// The week grid's view of the sessions: the hours its rows cover, and the
// hour-by-hour overlap its cells are built from.
import { overlaps, type Day, type Session } from "@/lib/sessions";

export { DAYS, type Day } from "@/lib/sessions";

export const FIRST_HOUR = 6;
export const LAST_HOUR = 21;

export const HOURS: number[] = [];
for (let h = FIRST_HOUR; h <= LAST_HOUR; h++) HOURS.push(h);

// one hour of one day: a row and column of the grid
export type GridCell = { day: Day; hour: number };

export function sameCell(a: GridCell | null, b: GridCell | null): boolean {
	return a === b || (a != null && b != null && a.day === b.day && a.hour === b.hour);
}

// a session is in an hour when any part of it overlaps [hour, hour + 1)
function overlapsHour(s: Session, hour: number): boolean {
	return overlaps(s, hour * 60, (hour + 1) * 60);
}

export function sessionsInCell(sessions: Session[], cell: GridCell): Session[] {
	return sessions.filter((s) => s.dayOfWeek === cell.day && overlapsHour(s, cell.hour));
}

export function hitKey(day: Day, hour: number, poolId: string): string {
	return `${day}|${hour}|${poolId}`;
}

// every day|hour|pool that has at least one of the sessions in it
export function buildHitMatrix(sessions: Session[]): Set<string> {
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
