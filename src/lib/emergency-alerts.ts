// The Alert Center on sfrecpark.org (AlertCenter.aspx) lists Rec & Park's
// site-wide emergency alerts, the ones the red EMERGENCY ALERT bar across
// the top of every page links to. Most are about parks, beaches and parking
// lots, so each one is read here for signs that it touches the pools: a
// mention of a pool, swimming or aquatics, or a closure of every facility.
// Only those show on the site; the rest are kept in the file and logged.
// The browser imports this file, so the HTML parsing, which needs cheerio,
// is in alert-center.ts; scripts/scrape-emergency-alerts.ts owns the I/O.

export type EmergencyAlert = {
	/** the Alert Center's own number for the alert, "114" */
	id: string;
	title: string;
	/** the alert's paragraphs, joined by blank lines */
	text: string;
	/** the Alert Center category, "Park Closures & Service Changes" */
	category: string | null;
	/** when Rec & Park posted it, as the page prints it: "November 24, 2026 8:55 PM" */
	posted: string | null;
	url: string;
	/** whether the alert reads as affecting the pools; only these show on the site */
	affectsPools: boolean;
	/** the pools it names; empty when it affects them all, or none */
	poolIds: string[];
	/** what in the text made it count, for the log */
	matched: string | null;
	/** YYYY-MM-DD the scraper first saw it */
	firstSeen: string;
};

/** public/data/emergency_alerts.json */
export type EmergencyAlertsData = {
	alerts: EmergencyAlert[];
};

/** an alert as the Alert Center lists it, before it's read for the pools */
export type ListedAlert = Pick<EmergencyAlert, "id" | "title" | "text" | "category" | "posted" | "url">;

const clean = (text: string) => text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

// a pool, swimming or aquatics anywhere in the alert
const POOL_WORDS = /\b(pools?|aquatics?|aquatic center|swim(s|ming)?|natatorium)\b/i;

// closures of everything Rec & Park runs, which would take the pools with
// them, as a storm or smoke closure might be worded
const CITYWIDE = [
	/\ball\s+(of\s+)?(our\s+|rec(reation)?\s*(and|&)\s*parks?(\s+department)?(['’]s)?\s+)?(indoor\s+)?(facilities|recreation\s+cent(er|re)s|rec\s+cent(er|re)s|clubhouses|programs|programming|classes|activities|sites|locations)\b/i,
	/\b(city-?wide|system-?wide|department-?wide)\b[^.]*\b(clos|cancel|suspend)/i,
	/\b(facilities|recreation\s+cent(er|re)s|programs|programming|classes|activities)\s+(are|will\s+be|have\s+been|remain)\s+(closed|cancell?ed|suspended)\b/i,
];

// each pool's name as an alert would give it, with the ids it covers
const POOL_NAMES: { pattern: RegExp; ids: string[] }[] = [
	{ pattern: /\bbalboa\b/i, ids: ["balboa"] },
	{ pattern: /\bcoffman\b/i, ids: ["coffman"] },
	{ pattern: /\bgarfield\b/i, ids: ["garfield"] },
	{ pattern: /\bhamilton\b/i, ids: ["hamilton"] },
	{ pattern: /\b(mlk|martin luther king(,? jr\.?)?)\b/i, ids: ["mlk"] },
	{ pattern: /\bmission\b/i, ids: ["mission"] },
	{ pattern: /\bnorth beach\b/i, ids: ["northBeachCool", "northBeachWarm"] },
	{ pattern: /\brossi\b/i, ids: ["rossi"] },
	{ pattern: /\bsava\b/i, ids: ["sava"] },
];

// how far before "pool" a name can sit and still be that pool's: "Hamilton
// Recreation Center and Pool", but not "Mission Dolores Park ... the pool"
const NAME_REACH = 40;

/**
 * Whether an alert touches the pools, which ones it names, and the words
 * that decided it. A pool named next to "pool" narrows it to that pool;
 * a mention of pools with no name, or a closure of every facility, counts
 * for them all.
 */
export function readAlertForPools(alert: Pick<ListedAlert, "title" | "text">): Pick<EmergencyAlert, "affectsPools" | "poolIds" | "matched"> {
	const text = `${alert.title}\n${alert.text}`;

	const citywide = CITYWIDE.map((re) => text.match(re)?.[0]).find(Boolean);
	const poolWord = text.match(POOL_WORDS)?.[0];
	if (!citywide && !poolWord) return { affectsPools: false, poolIds: [], matched: null };

	const poolIds = new Set<string>();
	if (poolWord && !citywide) {
		for (const m of text.matchAll(/\b(pools?|aquatic)\b/gi)) {
			const before = text.slice(Math.max(0, m.index! - NAME_REACH), m.index);
			for (const { pattern, ids } of POOL_NAMES) {
				if (pattern.test(before)) ids.forEach((id) => poolIds.add(id));
			}
		}
	}

	return { affectsPools: true, poolIds: [...poolIds], matched: clean(citywide ?? poolWord!) };
}

/**
 * The alerts as this run read them, each keeping the day it was first seen
 * when the last run already had it. An alert taken down from the Alert
 * Center drops out.
 */
export function mergeAlerts(listed: ListedAlert[], previous: EmergencyAlert[], today: string): EmergencyAlert[] {
	return listed.map((alert) => ({
		...alert,
		...readAlertForPools(alert),
		firstSeen: previous.find((p) => p.id === alert.id)?.firstSeen ?? today,
	}));
}

/** whether an alert shows for the pools in the filter (none selected means all) */
export function alertShowsFor(alert: EmergencyAlert, selectedPools: string[]): boolean {
	if (!alert.affectsPools) return false;
	if (alert.poolIds.length === 0 || selectedPools.length === 0) return true;
	return alert.poolIds.some((id) => selectedPools.includes(id));
}
