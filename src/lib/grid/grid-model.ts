// Everything the week grid shows, behind one small interface: the program and
// pool filters, the selected cell, the commands that change them and the
// derived data the views draw. No React and no DOM, so the views, the url and
// analytics are all just subscribers, and tests drive it the way a reader does.
import { countTags, createFilter, facetGroups, toggleGroup, toggleItem, type FacetGroup, type GridFilter } from "./filters";
import { buildHitMatrix, hourSpan, sameCell, type GridCell, type GridSession } from "./sessions";

export type ClearWhat = "programs" | "pools" | "all";

// what a command did, in the terms analytics reports it in: each event
// describes the state the reader ends up looking at, not the one before
export type GridAction =
	| { type: "toggleTag"; tag: string; selected: boolean; total: number }
	| { type: "toggleGroup"; group: string; selected: boolean; total: number }
	| { type: "togglePool"; pool: string; selected: boolean; total: number }
	| { type: "clear"; programs: number; pools: number; source: "clear_button" | "empty_cell" }
	| { type: "selectCell"; cell: GridCell | null; source: "click" | "drag" };

export type GridChange =
	// the filters changed, and with them everything getFilters() returns
	| { kind: "filters"; action: GridAction }
	// the cell the reader settled on, which may be the one already selected
	| { kind: "cell"; action: GridAction; changed: boolean }
	// a drag passed over a cell: shown, but not yet the selection
	| { kind: "preview" };

export type FilterView = {
	tags: string[];
	pools: string[];
	filter: GridFilter;
	// how many sessions carry each tag; tags no session uses aren't offered
	tagCounts: Map<string, number>;
	groups: FacetGroup[];
	// day|hour|pool keys with a session that passes the program filter, and
	// with any session at all; the pool filter fades rather than removes, so
	// the views apply it per lane
	hitMatrix: Set<string>;
	anyHitMatrix: Set<string>;
	// the rows, from the first busy hour to the last of the unfiltered week,
	// so they don't shift as the filters change
	hours: number[];
};

export type GridModel = ReturnType<typeof createGridModel>;

export function createGridModel(
	sessions: GridSession[],
	initial: { tags: string[]; pools: string[]; cell: GridCell | null }
) {
	const tagCounts = countTags(sessions);
	const anyHitMatrix = buildHitMatrix(sessions);
	const hours = hourSpan(anyHitMatrix);
	const listeners = new Set<(change: GridChange) => void>();

	function view(tags: string[], pools: string[]): FilterView {
		const filter = createFilter({ tags, pools }, tagCounts);
		return {
			tags,
			pools,
			filter,
			tagCounts,
			groups: facetGroups(tagCounts, tags),
			hitMatrix: buildHitMatrix(sessions.filter(filter.matchesTags)),
			anyHitMatrix,
			hours,
		};
	}

	let filters = view(initial.tags, initial.pools);
	// what the reader settled on, and what the grid shows, which runs ahead
	// of it while a drag is under way
	let committed = initial.cell;
	let shown = initial.cell;

	function emit(change: GridChange) {
		for (const listener of listeners) listener(change);
	}

	function setFilters(tags: string[], pools: string[], action: GridAction) {
		filters = view(tags, pools);
		emit({ kind: "filters", action });
	}

	return {
		sessions,
		getFilters: (): FilterView => filters,
		// the cell the grid shows selected, including one a drag is passing over
		getCell: (): GridCell | null => shown,
		getCommittedCell: (): GridCell | null => committed,

		subscribe(listener: (change: GridChange) => void): () => void {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},

		toggleTag(tag: string) {
			const tags = toggleItem(filters.tags, tag);
			setFilters(tags, filters.pools, {
				type: "toggleTag",
				tag,
				selected: tags.includes(tag),
				total: tags.length,
			});
		},

		toggleGroup(groupId: string) {
			const group = filters.groups.find((g) => g.id === groupId);
			if (!group) return;
			const tags = toggleGroup(filters.tags, group);
			setFilters(tags, filters.pools, {
				type: "toggleGroup",
				group: groupId,
				selected: !group.allSelected,
				total: tags.length,
			});
		},

		togglePool(pool: string) {
			const pools = toggleItem(filters.pools, pool);
			setFilters(filters.tags, pools, {
				type: "togglePool",
				pool,
				selected: pools.includes(pool),
				total: pools.length,
			});
		},

		// the clear buttons drop both filters; the empty cell's button only
		// the one it blamed
		clearFilters(what: ClearWhat, source: "clear_button" | "empty_cell" = "clear_button") {
			const programs = what === "pools" ? 0 : filters.tags.length;
			const pools = what === "programs" ? 0 : filters.pools.length;
			setFilters(programs ? [] : filters.tags, pools ? [] : filters.pools, {
				type: "clear",
				programs,
				pools,
				source,
			});
		},

		// a drag passing over a cell
		previewCell(cell: GridCell | null) {
			if (sameCell(cell, shown)) return;
			shown = cell;
			emit({ kind: "preview" });
		},

		// the reader settled on a cell, by a click or the end of a drag
		selectCell(cell: GridCell | null, source: "click" | "drag") {
			const changed = !sameCell(cell, committed);
			shown = committed = cell;
			emit({ kind: "cell", action: { type: "selectCell", cell, source }, changed });
		},
	};
}
