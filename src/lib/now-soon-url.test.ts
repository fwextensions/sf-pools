import { describe, it, expect } from "@jest/globals";
import { formatNowSoonQuery, parseNowSoonQuery, DEFAULT_OPTIONS } from "./now-soon-url";

const parse = (qs: string) => parseNowSoonQuery(new URLSearchParams(qs));

describe("now & soon url", () => {
	it("leaves the defaults out", () => {
		expect(formatNowSoonQuery(DEFAULT_OPTIONS)).toBe("");
		expect(parse("")).toEqual(DEFAULT_OPTIONS);
	});

	it("round-trips every control", () => {
		const options = { mode: "all", program: "lap" } as const;
		expect(formatNowSoonQuery(options)).toBe("access=all&program=lap");
		expect(parse(formatNowSoonQuery(options))).toEqual(options);
	});

	it("takes the first program it offers from a grid link, and ignores what it doesn't know", () => {
		expect(parse("program=youth,family,lap").program).toBe("family");
		expect(parse("program=lessons&when=someday&access=x")).toEqual(DEFAULT_OPTIONS);
	});
});
