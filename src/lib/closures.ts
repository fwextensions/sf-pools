import { z } from "zod";

/**
 * Closure detection for scraped pool alerts.
 *
 * SF Rec & Park announces pool closures as free text — sometimes a paragraph on
 * the facility page, more often just the title of a linked PDF ("Garfield Pool
 * Maintenance Closure 8-14_9-7 2026"). This module turns that text into a
 * structured closure so the site can hide a closed pool's programs and say when
 * it reopens, instead of showing a schedule nobody can swim.
 *
 * The bar for reporting a closure is deliberately high: suppressing a pool's
 * programs on a false positive is worse than showing the alert on its own. A
 * closure is only reported when the text reads as a whole-pool closure *and*
 * carries a date range or says it is indefinite.
 */

export type Closure = {
	/** a human-readable line; the raw alert text unless a model improved on it */
	summary: string;
	/** the alert text exactly as scraped, kept so a bad parse stays diagnosable */
	rawText: string;
	/** YYYY-MM-DD, or null when the text only gives an end */
	startDate: string | null;
	/** YYYY-MM-DD, or null when the closure is indefinite */
	endDate: string | null;
	/** "until further notice" — closed with no announced end */
	indefinite: boolean;
	/** the notice PDF on sfrecpark.org, when the alert came from a document link */
	sourceUrl: string | null;
	/** why the pool is shut, when the notice says ("maintenance", "renovation") */
	reason: string | null;
	/** whether the whole pool is shut or only part of the facility */
	scope: ClosureScope;
	/** which layer produced this closure */
	source: ClosureSource;
	/**
	 * Whether the pool's programs should be hidden. Only ever true for a
	 * whole-pool closure that passed the sanity checks — this is the field the
	 * pipeline acts on, so everything that could wrongly blank a schedule has to
	 * come through here.
	 */
	suppressPrograms: boolean;
	/** the model's self-reported confidence, when a model was involved */
	confidence: number | null;
	/** set when the deterministic and model readings disagree, for review */
	disagreement: string | null;
};

export type ClosureScope = "whole-pool" | "partial";

export type ClosureSource = "pattern" | "model" | "pattern+model";

/** phrases that mean the pool itself is shut */
const CLOSURE_PATTERNS = [/\bclosure\b/i, /\bclosed\b/i, /\bclosing\b/i];

/**
 * Notices that mention a closure but not of the pool. Suppressing a whole
 * schedule because the locker room is being painted would be worse than
 * showing no closure at all, so anything matching these is left as a plain
 * alert.
 */
const PARTIAL_CLOSURE_PATTERNS = [
	/locker\s*room/i,
	/diving\s*board/i,
	/\bsauna\b/i,
	/\bslide\b/i,
	/parking/i,
	/community\s*room/i,
	/\bholiday\b/i,
	/observance/i,
];

const MONTHS: Record<string, number> = {
	jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
	jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function iso(year: number, month: number, day: number): string | null {
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;
	const d = new Date(Date.UTC(year, month - 1, day));
	// reject impossible dates that Date would roll over (e.g. Feb 30)
	if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
	return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthFromName(name: string): number | null {
	return MONTHS[name.slice(0, 4).toLowerCase()] ?? MONTHS[name.slice(0, 3).toLowerCase()] ?? null;
}

type DateRange = { startDate: string | null; endDate: string | null };

/**
 * Pull a date range out of closure text. Handles the shapes SF Rec & Park
 * actually publishes; returns nulls when nothing recognisable is present.
 *
 * `referenceYear` supplies the year for formats that omit it, which is most of
 * them.
 */
export function parseDateRange(text: string, referenceYear: number): DateRange {
	// an explicit 4-digit year anywhere in the text wins over the reference year
	const yearMatch = /\b(20\d{2})\b/.exec(text);
	const year = yearMatch ? parseInt(yearMatch[1]!, 10) : referenceYear;

	// "8-14_9-7 2026" — the document-title style, an underscore between the
	// two M-D pairs
	const compact = /\b(\d{1,2})[-/](\d{1,2})\s*[_–—]\s*(\d{1,2})[-/](\d{1,2})\b/.exec(text);
	if (compact) {
		const startDate = iso(year, +compact[1]!, +compact[2]!);
		let endDate = iso(year, +compact[3]!, +compact[4]!);
		// a range that ends before it starts has crossed a year boundary
		if (startDate && endDate && endDate < startDate) {
			endDate = iso(year + 1, +compact[3]!, +compact[4]!);
		}
		return { startDate, endDate };
	}

	// "August 14 - September 7" / "Aug 14 through Sept 7, 2026"
	const named =
		/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*(?:-|–|—|to|thru|through|until)\s*([A-Za-z]{3,9})\.?\s+(\d{1,2})\b/i.exec(
			text
		);
	if (named) {
		const m1 = monthFromName(named[1]!);
		const m2 = monthFromName(named[3]!);
		if (m1 && m2) {
			const startDate = iso(year, m1, +named[2]!);
			let endDate = iso(year, m2, +named[4]!);
			if (startDate && endDate && endDate < startDate) {
				endDate = iso(year + 1, m2, +named[4]!);
			}
			return { startDate, endDate };
		}
	}

	// "August 14 - 21" — one month, two days
	const sameMonth = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*(?:-|–|—|to|thru|through)\s*(\d{1,2})\b/i.exec(
		text
	);
	if (sameMonth) {
		const m = monthFromName(sameMonth[1]!);
		if (m) {
			return {
				startDate: iso(year, m, +sameMonth[2]!),
				endDate: iso(year, m, +sameMonth[3]!),
			};
		}
	}

	// "closed through September 7" — an end with no announced start
	const endOnly = /\b(?:through|thru|until|reopens?(?:\s+on)?)\s+([A-Za-z]{3,9})\.?\s+(\d{1,2})\b/i.exec(
		text
	);
	if (endOnly) {
		const m = monthFromName(endOnly[1]!);
		if (m) return { startDate: null, endDate: iso(year, m, +endOnly[2]!) };
	}

	return { startDate: null, endDate: null };
}

export type DetectClosureOptions = {
	/** ISO date the alert was scraped, used to fill in omitted years */
	referenceDate: string;
	/** the notice PDF the text came from, when there is one */
	sourceUrl?: string | null;
};

/**
 * Read a closure out of alert text, or return null when the text doesn't
 * clearly describe a whole-pool closure with a known duration.
 */
export function detectClosure(text: string, opts: DetectClosureOptions): Closure | null {
	if (!CLOSURE_PATTERNS.some((p) => p.test(text))) return null;
	if (PARTIAL_CLOSURE_PATTERNS.some((p) => p.test(text))) return null;

	const referenceYear = new Date(opts.referenceDate).getUTCFullYear();
	const { startDate, endDate } = parseDateRange(text, referenceYear);
	const indefinite = /until\s+further\s+notice/i.test(text);

	// without an end date or an explicit "indefinitely", we can't say how long
	// the pool is shut — not enough to hide a schedule over
	if (!endDate && !indefinite) return null;

	return {
		summary: text,
		rawText: text,
		startDate,
		endDate: indefinite ? null : endDate,
		indefinite,
		sourceUrl: opts.sourceUrl ?? null,
		reason: null,
		scope: "whole-pool",
		source: "pattern",
		suppressPrograms: true,
		confidence: null,
		disagreement: null,
	};
}

/** the longest closure we'll believe without a human looking at it */
export const MAX_CLOSURE_DAYS = 400;

function daysBetween(startDate: string, endDate: string): number {
	const ms = Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`);
	return Math.round(ms / 86_400_000);
}

/**
 * Reject closures whose dates don't make sense. This is the guard on the model
 * path: a hallucinated range that reads as plausible JSON would otherwise hide
 * a working pool's schedule, and nobody reports a schedule they can't see.
 *
 * Returns null when the closure is sane, or the reason it isn't.
 */
export function checkClosureSanity(closure: Closure, today: string): string | null {
	if (closure.indefinite) return null;
	if (!closure.endDate) return "no end date and not marked indefinite";

	if (closure.startDate) {
		if (closure.endDate < closure.startDate) return "ends before it starts";
		const span = daysBetween(closure.startDate, closure.endDate);
		if (span > MAX_CLOSURE_DAYS) return `spans ${span} days`;
	}

	// a notice about a date years away is far more likely a misparse than news
	const yearBefore = shiftYears(today, -1);
	const twoYearsAfter = shiftYears(today, 2);
	if (closure.endDate < yearBefore) return `ends ${closure.endDate}, long past`;
	if (closure.endDate > twoYearsAfter) return `ends ${closure.endDate}, implausibly far off`;

	return null;
}

function shiftYears(date: string, years: number): string {
	const [y, m, d] = date.split("-").map(Number);
	return `${y! + years}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * True when the closure covers `today`. A closure that has already ended stops
 * suppressing the pool's programs on its own, without needing a re-scrape.
 */
export function isClosureActive(closure: Closure, today: string): boolean {
	if (closure.startDate && today < closure.startDate) return false;
	if (closure.indefinite) return true;
	if (!closure.endDate) return false;
	return today <= closure.endDate;
}

/** "Aug 14 – Sep 7" / "through Sep 7" / "until further notice" */
export function formatClosurePeriod(closure: Closure): string {
	if (closure.indefinite) return "until further notice";

	const fmt = (d: string) => {
		const [y, m, day] = d.split("-").map(Number);
		return new Date(Date.UTC(y!, m! - 1, day!)).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			timeZone: "UTC",
		});
	};

	if (closure.startDate && closure.endDate) {
		return `${fmt(closure.startDate)} – ${fmt(closure.endDate)}`;
	}
	if (closure.endDate) return `through ${fmt(closure.endDate)}`;
	return "";
}

/**
 * What a model reported about one alert. Mirrors the schema the enrichment
 * step asks for; kept here so the merge rules can be tested without the SDK.
 */
export type ClosureEnrichment = {
	isClosure: boolean;
	scope: ClosureScope;
	startDate: string | null;
	endDate: string | null;
	indefinite: boolean;
	reason: string | null;
	summary: string;
	confidence: number;
};

/** a model-only closure needs at least this much confidence to hide a schedule */
export const MODEL_SUPPRESS_CONFIDENCE = 0.8;

/**
 * Combine the deterministic reading with the model's. The pattern layer is the
 * floor: when it found a closure, its dates stand, because they came from text
 * we can point at rather than from a generation. The model contributes what
 * regexes can't — the reason, a readable summary, and closures written in a
 * shape the patterns don't cover.
 *
 * The model may *narrow* the outcome but not widen it. It can veto suppression
 * (by reading a notice as partial, or as not a closure at all), since a wrong
 * veto merely shows a schedule that was already showing. It can only cause
 * suppression on its own when it is confident, says the whole pool is shut, and
 * the dates survive checkClosureSanity.
 */
export function mergeClosure(
	pattern: Closure | null,
	enrichment: ClosureEnrichment | null,
	opts: { today: string; rawText: string; sourceUrl?: string | null }
): Closure | null {
	if (!enrichment) return pattern;

	if (pattern) {
		const disagreements: string[] = [];
		if (!enrichment.isClosure) {
			disagreements.push("model does not read this as a closure");
		} else if (enrichment.scope === "partial") {
			disagreements.push("model reads this as a partial closure");
		}
		if (enrichment.isClosure && enrichment.endDate && enrichment.endDate !== pattern.endDate) {
			disagreements.push(
				`model read the end as ${enrichment.endDate}, pattern read ${pattern.endDate ?? "none"}`
			);
		}

		// the model can pull the pool back out of suppression, never push it in
		const vetoed = !enrichment.isClosure || enrichment.scope === "partial";

		return {
			...pattern,
			summary: enrichment.isClosure ? enrichment.summary : pattern.summary,
			reason: enrichment.reason,
			scope: enrichment.scope,
			source: "pattern+model",
			suppressPrograms: !vetoed,
			confidence: enrichment.confidence,
			disagreement: disagreements.length > 0 ? disagreements.join("; ") : null,
		};
	}

	// nothing from the patterns: the model is on its own, so the bar is higher
	if (!enrichment.isClosure || enrichment.scope !== "whole-pool") return null;
	if (enrichment.confidence < MODEL_SUPPRESS_CONFIDENCE) return null;

	const candidate: Closure = {
		summary: enrichment.summary,
		rawText: opts.rawText,
		startDate: enrichment.startDate,
		endDate: enrichment.indefinite ? null : enrichment.endDate,
		indefinite: enrichment.indefinite,
		sourceUrl: opts.sourceUrl ?? null,
		reason: enrichment.reason,
		scope: "whole-pool",
		source: "model",
		suppressPrograms: true,
		confidence: enrichment.confidence,
		disagreement: null,
	};

	const problem = checkClosureSanity(candidate, opts.today);
	if (problem) {
		// keep it visible as an alert, but don't let it blank a schedule
		return { ...candidate, suppressPrograms: false, disagreement: `failed sanity check: ${problem}` };
	}

	return candidate;
}

/**
 * Validation for a persisted closure. Defined here rather than beside the
 * schedule schema so the type and its validator can't drift apart.
 */
export const ClosureSchema = z.object({
	summary: z.string(),
	rawText: z.string(),
	startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
	endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
	indefinite: z.boolean(),
	sourceUrl: z.string().url().nullable(),
	reason: z.string().nullable(),
	scope: z.enum(["whole-pool", "partial"]),
	source: z.enum(["pattern", "model", "pattern+model"]),
	suppressPrograms: z.boolean(),
	confidence: z.number().min(0).max(1).nullable(),
	disagreement: z.string().nullable(),
});
