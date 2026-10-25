// Answers to the questions an agent asks about the pools: what's on now or
// soon, which sessions match a pool, program, day or time, what a pool's week
// looks like, and what's closed. Pure functions over the published schedules
// and the pool calendar, with the moment passed in, so an MCP server, a JSON
// endpoint or tools in the page all give the answers the pages show.
//
// Everything is on the Pacific clock. A date is "YYYY-MM-DD"; a time is the
// schedules' own "h:mm[a|p]". Answers name things the way CONTEXT.md does.
import type { PoolSchedule } from "@/lib/schedule-schema";
import { formatClosurePeriod, type Closure } from "@/lib/closures";
import { formatGridQuery } from "@/lib/grid/url";
import { addDays, createPoolCalendar, isAllDay, weekdayOf, type ClosedReason } from "@/lib/pool-calendar";
import { poolPageHref, poolPageSlug } from "@/lib/pool-pages";
import { describeProgram } from "@/lib/program-display";
import { CATEGORY_GROUPS, PROGRAM_CATEGORIES } from "@/lib/program-taxonomy";
import { DAYS, programMinutes, type Day, type Session } from "@/lib/sessions";
import { formatMinutes, parseTimeToMinutes } from "@/lib/time";
import { formatScheduleDate } from "@/lib/utils";
import { SOON_MINUTES, restrictedLabel, stretchAt, type Moment } from "@/lib/now-soon";

/** the named windows find_sessions takes, each relative to the moment asked at */
export const WHEN_WINDOWS = ["now", "soon", "today", "tonight", "tomorrow", "this-week", "weekend"] as const;
export type WhenWindow = (typeof WHEN_WINDOWS)[number];

/** how many days explicit dates may span */
export const MAX_RANGE_DAYS = 31;
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

// "tonight" is from 5p, where the Now page's "tomorrow evening" starts
const EVENING = 17 * 60;

/**
 * An answer can't be given for what was asked, e.g. a pool name that matches
 * nothing. The message says what would work, since agents guess names and
 * read the error to try again.
 */
export class SwimAnswerError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SwimAnswerError";
	}
}

export type SessionFilter = {
	/** pool ids, page slugs or names: "mlk", "north-beach" (both pools), "Rossi Pool" */
	pools?: string[];
	/** program category ids: "lap", "family", "senior", ... */
	categories?: string[];
	/**
	 * only sessions you can walk in on; defaults to true unless categories are
	 * given, so asking for lessons finds them
	 */
	dropInOnly?: boolean;
};

export type SessionQuery = SessionFilter & {
	/** a window relative to now; give this or from and to */
	when?: WhenWindow;
	from?: string;
	to?: string;
	/** weekdays, "Saturday" or "sat" */
	days?: string[];
	/** a session's start, from startAfter (inclusive) to startBefore: "6:00a", "6pm", "18:00" */
	startAfter?: string;
	startBefore?: string;
	limit?: number;
};

export type SessionResult = {
	poolId: string;
	pool: string;
	date: string;
	day: Day;
	startTime: string;
	endTime: string;
	title: string;
	categories: string[];
	dropIn: boolean;
	/** "Registration", "Private · Rental", when the session isn't drop-in */
	restricted: string | null;
	/** for "soon": minutes until it starts */
	startsInMinutes?: number;
	/** for "now": minutes until it ends */
	endsInMinutes?: number;
};

/** a pool open at the moment, through back to back sessions */
export type OpenPool = {
	poolId: string;
	pool: string;
	since: string;
	until: string;
	endsInMinutes: number;
	programs: string[];
	/** the first change of program before it closes */
	then: { programs: string[]; at: string } | null;
};

/** why a pool has no sessions, or fewer, on a date */
export type Reason = {
	kind: ClosedReason["kind"];
	/** "Closed Oct 13 – Nov 1 for annual maintenance" */
	text: string;
	startDate: string | null;
	endDate: string | null;
	/** set when only part of the day is closed */
	startTime: string | null;
	endTime: string | null;
};

export type NextOpening = { date: string; day: Day; startTime: string; programs: string[] };

/** a pool with nothing in the window: why, and when it next has something */
export type QuietPool = {
	poolId: string;
	pool: string;
	reasons: Reason[];
	/** within a week of today, else null */
	next: NextOpening | null;
};

export type SessionsAnswer = {
	window: {
		when: WhenWindow | null;
		from: string;
		to: string;
		startAfter: string | null;
		startBefore: string | null;
		/** "now (Fri Oct 9, 12:40p)", "Sat Oct 10 – Sun Oct 11" */
		label: string;
	};
	/** the day the schedules were last scraped */
	asOf: string | null;
	sessions: SessionResult[];
	/** how many matched before the limit */
	total: number;
	truncated: boolean;
	/** for "now": the pools open, with how long for */
	open?: OpenPool[];
	/** for windows of one day: the pools with nothing in them, and why */
	quiet?: QuietPool[];
	/** the week grid with the same filter */
	gridUrl: string;
};

export type WeeklyProgram = {
	day: Day;
	startTime: string;
	endTime: string;
	title: string;
	categories: string[];
	dropIn: boolean;
	restricted: string | null;
};

export type ScheduleDetail = {
	season: string | null;
	startDate: string | null;
	endDate: string | null;
	pdfUrl: string | null;
	/** Monday first, then by start time; left out of an upcoming schedule unless asked for */
	programs?: WeeklyProgram[];
};

export type PoolDetail = {
	poolId: string;
	slug: string | null;
	/** what people call it: "Balboa Pool" */
	name: string;
	/** the city's name for the building: "Balboa Aquatics Center" */
	facilityName: string;
	address: string | null;
	pageUrl: string;
	sfRecParkUrl: string | null;
	schedule: ScheduleDetail;
	/** a schedule already posted to take over on its start date */
	upcoming: ScheduleDetail | null;
	/** the facility page's closure notice, when it hasn't ended */
	alert: AlertNotice | null;
	/** the closures the PDF's notes list from today on */
	scheduledClosures: Reason[];
};

export type AlertNotice = {
	poolId: string;
	pool: string;
	text: string;
	startDate: string | null;
	endDate: string | null;
	indefinite: boolean;
	/** false when the notice is shown but not trusted to hide sessions */
	hidesSessions: boolean;
	sourceUrl: string | null;
};

export type ClosuresAnswer = {
	from: string;
	to: string;
	alerts: AlertNotice[];
	/** one per closure the PDFs list, with the pools that share it */
	scheduled: Array<{
		startDate: string;
		endDate: string;
		reason: string | null;
		text: string;
		windows: Array<{ startTime: string | null; endTime: string | null; poolIds: string[]; pools: string[] }>;
	}>;
	/** schedules that start, end or hand over to a new one in the range */
	scheduleChanges: Array<{
		kind: "starts" | "ends" | "changes";
		date: string;
		nextStart: string | null;
		poolIds: string[];
		pools: string[];
		text: string;
	}>;
};

export type PoolSummary = {
	poolId: string;
	slug: string | null;
	name: string;
	facilityName: string;
	shortName: string;
	address: string | null;
	pageUrl: string;
};

export type CategorySummary = {
	id: string;
	label: string;
	group: string;
	/** false for rentals, school classes and camps, which answers leave out unless asked */
	public: boolean;
};

export type SwimAnswers = ReturnType<typeof createSwimAnswers>;

// ---- the clock -------------------------------------------------------------

/** the moment `now` is on San Francisco's clock */
export function pacificMoment(now: Date = new Date()): Moment {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "America/Los_Angeles",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(now);
	const part = (type: string) => parts.find((p) => p.type === type)!.value;
	const date = `${part("year")}-${part("month")}-${part("day")}`;
	return { day: weekdayOf(date), date, minutes: Number(part("hour")) * 60 + Number(part("minute")) };
}

/**
 * The moment an agent asks about. A time with no zone ("2026-10-30T19:00")
 * is read as San Francisco's clock, since that's what someone asking "at 7pm
 * Thursday" means; one with a zone or Z is converted to it.
 */
export function parseMoment(at: string): Moment {
	const local = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(at.trim());
	if (local) {
		const [, date, hh, mm] = local;
		const hour = Number(hh);
		const minute = Number(mm);
		if (validDate(date!) && hour < 24 && minute < 60) {
			return { day: weekdayOf(date!), date: date!, minutes: hour * 60 + minute };
		}
	}
	const instant = new Date(at);
	if (!local && /\d{4}-\d{2}-\d{2}T/.test(at) && !Number.isNaN(instant.getTime())) return pacificMoment(instant);
	throw new SwimAnswerError(`"${at}" isn't a time I can read; use ISO 8601, e.g. "2026-10-30T19:00" for 7pm Pacific`);
}

/**
 * A time of day as minutes past midnight, from the ways people write one:
 * "6:00a", "6a", "6:30 pm", "18:00", "noon".
 */
export function parseClock(text: string): number {
	const t = text.trim().toLowerCase().replace(/\./g, "");
	if (t === "noon") return 12 * 60;
	if (t === "midnight") return 0;
	const m = /^(\d{1,2})(?::(\d{2}))?\s*([ap])?m?$/.exec(t);
	if (m) {
		const hour = Number(m[1]);
		const minute = m[2] ? Number(m[2]) : 0;
		if (m[3]) {
			const parsed = parseTimeToMinutes(`${hour}:${String(minute).padStart(2, "0")}${m[3]}`);
			if (parsed != null) return parsed;
		} else if (m[2] && hour < 24 && minute < 60) {
			return hour * 60 + minute;
		}
	}
	throw new SwimAnswerError(`"${text}" isn't a time of day I can read; use e.g. "6:00a", "6pm" or "18:00"`);
}

function validDate(date: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
	const d = new Date(`${date}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

function daysBetween(from: string, to: string): number {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const shortDate = (date: string) => formatScheduleDate(date, { month: "short", day: "numeric" });
const dayDate = (date: string) => formatScheduleDate(date, { weekday: "short", month: "short", day: "numeric" });

function dateSpan(from: string, to: string): string {
	return from === to ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}`;
}

// ---- names -----------------------------------------------------------------

function poolName(pool: PoolSchedule): string {
	return pool.nameTitle || pool.name;
}

// letters and digits only, without the words every pool's name ends in, so
// "Rossi Pool", "rossi" and "ROSSI" are the same
function nameKey(text: string): string {
	return text.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(swimming)?pool$|aquatics?center$/, "");
}

function categoriesOf(tags: string[]): string[] {
	const categories = tags.filter((t) => t.startsWith("program:")).map((t) => t.slice("program:".length));
	return categories.length ? categories : ["other"];
}

const CATEGORY_IDS: string[] = PROGRAM_CATEGORIES.map((c) => c.id);
// the "Not open to the public" group, left out unless one of them is asked for
const PRIVATE_CATEGORIES = new Set<string>(PROGRAM_CATEGORIES.filter((c) => c.group === "private").map((c) => c.id));

function resolveCategories(categories: string[] | undefined): string[] {
	const ids: string[] = [];
	for (const raw of categories ?? []) {
		const wanted = raw.trim().toLowerCase();
		const id = CATEGORY_IDS.find(
			(c) => c === wanted || PROGRAM_CATEGORIES.find((p) => p.id === c)!.label.toLowerCase() === wanted
		);
		if (!id) throw new SwimAnswerError(`no program category "${raw}"; the categories are ${CATEGORY_IDS.join(", ")}`);
		if (!ids.includes(id)) ids.push(id);
	}
	return ids;
}

function resolveDays(days: string[] | undefined): Day[] {
	const out: Day[] = [];
	for (const raw of days ?? []) {
		const wanted = raw.trim().toLowerCase();
		const day = DAYS.find((d) => d.toLowerCase() === wanted || (wanted.length >= 3 && d.toLowerCase().startsWith(wanted)));
		if (!day) throw new SwimAnswerError(`"${raw}" isn't a weekday; use e.g. "Saturday" or "sat"`);
		if (!out.includes(day)) out.push(day);
	}
	return out;
}

// ---- answers ---------------------------------------------------------------

type Window = {
	when: WhenWindow | null;
	from: string;
	to: string;
	label: string;
	/** sessions in the dates that the window has already passed by, or not reached */
	keep: (s: Session) => boolean;
	/** for windows of one day, the minute after which a next opening is looked for */
	after: number | null;
};

/**
 * `schedules` are the current ones, `upcoming` the ones posted to take over.
 * `siteUrl` makes links absolute ("https://sfpools.info"); left empty they
 * start at the site's root.
 */
export function createSwimAnswers(
	data: { schedules: PoolSchedule[]; upcoming?: PoolSchedule[] },
	{ siteUrl = "" }: { siteUrl?: string } = {}
) {
	const { schedules, upcoming = [] } = data;
	const calendar = createPoolCalendar(schedules, upcoming);
	const byId = new Map(schedules.map((s) => [s.id, s]));
	const asOf = schedules.reduce<string | null>(
		(latest, s) => (s.scheduleLastUpdated && (!latest || s.scheduleLastUpdated > latest) ? s.scheduleLastUpdated : latest),
		null
	);
	const url = (path: string) => `${siteUrl.replace(/\/$/, "")}${path}`;
	const nameOf = (poolId: string) => {
		const pool = byId.get(poolId);
		return pool ? poolName(pool) : poolId;
	};

	/**
	 * The pools a list of names means. A name matches a pool's id, page slug,
	 * short name or full name; failing that, the pools whose names contain it
	 * ("king", "cool"). Throws, listing the pools, when one matches nothing.
	 */
	function resolvePools(names: string[] | undefined): PoolSchedule[] {
		if (!names?.length) return schedules;
		const found = new Set<PoolSchedule>();
		for (const raw of names) {
			const wanted = nameKey(raw);
			const keys = (s: PoolSchedule) =>
				[s.id, poolPageSlug(s.id), s.shortName, s.nameTitle, s.name].filter((k): k is string => !!k).map(nameKey);
			let matches = wanted ? schedules.filter((s) => keys(s).includes(wanted)) : [];
			if (!matches.length && wanted.length >= 3) {
				matches = schedules.filter((s) => keys(s).some((k) => k.includes(wanted)));
			}
			if (!matches.length) {
				const valid = schedules.map((s) => `${s.id} (${poolName(s)})`).join(", ");
				throw new SwimAnswerError(`no pool matches "${raw}"; the pools are ${valid}`);
			}
			for (const m of matches) found.add(m);
		}
		return schedules.filter((s) => found.has(s));
	}

	function sessionMatcher(filter: SessionFilter): { poolIds: Set<string>; categories: string[]; test: (s: Session) => boolean } {
		const poolIds = new Set(resolvePools(filter.pools).map((p) => p.id));
		const categories = resolveCategories(filter.categories);
		const dropInOnly = filter.dropInOnly ?? !categories.length;
		const test = (s: Session) => {
			if (!poolIds.has(s.poolId) || s.tags.includes("access:closed")) return false;
			if (dropInOnly && !s.tags.includes("access:drop-in")) return false;
			const own = categoriesOf(s.tags);
			if (categories.length) return own.some((c) => categories.includes(c));
			return !own.every((c) => PRIVATE_CATEGORIES.has(c));
		};
		return { poolIds, categories, test };
	}

	function windowFor(query: SessionQuery, now: Moment): Window {
		const today = now.date;
		const m = now.minutes;
		const hasDates = query.from != null || query.to != null;
		if (query.when && hasDates) throw new SwimAnswerError("give either when or from and to, not both");

		if (hasDates) {
			const from = query.from ?? query.to!;
			const to = query.to ?? query.from!;
			for (const d of [from, to]) {
				if (!validDate(d)) throw new SwimAnswerError(`"${d}" isn't a date; use YYYY-MM-DD`);
			}
			if (to < from) throw new SwimAnswerError(`to (${to}) is before from (${from})`);
			if (daysBetween(from, to) >= MAX_RANGE_DAYS) {
				throw new SwimAnswerError(`ask for at most ${MAX_RANGE_DAYS} days at a time`);
			}
			const label = from === to ? dayDate(from) : `${dayDate(from)} – ${dayDate(to)}`;
			return { when: null, from, to, label, keep: () => true, after: null };
		}

		const when = query.when ?? "today";
		if (!WHEN_WINDOWS.includes(when)) {
			throw new SwimAnswerError(`no window "${when}"; use one of ${WHEN_WINDOWS.join(", ")}, or from and to`);
		}
		const clock = formatMinutes(m);
		const laterThanNow = (s: Session) => s.date > today || s.endMin > m;
		switch (when) {
			case "now":
				return {
					when, from: today, to: today, label: `now (${dayDate(today)}, ${clock})`,
					keep: (s) => s.startMin <= m && m < s.endMin, after: m,
				};
			case "soon":
				return {
					when, from: today, to: today,
					label: `starting in the next ${SOON_MINUTES / 60} hours (${dayDate(today)}, after ${clock})`,
					keep: (s) => s.startMin > m && s.startMin <= m + SOON_MINUTES, after: m + SOON_MINUTES,
				};
			case "today":
				return { when, from: today, to: today, label: `the rest of today (${dayDate(today)}, from ${clock})`, keep: laterThanNow, after: 24 * 60 };
			case "tonight": {
				const start = Math.max(m, EVENING);
				return {
					when, from: today, to: today, label: `tonight (${dayDate(today)}, from ${formatMinutes(start)})`,
					keep: (s) => s.endMin > start, after: 24 * 60,
				};
			}
			case "tomorrow": {
				const date = addDays(today, 1);
				return { when, from: date, to: date, label: `tomorrow (${dayDate(date)})`, keep: () => true, after: 24 * 60 };
			}
			case "this-week": {
				const to = addDays(today, 6);
				return { when, from: today, to, label: `${dayDate(today)} – ${dayDate(to)}`, keep: laterThanNow, after: null };
			}
			case "weekend": {
				// this weekend, or what's left of it on a Sunday
				const index = DAYS.indexOf(now.day);
				const from = now.day === "Sunday" ? today : addDays(today, 5 - index);
				const to = now.day === "Sunday" ? today : addDays(from, 1);
				return { when, from, to, label: `the weekend (${dateSpan(from, to)})`, keep: laterThanNow, after: null };
			}
		}
	}

	function toResult(s: Session): SessionResult {
		return {
			poolId: s.poolId,
			pool: nameOf(s.poolId),
			date: s.date,
			day: s.dayOfWeek,
			startTime: s.startTime,
			endTime: s.endTime,
			title: s.title,
			categories: categoriesOf(s.tags),
			dropIn: s.tags.includes("access:drop-in"),
			restricted: restrictedLabel(s.tags),
		};
	}

	function bySession(a: Session, b: Session): number {
		return a.date.localeCompare(b.date) || a.startMin - b.startMin || nameOf(a.poolId).localeCompare(nameOf(b.poolId));
	}

	function reasonOf(r: ClosedReason): Reason {
		switch (r.kind) {
			case "alert":
				return {
					kind: r.kind,
					text: alertText(r.closure),
					startDate: r.closure.startDate,
					endDate: r.closure.indefinite ? null : r.closure.endDate,
					startTime: null,
					endTime: null,
				};
			case "scheduled": {
				const c = r.closure;
				const hours = isAllDay(r) ? "" : ` ${c.startTime}–${c.endTime}`;
				return {
					kind: r.kind,
					text: `Closed ${dateSpan(c.startDate, c.endDate)}${hours}${c.reason ? ` for ${c.reason}` : ""}`,
					startDate: c.startDate,
					endDate: c.endDate,
					startTime: isAllDay(r) ? null : c.startTime,
					endTime: isAllDay(r) ? null : c.endTime,
				};
			}
			case "not-started":
				return { kind: r.kind, text: `Schedule starts ${shortDate(r.startDate)}`, startDate: r.startDate, endDate: null, startTime: null, endTime: null };
			case "ended":
				return { kind: r.kind, text: `Schedule ended ${shortDate(r.endDate)}`, startDate: null, endDate: r.endDate, startTime: null, endTime: null };
		}
	}

	function uniqueReasons(reasons: ClosedReason[]): Reason[] {
		const out: Reason[] = [];
		for (const r of reasons.map(reasonOf)) if (!out.some((o) => o.text === r.text)) out.push(r);
		return out;
	}

	/**
	 * Sessions that match a filter in a window: a named one relative to `now`
	 * ("now", "soon", "weekend") or explicit dates. A window of one day also
	 * lists the pools with nothing in it, why, and when they next have
	 * something; "now" adds how long each open pool stays open.
	 */
	function findSessions(query: SessionQuery, now: Moment): SessionsAnswer {
		const window = windowFor(query, now);
		const { poolIds, categories, test } = sessionMatcher(query);
		const days = resolveDays(query.days);
		const startAfter = query.startAfter != null ? parseClock(query.startAfter) : null;
		const startBefore = query.startBefore != null ? parseClock(query.startBefore) : null;
		const limit = Math.min(Math.max(1, Math.floor(query.limit ?? DEFAULT_LIMIT)), MAX_LIMIT);

		const fits = (s: Session) =>
			test(s) &&
			(!days.length || days.includes(s.dayOfWeek)) &&
			(startAfter == null || s.startMin >= startAfter) &&
			(startBefore == null || s.startMin < startBefore);

		const inRange = calendar.sessions(window.from, window.to).filter(fits);
		const matched = inRange.filter(window.keep).sort(bySession);
		const sessions = matched.slice(0, limit).map((s) => {
			const result = toResult(s);
			if (window.when === "now") result.endsInMinutes = s.endMin - now.minutes;
			if (window.when === "soon") result.startsInMinutes = s.startMin - now.minutes;
			return result;
		});

		const answer: SessionsAnswer = {
			window: {
				when: window.when,
				from: window.from,
				to: window.to,
				startAfter: startAfter == null ? null : formatMinutes(startAfter),
				startBefore: startBefore == null ? null : formatMinutes(startBefore),
				label: window.label,
			},
			asOf,
			sessions,
			total: matched.length,
			truncated: matched.length > sessions.length,
			gridUrl: url(gridPath(categories, query.pools?.length ? [...poolIds] : [])),
		};

		const pools = schedules.filter((p) => poolIds.has(p.id));
		const today = inRange.filter((s) => s.date === now.date);
		const openIds = new Set<string>();
		if (window.when === "now" || window.when === "soon") {
			const open: OpenPool[] = [];
			for (const pool of pools) {
				const stretch = stretchAt(today.filter((s) => s.poolId === pool.id), now.minutes);
				if (!stretch) continue;
				openIds.add(pool.id);
				open.push({
					poolId: pool.id,
					pool: poolName(pool),
					since: stretch.startTime,
					until: stretch.endTime,
					endsInMinutes: stretch.end - now.minutes,
					programs: stretch.names,
					then: stretch.then && { programs: stretch.then.names, at: stretch.then.at },
				});
			}
			// closing first leads, as on the Now page
			if (window.when === "now") answer.open = open.sort((a, b) => a.endsInMinutes - b.endsInMinutes || a.pool.localeCompare(b.pool));
		}

		if (window.after != null) {
			// a week from today, as far as the Now page looks for a next opening
			const ahead = calendar.sessions(now.date, addDays(now.date, 7)).filter(fits).sort(bySession);
			const busy = new Set(matched.map((s) => s.poolId));
			answer.quiet = pools
				.filter((p) => !busy.has(p.id) && !openIds.has(p.id))
				.map((pool) => quietPool(pool, window, ahead, now));
		}
		return answer;
	}

	function quietPool(pool: PoolSchedule, window: Window, ahead: Session[], now: Moment): QuietPool {
		const own = ahead.filter((s) => s.poolId === pool.id);
		const first = own.find((s) => s.date > window.from || (s.date === window.from && s.startMin > window.after!));
		const next: NextOpening | null = first
			? {
					date: first.date,
					day: first.dayOfWeek,
					startTime: first.startTime,
					programs: [...new Set(own.filter((s) => s.date === first.date && s.startMin === first.startMin).map((s) => s.title))],
				}
			: null;
		let reasons = uniqueReasons(calendar.closuresOn(pool.id, window.from));
		// nothing for a week and nothing said for the day: what the week says
		if (!reasons.length && !next) {
			reasons = uniqueReasons(Array.from({ length: 7 }, (_, i) => calendar.closuresOn(pool.id, addDays(now.date, i))).flat());
		}
		return { poolId: pool.id, pool: poolName(pool), reasons, next };
	}

	function gridPath(categories: string[], pools: string[]): string {
		const query = formatGridQuery({ tags: categories.map((c) => `program:${c}`), pools, cell: null });
		return query ? `/?${query}` : "/";
	}

	function weeklyPrograms(schedule: PoolSchedule): WeeklyProgram[] {
		const out: Array<WeeklyProgram & { startMin: number }> = [];
		for (const p of schedule.programs) {
			const minutes = programMinutes(p);
			if (!minutes) continue;
			const tags = p.tags ?? [];
			out.push({
				day: p.dayOfWeek,
				startTime: p.startTime,
				endTime: p.endTime,
				title: describeProgram(p).title,
				categories: categoriesOf(tags),
				dropIn: tags.includes("access:drop-in"),
				restricted: restrictedLabel(tags),
				startMin: minutes.startMin,
			});
		}
		return out
			.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.startMin - b.startMin)
			.map(({ startMin: _, ...program }) => program);
	}

	function scheduleDetail(schedule: PoolSchedule, withPrograms: boolean): ScheduleDetail {
		return {
			season: schedule.scheduleSeason ?? null,
			startDate: schedule.scheduleStartDate ?? null,
			endDate: schedule.scheduleEndDate ?? null,
			pdfUrl: schedule.pdfScheduleUrl ?? null,
			...(withPrograms ? { programs: weeklyPrograms(schedule) } : {}),
		};
	}

	function alertNotice(pool: PoolSchedule): AlertNotice | null {
		const c = pool.closure;
		if (!c) return null;
		return {
			poolId: pool.id,
			pool: poolName(pool),
			text: alertText(c),
			startDate: c.startDate,
			endDate: c.indefinite ? null : c.endDate,
			indefinite: c.indefinite,
			hidesSessions: c.suppressPrograms,
			sourceUrl: c.sourceUrl,
		};
	}

	/**
	 * Everything about the pools a name means (North Beach is two): where, the
	 * links, the printed schedule's dates and weekly programs, any upcoming
	 * schedule, and the closures from today on.
	 */
	function getPool(name: string, now: Moment, { includeUpcoming = false }: { includeUpcoming?: boolean } = {}): PoolDetail[] {
		return resolvePools([name]).map((pool) => {
			const next = upcoming.find((u) => u.id === pool.id && u.scheduleStartDate);
			const alert = pool.closure && (pool.closure.indefinite || !pool.closure.endDate || pool.closure.endDate >= now.date)
				? alertNotice(pool)
				: null;
			const scheduled = [...(pool.scheduledClosures ?? []), ...(next?.scheduledClosures ?? [])]
				.filter((c) => c.endDate >= now.date)
				.sort((a, b) => a.startDate.localeCompare(b.startDate))
				.map((closure) => reasonOf({ kind: "scheduled", closure }));
			return {
				poolId: pool.id,
				slug: poolPageSlug(pool.id),
				name: poolName(pool),
				facilityName: pool.name,
				address: pool.address ?? null,
				pageUrl: url(poolPageHref(pool.id)),
				sfRecParkUrl: pool.sfRecParkUrl ?? null,
				schedule: scheduleDetail(pool, true),
				upcoming: next ? scheduleDetail(next, includeUpcoming) : null,
				alert,
				scheduledClosures: scheduled.filter((r, i) => scheduled.findIndex((o) => o.text === r.text) === i),
			};
		});
	}

	/**
	 * What's closed from `from` through `to`: the facility pages' notices, the
	 * closures the PDFs list, and the schedules that start, end or change.
	 */
	function listClosures(from: string, to: string, poolNames?: string[]): ClosuresAnswer {
		for (const d of [from, to]) {
			if (!validDate(d)) throw new SwimAnswerError(`"${d}" isn't a date; use YYYY-MM-DD`);
		}
		if (to < from) throw new SwimAnswerError(`to (${to}) is before from (${from})`);
		const ids = new Set(resolvePools(poolNames).map((p) => p.id));
		const names = (poolIds: string[]) => poolIds.map(nameOf);

		const alerts = schedules
			.filter((p) => ids.has(p.id) && p.closure)
			.filter(({ closure: c }) => (c!.startDate ?? from) <= to && (c!.indefinite || !c!.endDate || c!.endDate >= from))
			.map((p) => alertNotice(p)!);

		const scheduled = calendar
			.closures(from, to)
			.map((c) => ({
				...c,
				windows: c.windows
					.map((w) => ({ ...w, poolIds: w.poolIds.filter((id) => ids.has(id)) }))
					.filter((w) => w.poolIds.length)
					.map((w) => ({ ...w, pools: names(w.poolIds) })),
			}))
			.filter((c) => c.windows.length)
			.map((c) => ({ ...c, text: `Closed ${dateSpan(c.startDate, c.endDate)}${c.reason ? ` for ${c.reason}` : ""}` }));

		const scheduleChanges = calendar
			.scheduleGaps(from, to)
			.map((g) => ({ ...g, poolIds: g.poolIds.filter((id) => ids.has(id)) }))
			.filter((g) => g.poolIds.length)
			.map((g) => {
				const who = names(g.poolIds).join(", ");
				const text =
					g.kind === "starts" ? `${who}: schedule starts ${shortDate(g.date)}`
					: g.kind === "changes" ? `${who}: new schedule from ${shortDate(g.date)}`
					: g.nextStart ? `${who}: schedule ends ${shortDate(g.date)}, next one starts ${shortDate(g.nextStart)}`
					: `${who}: schedule ends ${shortDate(g.date)}, no newer one posted yet`;
				return { kind: g.kind, date: g.date, nextStart: g.nextStart ?? null, poolIds: g.poolIds, pools: names(g.poolIds), text };
			});

		return { from, to, alerts, scheduled, scheduleChanges };
	}

	function listPools(): PoolSummary[] {
		return schedules.map((pool) => ({
			poolId: pool.id,
			slug: poolPageSlug(pool.id),
			name: poolName(pool),
			facilityName: pool.name,
			shortName: pool.shortName || poolName(pool),
			address: pool.address ?? null,
			pageUrl: url(poolPageHref(pool.id)),
		}));
	}

	function listCategories(): CategorySummary[] {
		return PROGRAM_CATEGORIES.map((c) => ({
			id: c.id,
			label: c.label,
			group: CATEGORY_GROUPS.find((g) => g.id === c.group)!.label,
			public: !PRIVATE_CATEGORIES.has(c.id),
		}));
	}

	return { findSessions, getPool, listClosures, listPools, listCategories, resolvePools };
}

function alertText(c: Closure): string {
	const period = formatClosurePeriod(c);
	return ["Closed", period, c.reason ? `for ${c.reason}` : ""].filter(Boolean).join(" ");
}
