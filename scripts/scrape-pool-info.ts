import { writeFile, readFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";
import type { PoolEntry } from "./downloadPdf";

const LIST_URL = "https://sfrecpark.org/482/Swimming-Pools";
const OUT_DIR = path.join(process.cwd(), "public", "data");
const OUT_FILE = path.join(OUT_DIR, "discovered_pool_schedules.json");
const POOLS_FILE = path.join(process.cwd(), "data", "pools.json");

export type ScrapeResult = {
	success: boolean;
	pools: Array<{ poolId: string; pdfUrl: string | null }>;
	errors: string[];
};

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

	return scored[0]?.href ?? null;
}

async function loadPools(): Promise<PoolEntry[]> {
	try {
		const raw = await readFile(POOLS_FILE, "utf-8");
		return JSON.parse(raw);
	} catch {
		return [];
	}
}

export async function main(): Promise<ScrapeResult> {
	const errors: string[] = [];

	console.log("scraping pool listing:", LIST_URL);
	const poolPages = await discoverPoolPages();
	console.log(`found ${poolPages.length} pool pages`);

	// load pools.json as source of truth
	const pools = await loadPools();
	if (pools.length === 0) {
		errors.push("pools.json not found or empty");
		return { success: false, pools: [], errors };
	}

	// validate pool count matches
	if (poolPages.length !== pools.length) {
		errors.push(`Pool count mismatch: expected ${pools.length}, found ${poolPages.length}`);
	}

	// build a map of expected page URLs from pools.json
	const expectedPageUrls = new Set(pools.map((p) => p.pageUrl));
	const poolsByPageUrl = new Map(pools.map((p) => [p.pageUrl, p]));

	// check for unexpected or missing page URLs
	for (const pageUrl of poolPages) {
		if (!expectedPageUrls.has(pageUrl)) {
			errors.push(`Unexpected pool page URL: ${pageUrl}`);
		}
	}
	for (const pool of pools) {
		if (!poolPages.includes(pool.pageUrl)) {
			errors.push(`Missing pool page URL for ${pool.shortName}: ${pool.pageUrl}`);
		}
	}

	// scrape each pool page for PDF URLs
	const results: Array<{ poolId: string; pdfUrl: string | null }> = [];

	for (const pageUrl of poolPages) {
		const pool = poolsByPageUrl.get(pageUrl);
		if (!pool) {
			console.warn("skipping unknown pool page:", pageUrl);
			continue;
		}

		try {
			await sleep(400);
			const html = await fetchText(pageUrl);
			const $ = load(html);
			const slug = getPoolSlugFromUrl(pageUrl);
			const pdfUrl = pickBestPdfLink($, pageUrl, slug);

			// validate PDF URL doesn't look like rules/facility doc
			if (pdfUrl) {
				const urlLower = pdfUrl.toLowerCase();
				if (urlLower.includes("rules") || urlLower.includes("facility")) {
					errors.push(`Suspicious PDF URL for ${pool.shortName}: ${pdfUrl} (looks like rules/facility doc)`);
				}
			} else {
				errors.push(`No PDF found for ${pool.shortName}`);
			}

			results.push({ poolId: pool.id, pdfUrl });
			console.log("discovered:", pool.shortName, "->", pdfUrl ?? "(no pdf found)");
		} catch (err) {
			errors.push(`Failed to scrape ${pool.shortName}: ${err}`);
			console.warn("failed to process", pageUrl, err);
		}
	}

	// write discovered data for reference
	await mkdir(OUT_DIR, { recursive: true });
	await writeFile(OUT_FILE, JSON.stringify(results, null, "\t"), "utf-8");
	console.log("wrote:", OUT_FILE);

	// determine success - fail if there are structural errors (count/URL mismatch)
	const structuralErrors = errors.filter((e) =>
		e.includes("count mismatch") ||
		e.includes("Unexpected pool") ||
		e.includes("Missing pool")
	);
	const success = structuralErrors.length === 0;

	if (errors.length > 0) {
		console.log("\n⚠️  Warnings/Errors:");
		for (const e of errors) {
			console.log(`  - ${e}`);
		}
	}

	if (!success) {
		console.error("\n❌ Scrape failed: pool structure has changed");
		console.error("Update pools.json manually if this is expected");
	}

	return { success, pools: results, errors };
}

if (import.meta.main) {
	main()
		.then((result) => {
			if (!result.success) {
				process.exit(1);
			}
		})
		.catch((err) => {
			console.error(err);
			process.exit(1);
		});
}
