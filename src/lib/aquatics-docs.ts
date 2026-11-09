// The two citywide PDFs the Swimming Pools page links under Other Resources:
// the yearly maintenance schedule and the admission fee notice. The model
// reads each PDF into the schemas here, and the checks against the PDF's
// text layer make sure every date and price it returns is printed there, and
// that it left none out. scripts/scrape-aquatics-docs.ts owns the I/O.
import { load } from "cheerio";
import { z } from "zod";
import type { TextLine } from "@/lib/pdf-table";
import type { MaintenanceEntry } from "@/lib/maintenance";
import type { FeeGroup } from "@/lib/admission-fees";

export type DocLink = { url: string; text: string };

/**
 * The maintenance schedule and fee notice links on the Swimming Pools page,
 * found by their wording ("Annual Maintenance Schedule 2026/27 (PDF)",
 * "Aquatic Admission Fees (PDF)") or, failing that, their file names, since
 * the page gets a new link each year.
 */
export function findDocLinks(html: string, pageUrl: string): { maintenance: DocLink | null; fees: DocLink | null } {
	const $ = load(html);
	const links: DocLink[] = [];
	$('a[href*="DocumentCenter/View/"]').each((_i, el) => {
		const href = $(el).attr("href");
		if (!href) return;
		links.push({ url: new URL(href, pageUrl).toString(), text: $(el).text().replace(/\s+/g, " ").trim() });
	});
	const find = (pattern: RegExp) =>
		links.find((l) => pattern.test(l.text)) ?? links.find((l) => pattern.test(l.url.replace(/[-_]/g, " "))) ?? null;
	return {
		maintenance: find(/\bmaintenance\b/i),
		fees: find(/\bfees?\b/i),
	};
}

// The pools as the model names them. North Beach's two pools share one
// building, so a row for North Beach closes both.
export const DOC_POOLS: Record<string, { name: string; poolIds: string[] }> = {
	balboa: { name: "Balboa", poolIds: ["balboa"] },
	coffman: { name: "Coffman", poolIds: ["coffman"] },
	garfield: { name: "Garfield", poolIds: ["garfield"] },
	hamilton: { name: "Hamilton", poolIds: ["hamilton"] },
	mlk: { name: "MLK (Martin Luther King Jr.)", poolIds: ["mlk"] },
	mission: { name: "Mission", poolIds: ["mission"] },
	northBeach: { name: "North Beach", poolIds: ["northBeachCool", "northBeachWarm"] },
	rossi: { name: "Rossi", poolIds: ["rossi"] },
	sava: { name: "Sava", poolIds: ["sava"] },
};

const DOC_POOL_KEYS = Object.keys(DOC_POOLS) as [string, ...string[]];

const isoDate = z.string().describe("YYYY-MM-DD");

export const MaintenanceExtractSchema = z.object({
	title: z.string().describe("the document's heading, e.g. '2026-2027 Pool Maintenance Schedule'"),
	entries: z.array(
		z.object({
			pools: z
				.array(z.enum(DOC_POOL_KEYS))
				.describe("the pools the row closes; an empty array when it applies to every pool"),
			startDate: isoDate.nullable().describe("the first closed day, or null when the PDF says TBD"),
			endDate: isoDate.nullable().describe("the last closed day, or null when the PDF says TBD"),
			reason: z.string().describe("why, e.g. 'Annual maintenance', 'In-service training', 'Wet scrub'"),
		})
	),
});

export type MaintenanceExtract = z.infer<typeof MaintenanceExtractSchema>;

export const MAINTENANCE_PROMPT = `
Read the attached San Francisco Rec & Park aquatics maintenance schedule into the JSON schema.
- Each row of the pool table is one entry for that pool, from its start date to its end date, with reason 'Annual maintenance'. A row whose dates are TBD gets null dates.
- The table's comments ('Reopen Nov 22', 'Sunday- Thursday Pool', a holiday name) only describe the row. They are not closures of their own, and they never change its dates.
- Each event in the events table is its own entry. A list of dates ('8/22/2026, 12/12/2026') is one entry per date; a range ('11/23/2026-11/29/2026') is one entry. An event that names a pool closes that pool only; one that names none ('In Service Trainings') closes every pool, so its pools array is empty. Give it a short reason in the PDF's words, singular and without the pool's name ('In-service training', 'Wet scrub').
- Dates are YYYY-MM-DD.
- Pools: ${Object.entries(DOC_POOLS).map(([key, p]) => `${key} = ${p.name}`).join(", ")}.`;

export const FeesExtractSchema = z.object({
	effectiveDate: isoDate.nullable().describe("the day the prices take effect, or null when the notice doesn't say"),
	groups: z.array(
		z.object({
			name: z.string().describe("the group's name without its ages, e.g. 'Children', 'Adult', 'Economic Need'"),
			detail: z
				.string()
				.nullable()
				.describe("what the heading puts in parentheses, e.g. '0-17', '65+', 'Medi-Cal recipients'"),
			fees: z.array(
				z.object({
					name: z.string().describe("the item exactly as printed, e.g. 'Recreation Swim Pass - 10 visits'"),
					price: z.number().describe("whole dollars"),
				})
			),
		})
	),
});

export type FeesExtract = z.infer<typeof FeesExtractSchema>;

export const FEES_PROMPT = `
Read the attached San Francisco Rec & Park aquatics fee notice into the JSON schema.
- One group per heading, in the order printed, with every item under it in order.
- Copy each item's name exactly as printed and its price in whole dollars.
- effectiveDate is the date the notice says the fees take effect, as YYYY-MM-DD.`;

function joinText(lines: TextLine[]): string {
	return lines.map((l) => l.text).join("\n").replace(/[ \t]+/g, " ");
}

/** "2026-08-17" -> a pattern for "8/17/2026", "08/17/26" and the like */
function datePattern(date: string): RegExp {
	const [y, m, d] = date.split("-").map(Number);
	return new RegExp(`(^|[^\\d/])0?${m}/0?${d}/(${y}|${y! % 100})(?!\\d)`);
}

const PRINTED_DATE = /(?<![\d/])(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?![\d/])/g;

/**
 * The maintenance schedule's entries, checked against the PDF's text. Every
 * date and pool the model gives must be printed in it, and every date
 * printed must be used, so a misread or a dropped row stops the update
 * rather than closing a pool on the wrong days. TBD rows are left out.
 */
export function groundMaintenance(
	extract: MaintenanceExtract,
	lines: TextLine[]
): { entries: MaintenanceEntry[]; problems: string[] } {
	const text = joinText(lines);
	const problems: string[] = [];
	const entries: MaintenanceEntry[] = [];
	const used = new Set<string>();

	for (const e of extract.entries) {
		const label = `${e.pools.join("+") || "all pools"} ${e.startDate ?? "TBD"}–${e.endDate ?? "TBD"} (${e.reason})`;
		if (!e.startDate || !e.endDate) continue;
		for (const date of [e.startDate, e.endDate]) {
			if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !datePattern(date).test(text)) problems.push(`${label}: ${date} isn't printed`);
			used.add(date);
		}
		for (const key of e.pools) {
			const word = DOC_POOLS[key]!.name.split(" (")[0]!;
			if (!text.toLowerCase().includes(word.toLowerCase())) problems.push(`${label}: ${word} isn't named`);
		}
		entries.push({
			poolIds: e.pools.flatMap((key) => DOC_POOLS[key]!.poolIds),
			startDate: e.startDate,
			endDate: e.endDate,
			reason: e.reason.trim(),
		});
	}

	for (const [, m, d, y] of text.matchAll(PRINTED_DATE)) {
		const year = y!.length === 2 ? `20${y}` : y!;
		const date = `${year}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
		if (!used.has(date)) problems.push(`${m}/${d}/${y} is printed but no entry uses it`);
	}

	return { entries, problems };
}

/** lines whose baselines are this close (points) sit on the same row */
const ROW_TOLERANCE = 3;

const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * The fee notice's groups, checked against the PDF's text: each item's name
 * must be printed with its price on the same row, and each price printed
 * must belong to an item, so a shifted or dropped price stops the update.
 */
export function groundFees(extract: FeesExtract, lines: TextLine[]): { groups: FeeGroup[]; problems: string[] } {
	const problems: string[] = [];
	const prices = lines.filter((l) => /^\$\s?\d+(\.\d\d)?$/.test(l.text.trim()));
	const matched = new Set<TextLine>();
	const groups: FeeGroup[] = [];

	for (const g of extract.groups) {
		if (!lines.some((l) => normalize(l.text).includes(normalize(g.name)))) problems.push(`group ${g.name} isn't printed`);
		const fees = g.fees.map((f) => ({ name: f.name.trim(), price: f.price }));
		for (const f of fees) {
			const rows = lines.filter((l) => normalize(l.text) === normalize(f.name));
			const price = prices.find(
				(p) =>
					!matched.has(p) &&
					Number(p.text.trim().slice(1)) === f.price &&
					rows.some((r) => r.page === p.page && Math.abs(r.y - p.y) <= ROW_TOLERANCE)
			);
			if (price) matched.add(price);
			else problems.push(`${g.name}: ${f.name} $${f.price} isn't printed on one row`);
		}
		groups.push({ name: g.name.trim(), detail: g.detail?.trim() || null, fees });
	}
	for (const p of prices) {
		if (!matched.has(p)) problems.push(`${p.text.trim()} is printed but no item uses it`);
	}
	return { groups, problems };
}
