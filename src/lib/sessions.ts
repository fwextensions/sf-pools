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
export type SharedClosure = {
	startDate: string;
	endDate: string;
	reason: string | null;
	/** the hours each pool closes, all-day first, then by start time */
	windows: ClosureWindow[];
};

/** startTime and endTime are null for all day */
export type ClosureWindow = {
	startTime: string | null;
	endTime: string | null;
	poolIds: string[];
};

/**
 * The closures from the PDFs' notes that touch the seven days from `today`,
 * one per date range and reason, with the hours each pool shares. Most are
 * citywide holidays every pool lists, so a notice per pool would say the same
 * thing six times. A training day is one event too, even though each PDF
 * gives its own hours and words it differently ("Training", "staff
 * training", "Aquatics division training"), so it gets one notice that lists
 * the hours by pool. A pool whose alert closure already covers those days is
 * left out, since its own notice says it's closed.
 */
export function closuresThisWeek(all: PoolSchedule[], today: string): SharedClosure[] {
	const week = [...weekDates(today).values()];
	const groups: { startDate: string; endDate: string; reasons: string[]; closures: [string, ScheduledClosure][] }[] = [];
	for (const pool of all) {
		for (const c of pool.scheduledClosures ?? []) {
			const days = week.filter((d) => c.startDate <= d && d <= c.endDate);
			if (!days.length) continue;
			const alert = pool.closure?.suppressPrograms ? pool.closure : null;
			if (alert && days.every((d) => isClosureActive(alert, d))) continue;
			let group = groups.find((g) =>
				g.startDate === c.startDate && g.endDate === c.endDate && sameReason(g.reasons, c.reason)
			);
			if (!group) {
				group = { startDate: c.startDate, endDate: c.endDate, reasons: [], closures: [] };
				groups.push(group);
			}
			if (c.reason) group.reasons.push(c.reason);
			group.closures.push([pool.id, c]);
		}
	}
	return groups
		.map(({ startDate, endDate, reasons, closures }) => {
			const windows: ClosureWindow[] = [];
			for (const [poolId, c] of closures) {
				let w = windows.find((w) => w.startTime === c.startTime && w.endTime === c.endTime);
				if (!w) windows.push(w = { startTime: c.startTime, endTime: c.endTime, poolIds: [] });
				if (!w.poolIds.includes(poolId)) w.poolIds.push(poolId);
			}
			windows.sort((a, b) => windowStart(a) - windowStart(b));
			return { startDate, endDate, reason: plainestReason(reasons), windows };
		})
		// by day, a notice with an all-day closure ahead of one with only hours
		.sort((a, b) => a.startDate.localeCompare(b.startDate) || windowStart(a.windows[0]) - windowStart(b.windows[0]));
}

function windowStart(w: { startTime: string | null }): number {
	return (w.startTime ? parseTimeToMinutes(w.startTime) : null) ?? -1;
}

// words that don't tell one closure from another
const FILLER = new Set(["a", "the", "for", "of", "and", "all", "day", "days", "pool", "closed", "closure"]);

function reasonWords(reason: string): Set<string> {
	return new Set(
		reason.toLowerCase().replace(/['\u2019]/g, "").split(/[^a-z0-9]+/).filter((w) => w && !FILLER.has(w))
	);
}

/**
 * whether PDFs closing on the same dates mean the same thing: their wordings
 * share a word ("Training", "staff training", "Aquatics division training"),
 * or one gives no reason
 */
function sameReason(reasons: string[], reason: string | null): boolean {
	if (!reason || !reasons.length) return true;
	const words = reasonWords(reason);
	return reasons.every((r) => [...reasonWords(r)].some((w) => words.has(w)));
}

/**
 * the wording with the fewest words, since the rest add detail to it, and of
 * those the one most PDFs use ("Indigenous Peoples Day" over "Indigenous
 * People's Day")
 */
function plainestReason(reasons: string[]): string | null {
	const fewest = Math.min(...reasons.map((r) => reasonWords(r).size));
	return mostCommon(reasons.filter((r) => reasonWords(r).size === fewest));
}

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
