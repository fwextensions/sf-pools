import { writeFile, readFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";
import type { PoolEntry } from "./downloadPdf";
import { fetchText } from "./http";

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
	prefSlug: string,
	scheduleMatch?: string
): string | null {
	const slugTokens = stripTrailingId(prefSlug).toLowerCase().split("-").filter(Boolean);
	const wanted = scheduleMatch?.trim().toLowerCase() || null;
	// keywords used to disambiguate sibling schedules on the same page; when we
	// want one variant we must actively avoid the others
	const variantKeywords = ["cool", "warm"];

	// 1) prefer the Documents row inside the page details content
	const details = $(".details").first();
	const ctx = details.length ? details : $.root();

	// collect the anchors from the Documents row, if present, so we can score
	// them (the row may hold several PDFs, e.g. warm + cool pool schedules)
	let rowAnchors: ReturnType<typeof $> | null = null;
	const ths = $("th", ctx).toArray();
	for (const th of ths) {
		const label = $(th).text().trim().toLowerCase();
		if (label === "documents") {
			const tr = $(th).closest("tr");
			const anchors = tr.find('a[href*="/DocumentCenter/View/"]');
			if (anchors.length) rowAnchors = anchors;
			break;
		}
	}

	// when there's no ambiguity to resolve, keep the original fast path: the
	// first document-row link is the pool's schedule
	if (!wanted && rowAnchors && rowAnchors.length) {
		const hrefRaw = rowAnchors.first().attr("href") ?? "";
		return absoluteUrl(pageUrl, hrefRaw);
	}

	// 2) score all candidate PDF links; prefer the Documents row when we found
	// one, otherwise fall back to every PDF link in the details container
	const candidateEls = (rowAnchors && rowAnchors.length ? rowAnchors : $('a[href*="/DocumentCenter/View/"]', ctx)).toArray();
	if (candidateEls.length === 0) return null;
	const scored = candidateEls.map((el) => {
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
		// disambiguate sibling schedules: strongly prefer the requested variant
		// and reject the others so "warm" never resolves to the "cool" PDF
		if (wanted) {
			if (text.includes(wanted)) score += 10;
			for (const kw of variantKeywords) {
				if (kw !== wanted && text.includes(kw)) score -= 10;
			}
		}
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

	// validate page count matches the distinct facility pages we expect (a single
	// page can back multiple pools, e.g. North Beach's warm + cool schedules)
	const expectedPageUrls = new Set(pools.map((p) => p.pageUrl));
	if (poolPages.length !== expectedPageUrls.size) {
		errors.push(`Pool page count mismatch: expected ${expectedPageUrls.size}, found ${poolPages.length}`);
	}

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

	// scrape each pool for its PDF URL; cache pages so pools that share a facility
	// page (warm/cool) only fetch the HTML once
	const results: Array<{ poolId: string; pdfUrl: string | null }> = [];
	const pageCache = new Map<string, ReturnType<typeof load>>();

	for (const pool of pools) {
		const pageUrl = pool.pageUrl;
		try {
			let $ = pageCache.get(pageUrl);
			if (!$) {
				await sleep(400);
				const html = await fetchText(pageUrl);
				$ = load(html);
				pageCache.set(pageUrl, $);
			}
			const slug = getPoolSlugFromUrl(pageUrl);
			const pdfUrl = pickBestPdfLink($, pageUrl, slug, pool.scheduleMatch);

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
