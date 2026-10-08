import { describe, it, expect } from "@jest/globals";
import { buildDayCells, formatDayCells, parseTimeRanges, parseUntilNotes, type TextLine } from "./pdf-table";

const h = (hour: number, minute = 0) => hour * 60 + minute;

/** a text run on page 1; rows count down from the header at y = 500 */
function line(x: number, row: number, text: string): TextLine {
	return { page: 1, x, y: 500 - row * 12, width: 60, text };
}

describe("parseTimeRanges", () => {
	it("reads ranges with am/pm on both sides", () => {
		expect(parseTimeRanges("7:00am-8:00am")).toEqual([{ start: h(7), end: h(8) }]);
		expect(parseTimeRanges("9:30 a.m. -11:30 a.m.")).toEqual([{ start: h(9, 30), end: h(11, 30) }]);
		expect(parseTimeRanges("12:30pm – 3:30pm")).toEqual([{ start: h(12, 30), end: h(15, 30) }]);
	});

	it("borrows the meridiem from the other side", () => {
		expect(parseTimeRanges("2:00pm-3:30 (3)")).toEqual([{ start: h(14), end: h(15, 30) }]);
		expect(parseTimeRanges("5:00-5:30pm")).toEqual([{ start: h(17), end: h(17, 30) }]);
		expect(parseTimeRanges("11:00-1:00pm")).toEqual([{ start: h(11), end: h(13) }]);
		expect(parseTimeRanges("11:30am-1:00")).toEqual([{ start: h(11, 30), end: h(13) }]);
	});

	it("reads noon and short hours", () => {
		expect(parseTimeRanges("10:30am-Noon")).toEqual([{ start: h(10, 30), end: h(12) }]);
		expect(parseTimeRanges("9am-12pm")).toEqual([{ start: h(9), end: h(12) }]);
	});

	it("marks ranges with no meridiem at all as guessed", () => {
		expect(parseTimeRanges("5:30-6:30")).toEqual([{ start: h(5, 30), end: h(6, 30), guessed: true }]);
	});

	it("skips dates", () => {
		expect(parseTimeRanges("CLOSED 11/26-27")).toEqual([]);
		expect(parseTimeRanges("Closed every 4th Thursday")).toEqual([]);
	});
});

describe("parseUntilNotes", () => {
	it("reads a program that runs past its cell", () => {
		expect(parseUntilNotes("Family/Lap Swim (Lap swim until 4pm) 2:30pm-3:30pm")).toEqual([{ program: "lap", end: h(16) }]);
	});
});

describe("buildDayCells", () => {
	const header = [line(100, 0, "TUESDAY"), line(200, 0, "WEDNESDAY"), line(300, 0, "THURSDAY")];

	it("splits each column into cells that end at their time", () => {
		const cells = buildDayCells([
			...header,
			line(100, 2, "Lap Swim (10)"),
			line(100, 3, "7:30am - 9:00am"),
			line(300, 2, "Lap Swim (10)"),
			line(300, 3, "7:30am - 9:00am"),
			line(100, 5, "Senior Lap Swim"),
			line(100, 6, "9:00am - 12:00pm"),
			line(200, 5, "Senior Lap Swim"),
			line(200, 6, "9:00am - 10:30am"),
		])!;
		expect(cells.map((c) => [c.day, c.text])).toEqual([
			["Tuesday", "Lap Swim (10) 7:30am - 9:00am"],
			["Tuesday", "Senior Lap Swim 9:00am - 12:00pm"],
			["Thursday", "Lap Swim (10) 7:30am - 9:00am"],
			["Wednesday", "Senior Lap Swim 9:00am - 10:30am"],
		]);
		expect(formatDayCells(cells)).toBe([
			"Tuesday: Lap Swim (10) 7:30am - 9:00am | Senior Lap Swim 9:00am - 12:00pm",
			"Wednesday: Senior Lap Swim 9:00am - 10:30am",
			"Thursday: Lap Swim (10) 7:30am - 9:00am",
		].join("\n"));
	});

	it("ignores text outside the table's columns", () => {
		const cells = buildDayCells([...header, line(500, 2, "Notes"), line(500, 3, "Closed 9am-1pm")])!;
		expect(cells).toEqual([]);
	});

	it("returns null when there is no weekday header row", () => {
		expect(buildDayCells([line(100, 0, "6SULQJ"), line(100, 1, "Lap Swim 7:00am-8:00am")])).toBeNull();
	});
});
