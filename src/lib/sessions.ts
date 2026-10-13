// Every view of the week starts from the same flat list: one session per
// program, described for display, with its times parsed once into minutes.
// A program whose times don't parse isn't a session. The pipeline fails the
// build on those, so none should reach the site; a view that wants to list
// them anyway (the schedules page) asks programMinutes directly.
import type { PoolSchedule, ProgramEntry } from "@/lib/pdf-processor";
import { describeProgram } from "@/lib/program-display";
import { parseTimeToMinutes } from "@/lib/time";
import { closedDays, isClosureActive, scheduledClosuresOn, weekDates, type ScheduledClosure } from "@/lib/closures";

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

export type Session = {
	poolId: string;
	title: string;
	badges: string[];
	tags: string[];
	dayOfWeek: Day;
	startTime: string;
	endTime: string;
	startMin: number;
	endMin: number;
};

/** a program's start and end in minutes, or null when either doesn't parse */
export function programMinutes(
	p: Pick<ProgramEntry, "startTime" | "endTime">
): { startMin: number; endMin: number } | null {
	const startMin = parseTimeToMinutes(p.startTime);
	const endMin = parseTimeToMinutes(p.endTime);
	return startMin == null || endMin == null ? null : { startMin, endMin };
}

/**
 * The schedules with each pool's sessions removed where a closure covers them
 * this week (the seven days from `today`): every day of an alert closure, and
 * the dates (or the hours of a date) the PDF's own notes close. The published
 * data keeps the regular weekly schedule; this is where a closure takes effect.
 */
export function withoutClosedDays(all: PoolSchedule[], today: string): PoolSchedule[] {
	const dates = weekDates(today);
	return all.map((pool) => {
		const closed = pool.closure?.suppressPrograms ? closedDays(pool.closure, today) : new Set<string>();
		const programs = pool.programs.filter(
			(p) => !closed.has(p.dayOfWeek) && !closedByScheduledClosure(pool, p, dates.get(p.dayOfWeek)!)
		);
		return programs.length === pool.programs.length ? pool : { ...pool, programs };
	});
}

/** one closure from the PDFs' notes, with every pool that announces it */
export type SharedClosure = Omit<ScheduledClosure, "reason"> & {
	reason: string | null;
	poolIds: string[];
};

/**
 * The closures from the PDFs' notes that touch the seven days from `today`,
 * one per date range and time window, with the pools that share it. Most are
 * citywide holidays every pool lists, so a notice per pool would say the same
 * thing six times. A pool whose alert closure already covers those days is
 * left out, since its own notice says it's closed.
 */
export function closuresThisWeek(all: PoolSchedule[], today: string): SharedClosure[] {
	const week = [...weekDates(today).values()];
	const groups = new Map<string, { closure: ScheduledClosure; poolIds: string[]; reasons: string[] }>();
	for (const pool of all) {
		for (const c of pool.scheduledClosures ?? []) {
			const days = week.filter((d) => c.startDate <= d && d <= c.endDate);
			if (!days.length) continue;
			const alert = pool.closure?.suppressPrograms ? pool.closure : null;
			if (alert && days.every((d) => isClosureActive(alert, d))) continue;
			const key = [c.startDate, c.endDate, c.startTime, c.endTime].join("|");
			const group = groups.get(key) ?? { closure: c, poolIds: [], reasons: [] };
			if (!group.poolIds.includes(pool.id)) group.poolIds.push(pool.id);
			if (c.reason) group.reasons.push(c.reason);
			groups.set(key, group);
		}
	}
	return [...groups.values()]
		.map(({ closure, poolIds, reasons }) => ({ ...closure, reason: mostCommon(reasons), poolIds }))
		// by day, an all-day closure ahead of a window on the same day
		.sort((a, b) => a.startDate.localeCompare(b.startDate) || windowStart(a) - windowStart(b));
}

function windowStart(c: ScheduledClosure | SharedClosure): number {
	return (c.startTime ? parseTimeToMinutes(c.startTime) : null) ?? -1;
}

/** the PDFs word the same holiday differently; go with the majority */
function mostCommon(values: string[]): string | null {
	const counts = new Map<string, number>();
	for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
	let best: string | null = null;
	for (const [v, n] of counts) if (best == null || n > counts.get(best)!) best = v;
	return best;
}

/** whether a closure from the PDF's notes shuts any part of this session on `date` */
function closedByScheduledClosure(pool: PoolSchedule, program: ProgramEntry, date: string): boolean {
	return scheduledClosuresOn(pool.scheduledClosures, date).some((c) => {
		if (!c.startTime || !c.endTime) return true;
		const session = programMinutes(program);
		const window = programMinutes({ startTime: c.startTime, endTime: c.endTime });
		// a window we can't read closes nothing rather than the whole day
		return !!session && !!window && session.startMin < window.endMin && window.startMin < session.endMin;
	});
}

export function toSessions(all: PoolSchedule[]): Session[] {
	const out: Session[] = [];
	for (const pool of all) {
		for (const p of pool.programs || []) {
			const minutes = programMinutes(p);
			if (!minutes) continue;
			const display = describeProgram(p);
			out.push({
				poolId: pool.id,
				title: display.title,
				badges: display.badges,
				tags: p.tags ?? [],
				dayOfWeek: p.dayOfWeek,
				startTime: p.startTime,
				endTime: p.endTime,
				...minutes,
			});
		}
	}
	return out;
}

/** whether any part of the session falls in [from, to) */
export function overlaps(s: Session, from: number, to: number): boolean {
	return s.startMin < to && s.endMin > from;
}
