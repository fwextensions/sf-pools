import { describe, it, expect } from "@jest/globals";
import { formatGridQuery, parseGridQuery } from "./url";

const q = (s: string) => new URLSearchParams(s);

describe("formatGridQuery", () => {
	it("writes the categories with bare slugs and literal commas", () => {
		expect(
			formatGridQuery({
				tags: ["program:lap", "program:kids-lessons"],
				pools: ["balboa", "mlk"],
				cell: { day: "Thursday", hour: 20 },
			})
		).toBe("program=lap,kids-lessons&pools=balboa,mlk&cell=thu-20");
	});

	it("is empty with no filters", () => {
		expect(formatGridQuery({ tags: [], pools: [], cell: null })).toBe("");
	});

	it("drops tags from facets the picker does not offer", () => {
		expect(formatGridQuery({ tags: ["access:drop-in"], pools: [], cell: null })).toBe("");
	});
});

describe("parseGridQuery", () => {
	it("reads the params back into tag ids", () => {
		expect(parseGridQuery(q("program=lap,family&pools=balboa&cell=sat-9"))).toEqual({
			tags: ["program:lap", "program:family"],
			pools: ["balboa"],
			cell: { day: "Saturday", hour: 9 },
		});
	});

	it("ignores the old ?tags= and ?audience= params", () => {
		expect(parseGridQuery(q("tags=audience%3Aadult%2Cactivity%3Alap&audience=youth")).tags).toEqual([]);
	});

	it("drops what the grid can't show", () => {
		expect(parseGridQuery(q("program=rec,lap,therapy&pools=balboa,atlantis&cell=thu-23"))).toEqual({
			tags: ["program:lap"],
			pools: ["balboa"],
			cell: null,
		});
		expect(parseGridQuery(q("cell=xyz-10")).cell).toBeNull();
	});

	it("is empty for a bare url", () => {
		expect(parseGridQuery(q(""))).toEqual({ tags: [], pools: [], cell: null });
	});

	it("round-trips what it writes", () => {
		const state = {
			tags: ["program:water-exercise", "program:parent-tot"],
			pools: ["hamilton"],
			cell: { day: "Monday" as const, hour: 6 },
		};
		expect(parseGridQuery(q(formatGridQuery(state)))).toEqual(state);
	});
});
