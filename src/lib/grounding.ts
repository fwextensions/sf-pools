// Checks an extraction against the PDF's own table: every session should sit
// in a printed cell for its day with the same times and a matching name, and
// every printed cell that lists a program should have produced a session. The
// model reads the PDF as an image and sometimes copies a row from a
// neighboring day or merges programs that share a cell; this catches both.
// Pure, like pdf-table.ts, which supplies the cells.
import type { PoolSchedule, ProgramEntry } from "./pdf-processor";
import { formatRange, type Day, type DayCell, type TimeRange } from "./pdf-table";
import { parseTimeToMinutes } from "./time";

export type GroundingIssueKind =
	/** no cell in the session's day column starts at its start time */
	| "not-in-pdf"
	/** a cell starts at the session's start time, but none ends at its end */
	| "end-mismatch"
	/** the cells at the session's time don't contain the words of its name */
	| "name-mismatch"
	/** the cell says "Lap swim until 4pm" but the lap session ends elsewhere */
	| "until-mismatch"
	/** a printed cell that lists a program has no session at its time */
	| "missing-session"
	/** a printed cell lists more programs than there are sessions at its time */
	| "under-count";

export type GroundingIssue = {
	kind: GroundingIssueKind;
	day: Day;
	message: string;
	/** the extracted session at fault, for the session-level kinds */
	session?: ProgramEntry;
};

const HALF_DAY = 12 * 60;

/** words too common in program names to tell programs apart */
const STOPWORDS = new Set(["swim", "swimming", "and", "the", "of", "to", "for", "with", "pool", "lane", "lanes"]);

/** a cell names a program when it contains one of these */
const PROGRAM_WORDS = /\b(swim|lap|exercise|lessons?|rentals?|sfusd|class|olympics?|polo|hockey|synchro|tots?)\b/i;

/**
 * The words that identify a program: lowercased, without numbers, stopwords
 * or plural endings, so "Rentals (Masters)" and "RENTALS (10) MASTERS" agree.
 */
export function nameTokens(text: string): string[] {
	return (text.toLowerCase().match(/[a-z]+/g) ?? [])
		.filter((word) => !STOPWORDS.has(word))
		.map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word));
}

/**
 * How many programs a cell lists. Each program name ends in "Swim" except
 * lessons and teams, so count those, ignoring parenthetical notes like
 * "(Lap swim until 4pm)". A cell with program words but no "Swim" lists one.
 */
export function countCellPrograms(text: string): number {
	if (!PROGRAM_WORDS.test(text)) return 0;
	const swims = text
		.toLowerCase()
		.replace(/\([^)]*\)/g, " ")
		.replace(/learn[\s-]*to[\s-]*swim|swim\s+(team|lessons?)/g, " lesson ")
		.match(/\bswim\b/g);
	return Math.max(1, swims?.length ?? 0);
}

function sameTime(a: number, b: number, allowHalfDayFlip: boolean): boolean {
	return a === b || (allowHalfDayFlip && a % HALF_DAY === b % HALF_DAY);
}

function startsAt(range: TimeRange, start: number): boolean {
	// a range printed without am/pm only guesses its half of the day
	return sameTime(range.start, start, !!range.guessed);
}

function endsAt(range: TimeRange, end: number): boolean {
	// end times are only compared, never published from the PDF, so forgive a
	// flipped meridiem there ("10:00 am -12:00 am")
	return sameTime(range.end, end, true);
}

function namesMatch(name: string[], cell: DayCell): boolean {
	const cellTokens = new Set(nameTokens(cell.text));
	return name.every((token) => cellTokens.has(token));
}

function describe(session: ProgramEntry): string {
	return `${session.dayOfWeek} ${session.startTime}-${session.endTime} "${session.programName}"`;
}

function quote(cells: DayCell[]): string {
	return cells.map((c) => `"${c.text}"`).join(" or ");
}

function sessionMinutes(session: ProgramEntry): TimeRange | null {
	const start = parseTimeToMinutes(session.startTime);
	const end = parseTimeToMinutes(session.endTime);
	return start === null || end === null ? null : { start, end };
}

function checkSession(session: ProgramEntry, cells: DayCell[]): GroundingIssue[] {
	const day = session.dayOfWeek;
	const times = sessionMinutes(session);
	if (!times) return [];
	const dayCells = cells.filter((c) => c.day === day);
	const atStart = dayCells.filter((c) => c.times.some((r) => startsAt(r, times.start)));
	if (atStart.length === 0) {
		return [{
			kind: "not-in-pdf",
			day,
			session,
			message: `${describe(session)}: nothing in the PDF's ${day} column starts at ${session.startTime}`,
		}];
	}

	const issues: GroundingIssue[] = [];
	const name = nameTokens(session.programName);
	const named = atStart.filter((c) => namesMatch(name, c));
	if (named.length === 0) {
		issues.push({
			kind: "name-mismatch",
			day,
			session,
			message: `${describe(session)}: the PDF's ${day} cells at ${session.startTime} read ${quote(atStart)}`,
		});
	}

	const candidates = named.length > 0 ? named : atStart;
	const untils = candidates.flatMap((c) => c.untils).filter((u) => name.includes(u.program));
	const endOk =
		candidates.some((c) => c.times.some((r) => startsAt(r, times.start) && endsAt(r, times.end))) ||
		untils.some((u) => u.end === times.end);
	if (!endOk) {
		const printed = candidates.flatMap((c) => c.times.filter((r) => startsAt(r, times.start)).map(formatRange));
		issues.push({
			kind: "end-mismatch",
			day,
			session,
			message: `${describe(session)}: the PDF prints ${[...new Set(printed)].join(" or ")}`,
		});
	} else if (untils.length > 0 && !untils.some((u) => u.end === times.end)) {
		issues.push({
			kind: "until-mismatch",
			day,
			session,
			message: `${describe(session)}: the PDF says ${quote(candidates.filter((c) => c.untils.length > 0))}, so this program runs to a different time than the rest of the cell`,
		});
	}
	return issues;
}

/** printed cells with the same day and times, which together list `expected` programs */
type CellGroup = { day: Day; range: TimeRange; cells: DayCell[]; expected: number };

function groupCells(cells: DayCell[]): CellGroup[] {
	const groups = new Map<string, CellGroup>();
	for (const cell of cells) {
		const expected = countCellPrograms(cell.text);
		if (expected === 0) continue;
		const range = cell.times[0];
		const key = `${cell.day} ${range.start} ${range.end}`;
		const group = groups.get(key) ?? { day: cell.day, range, cells: [], expected: 0 };
		group.cells.push(cell);
		group.expected += expected;
		groups.set(key, group);
	}
	return [...groups.values()];
}

function checkCoverage(sessions: ProgramEntry[], cells: DayCell[]): GroundingIssue[] {
	const issues: GroundingIssue[] = [];
	const groups = groupCells(cells);
	const endsIn = (group: CellGroup, end: number) =>
		endsAt(group.range, end) || group.cells.some((c) => c.untils.some((u) => u.end === end));
	for (const group of groups) {
		const found = sessions.filter((session) => {
			const times = sessionMinutes(session);
			if (session.dayOfWeek !== group.day || !times || !startsAt(group.range, times.start)) return false;
			if (endsIn(group, times.end)) return true;
			// a session with the wrong end still came from this cell, unless
			// another cell starting at the same time fits it; checkSession
			// reports the end
			return !groups.some((g) => g !== group && g.day === group.day && startsAt(g.range, times.start) && endsIn(g, times.end));
		}).length;
		const where = `${group.day} ${formatRange(group.range)}`;
		if (found === 0) {
			issues.push({
				kind: "missing-session",
				day: group.day,
				message: `${where}: the PDF lists ${quote(group.cells)} but no session was extracted`,
			});
		} else if (found < group.expected) {
			issues.push({
				kind: "under-count",
				day: group.day,
				message: `${where}: the PDF lists ${quote(group.cells)}, which looks like ${group.expected} programs, but ${found} ${found === 1 ? "session was" : "sessions were"} extracted`,
			});
		}
	}
	return issues;
}

/** every way the extracted sessions disagree with the PDF's cells */
export function groundSessions(sessions: ProgramEntry[], cells: DayCell[]): GroundingIssue[] {
	return [...sessions.flatMap((s) => checkSession(s, cells)), ...checkCoverage(sessions, cells)];
}

/** the sessions the PDF doesn't print at all, which are dropped rather than published */
export function ungroundedSessions(issues: GroundingIssue[]): Set<ProgramEntry> {
	return new Set(issues.filter((i) => i.kind === "not-in-pdf" && i.session).map((i) => i.session!));
}

export type GroundedExtract = {
	schedules: PoolSchedule[];
	/** what a person should look at, one line each, prefixed "grounding:" */
	warnings: string[];
};

/**
 * Check an extract against its PDF's cells before it's released. Sessions the
 * PDF doesn't print are dropped; every other disagreement is only reported,
 * since the cell reading can be wrong too. Without cells (the text layer has
 * no readable table) nothing is checked, and the warning says so.
 */
export function applyGrounding(schedules: PoolSchedule[], cells: DayCell[] | null, label: string): GroundedExtract {
	if (!cells) {
		return {
			schedules,
			warnings: [`grounding: ${label}: no schedule table found in the PDF's text, so its sessions weren't checked`],
		};
	}
	const warnings: string[] = [];
	const grounded = schedules.map((schedule) => {
		const issues = groundSessions(schedule.programs, cells);
		const dropped = ungroundedSessions(issues);
		for (const issue of issues) {
			const action = issue.session && dropped.has(issue.session) ? "dropped " : "";
			warnings.push(`grounding: ${label}: ${action}${issue.message}`);
		}
		return dropped.size > 0
			? { ...schedule, programs: schedule.programs.filter((p) => !dropped.has(p)) }
			: schedule;
	});
	return { schedules: grounded, warnings };
}
