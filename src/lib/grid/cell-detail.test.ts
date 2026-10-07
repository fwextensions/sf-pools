import { describe, it, expect } from "@jest/globals";
import { cellDetail, emptyCellMessage, explainEmptyCell } from "./cell-detail";
import type { Session } from "@/lib/sessions";

type S = { poolId: string; tags: string[] };

const lap = (poolId: string): S => ({ poolId, tags: ["activity:lap"] });
const family = (poolId: string): S => ({ poolId, tags: ["activity:family"] });
const wantsLap = (s: { tags: string[] }) => s.tags.includes("activity:lap");

describe("explainEmptyCell", () => {
	it("reports nothing when the hour is empty at every pool", () => {
		expect(explainEmptyCell([], wantsLap, new Set(["balboa"]))).toEqual({ kind: "nothing" });
	});

	it("blames programs when the picked pools have other sessions", () => {
		const cell = [family("balboa"), family("balboa"), lap("rossi")];
		expect(explainEmptyCell(cell, wantsLap, new Set(["balboa"]))).toEqual({ kind: "programs", hidden: 2 });
	});

	it("blames programs when no pool is picked", () => {
		expect(explainEmptyCell([family("balboa")], wantsLap, null)).toEqual({ kind: "programs", hidden: 1 });
	});

	it("blames pools when the matching sessions are elsewhere", () => {
		const cell = [lap("rossi"), lap("sava"), lap("rossi"), family("mission")];
		expect(explainEmptyCell(cell, wantsLap, new Set(["balboa"]))).toEqual({
			kind: "pools",
			hidden: 3,
		});
	});

	it("blames both when neither filter alone is the cause", () => {
		const cell = [family("rossi"), family("sava")];
		expect(explainEmptyCell(cell, wantsLap, new Set(["balboa"]))).toEqual({ kind: "both", hidden: 2 });
	});
});

describe("emptyCellMessage", () => {
	it("words each case", () => {
		expect(emptyCellMessage({ kind: "nothing" })).toBe("Nothing is scheduled at any pool in this hour.");
		expect(emptyCellMessage({ kind: "programs", hidden: 1 })).toBe("Your program filter hides 1 session here.");
		expect(emptyCellMessage({ kind: "pools", hidden: 2 })).toBe("Your pool filter hides 2 sessions here.");
		expect(emptyCellMessage({ kind: "both", hidden: 4 })).toBe(
			"Your program and pool filters both hide the 4 sessions here."
		);
	});
});

describe("cellDetail", () => {
	const session = (poolId: string, tag: string, startTime: string, endTime: string, startMin: number, endMin: number): Session => ({
		poolId,
		title: tag,
		badges: [],
		tags: [tag],
		dayOfWeek: "Thursday",
		startTime,
		endTime,
		startMin,
		endMin,
	});
	const sessions = [
		session("rossi", "activity:lap", "10:30a", "11:30a", 630, 690),
		session("balboa", "activity:family", "10:45a", "12:00p", 645, 720),
		session("balboa", "activity:lap", "10:00a", "11:00a", 600, 660),
		// ends as the hour starts, so it is not in the 10a cell
		session("balboa", "activity:lap", "9:00a", "10:00a", 540, 600),
		session("mlk", "activity:lap", "10:00a", "11:00a", 600, 660),
	];
	const cell = { day: "Thursday" as const, hour: 10 };
	const everything = { matchesTags: () => true, poolSet: null };

	it("lists the cell's sessions by start time, in pool order on ties", () => {
		const { rows, empty } = cellDetail(sessions, cell, everything);
		expect(rows.map((r) => `${r.pool.code} ${r.startTime}`)).toEqual([
			"BAL 10:00a",
			"MLK 10:00a",
			"ROS 10:30a",
			"BAL 10:45a",
		]);
		expect(empty).toBeNull();
	});

	it("honours both filters", () => {
		const { rows } = cellDetail(sessions, cell, { matchesTags: wantsLap, poolSet: new Set(["balboa", "rossi"]) });
		expect(rows.map((r) => `${r.pool.code} ${r.startTime}`)).toEqual(["BAL 10:00a", "ROS 10:30a"]);
	});

	it("says which filter emptied the cell", () => {
		const { rows, empty } = cellDetail(sessions, cell, { matchesTags: wantsLap, poolSet: new Set(["sava"]) });
		expect(rows).toEqual([]);
		expect(empty).toEqual({ kind: "pools", hidden: 3 });
	});
});
