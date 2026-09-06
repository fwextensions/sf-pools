import { describe, it, expect } from "@jest/globals";
import { formatScheduleDate } from "./utils";

describe("formatScheduleDate", () => {
	// the schedules page read these with new Date(iso), which is UTC midnight,
	// and formatted them in Pacific — every season started and ended a day early
	it("keeps the day the PDF printed, whatever the viewer's timezone", () => {
		expect(formatScheduleDate("2026-08-29", { year: "numeric", month: "short", day: "2-digit" }))
			.toBe("Aug 29, 2026");
		expect(formatScheduleDate("2026-12-12", { month: "short", day: "numeric" })).toBe("Dec 12");
		expect(formatScheduleDate("2026-01-01", { month: "long", day: "numeric" })).toBe("January 1");
	});

	it("returns nothing for a missing or malformed date", () => {
		expect(formatScheduleDate(null, { month: "short" })).toBe("");
		expect(formatScheduleDate("", { month: "short" })).toBe("");
		expect(formatScheduleDate("not-a-date", { month: "short" })).toBe("");
	});
});
