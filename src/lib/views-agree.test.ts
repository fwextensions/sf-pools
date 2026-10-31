// The Now page and find_sessions both read the pool calendar, so on the
// published schedules they should agree with it, and with each other, at every
// moment of the week. Example tests only cover the shapes someone thought of;
// this walks the real data in 15 minute steps, so a schedule shape nobody
// wrote a test for (a pool closing at 1p and reopening at 2p) still gets
// checked.
import { describe, it, expect, beforeAll } from "@jest/globals";
import type { PoolSchedule } from "@/lib/schedule-schema";
import { loadCityHolidays, loadSchedules, loadUpcomingSchedules } from "@/lib/site-data";
import { addDays, createPoolCalendar, weekdayOf, type PoolCalendar } from "./pool-calendar";
import { nowSoon, qualifies, type Mode, type Moment } from "./now-soon";
import { createSwimAnswers, pacificMoment, type SwimAnswers } from "./swim-answers";
import type { Session } from "./sessions";

const STEP = 15;

let pools: PoolSchedule[];
let calendar: PoolCalendar;
let answers: SwimAnswers;
// every moment of the coming week, from today's midnight
let moments: Moment[];

beforeAll(async () => {
	const [schedules, upcoming, holidays] = await Promise.all([loadSchedules(), loadUpcomingSchedules(), loadCityHolidays()]);
	pools = schedules;
	calendar = createPoolCalendar(schedules, upcoming, holidays);
	answers = createSwimAnswers({ schedules, upcoming, holidays });
	const today = pacificMoment().date;
	moments = [];
	for (let offset = 0; offset < 7; offset++) {
		const date = addDays(today, offset);
		for (let minutes = 0; minutes < 24 * 60; minutes += STEP) moments.push({ day: weekdayOf(date), date, minutes });
	}
});

const label = (now: Moment, s?: Session) =>
	`${now.day} ${now.date} at ${Math.floor(now.minutes / 60)}:${String(now.minutes % 60).padStart(2, "0")}` +
	(s ? `: ${s.poolId} ${s.title} ${s.startTime}–${s.endTime}` : "");

describe.each<Mode>(["all", "drop-in"])("the Now page in %s mode, on the published schedules", (mode) => {
	it("shows every session running now or starting later today", () => {
		const missing: string[] = [];
		for (const now of moments) {
			const view = nowSoon(pools, calendar, now, { mode, program: null });
			const sessions = calendar.sessions(now.date, now.date).filter((s) => qualifies(s, { mode, program: null }));
			for (const s of sessions) {
				const open = view.open.find((o) => o.pool.id === s.poolId);
				const soon = view.soon.find((o) => o.pool.id === s.poolId);
				if (s.startMin <= now.minutes && now.minutes < s.endMin) {
					if (!open || !open.stretch.names.includes(s.title)) missing.push(`running, not open: ${label(now, s)}`);
				} else if (s.startMin > now.minutes) {
					// it shows inside the open stretch, or the soon row starts at or before it
					const shown = (open && s.startMin <= open.stretch.end) || (soon && soon.stretch.start <= s.startMin);
					if (!shown) missing.push(`starts soon, not shown: ${label(now, s)}`);
				}
			}
		}
		expect(missing).toEqual([]);
	});

	it("only lists a pool as open, soon or later when a session says so", () => {
		const wrong: string[] = [];
		for (const now of moments) {
			const view = nowSoon(pools, calendar, now, { mode, program: null });
			const own = (id: string) =>
				calendar.sessions(now.date, now.date).filter((s) => s.poolId === id && qualifies(s, { mode, program: null }));
			for (const o of view.open) {
				if (!own(o.pool.id).some((s) => s.startMin <= now.minutes && now.minutes < s.endMin)) {
					wrong.push(`open with nothing running: ${o.pool.id} ${label(now)}`);
				}
			}
			for (const o of view.soon) {
				if (o.stretch.start <= now.minutes) wrong.push(`soon but already started: ${o.pool.id} ${label(now)}`);
			}
			// every pool under later, at its first session after today
			const after = calendar
				.sessions(addDays(now.date, 1), addDays(now.date, 6))
				.filter((s) => qualifies(s, { mode, program: null }));
			const listed = new Set(view.later.map((o) => o.pool.id));
			for (const pool of pools) {
				if (!listed.has(pool.id)) wrong.push(`left out of later: ${pool.id} ${label(now)}`);
			}
			for (const o of view.later) {
				const own = after.filter((s) => s.poolId === o.pool.id);
				const date = own.map((s) => s.date).sort()[0];
				const day = !date ? null : date === addDays(now.date, 1) ? "Tomorrow" : weekdayOf(date).slice(0, 3);
				const start = date ? Math.min(...own.filter((s) => s.date === date).map((s) => s.startMin)) : undefined;
				if (o.day !== day || o.stretch?.start !== start) {
					wrong.push(`later isn't the first session after today: ${o.pool.id} ${label(now)}`);
				}
			}
		}
		expect(wrong).toEqual([]);
	});
});

describe("find_sessions on the published schedules", () => {
	it("agrees with the Now page's drop-in view on what's open now and what starts soon", () => {
		const disagree: string[] = [];
		for (const now of moments) {
			const view = nowSoon(pools, calendar, now, { mode: "drop-in", program: null });
			const openNow = answers.findSessions({ when: "now", limit: 200 }, now);
			const openIds = new Set((openNow.open ?? []).map((o) => o.poolId));
			const pageOpen = new Set(view.open.map((o) => o.pool.id));
			for (const id of new Set([...openIds, ...pageOpen])) {
				if (openIds.has(id) !== pageOpen.has(id)) disagree.push(`open: ${id} (find_sessions ${openIds.has(id)}, page ${pageOpen.has(id)}) ${label(now)}`);
			}

			const soon = answers.findSessions({ when: "soon", limit: 200 }, now);
			for (const r of soon.sessions) {
				const startMin = now.minutes + r.startsInMinutes!;
				const open = view.open.find((o) => o.pool.id === r.poolId);
				const row = view.soon.find((o) => o.pool.id === r.poolId);
				const shown = (open && startMin <= open.stretch.end) || (row && row.stretch.start <= startMin);
				if (!shown) disagree.push(`soon: ${r.pool} ${r.title} ${r.startTime} not on the page ${label(now)}`);
			}
		}
		expect(disagree).toEqual([]);
	});
});
