// tests for computeRunChangelog in scripts/changelog.ts: listing a posted
// schedule's changes when it's first found, not when it takes over
import { describe, it, expect } from "@jest/globals";
import { computeRunChangelog, mergeChangelogs } from "../../scripts/changelog";
import type { PoolSchedule } from "./schedule-schema";

const schedule = (pdf: string, start: string | null, lapEnd: string) =>
	({
		id: "sava",
		name: "Sava Pool",
		pdfScheduleUrl: `https://sfrecpark.org/DocumentCenter/View/${pdf}`,
		scheduleStartDate: start,
		programs: [
			{ programName: "Lap Swim", dayOfWeek: "Wednesday", startTime: "2:30p", endTime: lapEnd },
			{ programName: "Lap Swim", dayOfWeek: "Thursday", startTime: "7:00a", endTime: "9:00a" },
		],
	}) as unknown as PoolSchedule;

const fall2 = schedule("30037", "2026-08-29", "3:30p");
const fall3 = schedule("30374", "2026-11-03", "5:30p");

describe("computeRunChangelog", () => {
	it("lists a newly posted schedule's changes with the date they start", () => {
		const entry = computeRunChangelog({ previous: [fall2], previousUpcoming: [], current: [fall2], upcoming: [fall3] });
		expect(entry.pools).toEqual([
			expect.objectContaining({
				poolName: "Sava Pool",
				effectiveDate: "2026-11-03",
				pdfUrl: fall3.pdfScheduleUrl,
				changes: [{ type: "modified", program: "Lap Swim", day: "Wednesday", oldTime: "2:30p–3:30p", newTime: "2:30p–5:30p" }],
			}),
		]);
		expect([entry.totalChanges, entry.poolsChanged, entry.changeSeverity]).toEqual([1, 1, "minor"]);
	});

	it("lists nothing again while the posted schedule stays the same", () => {
		const entry = computeRunChangelog({ previous: [fall2], previousUpcoming: [fall3], current: [fall2], upcoming: [fall3] });
		expect(entry.pools).toEqual([]);
	});

	it("lists only the edits to a schedule posted before", () => {
		const revised = schedule("30374", "2026-11-03", "6:00p");
		const entry = computeRunChangelog({ previous: [fall2], previousUpcoming: [fall3], current: [fall2], upcoming: [revised] });
		expect(entry.pools[0]!.changes).toEqual([
			{ type: "modified", program: "Lap Swim", day: "Wednesday", oldTime: "2:30p–5:30p", newTime: "2:30p–6:00p" },
		]);
	});

	it("doesn't list a posted schedule's changes again when it takes over", () => {
		const entry = computeRunChangelog({ previous: [fall2], previousUpcoming: [fall3], current: [fall3], upcoming: [] });
		expect(entry.pools).toEqual([]);
		expect(entry.totalChanges).toBe(0);
	});

	it("still lists changes to a schedule that takes over without having been posted first", () => {
		const entry = computeRunChangelog({ previous: [fall2], previousUpcoming: [], current: [fall3], upcoming: [] });
		expect(entry.pools[0]).toMatchObject({ poolName: "Sava Pool", programsModified: 1 });
		expect(entry.pools[0]!.effectiveDate).toBeUndefined();
	});
});

describe("mergeChangelogs with posted schedules", () => {
	it("keeps a pool's changes in force apart from a posted schedule's", () => {
		const first = computeRunChangelog({ previous: [fall2], previousUpcoming: [], current: [fall2], upcoming: [fall3] });
		const thursday = schedule("30037", "2026-08-29", "3:30p");
		thursday.programs[1] = { ...thursday.programs[1]!, endTime: "9:30a" };
		const second = computeRunChangelog({ previous: [fall2], previousUpcoming: [fall3], current: [thursday], upcoming: [fall3] });
		const merged = mergeChangelogs(first, second);
		expect(merged.pools.map((p) => [p.effectiveDate ?? null, p.changes.length])).toEqual([
			["2026-11-03", 1],
			[null, 1],
		]);
		expect([merged.poolsChanged, merged.totalChanges]).toEqual([1, 2]);
	});
});
