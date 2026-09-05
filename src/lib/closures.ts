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
	/** the alert text the closure was read from */
	summary: string;
	/** YYYY-MM-DD, or null when the text only gives an end */
	startDate: string | null;
	/** YYYY-MM-DD, or null when the closure is indefinite */
	endDate: string | null;
	/** "until further notice" — closed with no announced end */
	indefinite: boolean;
	/** the notice PDF on sfrecpark.org, when the alert came from a document link */
	sourceUrl: string | null;
};

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
		startDate,
		endDate: indefinite ? null : endDate,
		indefinite,
		sourceUrl: opts.sourceUrl ?? null,
	};
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
