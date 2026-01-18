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
