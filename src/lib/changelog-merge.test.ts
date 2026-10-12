// tests for mergeChangelogs in scripts/changelog.ts: folding a same-day rerun
// into that day's entry
import { describe, it, expect } from "@jest/globals";
import { mergeChangelogs, type ChangelogEntry, type PoolChange, type ProgramChange } from "../../scripts/changelog";

function pool(poolName: string, changes: ProgramChange[]): PoolChange {
	return {
		poolName,
		programsAdded: changes.filter((c) => c.type === "added").length,
		programsRemoved: changes.filter((c) => c.type === "removed").length,
		programsModified: changes.filter((c) => c.type === "modified").length,
		changes,
	};
}

function entry(pools: PoolChange[], overrides: Partial<ChangelogEntry> = {}): ChangelogEntry {
	const added = pools.reduce((n, p) => n + p.programsAdded, 0);
	const removed = pools.reduce((n, p) => n + p.programsRemoved, 0);
	const modified = pools.reduce((n, p) => n + p.programsModified, 0);
	return {
		date: "2026-10-09",
		timestamp: "2026-10-09T00:00:00.000Z",
		poolsChanged: pools.length,
		totalProgramsAdded: added,
		totalProgramsRemoved: removed,
		totalProgramsModified: modified,
		totalChanges: added + removed + modified,
		changeSeverity: added + removed + modified > 0 ? "minor" : "none",
		scheduleStartDate: null,
		scheduleEndDate: null,
		scheduleSeason: null,
		seasonChanged: false,
		quarantinedPools: [],
		pools,
		warnings: [],
		...overrides,
	};
}

const removedLap: ProgramChange = { type: "removed", program: "Lap Swim", day: "Monday", oldTime: "9:00a–10:00a" };
const addedLap: ProgramChange = { type: "added", program: "Lap Swim", day: "Monday", newTime: "9:00a–10:00a" };

describe("mergeChangelogs", () => {
	it("keeps the first run's changes when the rerun found none", () => {
		const first = entry([pool("Balboa", [addedLap])]);
		const merged = mergeChangelogs(first, entry([], { warnings: ["grounding: something"] }));
		expect(merged.pools).toEqual(first.pools);
		expect(merged.totalProgramsAdded).toBe(1);
		expect(merged.warnings).toEqual(["grounding: something"]);
	});

	it("cancels a removal the rerun put back", () => {
		const merged = mergeChangelogs(entry([pool("Balboa", [removedLap])]), entry([pool("Balboa", [addedLap])]));
		expect(merged.pools).toEqual([]);
		expect(merged.totalChanges).toBe(0);
		expect(merged.changeSeverity).toBe("none");
	});

	it("joins two time changes into one", () => {
		const first = { type: "modified", program: "Lap Swim", day: "Monday", oldTime: "9:00a–10:00a", newTime: "9:30a–10:30a" } as const;
		const second = { type: "modified", program: "Lap Swim", day: "Monday", oldTime: "9:30a–10:30a", newTime: "10:00a–11:00a" } as const;
		const merged = mergeChangelogs(entry([pool("Balboa", [first])]), entry([pool("Balboa", [second])]));
		expect(merged.pools[0]!.changes).toEqual([
			{ type: "modified", program: "Lap Swim", day: "Monday", oldTime: "9:00a–10:00a", newTime: "10:00a–11:00a" },
		]);
	});

	it("adds changes to other pools alongside the first run's", () => {
		const merged = mergeChangelogs(entry([pool("Balboa", [removedLap])]), entry([pool("Rossi", [addedLap])]));
		expect(merged.pools.map((p) => p.poolName)).toEqual(["Balboa", "Rossi"]);
		expect(merged.poolsChanged).toBe(2);
		expect(merged.totalProgramsAdded).toBe(1);
		expect(merged.totalProgramsRemoved).toBe(1);
	});

	it("links each pool to the PDF the latest run read", () => {
		const first = { ...pool("Balboa", [removedLap]), pdfUrl: "https://example.com/old.pdf" };
		const second = { ...pool("Balboa", [{ ...addedLap, program: "Family Swim" }]), pdfUrl: "https://example.com/new.pdf" };
		const rossi = { ...pool("Rossi", [addedLap]), pdfUrl: "https://example.com/rossi.pdf" };
		const merged = mergeChangelogs(entry([first, rossi]), entry([second]));
		expect(merged.pools.map((p) => p.pdfUrl)).toEqual(["https://example.com/new.pdf", "https://example.com/rossi.pdf"]);
	});

	it("doesn't repeat a warning both runs raised", () => {
		const merged = mergeChangelogs(entry([], { warnings: ["a", "b"] }), entry([], { warnings: ["b", "c"] }));
		expect(merged.warnings).toEqual(["a", "b", "c"]);
	});
});
