import { describe, it, expect } from "@jest/globals";
import { applyGrounding, countCellPrograms, groundSessions, nameTokens } from "./grounding";
import { parseTimeRanges, parseUntilNotes, type Day, type DayCell } from "./pdf-table";
import type { PoolSchedule, ProgramEntry } from "./pdf-processor";

function cell(day: Day, text: string): DayCell {
	return { day, text, times: parseTimeRanges(text), untils: parseUntilNotes(text) };
}

function session(dayOfWeek: Day, startTime: string, endTime: string, programName: string): ProgramEntry {
	return { dayOfWeek, startTime, endTime, programName, notes: "" };
}

const cells = [
	cell("Tuesday", "Lap Swim 7:00am-8:00am"),
	cell("Tuesday", "Family/Lap Swim (small/main) (Lap swim until 4pm) 2:30pm-3:30pm"),
	cell("Monday", "Lap Swim (Main Pool) Rec/Family Swim (Small Pool) 7:00 am-8:45 am"),
	cell("Wednesday", "Rentals (Masters) 6:00pm-7:30pm"),
	cell("Saturday", "Closed for In-Service August 22, 9am-1pm"),
];

describe("nameTokens", () => {
	it("keeps the words that tell programs apart", () => {
		expect(nameTokens("Rentals (Masters)")).toEqual(["rental", "master"]);
		expect(nameTokens("Lap Swim (8)")).toEqual(["lap"]);
	});
});

describe("countCellPrograms", () => {
	it("counts each program that shares a cell", () => {
		expect(countCellPrograms("Lap Swim (Main Pool) Rec/Family Swim (Small Pool) 7:00 am-8:45 am")).toBe(2);
		expect(countCellPrograms("Family/Lap Swim (Lap swim until 4pm) 2:30pm-3:30pm")).toBe(1);
		expect(countCellPrograms("Learn To Swim 9:00am-11:00am")).toBe(1);
		expect(countCellPrograms("SFUSD 10:30am-11:30am")).toBe(1);
	});

	it("doesn't count closure notices", () => {
		expect(countCellPrograms("All city pools will be CLOSED December 12 from 9am-12pm")).toBe(0);
	});
});

describe("groundSessions", () => {
	const kinds = (sessions: ProgramEntry[]) => groundSessions(sessions, cells).map((i) => i.kind);
	const good = [
		session("Tuesday", "7:00a", "8:00a", "Lap Swim"),
		session("Tuesday", "2:30p", "3:30p", "Family Swim"),
		session("Tuesday", "2:30p", "4:00p", "Lap Swim"),
		session("Monday", "7:00a", "8:45a", "Lap Swim"),
		session("Monday", "7:00a", "8:45a", "Rec/Family Swim"),
		session("Wednesday", "6:00p", "7:30p", "Rentals (Masters)"),
	];

	it("passes an extraction that matches the PDF", () => {
		expect(groundSessions(good, cells)).toEqual([]);
	});

	it("flags a session copied into a day that doesn't have it", () => {
		const copied = session("Wednesday", "7:00a", "8:00a", "Lap Swim");
		const issues = groundSessions([...good, copied], cells);
		expect(issues).toEqual([expect.objectContaining({ kind: "not-in-pdf", session: copied })]);
	});

	it("flags a wrong end time", () => {
		expect(kinds([...good.slice(1), session("Tuesday", "7:00a", "9:00a", "Lap Swim")])).toEqual(["end-mismatch"]);
	});

	it("flags a name the cell doesn't contain", () => {
		expect(kinds([...good.slice(1), session("Tuesday", "7:00a", "8:00a", "Water Exercise")])).toEqual(["name-mismatch"]);
	});

	it("flags a merged session that ignores an until note", () => {
		const merged = [good[0], session("Tuesday", "2:30p", "3:30p", "Family/Lap Swim"), ...good.slice(3)];
		expect(kinds(merged)).toEqual(["until-mismatch"]);
	});

	it("flags a shared cell that produced too few sessions", () => {
		expect(kinds(good.filter((_, i) => i !== 3))).toEqual(["under-count"]);
	});

	it("flags a printed program with no session", () => {
		expect(kinds(good.slice(0, 5))).toEqual(["missing-session"]);
	});
});

describe("applyGrounding", () => {
	const schedule = (programs: ProgramEntry[]) => ({ id: "x", name: "X", nameTitle: null, shortName: null, programs }) as PoolSchedule;

	it("drops sessions the PDF doesn't print and reports the rest", () => {
		const copied = session("Wednesday", "7:00a", "8:00a", "Lap Swim");
		const { schedules, warnings } = applyGrounding([schedule([session("Tuesday", "7:00a", "8:00a", "Lap Swim"), copied])], cells.slice(0, 1), "Balboa");
		expect(schedules[0].programs).toHaveLength(1);
		expect(warnings).toEqual([`grounding: Balboa: dropped Wednesday 7:00a-8:00a "Lap Swim": nothing in the PDF's Wednesday column starts at 7:00a`]);
	});

	it("checks nothing when the PDF has no readable table", () => {
		const input = [schedule([session("Tuesday", "7:00a", "8:00a", "Lap Swim")])];
		const { schedules, warnings } = applyGrounding(input, null, "MLK");
		expect(schedules).toBe(input);
		expect(warnings).toHaveLength(1);
	});
});
