// tests for closures.ts
import { describe, it, expect } from "@jest/globals";
import {
	detectClosure,
	parseDateRange,
	isClosureActive,
	formatClosurePeriod,
} from "./closures";

const opts = { referenceDate: "2026-09-04" };

describe("parseDateRange", () => {
	it("reads the document-title style range", () => {
		// the shape SF Rec & Park uses for notice PDFs
		expect(parseDateRange("Garfield Pool Maintenance Closure 8-14_9-7 2026", 2026)).toEqual({
			startDate: "2026-08-14",
			endDate: "2026-09-07",
		});
	});

	it("prefers a year written in the text over the reference year", () => {
		const r = parseDateRange("Closure 8-14_9-7 2027", 2026);
		expect(r.startDate).toBe("2027-08-14");
	});

	it("reads a named month range", () => {
		expect(parseDateRange("Closed August 14 - September 7, 2026", 2026)).toEqual({
			startDate: "2026-08-14",
			endDate: "2026-09-07",
		});
	});

	it("reads a range written with 'through' and abbreviated months", () => {
		expect(parseDateRange("Closed Aug 14 through Sept 7", 2026)).toEqual({
			startDate: "2026-08-14",
			endDate: "2026-09-07",
		});
	});

	it("reads a range within one month", () => {
		expect(parseDateRange("Closed December 22 - 26", 2026)).toEqual({
			startDate: "2026-12-22",
			endDate: "2026-12-26",
		});
	});

	it("reads an end-only range", () => {
		expect(parseDateRange("Pool closed through September 7", 2026)).toEqual({
			startDate: null,
			endDate: "2026-09-07",
		});
	});

	it("rolls the end into the next year when the range wraps", () => {
		expect(parseDateRange("Closure 12-20_1-5", 2026)).toEqual({
			startDate: "2026-12-20",
			endDate: "2027-01-05",
		});
	});

	it("rejects impossible dates", () => {
		expect(parseDateRange("Closure 2-30_3-1", 2026).startDate).toBeNull();
	});

	it("returns nulls when there is no date", () => {
		expect(parseDateRange("Pool closed for maintenance", 2026)).toEqual({
			startDate: null,
			endDate: null,
		});
	});
});

describe("detectClosure", () => {
	it("detects the Garfield maintenance closure from its document title", () => {
		const c = detectClosure("Garfield Pool Maintenance Closure 8-14_9-7 2026", opts);
		expect(c).not.toBeNull();
		expect(c!.startDate).toBe("2026-08-14");
		expect(c!.endDate).toBe("2026-09-07");
		expect(c!.indefinite).toBe(false);
	});

	it("detects an indefinite closure", () => {
		const c = detectClosure("Mission Pool is closed until further notice", opts);
		expect(c).not.toBeNull();
		expect(c!.indefinite).toBe(true);
		expect(c!.endDate).toBeNull();
	});

	it("carries the source PDF url through", () => {
		const c = detectClosure("Pool Closure 8-14_9-7 2026", {
			...opts,
			sourceUrl: "https://sfrecpark.org/DocumentCenter/View/29808",
		});
		expect(c!.sourceUrl).toBe("https://sfrecpark.org/DocumentCenter/View/29808");
	});

	it("ignores text that is not about a closure", () => {
		expect(detectClosure("Please note that registration opens Sept 7", opts)).toBeNull();
	});

	it("ignores a closure with no stated duration", () => {
		// not enough to hide a whole schedule over
		expect(detectClosure("The pool is closed for maintenance", opts)).toBeNull();
	});

	it("ignores closures of parts of the facility", () => {
		expect(
			detectClosure("The locker room is closed August 14 - September 7", opts)
		).toBeNull();
		expect(detectClosure("Diving board closed through Sept 7", opts)).toBeNull();
	});

	it("ignores a holiday closure", () => {
		// one-day observances shouldn't blank out a schedule
		expect(
			detectClosure("All pools closed Friday, June 19 in observance of Juneteenth", opts)
		).toBeNull();
	});
});

describe("isClosureActive", () => {
	const closure = detectClosure("Pool Closure 8-14_9-7 2026", opts)!;

	it("is active inside the range", () => {
		expect(isClosureActive(closure, "2026-09-04")).toBe(true);
	});

	it("is active on the boundary days", () => {
		expect(isClosureActive(closure, "2026-08-14")).toBe(true);
		expect(isClosureActive(closure, "2026-09-07")).toBe(true);
	});

	it("expires on its own once the end date passes", () => {
		expect(isClosureActive(closure, "2026-09-08")).toBe(false);
	});

	it("is not yet active before it starts", () => {
		expect(isClosureActive(closure, "2026-08-13")).toBe(false);
	});

	it("treats an indefinite closure as ongoing", () => {
		const indefinite = detectClosure("Closed until further notice", opts)!;
		expect(isClosureActive(indefinite, "2030-01-01")).toBe(true);
	});
});

describe("formatClosurePeriod", () => {
	it("formats a full range", () => {
		expect(formatClosurePeriod(detectClosure("Closure 8-14_9-7 2026", opts)!)).toBe(
			"Aug 14 – Sep 7"
		);
	});

	it("formats an end-only closure", () => {
		expect(formatClosurePeriod(detectClosure("Closed through September 7, 2026", opts)!)).toBe(
			"through Sep 7"
		);
	});

	it("formats an indefinite closure", () => {
		expect(formatClosurePeriod(detectClosure("Closed until further notice", opts)!)).toBe(
			"until further notice"
		);
	});
});
