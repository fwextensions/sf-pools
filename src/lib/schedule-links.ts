// A facility page can list several schedule PDFs for the same pool when the
// season is split into parts (MLK posts "pt1_Aug 18_Sep26" and "pt2_Sep29_Dec 12"
// side by side). The link text is the only place the date range shows up
// before the PDF is downloaded, so it's what we pick the current one from.

export type ScheduleLink = {
	href: string;
	text: string;
};

export type LinkDateRange = {
	/** YYYY-MM-DD */
	start: string;
	/** YYYY-MM-DD */
	end: string;
};

const MONTHS: Record<string, number> = {
	jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
	jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// a month name or abbreviation followed by a day, with or without a space
// ("Aug 18", "Sep26", "Sept 1", "December 12"), even run into the word before
// it ("Aug16toDec10"). The day can't run into more digits, so "Dec 2026" isn't
// read as Dec 20.
const MONTH_DAY = /(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s*(\d{1,2})(?!\d)/gi;

function iso(year: number, month: number, day: number): string {
	return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Read a date range out of a schedule link's text, e.g.
 * "MLK Pool_Fall2026_pt2_Sep29_Dec 12" -> 2026-09-29..2026-12-12. Uses the
 * first and last month-day pair it finds. The year comes from the text when it
 * has one, otherwise from today; a range that wraps past December ends the
 * following year. Returns null when the text doesn't name two dates.
 */
export function parseLinkDateRange(text: string, today: string): LinkDateRange | null {
	const dates: Array<{ month: number; day: number }> = [];
	for (const m of text.matchAll(MONTH_DAY)) {
		const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
		const day = Number(m[2]);
		if (day >= 1 && day <= 31) dates.push({ month, day });
	}
	if (dates.length < 2) return null;

	const first = dates[0];
	const last = dates[dates.length - 1];
	const yearMatch = text.match(/20\d\d/);
	const startYear = yearMatch ? Number(yearMatch[0]) : Number(today.slice(0, 4));
	const endYear = last.month < first.month ? startYear + 1 : startYear;

	return {
		start: iso(startYear, first.month, first.day),
		end: iso(endYear, last.month, last.day),
	};
}

/** the DocumentCenter id in a link's href; the site numbers uploads in order */
function documentId(href: string): number {
	const m = href.match(/\/DocumentCenter\/View\/(\d+)/i);
	return m ? Number(m[1]) : -1;
}

/**
 * Pick the schedule that applies today from several links for the same pool:
 * the one whose range covers today, else the next one to start, else the one
 * that ended most recently. That needs a readable range on every link; when
 * any link's text has none, the newest upload (highest DocumentCenter id)
 * wins instead, since a later part is posted after the one it follows.
 */
export function pickCurrentScheduleLink<T extends ScheduleLink>(links: T[], today: string): T | null {
	if (links.length <= 1) return links[0] ?? null;

	const parsed = links.map((link) => ({ link, range: parseLinkDateRange(link.text, today) }));
	if (parsed.some(({ range }) => range === null)) {
		return links.reduce((newest, link) => (documentId(link.href) > documentId(newest.href) ? link : newest));
	}
	const dated = parsed as Array<{ link: T; range: LinkDateRange }>;

	const current = dated
		.filter(({ range }) => range.start <= today && today <= range.end)
		.sort((a, b) => b.range.start.localeCompare(a.range.start));
	if (current.length) return current[0].link;

	const upcoming = dated
		.filter(({ range }) => range.start > today)
		.sort((a, b) => a.range.start.localeCompare(b.range.start));
	if (upcoming.length) return upcoming[0].link;

	const past = [...dated].sort((a, b) => b.range.end.localeCompare(a.range.end));
	return past[0].link;
}
