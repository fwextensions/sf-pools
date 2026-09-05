import type { PoolSchedule } from "./pdf-processor";

/**
 * Convert a schedule time string ("h:mm[a|p]", e.g. "9:00a", "2:15p",
 * "12:00p" = noon, "12:00a" = midnight) to minutes since midnight.
 * Returns null if the string doesn't match the expected format.
 */
export function parseTimeToMinutes(time: string): number | null {
	const m = /^(\d{1,2}):(\d{2})([ap])$/.exec(time);
	if (!m) return null;
	let hour = parseInt(m[1], 10);
	const minute = parseInt(m[2], 10);
	if (hour < 1 || hour > 12 || minute > 59) return null;
	// 12a -> 0 (midnight), 12p -> 12 (noon)
	if (hour === 12) hour = 0;
	if (m[3] === "p") hour += 12;
	return hour * 60 + minute;
}

/**
 * "error" anomalies are unambiguously corrupt data that should not ship (they
 * fail the build); "warning" anomalies are suspicious but may be legitimate and
 * are surfaced for review without blocking.
 */
export type AnomalySeverity = "error" | "warning";

export type Anomaly = {
	severity: AnomalySeverity;
	message: string;
};

/**
 * Detect intrinsic data-quality problems in an extracted schedule — the kinds
 * of issues that usually mean the model misread the PDF rather than that the
 * schedule genuinely changed. Returns a list of anomalies; an empty array means
 * none were found.
 *
 * These are independent of history (the changelog already covers diffs vs the
 * previous run) and are deliberately conservative to avoid false positives on
 * legitimately sparse schedules.
 */
export function detectScheduleAnomalies(schedule: PoolSchedule): Anomaly[] {
	const anomalies: Anomaly[] = [];
	const programs = schedule.programs ?? [];

	// a pool with no programs almost always means extraction failed
	if (programs.length === 0) {
		anomalies.push({ severity: "warning", message: "no programs extracted" });
		// nothing else to check
		return anomalies;
	}

	// an impossible time block (end at/before start, or a time we can't parse)
	// is corrupt data — never a real schedule, so treat it as an error
	for (const p of programs) {
		const start = parseTimeToMinutes(p.startTime);
		const end = parseTimeToMinutes(p.endTime);
		if (start === null || end === null) {
			anomalies.push({
				severity: "error",
				message: `unparseable time in "${p.programName}" (${p.startTime}-${p.endTime})`,
			});
			continue;
		}
		if (end <= start) {
			anomalies.push({
				severity: "error",
				message: `end at or before start in "${p.programName}" on ${p.dayOfWeek} (${p.startTime}-${p.endTime})`,
			});
		}
	}

	// a full week's schedule collapsing to a single day usually means the model
	// only read part of the PDF. Closed-on-one-day pools still span several days,
	// so we only flag the extreme case (and only as a warning, since a
	// weekend-only pool is conceivable).
	const distinctDays = new Set(programs.map((p) => p.dayOfWeek));
	if (distinctDays.size <= 1) {
		anomalies.push({
			severity: "warning",
			message: `schedule covers only ${distinctDays.size} day(s): ${[...distinctDays].join(", ") || "none"}`,
		});
	}

	return anomalies;
}

/**
 * A pool whose previous run had fewer than this many programs doesn't have a
 * baseline solid enough to judge a regression against — a small schedule can
 * legitimately halve week to week.
 */
export const REGRESSION_MIN_BASELINE = 5;

/** a drop to below this fraction of the previous program count is a red flag */
export const REGRESSION_COUNT_RATIO = 0.5;

/** losing at least this many days of coverage is a red flag */
export const REGRESSION_DAY_DROP = 3;

/**
 * Detect problems visible only by comparing a schedule against the previous
 * run. This is the signal that separates a season rollover from a parse
 * failure: a rollover *replaces* programs, so the corpus stays roughly the same
 * size and shape, while a PDF whose layout the extractor no longer understands
 * loses programs without replacing them.
 *
 * Deliberately one-sided — growth is never suspicious, only collapse is.
 * Returns an empty array when there's no previous schedule, or when the
 * previous one was too small to judge against.
 */
export function detectRegressionAnomalies(
	current: PoolSchedule,
	previous: PoolSchedule | undefined
): Anomaly[] {
	if (!previous) return [];

	const anomalies: Anomaly[] = [];
	const currPrograms = current.programs ?? [];
	const prevPrograms = previous.programs ?? [];
	if (prevPrograms.length < REGRESSION_MIN_BASELINE) return [];

	// an established pool losing every program is the signature failure mode of a
	// changed PDF layout. It can also be a real long-term closure, but the two are
	// indistinguishable from the data alone, so treat it as corrupt and let a
	// human confirm.
	if (currPrograms.length === 0) {
		anomalies.push({
			severity: "error",
			message: `all ${prevPrograms.length} programs disappeared`,
		});
		// the count and coverage checks below would only restate this
		return anomalies;
	}

	if (currPrograms.length < prevPrograms.length * REGRESSION_COUNT_RATIO) {
		const pct = Math.round((1 - currPrograms.length / prevPrograms.length) * 100);
		anomalies.push({
			severity: "error",
			message: `program count fell ${pct}% (${prevPrograms.length} → ${currPrograms.length})`,
		});
	}

	// a schedule that quietly stops covering half the week usually means the
	// extractor read only part of the PDF. Warning rather than error: pools do
	// genuinely drop days between seasons.
	const currDays = new Set(currPrograms.map((p) => p.dayOfWeek));
	const prevDays = new Set(prevPrograms.map((p) => p.dayOfWeek));
	if (prevDays.size - currDays.size >= REGRESSION_DAY_DROP) {
		anomalies.push({
			severity: "warning",
			message: `day coverage fell from ${prevDays.size} to ${currDays.size} day(s)`,
		});
	}

	return anomalies;
}
