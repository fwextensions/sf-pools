import { describe, it, expect } from "@jest/globals";
import { createGridModel, type GridChange } from "./grid-model";
import { hitKey, type GridSession } from "./sessions";

function session(poolId: string, startTime: string, endTime: string, tags: string[]): GridSession {
	const min = (t: string) => {
		const [h, m] = t.split(":").map(Number);
		return h * 60 + m;
	};
	return {
		poolId,
		title: tags.join(" "),
		badges: [],
		tags,
		dayOfWeek: "Monday",
		startTime,
		endTime,
		startMin: min(startTime),
		endMin: min(endTime),
	};
}

const sessions = [
	session("mlk", "7:00", "8:00", ["activity:lap", "audience:adult"]),
	session("balboa", "7:00", "8:00", ["activity:family", "audience:youth"]),
	session("mlk", "18:00", "19:00", ["activity:rec"]),
];

function setup(initial: Partial<{ tags: string[]; pools: string[] }> = {}) {
	const model = createGridModel(sessions, { tags: [], pools: [], cell: null, ...initial });
	const changes: GridChange[] = [];
	model.subscribe((c) => changes.push(c));
	return { model, changes };
}

describe("createGridModel", () => {
	it("starts from the state it was given", () => {
		const { model } = setup({ tags: ["activity:lap"], pools: ["mlk"] });
		const f = model.getFilters();
		expect(f.tags).toEqual(["activity:lap"]);
		expect(f.pools).toEqual(["mlk"]);
		expect(f.hours[0]).toBe(7);
		expect(f.hours[f.hours.length - 1]).toBe(18);
		expect(model.getCell()).toBeNull();
	});

	it("toggles a tag, reports the state it leads to and recomputes the hits", () => {
		const { model, changes } = setup();
		const before = model.getFilters();
		expect(before.hitMatrix.has(hitKey("Monday", 7, "balboa"))).toBe(true);

		model.toggleTag("activity:lap");
		const after = model.getFilters();
		expect(after).not.toBe(before);
		expect(after.tags).toEqual(["activity:lap"]);
		expect(after.hitMatrix.has(hitKey("Monday", 7, "mlk"))).toBe(true);
		expect(after.hitMatrix.has(hitKey("Monday", 7, "balboa"))).toBe(false);
		// the fade still knows the faded session is there
		expect(after.anyHitMatrix.has(hitKey("Monday", 7, "balboa"))).toBe(true);
		expect(changes).toEqual([
			{ kind: "filters", action: { type: "toggleTag", tag: "activity:lap", selected: true, total: 1 } },
		]);

		model.toggleTag("activity:lap");
		expect(model.getFilters().tags).toEqual([]);
		expect(changes[1]).toEqual({
			kind: "filters",
			action: { type: "toggleTag", tag: "activity:lap", selected: false, total: 0 },
		});
	});

	it("ticks every box in a group, which filters nothing and stays out of the url", () => {
		const { model, changes } = setup();
		model.toggleGroup("audience");
		const f = model.getFilters();
		expect(f.tags.sort()).toEqual(["audience:adult", "audience:youth"]);
		expect(f.filter.urlTags).toEqual([]);
		expect(f.groups.find((g) => g.id === "audience")?.allSelected).toBe(true);
		expect(changes[0]).toEqual({
			kind: "filters",
			action: { type: "toggleGroup", group: "audience", selected: true, total: 2 },
		});

		model.toggleGroup("audience");
		expect(model.getFilters().tags).toEqual([]);
		expect(changes[1].kind === "filters" && changes[1].action).toMatchObject({ selected: false, total: 0 });
	});

	it("ignores a group it doesn't offer", () => {
		const { model, changes } = setup();
		model.toggleGroup("nonsense");
		expect(changes).toEqual([]);
	});

	it("toggles a pool", () => {
		const { model, changes } = setup();
		model.togglePool("mlk");
		expect(model.getFilters().pools).toEqual(["mlk"]);
		expect(model.getFilters().filter.poolSet).toEqual(new Set(["mlk"]));
		expect(changes[0]).toEqual({
			kind: "filters",
			action: { type: "togglePool", pool: "mlk", selected: true, total: 1 },
		});
	});

	it("clears both filters, or only the one an empty cell blamed", () => {
		const initial = { tags: ["activity:lap", "activity:rec"], pools: ["mlk"] };

		const all = setup(initial);
		all.model.clearFilters("all");
		expect(all.model.getFilters()).toMatchObject({ tags: [], pools: [] });
		expect(all.changes[0]).toEqual({
			kind: "filters",
			action: { type: "clear", programs: 2, pools: 1, source: "clear_button" },
		});

		const programs = setup(initial);
		programs.model.clearFilters("programs", "empty_cell");
		expect(programs.model.getFilters()).toMatchObject({ tags: [], pools: ["mlk"] });
		expect(programs.changes[0]).toEqual({
			kind: "filters",
			action: { type: "clear", programs: 2, pools: 0, source: "empty_cell" },
		});

		const pools = setup(initial);
		pools.model.clearFilters("pools", "empty_cell");
		expect(pools.model.getFilters()).toMatchObject({ tags: initial.tags, pools: [] });
		expect(pools.changes[0]).toEqual({
			kind: "filters",
			action: { type: "clear", programs: 0, pools: 1, source: "empty_cell" },
		});
	});

	it("shows a dragged-over cell without committing it", () => {
		const { model, changes } = setup();
		model.previewCell({ day: "Monday", hour: 7 });
		model.previewCell({ day: "Monday", hour: 7 });
		model.previewCell({ day: "Monday", hour: 8 });
		expect(model.getCell()).toEqual({ day: "Monday", hour: 8 });
		expect(model.getCommittedCell()).toBeNull();
		// the repeat over the same cell says nothing
		expect(changes).toEqual([{ kind: "preview" }, { kind: "preview" }]);

		model.selectCell(model.getCell(), "drag");
		expect(model.getCommittedCell()).toEqual({ day: "Monday", hour: 8 });
		expect(changes[2]).toEqual({
			kind: "cell",
			action: { type: "selectCell", cell: { day: "Monday", hour: 8 }, source: "drag" },
			changed: true,
		});
	});

	it("reports a click on the selected cell, marked unchanged", () => {
		const { model, changes } = setup();
		model.selectCell({ day: "Monday", hour: 7 }, "click");
		model.selectCell({ day: "Monday", hour: 7 }, "click");
		expect(changes.map((c) => c.kind === "cell" && c.changed)).toEqual([true, false]);
		expect(model.getCell()).toEqual({ day: "Monday", hour: 7 });
	});

	it("keeps the cell through filter changes and the filters through cell changes", () => {
		const { model } = setup();
		model.selectCell({ day: "Monday", hour: 7 }, "click");
		const filters = model.getFilters();
		model.previewCell({ day: "Monday", hour: 18 });
		expect(model.getFilters()).toBe(filters);
		model.togglePool("mlk");
		expect(model.getCell()).toEqual({ day: "Monday", hour: 18 });
	});

	it("stops telling a listener once it unsubscribes", () => {
		const model = createGridModel(sessions, { tags: [], pools: [], cell: null });
		const seen: GridChange[] = [];
		const unsubscribe = model.subscribe((c) => seen.push(c));
		model.togglePool("mlk");
		unsubscribe();
		model.togglePool("mlk");
		expect(seen).toHaveLength(1);
	});
});
