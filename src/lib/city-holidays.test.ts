import { describe, it, expect } from "@jest/globals";
import { hasYear, holidayClosures, mergeHolidays, parseHolidayPage, parseHolidayText, wantedYear, type CityHoliday } from "./city-holidays";

// the 2026 list as the sf.gov API returned it on 2026-10-26, cut down
const TEXT =
	`<p data-block-key="z1ji9"><b>New Year's Day</b>: January 1, 2026</p>` +
	`<p data-block-key="6l8v0"><b>Presidents' Day</b>: February 16, 2026</p>` +
	`<p data-block-key="7gf2q"><b>Independence Day</b> (observed): July 3, 2026</p>` +
	`<ul><li data-block-key="e307a">Marriages and other appointments at the County Clerk will go ahead on July 3, 2026.</li>` +
	`<li data-block-key="8doun">Some offices at City Hall are open, including the <a href="https://www.sf.gov/x"><b>Treasurer &amp; Tax Collector</b></a></li></ul>` +
	`<p data-block-key="24sh7"><b>Independence Day</b>: July 4, 2026</p>` +
	`<p data-block-key="4qk30"><b>Indigenous Peoples Day</b>: October 12, 2026</p>` +
	`<p data-block-key="2tnlq"><b>Italian American Heritage Day</b>: October 12, 2026</p>` +
	`<p data-block-key="5b919"><b>Thanksgiving Day</b>: November 26, 2026</p>` +
	`<p data-block-key="6etjj"><b>Day after Thanksgiving</b>: November 27, 2026</p>` +
	`<p data-block-key="37bp8">Find out more about <a href="/topics--things-to-do-san-francisco/">what's going on in San Francisco</a>.</p>`;

const holiday = (date: string, name: string, observed = false): CityHoliday => ({ date, name, observed });
const allDay = (startDate: string, endDate: string, reason: string) => ({ startDate, endDate, startTime: null, endTime: null, reason });

describe("parsing the sf.gov page", () => {
	it("reads one holiday per paragraph and skips the notes and links around them", () => {
		expect(parseHolidayText(TEXT)).toEqual([
			holiday("2026-01-01", "New Year's Day"),
			holiday("2026-02-16", "Presidents' Day"),
			holiday("2026-07-03", "Independence Day", true),
			holiday("2026-07-04", "Independence Day"),
			holiday("2026-10-12", "Indigenous Peoples Day"),
			holiday("2026-10-12", "Italian American Heritage Day"),
			holiday("2026-11-26", "Thanksgiving Day"),
			holiday("2026-11-27", "Day after Thanksgiving"),
		]);
	});

	it("reads every section of the API's answer, one per year", () => {
		const page = {
			information_section: [
				{ type: "title_and_text", value: { title: "2026 holiday schedule", text: `<p><b>Christmas</b>: December 25, 2026</p>` } },
				{ type: "title_and_text", value: { title: "2027 holiday schedule", text: `<p><b>New Year's Day</b>: January 1, 2027</p>` } },
				{ type: "title_and_text", value: { title: "", text: `<h3>Other holiday schedules</h3>` } },
			],
		};
		expect(parseHolidayPage(page).map((h) => h.date)).toEqual(["2026-12-25", "2027-01-01"]);
		expect(parseHolidayPage({})).toEqual([]);
	});
});

describe("saving the list", () => {
	const saved = [holiday("2026-01-01", "New Year's Day"), holiday("2026-12-25", "Christmas")];

	it("replaces the years the page lists and keeps the ones it has dropped", () => {
		const found = [holiday("2027-01-01", "New Year's Day"), holiday("2027-12-24", "Christmas")];
		expect(mergeHolidays(saved, found)).toEqual([...saved, ...found]);
		const corrected = [holiday("2026-12-24", "Christmas")];
		expect(mergeHolidays(saved, corrected)).toEqual(corrected);
	});

	it("wants next year's list in December and this year's the rest of the year", () => {
		expect(wantedYear("2026-11-30")).toBe("2026");
		expect(wantedYear("2026-12-01")).toBe("2027");
		expect(wantedYear("2027-01-02")).toBe("2027");
		expect(hasYear(saved, "2026")).toBe(true);
		expect(hasYear(saved, "2027")).toBe(false);
	});
});

describe("holidays as a pool's closures", () => {
	const holidays = parseHolidayText(TEXT);

	it("closes the pool all day, one closure for back-to-back days of the same holiday or one date", () => {
		expect(holidayClosures(holidays, [])).toEqual([
			allDay("2026-01-01", "2026-01-01", "New Year's Day"),
			allDay("2026-02-16", "2026-02-16", "Presidents' Day"),
			allDay("2026-07-03", "2026-07-04", "Independence Day"),
			allDay("2026-10-12", "2026-10-12", "Indigenous Peoples Day"),
			allDay("2026-11-26", "2026-11-27", "Thanksgiving Day"),
		]);
	});

	it("leaves a date to the PDF when its notes close the pool then, for any reason or hours", () => {
		const own = [
			allDay("2026-11-23", "2026-11-29", "maintenance"),
			{ startDate: "2026-10-12", endDate: "2026-10-12", startTime: "9:00a", endTime: "noon", reason: "training" },
		];
		const dates = holidayClosures(holidays, own).map((c) => c.startDate);
		expect(dates).not.toContain("2026-10-12");
		expect(dates).not.toContain("2026-11-26");
	});

	it("follows the PDF's date for a holiday it names a few days from the city's", () => {
		// as the summer 2026 PDFs put it: "closed on Juneteenth and July 4 for Independence Day"
		const own = [allDay("2026-07-04", "2026-07-04", "Independence Day")];
		expect(holidayClosures(holidays, own).map((c) => c.startDate)).not.toContain("2026-07-03");
	});
});
