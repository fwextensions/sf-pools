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
 * Detect intrinsic data-quality problems in an extracted schedule — the kinds
 * of issues that usually mean the model misread the PDF rather than that the
 * schedule genuinely changed. Returns a list of human-readable warnings;
 * an empty array means no anomalies were found.
 *
 * These are independent of history (the changelog already covers diffs vs the
 * previous run) and are deliberately conservative to avoid false positives on
 * legitimately sparse schedules.
 */
export function detectScheduleAnomalies(schedule: PoolSchedule): string[] {
	const anomalies: string[] = [];
	const programs = schedule.programs ?? [];

	// a pool with no programs almost always means extraction failed
	if (programs.length === 0) {
		anomalies.push("no programs extracted");
		// nothing else to check
		return anomalies;
	}

	// end time at or before start time is an impossible block (parse/order error)
	for (const p of programs) {
		const start = parseTimeToMinutes(p.startTime);
		const end = parseTimeToMinutes(p.endTime);
		if (start === null || end === null) {
			anomalies.push(`unparseable time in "${p.programName}" (${p.startTime}-${p.endTime})`);
			continue;
		}
		if (end <= start) {
			anomalies.push(
				`end at or before start in "${p.programName}" on ${p.dayOfWeek} (${p.startTime}-${p.endTime})`
			);
		}
	}

	// a full week's schedule collapsing to a single day usually means the model
	// only read part of the PDF. Closed-on-one-day pools still span several days,
	// so we only flag the extreme case.
	const distinctDays = new Set(programs.map((p) => p.dayOfWeek));
	if (distinctDays.size <= 1) {
		anomalies.push(
			`schedule covers only ${distinctDays.size} day(s): ${[...distinctDays].join(", ") || "none"}`
		);
	}

	return anomalies;
}
