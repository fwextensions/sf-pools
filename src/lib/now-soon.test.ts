import { describe, it, expect } from "@jest/globals";
import type { PoolSchedule } from "@/lib/schedule-schema";
import type { Closure } from "./closures";
import { createPoolCalendar } from "./pool-calendar";
import { formatDuration, joinNames, nowSoon, stretchAt, type Moment, type NowSoonOptions } from "./now-soon";

type Row = [day: string, start: string, end: string, name: string, tags?: string[]];

const LAP = ["access:drop-in", "activity:lap", "program:lap"];
const FAMILY = ["access:drop-in", "activity:family", "program:family"];
const RENTAL = ["access:rental", "activity:rental"];
const LESSONS = ["activity:lessons"];

const pool = (id: string, rows: Row[], extra: Partial<PoolSchedule> = {}) =>
	({
		id,
		name: id,
		shortName: id,
		programs: rows.map(([dayOfWeek, startTime, endTime, name, tags = LAP]) => ({
			programName: name,
			title: name,
			dayOfWeek,
			startTime,
			endTime,
			tags,
		})),
		...extra,
	}) as unknown as PoolSchedule;

// 2026-10-09 is a Friday
const FRIDAY = "2026-10-09";
const fridaySessions = (pools: PoolSchedule[]) => createPoolCalendar(pools).sessions(FRIDAY, FRIDAY);
const at = (hh: number, mm = 0): Moment => ({ day: "Friday", date: FRIDAY, minutes: hh * 60 + mm });
const DROP_IN: NowSoonOptions = { mode: "drop-in", program: null, when: "next" };

function view(pools: PoolSchedule[], now: Moment, options: Partial<NowSoonOptions> = {}) {
	return nowSoon(pools, createPoolCalendar(pools), now, { ...DROP_IN, ...options });
}

describe("stretchAt", () => {
	const sessions = fridaySessions([
		pool("balboa", [
			["Friday", "11:00a", "1:00p", "Lap Swim"],
			["Friday", "1:00p", "2:30p", "Family Swim", FAMILY],
			["Friday", "3:00p", "4:00p", "Lap Swim"],
		]),
	]);

	it("runs through back to back sessions and names the change of program", () => {
		const s = stretchAt(sessions, 12 * 60 + 40)!;
		expect([s.startTime, s.endTime, s.names]).toEqual(["11:00a", "2:30p", ["Lap Swim"]]);
		expect(s.then).toEqual({ names: ["Family Swim"], at: "1:00p" });
	});

	it("ends the programs named where a different program takes over", () => {
		const s = stretchAt(sessions, 12 * 60 + 40)!;
		expect([s.namesEndTime, s.namesEnd]).toEqual(["1:00p", 13 * 60]);
		expect(stretchAt(sessions, 13 * 60 + 30)!.namesEndTime).toBe("2:30p");
	});

	it("carries a program on through back to back sessions of the same program", () => {
		const s = stretchAt(
			fridaySessions([
				pool("mlk", [
					["Friday", "7:30a", "9:00a", "Lap Swim"],
					["Friday", "9:00a", "12:00p", "Senior Lap Swim"],
					["Friday", "9:00a", "12:00p", "Lap Swim"],
					["Friday", "12:00p", "1:00p", "Family Swim", FAMILY],
				]),
			]),
			8 * 60
		)!;
		expect([s.names, s.namesEndTime, s.endTime]).toEqual([["Lap Swim"], "12:00p", "1:00p"]);
		expect(s.then).toEqual({ names: ["Senior Lap Swim"], at: "9:00a" });
	});

	it("stops at a gap", () => {
		expect(stretchAt(sessions, 14 * 60)!.endTime).toBe("2:30p");
		expect(stretchAt(sessions, 14 * 60 + 45)).toBeNull();
	});

	it("names every program running at once, and the longest one sets the end", () => {
		const shared = fridaySessions([
			pool("garfield", [
				["Friday", "7:00a", "8:45a", "Lap Swim"],
				["Friday", "7:00a", "8:00a", "Family Swim", FAMILY],
			]),
		]);
		const s = stretchAt(shared, 7 * 60 + 30)!;
		expect(s.names).toEqual(["Family Swim", "Lap Swim"]);
		expect(s.endTime).toBe("8:45a");
		expect(s.namesEndTime).toBe("8:45a");
		expect(s.then).toBeNull();
	});
});

describe("nowSoon", () => {
	it("counts down to the end of the programs on now, not to the last of the programs that follow", () => {
		// MLK on a Tuesday, seen with every program at 12:32p
		const mlk = pool("mlk", [
			["Friday", "12:30p", "3:30p", "Rec/Family Swim", FAMILY],
			["Friday", "12:30p", "3:30p", "Lap Swim"],
			["Friday", "3:30p", "6:00p", "Bayview Safety Swim & Splash", LESSONS],
			["Friday", "6:00p", "7:00p", "Lap Swim"],
			["Friday", "7:00p", "8:30p", "Rentals Masters", RENTAL],
		]);
		const [open] = view([mlk], at(12, 32), { mode: "all" }).open;
		expect(open!.stretch.names).toEqual(["Rec/Family Swim", "Lap Swim"]);
		expect([open!.stretch.namesEndTime, open!.stretch.endTime]).toEqual(["3:30p", "8:30p"]);
		expect(open!.stretch.then).toEqual({ names: ["Bayview Safety Swim & Splash"], at: "3:30p" });
	});

	it("leads with the pool whose programs end first", () => {
		const pools = [
			pool("balboa", [["Friday", "11:00a", "2:00p", "Lap Swim"]]),
			pool("garfield", [
				["Friday", "11:00a", "1:00p", "Lap Swim"],
				["Friday", "1:00p", "4:00p", "Family Swim", FAMILY],
			]),
		];
		expect(view(pools, at(12)).open.map((x) => x.pool.id)).toEqual(["garfield", "balboa"]);
	});

	it("sorts pools into open, starting soon and not open", () => {
		const pools = [
			pool("balboa", [["Friday", "5:00p", "7:00p", "Lap Swim"]]),
			pool("mission", [["Friday", "6:30p", "8:00p", "Family Swim", FAMILY]]),
			pool("rossi", [["Friday", "9:00a", "10:00a", "Lap Swim"]]),
		];
		const v = view(pools, at(17, 57));
		expect(v.open.map((x) => x.pool.id)).toEqual(["balboa"]);
		expect(v.soon.map((x) => x.pool.id)).toEqual(["mission"]);
		expect(v.closed.map((x) => x.pool.id)).toEqual(["rossi"]);
	});

	it("lists a pool open now under starting soon too when it reopens after a gap", () => {
		const pools = [
			pool("garfield", [
				["Friday", "11:00a", "1:00p", "Lap Swim"],
				["Friday", "2:00p", "3:45p", "Lap Swim"],
				["Friday", "2:00p", "3:45p", "Rec/Family Swim", FAMILY],
			]),
			pool("rossi", [
				["Friday", "11:00a", "1:30p", "Lap Swim"],
				["Friday", "1:30p", "2:00p", "Family Swim", FAMILY],
			]),
		];
		const v = view(pools, at(12, 44));
		expect(v.open.map((x) => x.pool.id)).toEqual(["garfield", "rossi"]);
		expect(v.soon.map((x) => [x.pool.id, x.stretch.startTime, x.stretch.names])).toEqual([
			["garfield", "2:00p", ["Lap Swim", "Rec/Family Swim"]],
		]);
		// a session exactly two hours out counts, as it does for find_sessions
		expect(view(pools, at(12)).soon.map((x) => x.pool.id)).toEqual(["garfield"]);
		// nothing past the two hours
		expect(view(pools, at(11)).soon).toEqual([]);
	});

	it("leaves rentals and lessons out of drop-in, and says what is on instead", () => {
		const pools = [
			pool("coffman", [
				["Friday", "5:30p", "7:00p", "Rentals (Synchro)", RENTAL],
				["Saturday", "9:00a", "10:30a", "Rec Swim", FAMILY],
			]),
		];
		const dropIn = view(pools, at(18));
		expect(dropIn.open).toEqual([]);
		expect(dropIn.closed[0]!.next).toEqual({ day: "Sat", time: "9:00a", names: ["Rec Swim"] });

		const everything = view(pools, at(18), { mode: "all" });
		expect(everything.open[0]!.stretch.restricted).toBe("Private");

		const lessons = view([pool("rossi", [["Friday", "5:00p", "7:00p", "Learn to Swim", LESSONS]])], at(18), { mode: "all" });
		expect(lessons.open[0]!.stretch.restricted).toBe("Reg req'd");
	});

	it("filters on a program", () => {
		const pools = [
			pool("hamilton", [
				["Friday", "5:00p", "7:00p", "Family Swim", FAMILY],
				["Friday", "7:00p", "8:00p", "Lap Swim"],
			]),
		];
		const v = view(pools, at(18), { program: "lap" });
		expect(v.open).toEqual([]);
		expect(v.soon[0]!.stretch.startTime).toBe("7:00p");
		expect(v.noun).toBe("lap swim");
		expect(view(pools, at(16), { program: "lap" }).closed[0]!.next).toEqual({ day: "Today", time: "7:00p", names: ["Lap Swim"] });
	});

	it("widens the window to the rest of the day", () => {
		const pools = [pool("sava", [["Friday", "8:00p", "9:00p", "Lap Swim"]])];
		expect(view(pools, at(15)).soon).toEqual([]);
		expect(view(pools, at(15), { when: "today" }).soon[0]!.pool.id).toBe("sava");
	});

	it("plans a slot of tomorrow, with the pools in the order they open", () => {
		const pools = [
			pool("balboa", [["Saturday", "10:00a", "11:00a", "Lap Swim"]]),
			pool("mlk", [["Saturday", "7:00a", "9:00a", "Lap Swim"]]),
			pool("rossi", [["Saturday", "1:00p", "2:00p", "Lap Swim"]]),
		];
		const v = view(pools, at(21), { when: "tomorrow-am" });
		expect(v.planned).toBe(true);
		expect(v.open.map((x) => x.pool.id)).toEqual(["mlk", "balboa"]);
		expect(v.closed[0]!.next).toEqual({ day: "Sat", time: "1:00p", names: ["Lap Swim"] });
	});

	it("lists closed pools in the order they next open, then those with nothing this week", () => {
		const pools = [
			pool("balboa", [["Tuesday", "9:00a", "10:00a", "Lap Swim"]]),
			pool("coffman", [["Sunday", "8:30a", "10:00a", "Lap Swim"]]),
			pool("garfield", [["Sunday", "7:00a", "8:00a", "Lap Swim"]]),
			pool("hamilton", [], { scheduleEndDate: "2026-10-01" }),
			pool("mlk", [["Friday", "9:00p", "9:30p", "Lap Swim"]]),
		];
		expect(view(pools, at(18)).closed.map((x) => x.pool.id)).toEqual(["mlk", "garfield", "coffman", "balboa", "hamilton"]);
	});

	it("finds the next opening up to a week out, and leaves the note for when there is none", () => {
		const pools = [pool("garfield", [["Sunday", "8:30a", "10:00a", "Lap Swim"]])];
		const v = view(pools, at(18));
		expect(v.closed[0]).toMatchObject({ next: { day: "Sun", time: "8:30a", names: ["Lap Swim"] }, note: null });
		expect(view(pools, at(18), { program: "family" }).closed[0]).toMatchObject({ next: null, note: "No family swim this week" });
		expect(view([pool("x", [["Friday", "9:00p", "9:30p", "Lap Swim"]])], at(18)).closed[0]!.next!.day).toBe("Today");
	});

	it("skips days a closure covers", () => {
		const closure: Closure = {
			summary: "",
			rawText: "",
			startDate: "2026-10-09",
			endDate: "2026-10-11",
			indefinite: false,
			sourceUrl: null,
			reason: "maintenance",
			scope: "whole-pool",
			source: "pattern",
			suppressPrograms: true,
			confidence: null,
			disagreement: null,
		};
		// the calendar leaves out the closed days, Friday through Sunday
		const pools = [pool("northBeachCool", [["Monday", "7:00a", "8:00a", "Lap Swim"]], { closure })];
		const v = view(pools, at(10));
		expect(v.closed[0]!.next!.day).toBe("Mon");
	});

	it("names a closure that starts before the pool opens again", () => {
		const closure = {
			summary: "",
			rawText: "",
			startDate: "2026-10-10",
			endDate: "2026-11-01",
			indefinite: false,
			sourceUrl: null,
			reason: "annual maintenance",
			scope: "whole-pool",
			source: "pattern",
			suppressPrograms: true,
			confidence: null,
			disagreement: null,
		} satisfies Closure;
		const v = view([pool("northBeachWarm", [], { closure })], at(18));
		expect(v.closed[0]!.note).toBe("Closes Oct 10 – Nov 1 for annual maintenance");
	});

	it("says a pool is closed for the day the PDF lists, alongside its next opening", () => {
		const scheduledClosures = [
			{ startDate: "2026-10-09", endDate: "2026-10-09", startTime: null, endTime: null, reason: "Staff Training" },
			{ startDate: "2026-10-10", endDate: "2026-10-10", startTime: "12:00p", endTime: "2:00p", reason: "Swim Meet" },
		];
		const pools = [pool("hamilton", [["Saturday", "9:00a", "10:00a", "Lap Swim"]], { scheduledClosures })];
		const v = view(pools, at(10));
		expect(v.closed[0]).toMatchObject({ closedFor: "Closed today for Staff Training", next: { day: "Sat" } });
		// a closure for part of the day isn't the whole day's story
		expect(view(pools, at(21), { when: "tomorrow-pm" }).closed[0]!.closedFor).toBeNull();
		const holiday = [{ startDate: "2026-10-10", endDate: "2026-10-10", startTime: null, endTime: null, reason: null }];
		const tomorrow = view([pool("rossi", [], { scheduledClosures: holiday })], at(21), { when: "tomorrow-am" });
		expect(tomorrow.closed[0]!.closedFor).toBe("Closed tomorrow");
	});

	it("gives the end of a longer closure, from the PDF or the facility page", () => {
		const maintenance = [{ startDate: "2026-10-05", endDate: "2026-10-21", startTime: null, endTime: null, reason: "annual maintenance" }];
		const v = view([pool("sava", [], { scheduledClosures: maintenance })], at(10));
		expect(v.closed[0]).toMatchObject({ closedFor: "Closed through Oct 21 for annual maintenance", note: null });
		const closure = {
			summary: "",
			rawText: "",
			startDate: "2026-10-05",
			endDate: "2026-10-22",
			indefinite: false,
			sourceUrl: null,
			reason: "annual maintenance",
			scope: "whole-pool",
			source: "pattern",
			suppressPrograms: true,
			confidence: null,
			disagreement: null,
		} satisfies Closure;
		const both = view([pool("northBeachCool", [], { closure, scheduledClosures: maintenance })], at(10));
		expect(both.closed[0]).toMatchObject({ closedFor: "Closed through Oct 22 for annual maintenance", note: null });
	});

	it("stops at the end of the printed schedule", () => {
		const pools = [pool("mlk", [["Friday", "6:00p", "7:00p", "Lap Swim"]], { scheduleEndDate: "2026-09-26" })];
		const v = view(pools, at(18, 30));
		expect(v.open).toEqual([]);
		expect(v.closed[0]!.note).toBe("Schedule ended Sep 26");
		expect(v.closed[0]!.next).toBeNull();
	});
});

describe("formatting", () => {
	it("formats countdowns", () => {
		expect([3, 59, 60, 63, 120].map(formatDuration)).toEqual(["3m", "59m", "1h", "1h 03m", "2h"]);
	});

	it("joins up to two names and counts the rest", () => {
		expect(joinNames(["Lap Swim"])).toBe("Lap Swim");
		expect(joinNames(["Lap Swim", "Family Swim"])).toBe("Lap Swim · Family Swim");
		expect(joinNames(["Lap Swim", "Family Swim", "Senior Swim"])).toBe("Lap Swim +2 more");
	});
});
