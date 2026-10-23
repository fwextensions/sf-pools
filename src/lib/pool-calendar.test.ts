import { describe, it, expect } from "@jest/globals";
import type { PoolSchedule } from "@/lib/pdf-processor";
import type { Closure } from "./closures";
import { addDays, createPoolCalendar, isAllDay } from "./pool-calendar";

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

// the sessions in the seven days from `today`, as "Weekday start"
const week = (pools: PoolSchedule[], today: string) =>
	createPoolCalendar(pools)
		.sessions(today, addDays(today, 6))
		.map((s) => `${s.dayOfWeek} ${s.startTime}`);

// the PDFs' closures in the seven days from `today`
const closures = (pools: PoolSchedule[], today: string) => createPoolCalendar(pools).closures(today, addDays(today, 6));

describe("sessions", () => {
	it("places every pool's programs on their dates with their times parsed, leaving out unreadable ones", () => {
		// Mon Oct 12 through Sun Oct 18
		const sessions = createPoolCalendar([
			pool("balboa", [
				["Monday", "9:30a", "11:00a"],
				["Monday", "noon", "1:00p"],
			]),
			pool("mlk", [["Tuesday", "6:00a", "7:00a"]]),
		]).sessions("2026-10-12", "2026-10-18");
		expect(sessions.map((s) => [s.poolId, s.date, s.dayOfWeek, s.startMin, s.endMin, s.title])).toEqual([
			["balboa", "2026-10-12", "Monday", 570, 660, "Lap Swim"],
			["mlk", "2026-10-13", "Tuesday", 360, 420, "Lap Swim"],
		]);
	});

	it("repeats the week for every date asked for, however far out", () => {
		const sessions = createPoolCalendar([pool("mlk", [["Tuesday", "6:00a", "7:00a"]])]).sessions(
			"2027-03-01",
			"2027-03-31"
		);
		expect(sessions.map((s) => s.date)).toEqual(["2027-03-02", "2027-03-09", "2027-03-16", "2027-03-23", "2027-03-30"]);
	});
});

describe("closed days", () => {
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

	it("drops the sessions on the days the closure covers", () => {
		// Fri Oct 9: the coming Tuesday is Oct 13, the first closed day
		expect(week([northBeach], "2026-10-09")).toEqual(["Monday 9:00a", "Saturday 9:00a"]);
	});

	it("brings the sessions back after the closure's last day", () => {
		// Thu Oct 29: Thu through Sun are closed; Mon Nov 2 reopens
		expect(week([northBeach], "2026-10-29")).toEqual(["Monday 9:00a", "Tuesday 9:00a"]);
	});

	it("leaves a pool alone before its closure starts", () => {
		expect(week([northBeach], "2026-10-05")).toEqual(["Monday 9:00a", "Tuesday 9:00a", "Saturday 9:00a"]);
	});

	it("ignores a closure that isn't allowed to hide programs", () => {
		const partial = { ...northBeach, closure: { ...closure, suppressPrograms: false } };
		expect(week([partial], "2026-10-20")).toHaveLength(3);
		expect(createPoolCalendar([partial]).closuresOn("northBeachCool", "2026-10-20")).toEqual([]);
	});

	it("says why the pool is closed on a date", () => {
		expect(createPoolCalendar([northBeach]).closuresOn("northBeachCool", "2026-10-20")).toEqual([
			{ kind: "alert", closure },
		]);
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

		it("drops every session on a holiday", () => {
			// Sat Oct 10: the coming Monday is the holiday
			expect(week([withClosures], "2026-10-10")).toEqual(["Thursday 10:15a", "Thursday 11:00a", "Thursday 2:00p"]);
		});

		it("drops only the sessions a partial closure overlaps", () => {
			// Tue Oct 20: the coming Thursday is the training day, closed 12-2;
			// sessions that end as it starts or start as it ends still run
			expect(week([withClosures], "2026-10-20")).toEqual(["Monday 9:00a", "Thursday 10:15a", "Thursday 2:00p"]);
			const reasons = createPoolCalendar([withClosures]).closuresOn("rossi", "2026-10-22");
			expect(reasons).toEqual([{ kind: "scheduled", closure: training }]);
			expect(isAllDay(reasons[0]!)).toBe(false);
		});

		it("leaves the week alone when no closure date falls in it", () => {
			expect(week([withClosures], "2026-10-13")).toHaveLength(4);
		});
	});
});

describe("printed schedule dates", () => {
	// Mission's schedule runs Tue Oct 20 through Sat Nov 21
	const mission = {
		...pool("mission", [
			["Monday", "9:00a", "10:00a"],
			["Saturday", "9:00a", "10:00a"],
		]),
		scheduleStartDate: "2026-10-20",
		scheduleEndDate: "2026-11-21",
	} as PoolSchedule;

	it("has no sessions after the schedule's last day or before its first", () => {
		// Thu Nov 19 to Wed Nov 25: Sat Nov 21 runs, Mon Nov 23 doesn't
		expect(week([mission], "2026-11-19")).toEqual(["Saturday 9:00a"]);
		// Sat Oct 17 to Fri Oct 23: Mon Oct 19 is before the start
		expect(week([mission], "2026-10-17")).toEqual([]);
	});

	it("says the date is outside the schedule", () => {
		const calendar = createPoolCalendar([mission]);
		expect(calendar.closuresOn("mission", "2026-11-23")).toEqual([{ kind: "ended", endDate: "2026-11-21" }]);
		expect(calendar.closuresOn("mission", "2026-10-19")).toEqual([{ kind: "not-started", startDate: "2026-10-20" }]);
		expect(calendar.closuresOn("mission", "2026-11-02")).toEqual([]);
	});

	it("keeps repeating a schedule that prints no end date", () => {
		const open = { ...mission, scheduleEndDate: null } as PoolSchedule;
		expect(createPoolCalendar([open]).sessions("2027-06-01", "2027-06-07")).toHaveLength(2);
	});

	it("lists the schedules that end or start inside a range, a gap per date", () => {
		const balboa = { ...pool("balboa", []), scheduleStartDate: "2026-09-01", scheduleEndDate: "2026-12-12" } as PoolSchedule;
		const coffman = { ...balboa, id: "coffman" } as PoolSchedule;
		const calendar = createPoolCalendar([mission, balboa, coffman]);
		expect(calendar.scheduleGaps("2026-11-19", "2026-11-25")).toEqual([
			{ kind: "ends", date: "2026-11-21", poolIds: ["mission"] },
		]);
		expect(calendar.scheduleGaps("2026-12-10", "2026-12-16")).toEqual([
			{ kind: "ends", date: "2026-11-21", poolIds: ["mission"] },
			{ kind: "ends", date: "2026-12-12", poolIds: ["balboa", "coffman"] },
		]);
		expect(calendar.scheduleGaps("2026-10-17", "2026-10-23")).toEqual([
			{ kind: "starts", date: "2026-10-20", poolIds: ["mission"] },
		]);
		expect(calendar.scheduleGaps("2026-11-02", "2026-11-08")).toEqual([]);
	});
});

describe("closures", () => {
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
		expect(closures(all, "2026-10-12")).toEqual([
			{
				startDate: "2026-10-12",
				endDate: "2026-10-12",
				reason: "Indigenous Peoples Day",
				windows: [{ startTime: null, endTime: null, poolIds: ["balboa", "hamilton", "rossi"] }],
			},
		]);
	});

	it("puts a training day each PDF words and times differently in one closure, a window per set of hours", () => {
		const all = [
			withClosures("balboa", [day("2026-10-22", "Aquatics division training", { startTime: "11:30a", endTime: "2:00p" })]),
			withClosures("coffman", [day("2026-10-22", "Training")]),
			withClosures("garfield", [day("2026-10-22", "staff training", { startTime: "11:00a", endTime: "2:00p" })]),
			withClosures("rossi", [day("2026-10-22", "training", { startTime: "12:00p", endTime: "2:00p" })]),
			withClosures("sava", [day("2026-10-22", "staff training", { startTime: "12:00p", endTime: "2:00p" })]),
		];
		expect(closures(all, "2026-10-20")).toEqual([
			{
				startDate: "2026-10-22",
				endDate: "2026-10-22",
				reason: "Training",
				windows: [
					{ startTime: null, endTime: null, poolIds: ["coffman"] },
					{ startTime: "11:00a", endTime: "2:00p", poolIds: ["garfield"] },
					{ startTime: "11:30a", endTime: "2:00p", poolIds: ["balboa"] },
					{ startTime: "12:00p", endTime: "2:00p", poolIds: ["rossi", "sava"] },
				],
			},
		]);
	});

	it("keeps unrelated closures on the same day apart, the one with an all-day closure first", () => {
		const all = [
			withClosures("rossi", [day("2026-11-11", "staff training", { startTime: "12:00p", endTime: "2:00p" })]),
			withClosures("balboa", [day("2026-11-11", "Veterans Day")]),
		];
		expect(closures(all, "2026-11-09").map((c) => c.reason)).toEqual(["Veterans Day", "staff training"]);
	});

	it("covers the dates asked for, from one day to several weeks", () => {
		const all = [withClosures("rossi", [day("2026-11-11", "Veterans Day"), day("2026-11-26", "Thanksgiving")])];
		const calendar = createPoolCalendar(all);
		expect(calendar.closures("2026-11-11", "2026-11-11").map((c) => c.reason)).toEqual(["Veterans Day"]);
		expect(calendar.closures("2026-11-12", "2026-11-25")).toEqual([]);
		expect(calendar.closures("2026-11-01", "2026-11-30").map((c) => c.reason)).toEqual(["Veterans Day", "Thanksgiving"]);
	});

	it("includes a range that overlaps the week and leaves out pools an alert already closes", () => {
		const all = [
			withClosures("rossi", [day("2026-11-02", "annual maintenance", { endDate: "2026-11-21" })]),
			withClosures("northBeachCool", [day("2026-10-13", "ANNUAL MAINTENANCE", { endDate: "2026-10-31" })], maintenance),
		];
		expect(closures(all, "2026-10-30").map((c) => c.windows.map((w) => w.poolIds))).toEqual([[["rossi"]]]);
	});
});
