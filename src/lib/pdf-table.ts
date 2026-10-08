// Reads the schedule grid out of a PDF's text layer, so an extraction can be
// checked against what the PDF actually prints. Every Rec & Park schedule is a
// table with one column per weekday: the header row names the days, and each
// cell lists one or more programs followed by the time they share. This module
// is pure; scripts/read-pdf-lines.ts turns PDF bytes into the lines it takes.
import type { ProgramEntry } from "./pdf-processor";

export type Day = ProgramEntry["dayOfWeek"];

/** one run of text on a page, positioned in PDF points with y increasing upward */
export type TextLine = {
	page: number;
	x: number;
	y: number;
	width: number;
	text: string;
};

/** a printed time range, in minutes since midnight */
export type TimeRange = {
	start: number;
	end: number;
	/** neither side was marked am or pm, so the half of the day is a guess */
	guessed?: boolean;
};

/** "Lap swim until 4pm": a program in a shared cell that ends early or late */
export type UntilNote = {
	/** the word that names the program, lowercased, e.g. "lap" */
	program: string;
	end: number;
};

/** the text of one table cell, ending at the time its programs share */
export type DayCell = {
	day: Day;
	text: string;
	times: TimeRange[];
	untils: UntilNote[];
};

const DAYS: Day[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** a header row must name at least this many days to count as the table's */
const MIN_HEADER_DAYS = 3;
/** lines whose baselines are this close (points) sit on the same row */
const ROW_TOLERANCE = 3;

function normalizeText(text: string): string {
	return text
		.replace(/[‐-―−]/g, "-")
		.replace(/\b([ap])\.\s?m\.?/gi, "$1m")
		.replace(/\bnoon\b/gi, "12:00pm")
		.replace(/\bmidnight\b/gi, "12:00am")
		.replace(/\s+/g, " ")
		.trim();
}

function toMinutes(hour: number, minute: number, meridiem: "a" | "p"): number {
	return (hour % 12) * 60 + minute + (meridiem === "p" ? 12 * 60 : 0);
}

function meridiemOf(raw: string | undefined): "a" | "p" | null {
	if (!raw) return null;
	return raw[0].toLowerCase() as "a" | "p";
}

/**
 * Every time range printed in a piece of text: "7:00am-8:00am",
 * "2:00pm-3:30 (3)", "5:00-5:30pm", "10:30am-Noon", "9:30 a.m. -11:30 a.m.".
 * A side that omits am/pm takes the other side's, flipped where that would
 * make the range run backwards. Number pairs with neither a colon nor am/pm
 * ("11/26-27") are dates, not times, and are skipped.
 */
export function parseTimeRanges(text: string): TimeRange[] {
	const normalized = normalizeText(text);
	const pattern = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?(?![a-z])/gi;
	const ranges: TimeRange[] = [];
	for (const m of normalized.matchAll(pattern)) {
		const [, h1, m1, mer1, h2, m2, mer2] = m;
		if (!m1 && !m2 && !mer1 && !mer2) continue;
		const startHour = Number(h1);
		const endHour = Number(h2);
		if (startHour < 1 || startHour > 12 || endHour < 1 || endHour > 12) continue;
		const startMinute = Number(m1 ?? 0);
		const endMinute = Number(m2 ?? 0);
		let startMer = meridiemOf(mer1);
		let endMer = meridiemOf(mer2);
		const guessed = !startMer && !endMer;
		if (guessed) {
			// neither side says; the matching code tolerates a flipped meridiem
			startMer = endMer = "a";
		} else if (!startMer) {
			startMer = endMer;
			if (toMinutes(startHour, startMinute, startMer!) >= toMinutes(endHour, endMinute, endMer!)) startMer = "a";
		} else if (!endMer) {
			endMer = startMer;
			if (toMinutes(endHour, endMinute, endMer) <= toMinutes(startHour, startMinute, startMer)) endMer = "p";
		}
		ranges.push({
			start: toMinutes(startHour, startMinute, startMer!),
			end: toMinutes(endHour, endMinute, endMer!),
			...(guessed && { guessed }),
		});
	}
	return ranges;
}

/** "(Lap swim until 4pm)" -> { program: "lap", end: 960 } */
export function parseUntilNotes(text: string): UntilNote[] {
	const normalized = normalizeText(text);
	const pattern = /([a-z]+)(?:\s+swim)?\s+until\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/gi;
	return [...normalized.matchAll(pattern)].map((m) => ({
		program: m[1].toLowerCase(),
		end: toMinutes(Number(m[2]), Number(m[3] ?? 0), meridiemOf(m[4])!),
	}));
}

function headerDay(text: string): Day | null {
	const word = text.trim().replace(/[^a-z]/gi, "").toLowerCase();
	return DAYS.find((d) => d.toLowerCase() === word) ?? null;
}

type HeaderRow = {
	page: number;
	y: number;
	columns: Array<{ day: Day; center: number }>;
};

/** rows of weekday names, top to bottom within each page */
function findHeaderRows(lines: TextLine[]): HeaderRow[] {
	const rows: HeaderRow[] = [];
	for (const line of lines) {
		const day = headerDay(line.text);
		if (!day) continue;
		const center = line.x + line.width / 2;
		const row = rows.find((r) => r.page === line.page && Math.abs(r.y - line.y) <= ROW_TOLERANCE);
		if (row) row.columns.push({ day, center });
		else rows.push({ page: line.page, y: line.y, columns: [{ day, center }] });
	}
	return rows
		.filter((r) => new Set(r.columns.map((c) => c.day)).size >= MIN_HEADER_DAYS)
		.map((r) => ({ ...r, columns: r.columns.sort((a, b) => a.center - b.center) }))
		.sort((a, b) => a.page - b.page || b.y - a.y);
}

/** the column a point falls in, or null when it's outside the table */
function columnAt(row: HeaderRow, x: number): Day | null {
	const { columns } = row;
	const edges: number[] = [];
	for (let i = 0; i < columns.length - 1; i++) {
		edges.push((columns[i].center + columns[i + 1].center) / 2);
	}
	const firstHalf = columns.length > 1 ? (columns[1].center - columns[0].center) / 2 : 75;
	const lastHalf = columns.length > 1 ? (columns.at(-1)!.center - columns.at(-2)!.center) / 2 : 75;
	if (x < columns[0].center - firstHalf || x > columns.at(-1)!.center + lastHalf) return null;
	const index = edges.findIndex((edge) => x < edge);
	return columns[index === -1 ? columns.length - 1 : index].day;
}

/**
 * Split the table under each weekday header into cells. Lines are assigned to
 * the column their center falls in; reading down a column, a cell ends at the
 * line that carries its time range. Returns null when no header row names
 * enough weekdays, which means the text layer can't be read as a schedule.
 */
export function buildDayCells(lines: TextLine[]): DayCell[] | null {
	const headers = findHeaderRows(lines);
	if (headers.length === 0) return null;

	const cells: DayCell[] = [];
	headers.forEach((header, i) => {
		const next = headers[i + 1];
		const below = lines.filter(
			(l) =>
				l.page === header.page &&
				l.y < header.y - ROW_TOLERANCE &&
				!(next && next.page === header.page && l.y >= next.y - ROW_TOLERANCE)
		);
		const byDay = new Map<Day, TextLine[]>();
		for (const line of below) {
			const day = columnAt(header, line.x + line.width / 2);
			if (!day) continue;
			if (!byDay.has(day)) byDay.set(day, []);
			byDay.get(day)!.push(line);
		}
		for (const [day, column] of byDay) {
			column.sort((a, b) => b.y - a.y || a.x - b.x);
			let pending: string[] = [];
			for (const line of column) {
				pending.push(line.text.trim());
				const times = parseTimeRanges(line.text);
				if (times.length === 0) continue;
				const text = normalizeText(pending.join(" "));
				cells.push({ day, text, times, untils: parseUntilNotes(text) });
				pending = [];
			}
		}
	});
	return cells;
}

function formatMinutesShort(minutes: number): string {
	const hour24 = Math.floor(minutes / 60) % 24;
	const hour12 = hour24 % 12 || 12;
	return `${hour12}:${String(minutes % 60).padStart(2, "0")}${hour24 < 12 ? "am" : "pm"}`;
}

export function formatRange(range: TimeRange): string {
	return `${formatMinutesShort(range.start)}-${formatMinutesShort(range.end)}`;
}

/** the cells as plain text, one day per line, for the extraction prompt */
export function formatDayCells(cells: DayCell[]): string {
	return DAYS.filter((day) => cells.some((c) => c.day === day))
		.map((day) => `${day}: ${cells.filter((c) => c.day === day).map((c) => c.text).join(" | ")}`)
		.join("\n");
}
