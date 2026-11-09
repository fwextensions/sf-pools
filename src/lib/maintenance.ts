// The aquatics division's yearly maintenance schedule, a PDF linked from the
// Swimming Pools page. It lists each pool's maintenance shutdown and the
// closures every pool shares, like in-service training days. The pools' own
// PDFs usually print the same closures in their notes, but not always, so
// this fills in whatever a pool's PDF leaves out, the way the city's holiday
// list does.
import type { PoolSchedule } from "@/lib/schedule-schema";
import { checkScheduledClosure, type ScheduledClosure } from "@/lib/closures";

export const SWIMMING_POOLS_URL = "https://sfrecpark.org/482/Swimming-Pools";

/** one row of the maintenance schedule */
export type MaintenanceEntry = {
	/** the pools it closes; empty for every pool */
	poolIds: string[];
	/** YYYY-MM-DD, the first closed day */
	startDate: string;
	/** YYYY-MM-DD, the last closed day */
	endDate: string;
	/** as the PDF puts it ("Annual maintenance", "In-service training") */
	reason: string;
};

/** public/data/maintenance_schedule.json */
export type MaintenanceData = {
	/** the PDF the entries were read from */
	source: string;
	/** sha256 of the PDF's bytes, so an unchanged PDF isn't read again */
	pdfHash: string;
	/** the PDF's heading, e.g. "2026-2027 Pool Maintenance Schedule" */
	title: string;
	lastUpdated: string;
	entries: MaintenanceEntry[];
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function addDay(date: string): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

function weekdayOf(date: string): string {
	return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
}

/**
 * The maintenance schedule's closures for one pool, as all-day closures, for
 * the dates its own PDF says nothing about. A closure in the pool's PDF that
 * overlaps an entry at all, for any reason or hours, has the last word on
 * those dates, since the pool's schedule is the more specific of the two and
 * is often the newer: Rossi's PDF and the maintenance schedule both say
 * 11/2-11/21, and when they disagree the pool's own dates win. An entry that
 * has ended, or closes none of the days the pool runs in its printed season,
 * is left out, as is one that doesn't read as a sensible closure.
 */
export function maintenanceClosures(
	schedule: Pick<PoolSchedule, "id" | "scheduleStartDate" | "scheduleEndDate" | "programs" | "scheduledClosures">,
	entries: MaintenanceEntry[] | null | undefined,
	today: string
): ScheduledClosure[] {
	const own = schedule.scheduledClosures ?? [];
	const days = new Set<string>((schedule.programs ?? []).map((p) => p.dayOfWeek));
	const season = { startDate: schedule.scheduleStartDate, endDate: schedule.scheduleEndDate };
	const runs = (date: string) =>
		days.has(weekdayOf(date)) &&
		(!season.startDate || season.startDate <= date) &&
		(!season.endDate || date <= season.endDate);

	const out: ScheduledClosure[] = [];
	for (const e of entries ?? []) {
		if (e.poolIds.length && !e.poolIds.includes(schedule.id)) continue;
		if (e.endDate < today) continue;
		const closure: ScheduledClosure = {
			startDate: e.startDate,
			endDate: e.endDate,
			startTime: null,
			endTime: null,
			reason: e.reason,
		};
		// a malformed or impossibly long entry is a misread, not a closure
		if (checkScheduledClosure(closure, {})) continue;
		if (own.some((c) => c.startDate <= e.endDate && e.startDate <= c.endDate)) continue;
		let closesSomething = false;
		for (let d = e.startDate; d <= e.endDate && !closesSomething; d = addDay(d)) closesSomething = runs(d);
		if (!closesSomething) continue;
		out.push(closure);
	}
	return out;
}
