export function parseTimeToMinutes(t: string): number
{
	// expects format: h:mm[a|p], e.g., 9:00a, 12:15p (no spaces)
	const m = /^(\d{1,2}):(\d{2})([ap])$/.exec(t);

	if (m) {
		let h = parseInt(m[1]!, 10);
		const min = parseInt(m[2]!, 10);
		const suffix = m[3]!;

		if (h === 12) {
			h = 0;
		} // 12am -> 0, 12pm handled by +12 below

		let total = h * 60 + min;

		if (suffix === "p") {
			total += 12 * 60;
		}

		return total;
	}

	// fallback: support 24-hour format HH:mm for older files
	const m24 = /^(\d{2}):(\d{2})$/.exec(t);

	if (m24) {
		const h = parseInt(m24[1]!, 10);
		const min = parseInt(m24[2]!, 10);

		return h * 60 + min;
	}

	return Number.MAX_SAFE_INTEGER;
}

/**
 * Format a plain YYYY-MM-DD from a schedule as text.
 *
 * These are calendar dates, not instants: "the Fall schedule starts on
 * August 29th" is true in every timezone. `new Date("2026-08-29")` reads the
 * string as UTC midnight, so formatting that in any timezone behind UTC lands
 * on the 28th — the schedules page showed every pool's season a day early.
 * Building the date in UTC and formatting it in UTC keeps the day the PDF
 * printed.
 */
export function formatScheduleDate(
	iso: string | null | undefined,
	options: Intl.DateTimeFormatOptions
): string {
	if (!iso) return "";
	const [y, m, d] = iso.split("-").map(Number);
	if (!y || !m || !d) return "";
	return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}
