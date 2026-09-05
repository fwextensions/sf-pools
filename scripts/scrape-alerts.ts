// Scrape pool alerts from SF Rec & Park website
import { writeFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";
import type { PoolEntry } from "./downloadPdf";
import { fetchText } from "./http";

const LIST_URL = "https://sfrecpark.org/482/Swimming-Pools";
const OUT_DIR = path.join(process.cwd(), "public", "data");
const OUT_FILE = path.join(OUT_DIR, "alerts.json");
const POOLS_FILE = path.join(process.cwd(), "data", "pools.json");

function sleep(ms: number) {
	return new Promise((res) => setTimeout(res, ms));
}

async function loadPools(): Promise<PoolEntry[]> {
	try {
		const raw = await readFile(POOLS_FILE, "utf-8");
		return JSON.parse(raw);
	} catch {
		return [];
	}
}

export type PoolAlert = {
	poolId: string;
	poolName: string;
	pageUrl: string;
	alertText: string;
	scrapedAt: string;
};

export type AlertsData = {
	siteWideAlerts: string[];
	poolAlerts: PoolAlert[];
	lastUpdated: string;
};

// keywords that suggest an alert or notice
const ALERT_KEYWORDS = [
	"closed",
	"closure",
	"cancelled",
	"canceled",
	"suspended",
	"temporarily",
	"until further notice",
	"out of service",
	"broken",
	"emergency",
	"please note",
	"attention",
	"important notice",
	"advisory",
	"warning",
];

// patterns to exclude (boilerplate text)
const EXCLUDE_PATTERNS = [
	"report a maintenance issue",
	"call 311",
	"click here to report",
	"this pool offers",
	"playground is located",
	"the project includes",
	"register at sfrecpark.org",
	"pre-registration required",
];

// text-length bounds for candidate alerts
const MIN_PROSE_LEN = 20;
const MIN_DOC_TITLE_LEN = 8;
const MAX_ALERT_LEN = 500;

function isRealAlert(text: string): boolean {
	const lower = text.toLowerCase();
	// must contain an alert keyword
	if (!ALERT_KEYWORDS.some((kw) => lower.includes(kw))) {
		return false;
	}
	// must not be boilerplate
	if (EXCLUDE_PATTERNS.some((pat) => lower.includes(pat))) {
		return false;
	}
	return true;
}

function cleanText(text: string): string {
	return text
		.replace(/\s+/g, " ")
		.replace(/\u00a0/g, " ")
		.trim();
}

async function scrapeSiteWideAlerts(): Promise<string[]> {
	console.log("Scraping site-wide alerts from:", LIST_URL);
	const html = await fetchText(LIST_URL);
	const $ = load(html);

	const alerts: string[] = [];

	// look for the main content area
	$(".fr-view").each((_i, el) => {
		const $el = $(el);
		// skip footer/navigation areas
		if ($el.closest(".footer, .nav, .header").length) return;

		// look for list items or paragraphs that might be alerts
		$el.find("li, p").each((_j, item) => {
			const text = cleanText($(item).text());
			// skip very short or very long text
			if (text.length < MIN_PROSE_LEN || text.length > MAX_ALERT_LEN) return;
			// check for alert keywords
			if (isRealAlert(text)) {
				// avoid duplicates
				if (!alerts.includes(text)) {
					alerts.push(text);
				}
			}
		});
	});

	return alerts;
}

type CheerioApi = ReturnType<typeof load>;

/** alert text from prose in the page's main content area */
function collectProseAlerts($page: CheerioApi): string[] {
	const found: string[] = [];

	$page(".editorContent.fr-view, .fr-view").each((_i, el) => {
		const $el = $page(el);
		// skip footer/navigation
		if ($el.closest(".footer, .nav, .header, .cp-Splash").length) return;

		// check paragraphs for alert content
		$el.find("p, strong, span").each((_j, item) => {
			const text = cleanText($page(item).text());
			// skip very short or very long text
			if (text.length < MIN_PROSE_LEN || text.length > MAX_ALERT_LEN) return;
			if (isRealAlert(text)) found.push(text);
		});
	});

	return found;
}

/**
 * alert text from the facility page's Documents table. closures are often
 * posted only as a linked PDF whose title carries the notice (e.g. "Garfield
 * Pool Maintenance Closure 8-14_9-7 2026") with no matching prose on the page.
 */
function collectDocumentAlerts($page: CheerioApi): string[] {
	const found: string[] = [];

	$page("th").each((_i, th) => {
		if (cleanText($page(th).text()).toLowerCase() !== "documents") return;

		$page(th)
			.siblings("td")
			.find("a")
			.each((_j, a) => {
				const title = cleanText($page(a).text());
				// document titles are terser than prose, so allow shorter text
				if (title.length < MIN_DOC_TITLE_LEN || title.length > MAX_ALERT_LEN) return;
				if (isRealAlert(title)) found.push(title);
			});
	});

	return found;
}

async function scrapePoolAlerts(): Promise<PoolAlert[]> {
	// pools.json is the source of truth for facility page URLs
	const pools = await loadPools();
	if (pools.length === 0) {
		console.warn("Could not load pools.json, skipping pool alerts");
		return [];
	}

	const alerts: PoolAlert[] = [];
	const now = new Date().toISOString();
	// several pools can share one facility page (North Beach warm + cool), so
	// fetch each distinct page once and attribute its alerts to every pool on it
	const pageCache = new Map<string, CheerioApi>();

	for (const pool of pools) {
		try {
			let $page = pageCache.get(pool.pageUrl);
			if (!$page) {
				await sleep(400);
				console.log("Checking alerts for:", pool.shortName);
				$page = load(await fetchText(pool.pageUrl));
				pageCache.set(pool.pageUrl, $page);
			} else {
				console.log("Checking alerts for:", pool.shortName, "(cached page)");
			}

			const texts = [...collectProseAlerts($page), ...collectDocumentAlerts($page)];
			for (const alertText of texts) {
				// avoid duplicates for this pool (a notice can appear as both prose
				// and a document title)
				const existing = alerts.find(
					(a) => a.poolId === pool.id && a.alertText === alertText
				);
				if (existing) continue;
				alerts.push({
					poolId: pool.id,
					poolName: pool.shortName,
					pageUrl: pool.pageUrl,
					alertText,
					scrapedAt: now,
				});
			}
		} catch (err) {
			console.warn("Failed to check alerts for", pool.shortName, err);
		}
	}

	return alerts;
}

export async function scrapeAllAlerts(): Promise<AlertsData> {
	const siteWideAlerts = await scrapeSiteWideAlerts();
	const poolAlerts = await scrapePoolAlerts();

	return {
		siteWideAlerts,
		poolAlerts,
		lastUpdated: new Date().toISOString(),
	};
}

export async function loadPreviousAlerts(): Promise<AlertsData | null> {
	try {
		const raw = await readFile(OUT_FILE, "utf-8");
		return JSON.parse(raw) as AlertsData;
	} catch {
		return null;
	}
}

export function findNewAlerts(
	previous: AlertsData | null,
	current: AlertsData
): { newSiteWide: string[]; newPoolAlerts: PoolAlert[] } {
	if (!previous) {
		return {
			newSiteWide: current.siteWideAlerts,
			newPoolAlerts: current.poolAlerts,
		};
	}

	const newSiteWide = current.siteWideAlerts.filter(
		(a) => !previous.siteWideAlerts.includes(a)
	);

	const newPoolAlerts = current.poolAlerts.filter((a) => {
		return !previous.poolAlerts.some(
			(p) => p.poolName === a.poolName && p.alertText === a.alertText
		);
	});

	return { newSiteWide, newPoolAlerts };
}

export async function main(options: { notify?: boolean } = {}) {
	const previous = await loadPreviousAlerts();
	const current = await scrapeAllAlerts();

	console.log("\n--- Results ---");
	console.log("Site-wide alerts:", current.siteWideAlerts.length);
	console.log("Pool alerts:", current.poolAlerts.length);

	if (current.poolAlerts.length > 0) {
		console.log("\nPool alerts found:");
		for (const a of current.poolAlerts) {
			console.log(`  [${a.poolName}] ${a.alertText.slice(0, 80)}...`);
		}
	}

	// check for new alerts
	const { newSiteWide, newPoolAlerts } = findNewAlerts(previous, current);
	if (newSiteWide.length > 0 || newPoolAlerts.length > 0) {
		console.log("\n🆕 New alerts detected!");
		console.log("  New site-wide:", newSiteWide.length);
		console.log("  New pool alerts:", newPoolAlerts.length);

		// send notification if requested
		if (options.notify) {
			const { notifyNewAlerts } = await import("./notify");
			await notifyNewAlerts(newSiteWide, newPoolAlerts);
		}
	}

	await mkdir(OUT_DIR, { recursive: true });
	await writeFile(OUT_FILE, JSON.stringify(current, null, "\t"), "utf-8");
	console.log("\nWrote:", OUT_FILE);

	return { current, newSiteWide, newPoolAlerts };
}

if (import.meta.main) {
	const notify = process.argv.includes("--notify");
	main({ notify }).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
