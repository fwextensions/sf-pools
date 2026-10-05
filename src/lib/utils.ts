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
