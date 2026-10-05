import { describe, it, expect } from "@jest/globals";
import { formatGridQuery, parseGridQuery } from "./url";

const q = (s: string) => new URLSearchParams(s);

describe("formatGridQuery", () => {
	it("writes one param per facet with bare slugs and literal commas", () => {
		expect(
			formatGridQuery({
				tags: ["audience:preschool", "activity:lap", "audience:youth"],
				pools: ["balboa", "mlk"],
				cell: { day: "Thursday", hour: 20 },
			})
		).toBe("program=lap&audience=preschool,youth&pools=balboa,mlk&cell=thu-20");
	});

	it("is empty with no filters", () => {
		expect(formatGridQuery({ tags: [], pools: [], cell: null })).toBe("");
	});

	it("drops tags from facets the picker does not offer", () => {
		expect(formatGridQuery({ tags: ["access:drop-in"], pools: [], cell: null })).toBe("");
	});
});

describe("parseGridQuery", () => {
	it("reads the per-facet params back into tag ids", () => {
		expect(parseGridQuery(q("program=lap,family&audience=youth&pools=balboa&cell=sat-9"))).toEqual({
			tags: ["activity:lap", "activity:family", "audience:youth"],
			pools: ["balboa"],
			cell: { day: "Saturday", hour: 9 },
		});
	});

	it("still reads the old ?tags= links", () => {
		expect(parseGridQuery(q("tags=audience%3Aadult%2Cactivity%3Alap")).tags).toEqual(["audience:adult", "activity:lap"]);
	});

	it("drops what the grid can't show", () => {
		expect(parseGridQuery(q("tags=access:drop-in,activity:lap&pools=balboa,atlantis&cell=thu-23"))).toEqual({
			tags: ["activity:lap"],
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
			tags: ["activity:water-exercise", "audience:parent-child"],
			pools: ["hamilton"],
			cell: { day: "Monday" as const, hour: 6 },
		};
		expect(parseGridQuery(q(formatGridQuery(state)))).toEqual(state);
	});
});
