import { describe, it, expect } from "@jest/globals";
import type { PoolSchedule } from "@/lib/pdf-processor";
import { closuresThisWeek, programMinutes, toSessions, withoutClosedDays } from "./sessions";
import type { Closure } from "./closures";

const pool = (id: string, programs: Array<[string, string, string]>) =>
	({
		id,
		name: id,
		programs: programs.map(([dayOfWeek, startTime, endTime]) => ({
			programName: "Lap Swim",
			dayOfWeek,
			startTime,
			endTime,
			tags: ["activity:lap"],
		})),
	}) as unknown as PoolSchedule;

describe("programMinutes", () => {
	it("parses both ends, or gives null when either doesn't parse", () => {
		expect(programMinutes({ startTime: "9:30a", endTime: "11:00a" })).toEqual({ startMin: 570, endMin: 660 });
		expect(programMinutes({ startTime: "noon", endTime: "1:00p" })).toBeNull();
		expect(programMinutes({ startTime: "9:30a", endTime: "" })).toBeNull();
	});
});

describe("toSessions", () => {
	it("flattens every pool's programs with their times parsed, leaving out unreadable ones", () => {
		const sessions = toSessions([
			pool("balboa", [
				["Monday", "9:30a", "11:00a"],
				["Monday", "noon", "1:00p"],
			]),
			pool("mlk", [["Tuesday", "6:00a", "7:00a"]]),
		]);
		expect(sessions.map((s) => [s.poolId, s.dayOfWeek, s.startMin, s.endMin, s.title])).toEqual([
			["balboa", "Monday", 570, 660, "Lap Swim"],
			["mlk", "Tuesday", 360, 420, "Lap Swim"],
		]);
	});
});

describe("withoutClosedDays", () => {
	const closure: Closure = {
		summary: "",
		rawText: "",
		startDate: "2026-10-13",
		endDate: "2026-11-01",
		indefinite: false,
		sourceUrl: null,
		reason: null,
		scope: "whole-pool",
		source: "pattern",
		suppressPrograms: true,
		confidence: null,
		disagreement: null,
	};
	const northBeach = {
		...pool("northBeachCool", [
			["Monday", "9:00a", "10:00a"],
			["Tuesday", "9:00a", "10:00a"],
			["Saturday", "9:00a", "10:00a"],
		]),
		closure,
	};

	it("drops the sessions on the days the closure covers this week", () => {
		// Fri Oct 9: the coming Tuesday is Oct 13, the first closed day
		const [open] = withoutClosedDays([northBeach], "2026-10-09");
		expect(open!.programs.map((p) => p.dayOfWeek)).toEqual(["Monday", "Saturday"]);
	});

	it("leaves a pool alone before its closure reaches this week", () => {
		expect(withoutClosedDays([northBeach], "2026-10-05")[0]).toBe(northBeach);
	});

	it("ignores a closure that isn't allowed to hide programs", () => {
		const partial = { ...northBeach, closure: { ...closure, suppressPrograms: false } };
		expect(withoutClosedDays([partial], "2026-10-20")[0]).toBe(partial);
	});

	describe("closures from the PDF's notes", () => {
		const rossi = pool("rossi", [
			["Monday", "9:00a", "10:00a"],
			["Thursday", "10:15a", "12:00p"],
			["Thursday", "11:00a", "1:30p"],
			["Thursday", "2:00p", "3:30p"],
		]);
		const holiday = {
			startDate: "2026-10-12",
			endDate: "2026-10-12",
			startTime: null,
			endTime: null,
			reason: "Indigenous Peoples Day",
		};
		const training = {
			...holiday,
			startDate: "2026-10-22",
			endDate: "2026-10-22",
			startTime: "12:00p",
			endTime: "2:00p",
			reason: "training",
		};
		const withClosures = { ...rossi, scheduledClosures: [holiday, training] };

		it("drops every session on a holiday this week", () => {
			// Sat Oct 10: the coming Monday is the holiday
			const [open] = withoutClosedDays([withClosures], "2026-10-10");
			expect(open!.programs.map((p) => p.dayOfWeek)).toEqual(["Thursday", "Thursday", "Thursday"]);
		});

		it("drops only the sessions a partial closure overlaps", () => {
			// Tue Oct 20: the coming Thursday is the training day, closed 12-2;
			// sessions that end as it starts or start as it ends still run
			const [open] = withoutClosedDays([withClosures], "2026-10-20");
			expect(open!.programs.map((p) => `${p.dayOfWeek} ${p.startTime}`)).toEqual([
				"Monday 9:00a",
				"Thursday 10:15a",
				"Thursday 2:00p",
			]);
		});

		it("leaves the week alone when no closure date falls in it", () => {
			expect(withoutClosedDays([withClosures], "2026-10-13")[0]).toBe(withClosures);
		});
	});
});

describe("closuresThisWeek", () => {
	const day = (startDate: string, reason: string, more: object = {}) => ({
		startDate,
		endDate: startDate,
		startTime: null,
		endTime: null,
		reason,
		...more,
	});
	const withClosures = (id: string, scheduledClosures: object[], closure: Closure | null = null) =>
		({ ...pool(id, []), scheduledClosures, closure }) as unknown as PoolSchedule;
	const maintenance: Closure = {
		summary: "",
		rawText: "",
		startDate: "2026-10-13",
		endDate: "2026-11-01",
		indefinite: false,
		sourceUrl: null,
		reason: "maintenance",
		scope: "whole-pool",
		source: "pattern",
		suppressPrograms: true,
		confidence: null,
		disagreement: null,
	};

	it("groups a holiday every pool lists into one closure, in the PDFs' majority wording", () => {
		const all = [
			withClosures("balboa", [day("2026-10-12", "Indigenous Peoples Day")]),
			withClosures("hamilton", [day("2026-10-12", "Indigenous People's Day")]),
			withClosures("rossi", [day("2026-10-12", "Indigenous Peoples Day"), day("2026-11-11", "Veterans Day")]),
		];
		expect(closuresThisWeek(all, "2026-10-12")).toEqual([
			{ ...day("2026-10-12", "Indigenous Peoples Day"), poolIds: ["balboa", "hamilton", "rossi"] },
		]);
	});

	it("keeps different time windows on the same day apart, all-day first", () => {
		const all = [
			withClosures("rossi", [day("2026-10-22", "training", { startTime: "12:00p", endTime: "2:00p" })]),
			withClosures("garfield", [day("2026-10-22", "training", { startTime: "11:00a", endTime: "2:00p" })]),
			withClosures("coffman", [day("2026-10-22", "training")]),
		];
		expect(closuresThisWeek(all, "2026-10-20").map((c) => c.poolIds)).toEqual([["coffman"], ["garfield"], ["rossi"]]);
	});

	it("includes a range that overlaps the week and leaves out pools an alert already closes", () => {
		const all = [
			withClosures("rossi", [day("2026-11-02", "annual maintenance", { endDate: "2026-11-21" })]),
			withClosures("northBeachCool", [day("2026-10-13", "ANNUAL MAINTENANCE", { endDate: "2026-10-31" })], maintenance),
		];
		expect(closuresThisWeek(all, "2026-10-30").map((c) => c.poolIds)).toEqual([["rossi"]]);
	});
});
