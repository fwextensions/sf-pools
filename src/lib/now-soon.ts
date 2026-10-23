// Where each pool stands for the Now & Soon page: open now, starting soon, or
// not open, with the countdown, what comes next and why a pool is quiet.
//
// Pure functions over the pool calendar, so the view only lays out what this
// returns. Times are minutes past midnight on a Pacific date; a date is
// "YYYY-MM-DD", which compares correctly as a string.
import type { PoolSchedule } from "@/lib/pdf-processor";
import { formatClosurePeriod, isClosureActive } from "@/lib/closures";
import { formatScheduleDate } from "@/lib/utils";
import type { Day, Session } from "@/lib/sessions";
import { addDays, isAllDay, weekdayOf, type PoolCalendar } from "@/lib/pool-calendar";

/** Drop-in counts only the sessions you can walk in on; Everything counts all */
export type Mode = "drop-in" | "all";

/** the programs the page filters on, as program category slugs, shared with the grid's ?program= */
export const PROGRAM_CHOICES = ["lap", "family", "senior"] as const;
export type ProgramChoice = (typeof PROGRAM_CHOICES)[number];

export const WHEN_CHOICES = ["next", "today", "tomorrow-am", "tomorrow-pm", "tomorrow-eve"] as const;
export type When = (typeof WHEN_CHOICES)[number];

export type NowSoonOptions = { mode: Mode; program: ProgramChoice | null; when: When };

export type Moment = { day: Day; date: string; minutes: number };

/** how far ahead "Next 2 hours" looks */
export const SOON_MINUTES = 120;

const DAY_END = 24 * 60;

// the named parts of tomorrow, as [from, to) in minutes
const SLOTS: Record<Exclude<When, "next" | "today">, { from: number; to: number; label: string }> = {
	"tomorrow-am": { from: 0, to: 12 * 60, label: "tomorrow morning" },
	"tomorrow-pm": { from: 12 * 60, to: 17 * 60, label: "tomorrow afternoon" },
	"tomorrow-eve": { from: 17 * 60, to: DAY_END, label: "tomorrow evening" },
};

/** the stretch of time a run of sessions keeps the pool open */
export type Stretch = {
	start: number;
	end: number;
	startTime: string;
	endTime: string;
	/** what is on at the start of the stretch */
	names: string[];
	/** the label of a restricted session in the stretch, in Everything mode */
	restricted: string | null;
	/** the first change of program inside the stretch */
	then: { names: string[]; at: string } | null;
};

export type NextOpening = {
	/** "Today", or the weekday's three-letter abbreviation */
	day: string;
	time: string;
	names: string[];
};

export type OpenStanding = { pool: PoolSchedule; stretch: Stretch };
/**
 * a pool that isn't open: when it next is, or, when not within a week, why;
 * `closedFor` names a whole-day closure the PDF lists on the day in view
 */
export type ClosedStanding = {
	pool: PoolSchedule;
	next: NextOpening | null;
	note: string | null;
	closedFor: string | null;
};

export type NowSoonView = {
	/** whether the view is anchored on the clock (countdowns) or on a slot of tomorrow */
	planned: boolean;
	/** open now, or open during the slot when planned */
	open: OpenStanding[];
	soon: OpenStanding[];
	closed: ClosedStanding[];
	/** the noun the headings use: "drop-in", "lap swim", "sessions" */
	noun: string;
	/** "in the next 2 hours", "later today", "tomorrow morning" */
	span: string;
};

/** "45m", "1h 03m", "2h" */
export function formatDuration(minutes: number): string {
	const m = Math.max(0, Math.round(minutes));
	if (m < 60) return `${m}m`;
	const h = Math.floor(m / 60);
	const rest = m % 60;
	return rest ? `${h}h ${String(rest).padStart(2, "0")}m` : `${h}h`;
}

/**
 * One name, two joined with a dot, three or more as "first +N more"; the full
 * list goes in the title attribute.
 */
export function joinNames(names: string[]): string {
	if (names.length <= 2) return names.join(" · ");
	return `${names[0]} +${names.length - 1} more`;
}

// the tag on a row in Everything mode, in the words the grid's tags use
const TAG_LABELS: Array<[string, string]> = [
	["access:rental", "Private · Rental"],
	["access:school-group", "School group"],
	["access:registration", "Registration"],
	["access:contact-coach", "Contact coach"],
];

export function restrictedLabel(tags: string[]): string | null {
	for (const [tag, label] of TAG_LABELS) if (tags.includes(tag)) return label;
	// lessons and teams need a sign-up even when the PDF prints no marker
	return tags.includes("access:drop-in") ? null : "Registration";
}

export function qualifies(s: Pick<Session, "tags">, { mode, program }: Pick<NowSoonOptions, "mode" | "program">): boolean {
	if (s.tags.includes("access:closed")) return false;
	if (mode === "drop-in" && !s.tags.includes("access:drop-in")) return false;
	return !program || s.tags.includes(`program:${program}`);
}

function unique(list: string[]): string[] {
	return [...new Set(list)];
}

/** whether the pool's printed schedule covers the date */
function scheduleCovers(pool: PoolSchedule, date: string): boolean {
	if (pool.scheduleStartDate && date < pool.scheduleStartDate) return false;
	if (pool.scheduleEndDate && date > pool.scheduleEndDate) return false;
	return true;
}

/**
 * The stretch the pool stays open from minute `at`: the sessions running then,
 * extended through every session that starts before the stretch ends, so back
 * to back sessions read as one opening. Null when nothing runs at `at`.
 */
export function stretchAt(sessions: Session[], at: number): Stretch | null {
	const sorted = [...sessions].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
	const running = sorted.filter((s) => s.startMin <= at && at < s.endMin);
	if (!running.length) return null;

	let end = Math.max(...running.map((s) => s.endMin));
	let endTime = running.find((s) => s.endMin === end)!.endTime;
	const later: Session[] = [];
	for (const s of sorted) {
		if (s.startMin > end) break;
		if (s.startMin <= at) continue;
		later.push(s);
		if (s.endMin > end) {
			end = s.endMin;
			endTime = s.endTime;
		}
	}

	const names = unique(running.map((s) => s.title));
	const change = later.find((s) => !names.includes(s.title));
	const then = change
		? {
				names: unique(later.filter((s) => s.startMin === change.startMin && !names.includes(s.title)).map((s) => s.title)),
				at: change.startTime,
			}
		: null;
	const start = Math.min(...running.map((s) => s.startMin));

	return {
		start,
		end,
		startTime: running.find((s) => s.startMin === start)!.startTime,
		endTime,
		names,
		restricted: unique(running.map((s) => restrictedLabel(s.tags)).filter((l): l is string => !!l))[0] ?? null,
		then,
	};
}

type NextFound = { offset: number; time: string; names: string[] };

/**
 * The first qualifying opening at or after minute `from` on the day `start`
 * days out, looking no further than a week from today.
 */
function findNext(wanted: (offset: number) => Session[], start: number, from: number): NextFound | null {
	for (let offset = start; offset < 7; offset++) {
		const after = offset === start ? from : 0;
		const candidates = wanted(offset).filter((s) => s.startMin >= after);
		if (!candidates.length) continue;
		const first = Math.min(...candidates.map((s) => s.startMin));
		const atFirst = candidates.filter((s) => s.startMin === first);
		return { offset, time: atFirst[0]!.startTime, names: unique(atFirst.map((s) => s.title)) };
	}
	return null;
}

export function nowSoon(
	pools: PoolSchedule[],
	calendar: PoolCalendar,
	now: Moment,
	options: NowSoonOptions
): NowSoonView {
	const planned = options.when !== "next" && options.when !== "today";
	const slot = planned ? SLOTS[options.when as keyof typeof SLOTS] : null;
	// the day the view is about, as an offset from today, and its [from, to)
	const anchor = slot ? 1 : 0;
	const from = slot ? slot.from : now.minutes;
	const to = slot ? slot.to : options.when === "today" ? DAY_END : now.minutes + SOON_MINUTES;
	const anchorDate = addDays(now.date, anchor);

	const programName = options.program
		? { lap: "lap swim", family: "family swim", senior: "senior swim" }[options.program]
		: null;
	const noun = programName ?? (options.mode === "drop-in" ? "drop-in" : "sessions");
	const span = slot ? slot.label : options.when === "today" ? "later today" : "in the next 2 hours";

	const open: OpenStanding[] = [];
	const soon: OpenStanding[] = [];
	const closed: ClosedStanding[] = [];

	// the week from today, as far as a next opening is looked for
	const sessionsByPool = new Map<string, Session[]>();
	for (const s of calendar.sessions(now.date, addDays(now.date, 6))) {
		const list = sessionsByPool.get(s.poolId);
		if (list) list.push(s);
		else sessionsByPool.set(s.poolId, [s]);
	}

	for (const pool of pools) {
		const all = sessionsByPool.get(pool.id) ?? [];
		// every session on the date `offset` days out, before the program and
		// access filters; the schedule's own dates bound it
		const onDay = (offset: number) => {
			const date = addDays(now.date, offset);
			if (!scheduleCovers(pool, date)) return [];
			return all.filter((s) => s.date === date).sort((a, b) => a.startMin - b.startMin);
		};
		const wanted = (offset: number) => onDay(offset).filter((s) => qualifies(s, options));
		const anchorWanted = wanted(anchor);

		if (!planned) {
			const current = stretchAt(anchorWanted, from);
			if (current) {
				open.push({ pool, stretch: current });
				continue;
			}
			const next = anchorWanted.find((s) => s.startMin > from && s.startMin < to);
			if (next) {
				soon.push({ pool, stretch: stretchAt(anchorWanted, next.startMin)! });
				continue;
			}
		} else {
			const first = anchorWanted.find((s) => s.startMin < to && s.endMin > from);
			if (first) {
				open.push({ pool, stretch: stretchAt(anchorWanted, Math.max(from, first.startMin))! });
				continue;
			}
		}

		const found = findNext(wanted, anchor, to);
		const next: NextOpening | null = found
			? {
					day: found.offset === 0 ? "Today" : weekdayOf(addDays(now.date, found.offset)).slice(0, 3),
					time: found.time,
					names: found.names,
				}
			: null;
		const closedFor = dayClosure(calendar, pool, anchorDate, anchor ? "tomorrow" : "today");
		closed.push({
			pool,
			next,
			// the closure says why the week is empty, so it stands in for the note
			note: next || closedFor ? null : absenceNote(calendar, pool, now.date, noun),
			closedFor,
		});
	}

	// open pools closing first lead, since they are the ones to hurry for; a
	// slot of tomorrow lists them in the order they open
	open.sort((a, b) => (planned ? a.stretch.start - b.stretch.start : a.stretch.end - b.stretch.end) || comparePools(a, b));
	soon.sort((a, b) => a.stretch.start - b.stretch.start || comparePools(a, b));
	closed.sort(comparePools);

	return { planned, open, soon, closed, noun, span };
}

function poolName(pool: PoolSchedule): string {
	return pool.shortName || pool.name || "";
}

function comparePools(a: { pool: PoolSchedule }, b: { pool: PoolSchedule }): number {
	return poolName(a.pool).localeCompare(poolName(b.pool));
}

const shortDate = (date: string) => formatScheduleDate(date, { month: "short", day: "numeric" });

/**
 * "Closed today for Indigenous Peoples Day", or "Closed through Nov 1 for
 * annual maintenance", when the pool is closed all day on `date`, whether the
 * facility page or the PDF says so. Where both do, the longer closure wins.
 */
function dayClosure(calendar: PoolCalendar, pool: PoolSchedule, date: string, when: string): string | null {
	// a null end is a closure until further notice
	const covering = calendar.closuresOn(pool.id, date).filter(isAllDay).map((r) =>
		r.kind === "alert"
			? { end: r.closure.indefinite ? null : r.closure.endDate, reason: r.closure.reason }
			: { end: r.closure.endDate, reason: r.closure.reason }
	);
	if (!covering.length) return null;
	const longest = covering.reduce((a, b) => (a.end === null || (b.end !== null && a.end >= b.end) ? a : b));
	const until =
		longest.end === null ? "until further notice" : longest.end > date ? `through ${shortDate(longest.end)}` : when;
	return `Closed ${until}${longest.reason ? ` for ${longest.reason}` : ""}`;
}

/**
 * Why a pool has nothing for a week: a closure, a printed schedule that has
 * run out or not begun, or simply nothing that matches. Only shown when there
 * is no next opening to say it instead.
 */
function absenceNote(calendar: PoolCalendar, pool: PoolSchedule, today: string, noun: string): string {
	// the facility page's closure, when it reaches into the week
	const week = Array.from({ length: 7 }, (_, offset) => addDays(today, offset));
	const alert = week.flatMap((date) => calendar.closuresOn(pool.id, date)).find((r) => r.kind === "alert");
	if (alert?.kind === "alert") {
		const closure = alert.closure;
		const verb = isClosureActive(closure, today) ? "Closed" : "Closes";
		return [verb, formatClosurePeriod(closure), closure.reason ? `for ${closure.reason}` : ""].filter(Boolean).join(" ");
	}
	if (pool.scheduleEndDate && today > pool.scheduleEndDate) return `Schedule ended ${shortDate(pool.scheduleEndDate)}`;
	if (pool.scheduleStartDate && addDays(today, 6) < pool.scheduleStartDate) {
		return `New schedule starts ${shortDate(pool.scheduleStartDate)}`;
	}
	return `No ${noun} this week`;
}
