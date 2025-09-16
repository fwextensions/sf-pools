import { writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";

const LIST_URL = "https://sfrecpark.org/482/Swimming-Pools";
const OUT_DIR = path.join(process.cwd(), "public", "data");
const OUT_FILE = path.join(OUT_DIR, "discovered_pool_schedules.json");

function sleep(ms: number) {
	return new Promise((res) => setTimeout(res, ms));
}

async function fetchText(url: string): Promise<string> {
	const res = await fetch(url, {
		headers: {
			"user-agent": "Mozilla/5.0 (compatible; sf-pools-schedule-viewer/0.1)",
		},
	});
	if (!res.ok) throw new Error(`request failed ${res.status} ${res.statusText} for ${url}`);
	return res.text();
}

function absoluteUrl(base: string, href: string): string {
	try {
		return new URL(href, base).toString();
	} catch {
		return href;
	}
}

function unique<T>(arr: T[]): T[] {
	return Array.from(new Set(arr));
}

async function discoverPoolPages(): Promise<string[]> {
	const html = await fetchText(LIST_URL);
	const $ = load(html);
	const links: string[] = [];
	$('a[href*="/Facilities/Facility/Details/"]').each((_i, el) => {
		const href = $(el).attr("href");
		if (href) links.push(absoluteUrl(LIST_URL, href));
	});
	return unique(links);
}

function getPoolSlugFromUrl(pageUrl: string): string {
	try {
		const u = new URL(pageUrl);
		const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
		return last; // e.g., Martin-Luther-King-Jr-Pool-216
	} catch {
		return "";
	}
}

function stripTrailingId(slug: string): string {
	return slug.replace(/-\d+$/i, "");
}

function humanizeSlug(slug: string): string {
	const base = stripTrailingId(slug).replace(/-/g, " ");
	return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

function pickBestPdfLink(
	$: ReturnType<typeof load>,
	pageUrl: string,
	prefSlug: string
): string | null {
	const slugTokens = stripTrailingId(prefSlug).toLowerCase().split("-").filter(Boolean);

	// 1) prefer the Documents row inside the page details content
	const details = $(".details").first();
	const ctx = details.length ? details : $.root();

	// try to find the <tr> whose <th> text is exactly "Documents"
	const ths = $("th", ctx).toArray();
	for (const th of ths) {
		const label = $(th).text().trim().toLowerCase();
		if (label === "documents") {
			const tr = $(th).closest("tr");
			const a = tr.find('a[href*="/DocumentCenter/View/"]').first();
			if (a.length) {
				const hrefRaw = a.attr("href") ?? "";
				return absoluteUrl(pageUrl, hrefRaw);
			}
		}
	}

	// 2) otherwise, search for PDF links within the details container and score them
	const candidates = $('a[href*="/DocumentCenter/View/"]', ctx).toArray();
	if (candidates.length === 0) return null;
	const scored = candidates.map((el) => {
		const hrefRaw = $(el).attr("href") ?? "";
		const hrefAbs = absoluteUrl(pageUrl, hrefRaw);
		const href = hrefAbs.toLowerCase();
		const text = $(el).text().trim().toLowerCase();
		let score = 0;
		// base positives
		if (text.includes("schedule")) score += 4;
		if (text.includes("pool")) score += 1;
		if (href.endsWith(".pdf") || text.endsWith("pdf")) score += 1;
		// pool name tokens present? require at least one non-trivial token match
		let tokenMatches = 0;
		for (const t of slugTokens) {
			if (t.length >= 3 && (text.includes(t) || href.includes(t))) tokenMatches++;
		}
		if (tokenMatches > 0) score += tokenMatches; else score -= 3;
		// negatives to avoid unrelated docs
		if (text.includes("citywide")) score -= 4;
		if (text.includes("aquatics") && !text.includes("pool")) score -= 2;
		if (text.includes("rules")) score -= 2;
		if (text.includes("party")) score -= 2;
		// if text contains "mission" but slug doesn't, penalize
		if (text.includes("mission") && !slugTokens.includes("mission")) score -= 3;
		return { href: hrefAbs, score, text };
	});
	scored.sort((a, b) => b.score - a.score);

	// debug the top two choices to help diagnose scoring
	console.log(
		scored
			.slice(0, 2)
			.map((s) => `${s.score}: ${s.text} -> ${s.href}`)
			.join("\n"),
	);

	return scored[0]?.href ?? null;
}

export async function main() {
	console.log("scraping pool listing:", LIST_URL);
	const poolPages = await discoverPoolPages();
	console.log(`found ${poolPages.length} pool pages`);
console.log(poolPages.join("\n"));

	const results: Array<{
		poolName: string;
		pageUrl: string;
		pdfUrl: string | null;
	}> = [];

	for (const pageUrl of poolPages) {
		try {
			await sleep(400);
			const html = await fetchText(pageUrl);
			const $ = load(html);
			const slug = getPoolSlugFromUrl(pageUrl);
			const fallbackName = humanizeSlug(slug) || pageUrl;
			const h2Name = $("h2").first().text().trim();
			const pageTitle = $("title").text().trim();
			const poolName = (h2Name || pageTitle || fallbackName).replace(/\s+/g, " ");
			const pdfUrl = pickBestPdfLink($, pageUrl, slug);
			results.push({ poolName, pageUrl, pdfUrl });
			console.log("discovered:", poolName, "->", pdfUrl ?? "(no pdf found)");
		} catch (err) {
			console.warn("failed to process", pageUrl, err);
		}
	}

	await mkdir(OUT_DIR, { recursive: true });
	await writeFile(OUT_FILE, JSON.stringify(results, null, "\t"), "utf-8");
	console.log("wrote:", OUT_FILE);
}

if (import.meta.main) {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
