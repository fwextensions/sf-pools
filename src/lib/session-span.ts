// Where a list's sessions sit on one timeline the whole list shares, so the
// bars drawn from it compare: a 9:00-10:30 session starts left of one running
// 10:15-12:00. The grid's cell list and Now & Soon both draw them.

/** percentages of the track: the session's span, then its darker stretch */
export type SessionSpan = {
	left: number;
	width: number;
	markLeft: number;
	markWidth: number;
};

export type SpanInput = {
	start: number;
	end: number;
	/** the stretch to draw darker, clipped to the session; null for none */
	mark: [number, number] | null;
};

/**
 * The scale runs from the earliest start to the latest end, widened to take
 * in `include` (the selected hour, or the current minute), so it shows on the
 * track even where no session reaches it.
 */
export function spansOnOneScale(rows: SpanInput[], include: [number, number]): SessionSpan[] {
	let [from, to] = include;
	for (const r of rows) {
		from = Math.min(from, r.start);
		to = Math.max(to, r.end);
	}
	const length = to - from || 1;
	const pct = (min: number) => ((min - from) / length) * 100;
	return rows.map((r) => {
		const markStart = r.mark ? Math.max(r.mark[0], r.start) : r.start;
		const markEnd = r.mark ? Math.min(r.mark[1], r.end) : r.start;
		return {
			left: pct(r.start),
			width: pct(r.end) - pct(r.start),
			markLeft: pct(markStart),
			markWidth: Math.max(0, pct(markEnd) - pct(markStart)),
		};
	});
}
