// Why a selected grid cell lists no sessions. "Nothing scheduled" was the only
// answer, which was wrong whenever the filters were what emptied the cell, so
// this sorts the cell's unfiltered sessions by which filter hid them.

export type EmptyCellReason =
	// no pool has anything in this hour, filters or not
	| { kind: "nothing" }
	// the picked pools have sessions here, but none in the picked programs
	| { kind: "programs"; hidden: number }
	// sessions in the picked programs exist here, only at other pools
	| { kind: "pools"; hidden: number; poolIds: string[] }
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
	if (inPrograms.length) {
		const poolIds = [...new Set(inPrograms.map((s) => s.poolId))];
		return { kind: "pools", hidden: inPrograms.length, poolIds };
	}

	return { kind: "both", hidden: inCell.length };
}

function sessionCount(n: number): string {
	return `${n} session${n === 1 ? "" : "s"}`;
}

function listNames(names: string[]): string {
	if (names.length <= 2) return names.join(" and ");
	return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function emptyCellMessage(reason: EmptyCellReason, poolName: (id: string) => string): string {
	switch (reason.kind) {
		case "nothing":
			return "Nothing is scheduled at any pool in this hour.";
		case "programs":
			return `Your program filter hides ${sessionCount(reason.hidden)} here.`;
		case "pools":
			return `Your pool filter hides ${sessionCount(reason.hidden)} here, at ${listNames(reason.poolIds.map(poolName))}.`;
		case "both":
			return `Your program and pool filters both hide the ${sessionCount(reason.hidden)} here.`;
	}
}
