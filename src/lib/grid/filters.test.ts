import { describe, it, expect } from "@jest/globals";
import { countTags, createFilter, facetGroups, pickerTags, toggleGroup, toggleItem } from "./filters";

const s = (...tags: string[]) => ({ tags });

// what the season's schedules use: three categories in two groups, with the
// activity tags they were worked out from
const sessions = [
	s("program:lap", "activity:lap", "activity:senior"),
	s("program:lap", "activity:lap"),
	s("program:family", "activity:family"),
	s("program:senior", "activity:senior", "access:drop-in"),
];
const counts = countTags(sessions);

describe("createFilter", () => {
	it("matches everything with nothing picked", () => {
		const { matchesTags, poolSet, urlTags } = createFilter({ tags: [], pools: [] }, counts);
		expect(sessions.every(matchesTags)).toBe(true);
		expect(poolSet).toBeNull();
		expect(urlTags).toEqual([]);
	});

	it("ORs the picked categories", () => {
		const { matchesTags } = createFilter({ tags: ["program:lap", "program:family"], pools: [] }, counts);
		expect(sessions.map(matchesTags)).toEqual([true, true, true, false]);
	});

	it("hides a category's sessions when it is unticked, whatever their activities", () => {
		const { matchesTags } = createFilter({ tags: ["program:senior", "program:family"], pools: [] }, counts);
		// the first session is senior lap swim by its activities, filed under lap
		expect(sessions.map(matchesTags)).toEqual([false, false, true, true]);
	});

	it("treats every category ticked as no filter, and leaves it out of the url", () => {
		const tags = ["program:lap", "program:family", "program:senior"];
		const { matchesTags, urlTags } = createFilter({ tags, pools: [] }, counts);
		expect(sessions.every(matchesTags)).toBe(true);
		expect(urlTags).toEqual([]);
	});

	it("counts only tags the schedules use toward every-tag-ticked", () => {
		// a stale tag no session carries doesn't make the facet look complete
		const tags = ["program:lap", "program:family", "program:rentals"];
		expect(createFilter({ tags, pools: [] }, counts).urlTags).toEqual(tags);
	});

	it("keeps the picked pools", () => {
		expect(createFilter({ tags: [], pools: ["balboa"] }, counts).poolSet).toEqual(new Set(["balboa"]));
	});
});

describe("facetGroups", () => {
	it("lists the categories in use per group, in group order and alphabetized by label, with selection state", () => {
		const groups = facetGroups(counts, ["program:lap", "program:family"]);
		expect(groups.map((g) => [g.id, g.label, g.tags, g.allSelected, g.someSelected])).toEqual([
			["swim", "Swim", ["program:family", "program:lap"], true, true],
			["exercise", "Exercise & therapy", ["program:senior"], false, false],
		]);
	});
});

describe("toggles", () => {
	it("toggleItem adds and removes", () => {
		expect(toggleItem(["a"], "b")).toEqual(["a", "b"]);
		expect(toggleItem(["a", "b"], "a")).toEqual(["b"]);
	});

	it("toggleGroup ticks the whole group, or clears it when all are ticked", () => {
		const group = { tags: ["program:lap", "program:family"], allSelected: false };
		expect(toggleGroup(["program:senior", "program:lap"], group)).toEqual([
			"program:senior",
			"program:lap",
			"program:family",
		]);
		expect(toggleGroup(["program:senior", "program:lap", "program:family"], { ...group, allSelected: true })).toEqual([
			"program:senior",
		]);
	});
});

describe("pickerTags", () => {
	it("keeps only the categories the picker offers", () => {
		expect(pickerTags(["program:lap", "activity:lap", "access:drop-in", "audience:youth", "program:nonsense"])).toEqual([
			"program:lap",
		]);
	});
});
