import { describe, it, expect } from "@jest/globals";
import type { PoolSchedule } from "@/lib/pdf-processor";
import { buildHitMatrix, hitKey, hourSpan, HOURS, sessionsInCell, toSessions } from "./sessions";

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

const sessions = toSessions([
	pool("balboa", [
		["Monday", "9:30a", "11:00a"],
		["Monday", "7:00p", "8:00p"],
		// unreadable: in no cell, never on the grid
		["Monday", "noon", "1:00p"],
	]),
	pool("mlk", [["Tuesday", "6:00a", "7:00a"]]),
]);

describe("toSessions", () => {
	it("parses times once, leaving null for ones that don't parse", () => {
		expect(sessions.map((s) => [s.poolId, s.startMin, s.endMin])).toEqual([
			["balboa", 570, 660],
			["balboa", 1140, 1200],
			["balboa", null, 780],
			["mlk", 360, 420],
		]);
	});
});

describe("sessionsInCell", () => {
	it("includes sessions overlapping any part of the hour, but not ones that end as it starts", () => {
		expect(sessionsInCell(sessions, { day: "Monday", hour: 9 })).toHaveLength(1);
		expect(sessionsInCell(sessions, { day: "Monday", hour: 10 })).toHaveLength(1);
		expect(sessionsInCell(sessions, { day: "Monday", hour: 11 })).toHaveLength(0);
		expect(sessionsInCell(sessions, { day: "Tuesday", hour: 9 })).toHaveLength(0);
	});
});

describe("buildHitMatrix / hourSpan", () => {
	const hits = buildHitMatrix(sessions);

	it("marks each day, hour and pool a session touches", () => {
		expect([...hits].sort()).toEqual(
			[
				hitKey("Monday", 9, "balboa"),
				hitKey("Monday", 10, "balboa"),
				hitKey("Monday", 19, "balboa"),
				hitKey("Tuesday", 6, "mlk"),
			].sort()
		);
	});

	it("spans the rows from the first busy hour to the last", () => {
		expect(hourSpan(hits)).toEqual(HOURS.filter((h) => h >= 6 && h <= 19));
		expect(hourSpan(buildHitMatrix(sessions.slice(0, 1)))).toEqual([9, 10]);
		expect(hourSpan(new Set())).toEqual(HOURS);
	});
});
