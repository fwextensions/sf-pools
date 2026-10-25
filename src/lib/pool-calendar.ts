// The one place that decides which sessions a pool has on a date, and why it
// has none. The published data keeps each pool's regular week of programs;
// closures take effect here, as sessions left off the dates they cover. A
// schedule posted ahead of its season takes over on its start date, so the
// change lands on the right day whenever the data was last scraped. Views
// ask for the dates they show, so nothing here assumes "this week".
//
// A date is "YYYY-MM-DD" on the Pacific calendar, which compares correctly as
// a string.
import type { PoolSchedule } from "@/lib/schedule-schema";
import { describeProgram } from "@/lib/program-display";
import { parseTimeToMinutes } from "@/lib/time";
import { isClosureActive, scheduledClosuresOn, type Closure, type ScheduledClosure } from "@/lib/closures";
import { programMinutes, type Day, type Session } from "@/lib/sessions";

/**
 * why a pool has no sessions, or fewer, on a date: a closure, or a date
 * outside the dates its printed schedule runs
 */
export type ClosedReason =
	| { kind: "alert"; closure: Closure }
	| { kind: "scheduled"; closure: ScheduledClosure }
	| { kind: "not-started"; startDate: string }
	| { kind: "ended"; endDate: string };

/** the pools whose printed schedule starts, ends or changes inside a range of dates */
export type ScheduleGap = {
	/**
	 * "ends": no sessions after `date`, until `nextStart` when a new schedule
	 * is already posted; "starts": none before `date`; "changes": a new
	 * schedule takes over on `date`, straight after the old one
	 */
	kind: "ends" | "starts" | "changes";
	date: string;
	/** for "ends", the day the posted schedule that follows begins */
	nextStart?: string;
	poolIds: string[];
};

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

export type PoolCalendar = {
	/**
	 * Every pool's sessions on the dates from `from` through `to`, pool by
	 * pool in the order of their programs.
	 */
	sessions(from: string, to: string): Session[];
	/**
	 * Why the pool is closed for all or part of `date`: a date outside its
	 * schedule, then the PDF's notes in the order they list them, then the
	 * facility page's closure.
	 */
	closuresOn(poolId: string, date: string): ClosedReason[];
	/**
	 * The closures from the PDFs' notes that touch `from` through `to`, one
	 * per date range and reason, with the hours each pool shares.
	 */
	closures(from: string, to: string): SharedClosure[];
	/**
	 * The schedules that end before `to` or start after `from`, so that some
	 * of those dates have no sessions until a new PDF is posted or starts, and
	 * the posted schedules that take over between the two.
	 */
	scheduleGaps(from: string, to: string): ScheduleGap[];
};

const WEEKDAYS: Day[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function addDays(date: string, days: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

export function weekdayOf(date: string): Day {
	return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
}

/** whether a reason shuts the pool for the whole of the date */
export function isAllDay(reason: ClosedReason): boolean {
	return reason.kind !== "scheduled" || !reason.closure.startTime || !reason.closure.endTime;
}

function datesBetween(from: string, to: string): string[] {
	const dates: string[] = [];
	for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
	return dates;
}

// a session before it's placed on a date: a program parsed and described once
type Weekly = Omit<Session, "date">;

// one printed schedule of a pool and the dates it applies from
type Period = { schedule: PoolSchedule; weekly: Weekly[] };

/**
 * `pools` are the current schedules. `upcoming` are the ones posted to take
 * over later, at most one per pool, each from its scheduleStartDate.
 */
export function createPoolCalendar(pools: PoolSchedule[], upcoming: PoolSchedule[] = []): PoolCalendar {
	const periods = new Map<string, Period[]>();
	for (const schedule of [...pools, ...upcoming.filter((s) => s.scheduleStartDate)]) {
		const list = periods.get(schedule.id) ?? [];
		list.push({ schedule, weekly: weeklySessions(schedule) });
		periods.set(schedule.id, list);
	}
	// a missing start sorts first: the current schedule, running already
	for (const list of periods.values()) {
		list.sort((a, b) => (a.schedule.scheduleStartDate ?? "").localeCompare(b.schedule.scheduleStartDate ?? ""));
	}

	/** the schedule in force on a date: the latest to have started, else the first */
	function periodOn(poolId: string, date: string): Period | undefined {
		const list = periods.get(poolId);
		if (!list) return undefined;
		let period = list[0];
		for (const p of list.slice(1)) if (p.schedule.scheduleStartDate! <= date) period = p;
		return period;
	}

	function closuresOn(poolId: string, date: string): ClosedReason[] {
		const pool = periodOn(poolId, date)?.schedule;
		if (!pool) return [];
		const reasons: ClosedReason[] = [];
		// a missing date means the schedule runs until the next PDF replaces it
		if (pool.scheduleStartDate && date < pool.scheduleStartDate) {
			reasons.push({ kind: "not-started", startDate: pool.scheduleStartDate });
		}
		if (pool.scheduleEndDate && date > pool.scheduleEndDate) {
			reasons.push({ kind: "ended", endDate: pool.scheduleEndDate });
		}
		for (const closure of scheduledClosuresOn(pool.scheduledClosures, date)) {
			reasons.push({ kind: "scheduled", closure });
		}
		// suppressPrograms is the release rules' gate: an alert that isn't
		// trusted to hide programs is only shown as a notice
		if (pool.closure?.suppressPrograms && isClosureActive(pool.closure, date)) {
			reasons.push({ kind: "alert", closure: pool.closure });
		}
		return reasons;
	}

	function sessions(from: string, to: string): Session[] {
		const dates = datesBetween(from, to);
		const out: Session[] = [];
		for (const [poolId, list] of periods) {
			const shut = new Map(dates.map((date) => [date, closuresOn(poolId, date)]));
			for (const period of list) {
				const own = dates.filter((date) => periodOn(poolId, date) === period);
				for (const s of period.weekly) {
					for (const date of own) {
						if (weekdayOf(date) !== s.dayOfWeek) continue;
						if (shut.get(date)!.some((reason) => shuts(reason, s))) continue;
						out.push({ ...s, date });
					}
				}
			}
		}
		return out;
	}

	function closures(from: string, to: string): SharedClosure[] {
		const range = datesBetween(from, to);
		const groups: { startDate: string; endDate: string; reasons: string[]; closures: [string, ScheduledClosure][] }[] = [];
		for (const [poolId, list] of periods) {
			for (const period of list) {
				for (const c of period.schedule.scheduledClosures ?? []) {
					// a schedule's notes only speak for the dates it's in force
					const days = range.filter((d) => c.startDate <= d && d <= c.endDate && periodOn(poolId, d) === period);
					if (!days.length) continue;
					// a pool its alert already closes on every one of those days has
					// its own notice saying so
					if (days.every((d) => closuresOn(poolId, d).some((r) => r.kind === "alert"))) continue;
					let group = groups.find((g) =>
						g.startDate === c.startDate && g.endDate === c.endDate && sameReason(g.reasons, c.reason)
					);
					if (!group) {
						group = { startDate: c.startDate, endDate: c.endDate, reasons: [], closures: [] };
						groups.push(group);
					}
					if (c.reason) group.reasons.push(c.reason);
					group.closures.push([poolId, c]);
				}
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
			.sort((a, b) => a.startDate.localeCompare(b.startDate) || windowStart(a.windows[0]!) - windowStart(b.windows[0]!));
	}

	function scheduleGaps(from: string, to: string): ScheduleGap[] {
		const gaps: ScheduleGap[] = [];
		const add = (kind: ScheduleGap["kind"], date: string, poolId: string, nextStart?: string) => {
			const gap = gaps.find((g) => g.kind === kind && g.date === date && g.nextStart === nextStart);
			if (gap) gap.poolIds.push(poolId);
			else gaps.push(nextStart ? { kind, date, nextStart, poolIds: [poolId] } : { kind, date, poolIds: [poolId] });
		};
		for (const [poolId, list] of periods) {
			const first = list[0]!.schedule;
			if (first.scheduleStartDate && first.scheduleStartDate > from) add("starts", first.scheduleStartDate, poolId);
			list.forEach(({ schedule }, i) => {
				const end = schedule.scheduleEndDate;
				const next = list[i + 1]?.schedule.scheduleStartDate;
				if (!next) {
					if (end && end < to) add("ends", end, poolId);
				} else if (end && addDays(end, 1) < next) {
					// days with no schedule between this one and the next
					if (end < to && next > from) add("ends", end, poolId, next);
				} else if (from < next && next <= to) {
					add("changes", next, poolId);
				}
			});
		}
		return gaps.sort((a, b) => a.date.localeCompare(b.date));
	}

	return { sessions, closuresOn, closures, scheduleGaps };
}

function weeklySessions(pool: PoolSchedule): Weekly[] {
	const out: Weekly[] = [];
	for (const p of pool.programs || []) {
		// a program whose times don't parse isn't a session; the pipeline fails
		// the build on those, so none should reach the site
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
	return out;
}

/** whether a closure shuts any part of the session */
function shuts(reason: ClosedReason, s: Weekly): boolean {
	if (isAllDay(reason)) return true;
	const c = (reason as Extract<ClosedReason, { kind: "scheduled" }>).closure;
	const window = programMinutes({ startTime: c.startTime!, endTime: c.endTime! });
	// a window we can't read closes nothing rather than the whole day
	return !!window && s.startMin < window.endMin && window.startMin < s.endMin;
}

function windowStart(w: { startTime: string | null }): number {
	return (w.startTime ? parseTimeToMinutes(w.startTime) : null) ?? -1;
}

// Most of the PDFs' closures are citywide holidays every pool lists, so a
// notice per pool would say the same thing six times. A training day is one
// event too, even though each PDF gives its own hours and words it
// differently ("Training", "staff training", "Aquatics division training").

// words that don't tell one closure from another
const FILLER = new Set(["a", "the", "for", "of", "and", "all", "day", "days", "pool", "closed", "closure"]);

function reasonWords(reason: string): Set<string> {
	return new Set(
		reason.toLowerCase().replace(/['’]/g, "").split(/[^a-z0-9]+/).filter((w) => w && !FILLER.has(w))
	);
}

/**
 * whether PDFs closing on the same dates mean the same thing: their wordings
 * share a word, or one gives no reason
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
