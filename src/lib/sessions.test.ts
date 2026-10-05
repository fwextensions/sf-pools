import { describe, it, expect } from "@jest/globals";
import type { PoolSchedule } from "@/lib/pdf-processor";
import { around, programMinutes, toSessions } from "./sessions";

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

describe("around", () => {
	const sessions = toSessions([
		pool("balboa", [
			["Monday", "6:00p", "8:00p"],
			["Monday", "5:30p", "7:30p"],
			["Monday", "8:30p", "9:30p"],
			["Monday", "7:30p", "8:30p"],
			["Monday", "9:00p", "9:45p"],
			["Tuesday", "7:00p", "8:00p"],
		]),
	]);
	const at = (minutes: number, windowMin = 60) => around(sessions, { day: "Monday", minutes }, windowMin);
	const times = (list: Array<{ startTime: string } | undefined>) => list.map((s) => s?.startTime);

	it("picks the running session that ends first", () => {
		expect(at(19 * 60).current?.startTime).toBe("5:30p");
		expect(at(19 * 60 + 45).current?.startTime).toBe("6:00p");
	});

	it("lists sessions starting inside the window, earliest first, then the first one after it", () => {
		const r = at(19 * 60, 120);
		expect(times(r.upcoming)).toEqual(["7:30p", "8:30p"]);
		expect(r.later?.startTime).toBe("9:00p");
	});

	it("lists a session starting this minute as upcoming, whatever is running", () => {
		const r = at(19 * 60 + 30);
		expect(r.current?.startTime).toBe("6:00p");
		expect(times(r.upcoming)).toEqual(["7:30p"]);
	});

	it("is empty on a day with nothing scheduled, or once the day's sessions are over", () => {
		expect(around(sessions, { day: "Sunday", minutes: 600 }, 60)).toEqual({
			current: undefined,
			upcoming: [],
			later: undefined,
		});
		expect(at(22 * 60)).toEqual({ current: undefined, upcoming: [], later: undefined });
	});
});
