// What the detail list under the grid shows for the selected cell: the
// sessions that pass both filters, in pool order and then by start time, or,
// when none do, why not.
import { POOL_TOKENS, type PoolToken } from "@/lib/pool-tokens";
import type { Day, Session } from "@/lib/sessions";
import type { GridFilter } from "./filters";
import { sessionsInCell, type GridCell } from "./sessions";

export type DetailRow = {
	pool: PoolToken;
	day: Day;
	title: string;
	badges: string[];
	tags: string[];
	startTime: string;
	endTime: string;
	startMin: number;
	endMin: number;
};

export type CellDetail = {
	rows: DetailRow[];
	// set only when rows is empty
	empty: EmptyCellReason | null;
};

export function cellDetail(
	sessions: Session[],
	cell: GridCell,
	{ matchesTags, poolSet }: Pick<GridFilter, "matchesTags" | "poolSet">
): CellDetail {
	// every session in the cell, before either filter, so an empty list can
	// say whether the filters emptied it
	const inCell = sessionsInCell(sessions, cell);
	const rows: DetailRow[] = [];
	for (const token of POOL_TOKENS) {
		if (poolSet && !poolSet.has(token.id)) continue;
		for (const s of inCell) {
			if (s.poolId !== token.id || !matchesTags(s)) continue;
			rows.push({
				pool: token,
				day: s.dayOfWeek,
				title: s.title,
				badges: s.badges,
				tags: s.tags,
				startTime: s.startTime,
				endTime: s.endTime,
				startMin: s.startMin,
				endMin: s.endMin,
			});
		}
	}
	rows.sort((a, b) => a.startMin - b.startMin);
	return { rows, empty: rows.length ? null : explainEmptyCell(inCell, matchesTags, poolSet) };
}

// Where each row's session sits on a timeline shared by the whole list, so
// the bars under the times compare: a 9:00-10:30 session starts left of one
// running 10:15-12:00. The scale runs from the earliest start to the latest
// end, widened to take in the whole selected hour. Each value is a percentage
// of the track: the session's span, then the part of it inside the hour.
export type SessionSpan = {
	left: number;
	width: number;
	hourLeft: number;
	hourWidth: number;
};

export function sessionSpans(rows: Pick<DetailRow, "startMin" | "endMin">[], hour: number): SessionSpan[] {
	const hourStart = hour * 60;
	const hourEnd = hourStart + 60;
	let from = hourStart;
	let to = hourEnd;
	for (const r of rows) {
		from = Math.min(from, r.startMin);
		to = Math.max(to, r.endMin);
	}
	const pct = (min: number) => ((min - from) / (to - from)) * 100;
	return rows.map((r) => {
		const inStart = Math.max(r.startMin, hourStart);
		const inEnd = Math.min(r.endMin, hourEnd);
		return {
			left: pct(r.startMin),
			width: pct(r.endMin) - pct(r.startMin),
			hourLeft: pct(inStart),
			hourWidth: Math.max(0, pct(inEnd) - pct(inStart)),
		};
	});
}

// Why a selected grid cell lists no sessions. "Nothing scheduled" was the only
// answer, which was wrong whenever the filters were what emptied the cell, so
// this sorts the cell's unfiltered sessions by which filter hid them.

export type EmptyCellReason =
	// no pool has anything in this hour, filters or not
	| { kind: "nothing" }
	// the picked pools have sessions here, but none in the picked programs
	| { kind: "programs"; hidden: number }
	// sessions in the picked programs exist here, only at other pools
	| { kind: "pools"; hidden: number }
	// each filter on its own hides every session here, so only clearing both
	// brings any back
	| { kind: "both"; hidden: number };

// inCell is every session overlapping the cell before any filtering, and
// the caller has already found that none of them pass both filters
export function explainEmptyCell<T extends { poolId: string }>(
	inCell: T[],
	matchesTags: (s: T) => boolean,
	poolSet: Set<string> | null
): EmptyCellReason {
	if (!inCell.length) return { kind: "nothing" };

	// with the pool filter left on, the program filter is the one hiding
	// these, so loosening programs is the change that brings them back
	const atPools = poolSet ? inCell.filter((s) => poolSet.has(s.poolId)) : inCell;
	if (atPools.length) return { kind: "programs", hidden: atPools.length };

	const inPrograms = inCell.filter(matchesTags);
	if (inPrograms.length) return { kind: "pools", hidden: inPrograms.length };

	return { kind: "both", hidden: inCell.length };
}

function sessionCount(n: number): string {
	return `${n} session${n === 1 ? "" : "s"}`;
}

export function emptyCellMessage(reason: EmptyCellReason): string {
	switch (reason.kind) {
		case "nothing":
			return "Nothing is scheduled at any pool in this hour.";
		case "programs":
			return `Your program filter hides ${sessionCount(reason.hidden)} here.`;
		case "pools":
			return `Your pool filter hides ${sessionCount(reason.hidden)} here.`;
		case "both":
			return `Your program and pool filters both hide the ${sessionCount(reason.hidden)} here.`;
	}
}
