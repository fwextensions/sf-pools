import { describe, it, expect } from "@jest/globals";
import { formatFilterQuery, parseFilterQuery } from "./filter-url";

describe("formatFilterQuery", () => {
	it("writes one param per facet with bare slugs and literal commas", () => {
		expect(
			formatFilterQuery({
				tags: ["audience:preschool", "activity:lap", "audience:youth"],
				pools: ["balboa", "mlk"],
				cell: "thu-20",
			})
		).toBe("program=lap&audience=preschool,youth&pools=balboa,mlk&cell=thu-20");
	});

	it("is empty with no filters", () => {
		expect(formatFilterQuery({ tags: [], pools: [], cell: null })).toBe("");
	});

	it("drops tags from facets the picker does not offer", () => {
		expect(formatFilterQuery({ tags: ["access:drop-in"], pools: [], cell: null })).toBe("");
	});
});

describe("parseFilterQuery", () => {
	it("reads the per-facet params back into tag ids", () => {
		const params = new URLSearchParams("program=lap,family&audience=youth&pools=balboa");
		expect(parseFilterQuery(params)).toEqual({
			tags: ["activity:lap", "activity:family", "audience:youth"],
			pools: ["balboa"],
		});
	});

	it("still reads the old ?tags= links", () => {
		const params = new URLSearchParams("tags=audience%3Aadult%2Cactivity%3Alap");
		expect(parseFilterQuery(params).tags).toEqual(["audience:adult", "activity:lap"]);
	});

	it("returns null for halves the url leaves out", () => {
		expect(parseFilterQuery(new URLSearchParams("cell=thu-20"))).toEqual({ tags: null, pools: null });
	});

	it("round-trips what it writes", () => {
		const tags = ["activity:water-exercise", "audience:parent-child"];
		const qs = formatFilterQuery({ tags, pools: ["hamilton"], cell: null });
		expect(parseFilterQuery(new URLSearchParams(qs))).toEqual({ tags, pools: ["hamilton"] });
	});
});
