// tests for closures.ts
import { describe, it, expect } from "@jest/globals";
import {
	detectClosure,
	parseDateRange,
	isClosureActive,
	formatClosurePeriod,
	checkClosureSanity,
	mergeClosure,
	type ClosureEnrichment,
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

describe("checkClosureSanity", () => {
	const base = detectClosure("Pool Closure 8-14_9-7 2026", opts)!;

	it("accepts a normal closure", () => {
		expect(checkClosureSanity(base, "2026-09-04")).toBeNull();
	});

	it("accepts an indefinite closure without dates", () => {
		expect(checkClosureSanity(detectClosure("Closed until further notice", opts)!, "2026-09-04"))
			.toBeNull();
	});

	it("rejects a range that ends before it starts", () => {
		expect(
			checkClosureSanity({ ...base, startDate: "2026-09-07", endDate: "2026-08-14" }, "2026-09-04")
		).toMatch(/ends before/);
	});

	it("rejects an implausibly long closure", () => {
		expect(
			checkClosureSanity({ ...base, startDate: "2026-01-01", endDate: "2028-01-01" }, "2026-09-04")
		).toMatch(/spans/);
	});

	it("rejects a closure ending years in the future", () => {
		expect(
			checkClosureSanity({ ...base, startDate: null, endDate: "2031-01-01" }, "2026-09-04")
		).toMatch(/implausibly far off/);
	});

	it("rejects a closure that ended long ago", () => {
		expect(
			checkClosureSanity({ ...base, startDate: null, endDate: "2020-01-01" }, "2026-09-04")
		).toMatch(/long past/);
	});
});

describe("mergeClosure", () => {
	const mergeOpts = { today: "2026-09-04", rawText: "Pool Closure 8-14_9-7 2026" };
	const pattern = detectClosure("Pool Closure 8-14_9-7 2026", opts)!;

	function enrichment(overrides: Partial<ClosureEnrichment> = {}): ClosureEnrichment {
		return {
			isClosure: true,
			scope: "whole-pool",
			startDate: "2026-08-14",
			endDate: "2026-09-07",
			indefinite: false,
			reason: "maintenance",
			summary: "Closed for maintenance until September 7.",
			confidence: 0.95,
			...overrides,
		};
	}

	it("keeps the pattern reading when there is no enrichment", () => {
		expect(mergeClosure(pattern, null, mergeOpts)).toBe(pattern);
	});

	it("adds the reason and summary without moving the dates", () => {
		const merged = mergeClosure(pattern, enrichment(), mergeOpts)!;
		expect(merged.startDate).toBe("2026-08-14");
		expect(merged.endDate).toBe("2026-09-07");
		expect(merged.reason).toBe("maintenance");
		expect(merged.summary).toMatch(/maintenance/);
		expect(merged.source).toBe("pattern+model");
		expect(merged.suppressPrograms).toBe(true);
	});

	it("keeps the pattern's dates when the model disagrees, and records it", () => {
		const merged = mergeClosure(pattern, enrichment({ endDate: "2026-10-31" }), mergeOpts)!;
		// the pattern read text we can point at; the model's date does not win
		expect(merged.endDate).toBe("2026-09-07");
		expect(merged.disagreement).toMatch(/2026-10-31/);
		expect(merged.suppressPrograms).toBe(true);
	});

	it("lets the model veto suppression by reading a closure as partial", () => {
		const merged = mergeClosure(pattern, enrichment({ scope: "partial" }), mergeOpts)!;
		expect(merged.suppressPrograms).toBe(false);
		expect(merged.disagreement).toMatch(/partial/);
	});

	it("lets the model veto suppression by rejecting the closure entirely", () => {
		const merged = mergeClosure(pattern, enrichment({ isClosure: false }), mergeOpts)!;
		expect(merged.suppressPrograms).toBe(false);
	});

	it("accepts a confident model-only closure the patterns missed", () => {
		const merged = mergeClosure(null, enrichment(), mergeOpts)!;
		expect(merged.source).toBe("model");
		expect(merged.suppressPrograms).toBe(true);
		expect(merged.endDate).toBe("2026-09-07");
	});

	it("refuses a model-only closure below the confidence bar", () => {
		expect(mergeClosure(null, enrichment({ confidence: 0.5 }), mergeOpts)).toBeNull();
	});

	it("refuses a model-only partial closure", () => {
		expect(mergeClosure(null, enrichment({ scope: "partial" }), mergeOpts)).toBeNull();
	});

	it("keeps a model-only closure visible but harmless when its dates fail sanity", () => {
		// a hallucinated range must never blank a schedule
		const merged = mergeClosure(
			null,
			enrichment({ startDate: "2026-09-07", endDate: "2026-08-14" }),
			mergeOpts
		)!;
		expect(merged.suppressPrograms).toBe(false);
		expect(merged.disagreement).toMatch(/sanity/);
	});
});
