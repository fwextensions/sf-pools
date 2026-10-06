import { describe, it, expect } from "@jest/globals";
import { formatMinutes, parseTimeToMinutes } from "./time";

describe("parseTimeToMinutes", () => {
	it("parses morning times", () => {
		expect(parseTimeToMinutes("9:00a")).toBe(9 * 60);
		expect(parseTimeToMinutes("6:30a")).toBe(6 * 60 + 30);
	});

	it("parses afternoon times", () => {
		expect(parseTimeToMinutes("2:15p")).toBe(14 * 60 + 15);
	});

	it("handles noon and midnight", () => {
		expect(parseTimeToMinutes("12:00p")).toBe(12 * 60); // noon
		expect(parseTimeToMinutes("12:00a")).toBe(0); // midnight
	});

	it("returns null for malformed input", () => {
		expect(parseTimeToMinutes("25:00a")).toBeNull();
		expect(parseTimeToMinutes("13:00p")).toBeNull();
		expect(parseTimeToMinutes("9:60a")).toBeNull();
		expect(parseTimeToMinutes("9:00")).toBeNull();
		expect(parseTimeToMinutes("14:00")).toBeNull();
		expect(parseTimeToMinutes("noon")).toBeNull();
	});
});

describe("formatMinutes", () => {
	it("round-trips with parseTimeToMinutes", () => {
		for (const t of ["12:00a", "6:05a", "11:59a", "12:00p", "2:30p", "9:30p"]) {
			expect(formatMinutes(parseTimeToMinutes(t)!)).toBe(t);
		}
	});
});
