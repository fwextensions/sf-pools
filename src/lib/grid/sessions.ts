// The week grid's view of the schedules: every session flattened out of its
// pool, with its times parsed once, and the hour-by-hour overlap the grid's
// cells are built from.
import type { PoolSchedule, ProgramEntry } from "@/lib/pdf-processor";
import { describeProgram } from "@/lib/program-display";
import { parseTimeToMinutes } from "@/lib/utils";

export type Day = ProgramEntry["dayOfWeek"];

export const DAYS: Day[] = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
];

export const FIRST_HOUR = 6;
export const LAST_HOUR = 21;

export const HOURS: number[] = [];
for (let h = FIRST_HOUR; h <= LAST_HOUR; h++) HOURS.push(h);

// one hour of one day: a row and column of the grid
export type GridCell = { day: Day; hour: number };

export function sameCell(a: GridCell | null, b: GridCell | null): boolean {
	return a === b || (a != null && b != null && a.day === b.day && a.hour === b.hour);
}

export type GridSession = {
	poolId: string;
	title: string;
	badges: string[];
	tags: string[];
	dayOfWeek: Day;
	startTime: string;
	endTime: string;
	// null when the time didn't parse; such a session is in no cell
	startMin: number | null;
	endMin: number | null;
};

function toMinutes(t: string): number | null {
	const m = parseTimeToMinutes(t);
	return m === Number.MAX_SAFE_INTEGER ? null : m;
}

export function toSessions(all: PoolSchedule[]): GridSession[] {
	const out: GridSession[] = [];
	for (const pool of all) {
		for (const p of pool.programs || []) {
			const display = describeProgram(p);
			out.push({
				poolId: pool.id,
				title: display.title,
				badges: display.badges,
				tags: p.tags ?? [],
				dayOfWeek: p.dayOfWeek,
				startTime: p.startTime,
				endTime: p.endTime,
				startMin: toMinutes(p.startTime),
				endMin: toMinutes(p.endTime),
			});
		}
	}
	return out;
}

// a session is in an hour when any part of it overlaps [hour, hour + 1)
function overlapsHour(s: GridSession, hour: number): boolean {
	return s.startMin != null && s.endMin != null && s.startMin < (hour + 1) * 60 && s.endMin > hour * 60;
}

export function sessionsInCell(sessions: GridSession[], cell: GridCell): GridSession[] {
	return sessions.filter((s) => s.dayOfWeek === cell.day && overlapsHour(s, cell.hour));
}

export function hitKey(day: Day, hour: number, poolId: string): string {
	return `${day}|${hour}|${poolId}`;
}

// every day|hour|pool that has at least one of the sessions in it
export function buildHitMatrix(sessions: GridSession[]): Set<string> {
	const hits = new Set<string>();
	for (const s of sessions) {
		for (const h of HOURS) {
			if (overlapsHour(s, h)) hits.add(hitKey(s.dayOfWeek, h, s.poolId));
		}
	}
	return hits;
}

// the grid's rows: every hour from the first one anything is scheduled in to
// the last, so no empty row sits above the first session or below the last
export function hourSpan(hits: Set<string>): number[] {
	const used = [...hits].map((key) => Number(key.split("|")[1]));
	if (!used.length) return HOURS;
	const first = Math.min(...used);
	const last = Math.max(...used);
	return HOURS.filter((h) => h >= first && h <= last);
}

export function formatHour(h: number): string {
	return (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? "a" : "p");
}
