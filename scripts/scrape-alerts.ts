// Scrape pool alerts from SF Rec & Park website
import { writeFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";
import { getPoolIdFromName } from "../src/lib/pool-mapping";

const LIST_URL = "https://sfrecpark.org/482/Swimming-Pools";
const OUT_DIR = path.join(process.cwd(), "public", "data");
const OUT_FILE = path.join(OUT_DIR, "alerts.json");
const DISCOVERED_FILE = path.join(OUT_DIR, "discovered_pool_schedules.json");

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
			if (text.length < 20 || text.length > 500) return;
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

async function scrapePoolAlerts(): Promise<PoolAlert[]> {
	// load discovered pools
	let discovered: Array<{ poolName: string; pageUrl: string }> = [];
	try {
		const raw = await readFile(DISCOVERED_FILE, "utf-8");
		discovered = JSON.parse(raw);
	} catch {
		console.warn("Could not load discovered pools, run scrape first");
		return [];
	}

	const alerts: PoolAlert[] = [];
	const now = new Date().toISOString();

	for (const pool of discovered) {
		try {
			await sleep(400);
			console.log("Checking alerts for:", pool.poolName);
			const html = await fetchText(pool.pageUrl);
			const $ = load(html);

			// look in the main content area
			$(".editorContent.fr-view, .fr-view").each((_i, el) => {
				const $el = $(el);
				// skip footer/navigation
				if ($el.closest(".footer, .nav, .header, .cp-Splash").length) return;

				// check paragraphs for alert content
				$el.find("p, strong, span").each((_j, item) => {
					const text = cleanText($(item).text());
					// skip very short or very long text
					if (text.length < 20 || text.length > 500) return;
					// check for alert keywords
					if (isRealAlert(text)) {
						// avoid duplicates for this pool
						const existing = alerts.find(
							(a) => a.poolName === pool.poolName && a.alertText === text
						);
						if (!existing) {
							const poolId = getPoolIdFromName(pool.poolName) ?? "unknown";
							alerts.push({
								poolId,
								poolName: pool.poolName,
								pageUrl: pool.pageUrl,
								alertText: text,
								scrapedAt: now,
							});
						}
					}
				});
			});
		} catch (err) {
			console.warn("Failed to check alerts for", pool.poolName, err);
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
