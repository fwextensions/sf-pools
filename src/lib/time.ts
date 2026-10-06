// The one parser for a schedule's clock times. The pipeline fails the build on
// any time this can't read (detectScheduleAnomalies), so the site never sees
// one, but every caller still gets null rather than a number to check for.

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

/** minutes since midnight back to a schedule time, e.g. 870 -> "2:30p" */
export function formatMinutes(minutes: number): string {
	const hour24 = Math.floor(minutes / 60);
	const hour12 = hour24 % 12 || 12;
	const minute = String(minutes % 60).padStart(2, "0");
	return `${hour12}:${minute}${hour24 < 12 ? "a" : "p"}`;
}
