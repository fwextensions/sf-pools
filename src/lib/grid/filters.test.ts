import { describe, it, expect } from "@jest/globals";
import { countTags, createFilter, facetGroups, pickerTags, toggleGroup, toggleItem } from "./filters";

const s = (...tags: string[]) => ({ tags });

// what the season's schedules use: three programs, two audiences
const sessions = [
	s("activity:lap", "audience:adult"),
	s("activity:lap"),
	s("activity:family", "audience:youth"),
	s("activity:rec", "access:drop-in"),
];
const counts = countTags(sessions);

describe("createFilter", () => {
	it("matches everything with nothing picked", () => {
		const { matchesTags, poolSet, urlTags } = createFilter({ tags: [], pools: [] }, counts);
		expect(sessions.every(matchesTags)).toBe(true);
		expect(poolSet).toBeNull();
		expect(urlTags).toEqual([]);
	});

	it("ORs tags within a facet", () => {
		const { matchesTags } = createFilter({ tags: ["activity:lap", "activity:family"], pools: [] }, counts);
		expect(sessions.map(matchesTags)).toEqual([true, true, true, false]);
	});

	it("ANDs across facets", () => {
		const { matchesTags } = createFilter({ tags: ["activity:lap", "audience:adult"], pools: [] }, counts);
		expect(sessions.map(matchesTags)).toEqual([true, false, false, false]);
	});

	it("treats a facet with every tag ticked as no filter, and leaves it out of the url", () => {
		const tags = ["audience:adult", "audience:youth", "activity:lap"];
		const { matchesTags, urlTags } = createFilter({ tags, pools: [] }, counts);
		// the second session says nothing about its audience and still matches
		expect(sessions.map(matchesTags)).toEqual([true, true, false, false]);
		expect(urlTags).toEqual(["activity:lap"]);
	});

	it("counts only tags the schedules use toward every-tag-ticked", () => {
		// a stale tag no session carries doesn't make the facet look complete
		const { urlTags } = createFilter({ tags: ["audience:adult", "audience:senior"], pools: [] }, counts);
		expect(urlTags).toEqual(["audience:adult", "audience:senior"]);
	});

	it("keeps the picked pools", () => {
		expect(createFilter({ tags: [], pools: ["balboa"] }, counts).poolSet).toEqual(new Set(["balboa"]));
	});
});

describe("facetGroups", () => {
	it("lists the tags in use per picker facet, alphabetized by label, with selection state", () => {
		const groups = facetGroups(counts, ["activity:lap", "activity:family", "activity:rec", "audience:youth"]);
		expect(groups.map((g) => [g.id, g.tags, g.allSelected, g.someSelected])).toEqual([
			["activity", ["activity:family", "activity:lap", "activity:rec"], true, true],
			["audience", ["audience:adult", "audience:youth"], false, true],
		]);
	});
});

describe("toggles", () => {
	it("toggleItem adds and removes", () => {
		expect(toggleItem(["a"], "b")).toEqual(["a", "b"]);
		expect(toggleItem(["a", "b"], "a")).toEqual(["b"]);
	});

	it("toggleGroup ticks the whole group, or clears it when all are ticked", () => {
		const group = { tags: ["audience:adult", "audience:youth"], allSelected: false };
		expect(toggleGroup(["activity:lap", "audience:adult"], group)).toEqual([
			"activity:lap",
			"audience:adult",
			"audience:youth",
		]);
		expect(toggleGroup(["activity:lap", "audience:adult", "audience:youth"], { ...group, allSelected: true })).toEqual([
			"activity:lap",
		]);
	});
});

describe("pickerTags", () => {
	it("drops tags from facets the picker doesn't offer", () => {
		expect(pickerTags(["activity:lap", "access:drop-in", "audience:youth"])).toEqual(["activity:lap", "audience:youth"]);
	});
});
