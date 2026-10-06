import { describe, it, expect } from "@jest/globals";
import { parseLinkDateRange, pickCurrentScheduleLink } from "./schedule-links";

// link texts as they appeared on the facility pages, 2026-10-06
const MLK_PT1 = { href: "https://sfrecpark.org/DocumentCenter/View/29802", text: "MLK Pool_Fall2026_pt1_Aug 18_Sep26" };
const MLK_PT2 = { href: "https://sfrecpark.org/DocumentCenter/View/30210", text: "MLK Pool_Fall2026_pt2_Sep29_Dec 12" };

describe("parseLinkDateRange", () => {
	const today = "2026-10-06";

	it("reads the facility pages' link texts", () => {
		expect(parseLinkDateRange(MLK_PT1.text, today)).toEqual({ start: "2026-08-18", end: "2026-09-26" });
		expect(parseLinkDateRange(MLK_PT2.text, today)).toEqual({ start: "2026-09-29", end: "2026-12-12" });
		expect(parseLinkDateRange("2026 Balboa Fall Schedule (Sept 1-Dec 12)", today)).toEqual({ start: "2026-09-01", end: "2026-12-12" });
		expect(parseLinkDateRange("Garfield Pool_FALL 2026_Sept 8 to Dec 10", today)).toEqual({ start: "2026-09-08", end: "2026-12-10" });
		expect(parseLinkDateRange("Hamilton Pool _ Fall 2026 _ August 18 to December 12", today)).toEqual({ start: "2026-08-18", end: "2026-12-12" });
		expect(parseLinkDateRange("RossiPool_Fall2026_Aug16toDec10", today)).toEqual({ start: "2026-08-16", end: "2026-12-10" });
		expect(parseLinkDateRange("Mission_Pool_Fall2026_Aug18_toOct17 (1) (2)", today)).toEqual({ start: "2026-08-18", end: "2026-10-17" });
		expect(parseLinkDateRange("NB Pool_Fall2026_Sept1_Dec12_ WARM POOL   (1)", today)).toEqual({ start: "2026-09-01", end: "2026-12-12" });
	});

	it("doesn't read a year as a day", () => {
		expect(parseLinkDateRange("Winter Dec 2026 to Feb 2027", today)).toBeNull();
	});

	it("takes the year from today when the text has none, and wraps past December", () => {
		expect(parseLinkDateRange("Winter Dec 15 - Mar 1", "2026-11-20")).toEqual({ start: "2026-12-15", end: "2027-03-01" });
	});

	it("returns null without two dates", () => {
		expect(parseLinkDateRange("MLK Pool Schedule", today)).toBeNull();
		expect(parseLinkDateRange("Coffman Pool Fall 2026 starting Aug 18", today)).toBeNull();
	});
});

describe("pickCurrentScheduleLink", () => {
	const links = [MLK_PT1, MLK_PT2];

	it("picks the part whose range covers today", () => {
		expect(pickCurrentScheduleLink(links, "2026-09-25")).toBe(MLK_PT1);
		expect(pickCurrentScheduleLink(links, "2026-10-06")).toBe(MLK_PT2);
	});

	it("picks the next part to start in a gap between parts", () => {
		expect(pickCurrentScheduleLink(links, "2026-09-27")).toBe(MLK_PT2);
	});

	it("picks the next part to start before any has begun", () => {
		expect(pickCurrentScheduleLink(links, "2026-08-01")).toBe(MLK_PT1);
	});

	it("picks the most recent part once all have ended", () => {
		expect(pickCurrentScheduleLink(links, "2026-12-20")).toBe(MLK_PT2);
	});

	it("doesn't depend on the order the page lists them in", () => {
		expect(pickCurrentScheduleLink([MLK_PT2, MLK_PT1], "2026-09-01")).toBe(MLK_PT1);
	});

	it("falls back to the first link when none has readable dates", () => {
		const a = { href: "a", text: "Pool Schedule" };
		const b = { href: "b", text: "Pool Schedule (Spanish)" };
		expect(pickCurrentScheduleLink([a, b], "2026-10-06")).toBe(a);
	});

	it("handles one link or none", () => {
		expect(pickCurrentScheduleLink([MLK_PT1], "2026-12-20")).toBe(MLK_PT1);
		expect(pickCurrentScheduleLink([], "2026-10-06")).toBeNull();
	});
});
