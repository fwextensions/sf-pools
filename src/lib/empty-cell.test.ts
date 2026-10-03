import { describe, it, expect } from "@jest/globals";
import { emptyCellMessage, explainEmptyCell } from "./empty-cell";

type S = { poolId: string; tags: string[] };

const lap = (poolId: string): S => ({ poolId, tags: ["activity:lap"] });
const family = (poolId: string): S => ({ poolId, tags: ["activity:family"] });
const wantsLap = (s: S) => s.tags.includes("activity:lap");
const name = (id: string) => id.toUpperCase();

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

	it("blames pools and names where the matching sessions are", () => {
		const cell = [lap("rossi"), lap("sava"), lap("rossi"), family("mission")];
		expect(explainEmptyCell(cell, wantsLap, new Set(["balboa"]))).toEqual({
			kind: "pools",
			hidden: 3,
			poolIds: ["rossi", "sava"],
		});
	});

	it("blames both when neither filter alone is the cause", () => {
		const cell = [family("rossi"), family("sava")];
		expect(explainEmptyCell(cell, wantsLap, new Set(["balboa"]))).toEqual({ kind: "both", hidden: 2 });
	});
});

describe("emptyCellMessage", () => {
	it("words each case", () => {
		expect(emptyCellMessage({ kind: "nothing" }, name)).toBe("Nothing is scheduled at any pool in this hour.");
		expect(emptyCellMessage({ kind: "programs", hidden: 1 }, name)).toBe("Your program filter hides 1 session here.");
		expect(emptyCellMessage({ kind: "pools", hidden: 2, poolIds: ["rossi"] }, name)).toBe(
			"Your pool filter hides 2 sessions here, at ROSSI."
		);
		expect(emptyCellMessage({ kind: "pools", hidden: 3, poolIds: ["a", "b", "c"] }, name)).toBe(
			"Your pool filter hides 3 sessions here, at A, B, and C."
		);
		expect(emptyCellMessage({ kind: "both", hidden: 4 }, name)).toBe(
			"Your program and pool filters both hide the 4 sessions here."
		);
	});
});
