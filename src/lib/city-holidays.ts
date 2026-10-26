// San Francisco's official holidays, which close every Rec & Park pool. The
// pool PDFs' notes list them too, but only the ones that fall inside their
// season and on a day the pool runs, and now and then one gets left off, so
// the city's list fills in for whatever a PDF doesn't say.
//
// sf.gov posts each year's list some time before it starts. The page sits
// behind a bot check, but the Wagtail API behind it doesn't, so the scraper
// reads the page's content from there.
import type { ScheduledClosure } from "@/lib/closures";

export const HOLIDAY_PAGE_URL = "https://www.sf.gov/information--city-and-county-san-francisco-holiday-schedule";
export const HOLIDAY_API_URL =
	"https://api.sf.gov/api/v2/pages/find/?html_path=/information--city-and-county-san-francisco-holiday-schedule";

export type CityHoliday = {
	/** YYYY-MM-DD */
	date: string;
	/** as the city puts it ("Veterans Day", "Day after Thanksgiving") */
	name: string;
	/** the weekday the city observes a holiday that falls on a weekend */
	observed: boolean;
};

/** public/data/city_holidays.json */
export type CityHolidaysData = {
	source: string;
	lastUpdated: string;
	holidays: CityHoliday[];
};

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const ENTITIES: Record<string, string> = { amp: "&", apos: "'", quot: '"', nbsp: " ", rsquo: "’", "#39": "'" };

function plainText(html: string): string {
	return html
		.replace(/<[^>]+>/g, "")
		.replace(/&(#39|[a-z]+);/g, (m, name: string) => ENTITIES[name] ?? m)
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * The holidays in the page's rich text, one paragraph per holiday:
 * "<b>Independence Day</b> (observed): July 3, 2026". Anything else on the
 * page (notes under a holiday, links) is skipped.
 */
export function parseHolidayText(html: string): CityHoliday[] {
	const holidays: CityHoliday[] = [];
	for (const [, inner] of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) {
		const m = plainText(inner!).match(/^(.+?)\s*(\(observed\))?\s*:\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\.?$/i);
		if (!m) continue;
		const [, name, observed, monthName, day, year] = m;
		const month = MONTHS.indexOf(monthName!.toLowerCase());
		if (month < 0 || Number(day) > 31) continue;
		holidays.push({
			date: `${year}-${String(month + 1).padStart(2, "0")}-${day!.padStart(2, "0")}`,
			name: name!.trim(),
			observed: !!observed,
		});
	}
	return holidays;
}

/** the holidays in the API's answer for the page, from every section of it */
export function parseHolidayPage(page: unknown): CityHoliday[] {
	const sections = (page as { information_section?: { value?: { text?: unknown } }[] })?.information_section ?? [];
	return sections.flatMap((s) => (typeof s.value?.text === "string" ? parseHolidayText(s.value.text) : []));
}

/**
 * The saved holidays with every year the page lists replaced by the page's
 * list, so a year the city corrects is corrected here, and years it has
 * dropped are kept.
 */
export function mergeHolidays(saved: CityHoliday[], found: CityHoliday[]): CityHoliday[] {
	const years = new Set(found.map((h) => h.date.slice(0, 4)));
	return [...saved.filter((h) => !years.has(h.date.slice(0, 4))), ...found].sort(
		(a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)
	);
}

/** the year whose list the scraper wants: next year's in December, else this year's */
export function wantedYear(today: string): string {
	const year = Number(today.slice(0, 4));
	return String(today.slice(5, 7) === "12" ? year + 1 : year);
}

export function hasYear(holidays: CityHoliday[], year: string): boolean {
	return holidays.some((h) => h.date.startsWith(year));
}

function nextDay(date: string): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

function daysApart(a: string, b: string): number {
	return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

// how far from a holiday a PDF's closure for it can be and still count, so
// a PDF that closes on July 4 isn't also closed on the city's observed July 3
const SAME_HOLIDAY_DAYS = 3;

const FILLER = new Set(["a", "the", "of", "and", "day", "after", "observed", "holiday", "closed", "closure", "pool"]);

function words(text: string): string[] {
	return text.toLowerCase().replace(/['’]/g, "").split(/[^a-z0-9]+/).filter((w) => w && !FILLER.has(w));
}

/**
 * The city's holidays as all-day closures for one pool, for the dates its
 * PDF says nothing about. A PDF that closes the pool on the date, for any
 * reason or hours, has the last word on it, as does one that names the same
 * holiday a few days off (its own date for July 4th). Back-to-back holidays
 * that share a word, like Thanksgiving and the day after, are one closure;
 * two on the same date take the first one's name.
 */
export function holidayClosures(holidays: CityHoliday[], pdfClosures: ScheduledClosure[] | null | undefined): ScheduledClosure[] {
	const own = pdfClosures ?? [];
	const covered = (h: CityHoliday) =>
		own.some((c) => {
			if (c.startDate <= h.date && h.date <= c.endDate) return true;
			const near = daysApart(c.startDate, h.date) <= SAME_HOLIDAY_DAYS || daysApart(c.endDate, h.date) <= SAME_HOLIDAY_DAYS;
			const named = words(h.name);
			return near && words(c.reason ?? "").some((w) => named.includes(w));
		});

	const out: ScheduledClosure[] = [];
	for (const h of [...holidays].sort((a, b) => a.date.localeCompare(b.date))) {
		if (covered(h)) continue;
		const last = out[out.length - 1];
		if (last && last.endDate === h.date) continue;
		if (last && nextDay(last.endDate) === h.date && words(h.name).some((w) => words(last.reason ?? "").includes(w))) {
			last.endDate = h.date;
			continue;
		}
		out.push({ startDate: h.date, endDate: h.date, startTime: null, endTime: null, reason: h.name });
	}
	return out;
}
