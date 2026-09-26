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
 * Bounds on a real session. The longest any pool has published is 4.5 hours,
 * none has started before 6am or ended after 9:30pm, so these leave plenty of
 * room for a genuinely unusual schedule while still catching a flipped am/pm,
 * which moves a time by twelve hours.
 */
export const EARLIEST_START = 5 * 60;
export const LATEST_END = 22 * 60 + 30;
export const MAX_SESSION_MINUTES = 8 * 60;

/** a repaired session has to come out at least this short to be believed */
export const MAX_REPAIRED_MINUTES = 6 * 60;
const MIN_SESSION_MINUTES = 15;

function formatMinutes(minutes: number): string {
	const hour24 = Math.floor(minutes / 60);
	const hour12 = hour24 % 12 || 12;
	const minute = String(minutes % 60).padStart(2, "0");
	return `${hour12}:${minute}${hour24 < 12 ? "a" : "p"}`;
}

function flipMeridiem(time: string): string {
	return time.endsWith("a") ? time.slice(0, -1) + "p" : time.slice(0, -1) + "a";
}

/** why a start/end pair can't be a real session, or null if it could be */
function implausibility(start: number, end: number): string | null {
	if (end <= start) return "end at or before start";
	if (end - start > MAX_SESSION_MINUTES) return `lasts ${Math.round((end - start) / 60)} hours`;
	if (start < EARLIEST_START) return `starts before ${formatMinutes(EARLIEST_START)}`;
	if (end > LATEST_END) return `ends after ${formatMinutes(LATEST_END)}`;
	return null;
}

export type TimeRepair = {
	programName: string;
	dayOfWeek: string;
	from: string;
	to: string;
};

/**
 * Fix the am/pm typos the city's PDFs sometimes carry, like a Senior Swim
 * printed as "10:15am-11:15pm". The extractor copies these faithfully, and a
 * thirteen-hour session then shows on the site. When a session can't be real
 * but flipping the am/pm on one end gives an ordinary one, the flipped reading
 * is almost certainly what was meant. Only one end is ever flipped, the end
 * time first since that's where these typos have turned up, and a session
 * neither flip explains is left alone for detectScheduleAnomalies to flag.
 *
 * Mutates the schedule's programs and returns what was changed.
 */
export function repairMeridiemTypos(schedule: PoolSchedule): TimeRepair[] {
	const repairs: TimeRepair[] = [];

	for (const p of schedule.programs ?? []) {
		const start = parseTimeToMinutes(p.startTime);
		const end = parseTimeToMinutes(p.endTime);
		if (start === null || end === null || implausibility(start, end) === null) continue;

		const candidates = [
			{ startTime: p.startTime, endTime: flipMeridiem(p.endTime) },
			{ startTime: flipMeridiem(p.startTime), endTime: p.endTime },
		];
		for (const candidate of candidates) {
			const s = parseTimeToMinutes(candidate.startTime)!;
			const e = parseTimeToMinutes(candidate.endTime)!;
			if (implausibility(s, e) !== null) continue;
			if (e - s < MIN_SESSION_MINUTES || e - s > MAX_REPAIRED_MINUTES) continue;

			repairs.push({
				programName: p.programName,
				dayOfWeek: p.dayOfWeek,
				from: `${p.startTime}-${p.endTime}`,
				to: `${candidate.startTime}-${candidate.endTime}`,
			});
			p.startTime = candidate.startTime;
			p.endTime = candidate.endTime;
			break;
		}
	}

	return repairs;
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

	// an impossible time block (end at/before start, a session far longer or
	// earlier or later than any pool runs, or a time we can't parse) is corrupt
	// data — never a real schedule, so treat it as an error. repairMeridiemTypos
	// runs first and fixes the ones a flipped am/pm explains
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
		const problem = implausibility(start, end);
		if (problem) {
			anomalies.push({
				severity: "error",
				message: `${problem} in "${p.programName}" on ${p.dayOfWeek} (${p.startTime}-${p.endTime})`,
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
