"use client";

import { memo, useCallback, useMemo, useSyncExternalStore } from "react";
import ProgramName from "@/components/ProgramName";
import PoolChip from "@/components/PoolChip";
import { tagLabel } from "@/lib/program-taxonomy";
import { cellDetail, emptyCellMessage } from "@/lib/grid/cell-detail";
import type { FilterView, GridModel } from "@/lib/grid/grid-model";
import { formatHour } from "@/lib/grid/sessions";
import HeightRatchet from "./HeightRatchet";

// a session you cannot simply show up for says so on the card; drop-in is the
// unremarkable case and stays unlabelled
function accessNote(tags: string[]): string | null {
	for (const tag of ["access:closed", "access:rental", "access:school-group", "access:registration"]) {
		if (tags.includes(tag)) return tagLabel(tag);
	}
	return null;
}

const noSelection = () => null;

// the one part of the page that does depend on the selected cell, so the one
// part that re-renders as a drag moves it
const DetailPanel = memo(function DetailPanel({
	model,
	filters,
	canDrag,
	ratchet,
	holdFloor = false,
}: {
	model: GridModel;
	filters: FilterView;
	canDrag: boolean;
	ratchet: boolean;
	holdFloor?: boolean;
}) {
	const subscribe = useCallback(
		(onChange: () => void) =>
			model.subscribe((change) => {
				if (change.kind !== "filters") onChange();
			}),
		[model]
	);
	const selectedCell = useSyncExternalStore(subscribe, model.getCell, noSelection);
	const { filter } = filters;
	// what the list's height floor resets on
	const filterKey = `${filters.tags.join(",")}|${filters.pools.join(",")}`;

	// the cell's sessions that pass both filters, or why there are none
	const cellView = useMemo(
		() => (selectedCell ? cellDetail(model.sessions, selectedCell, filter) : null),
		[selectedCell, model, filter]
	);
	const detail = cellView?.rows ?? null;
	const emptyReason = cellView?.empty ?? null;
	const emptyAction =
		emptyReason?.kind === "programs"
			? { what: "programs" as const, label: "SHOW ALL PROGRAMS" }
			: emptyReason?.kind === "pools"
				? { what: "pools" as const, label: "SHOW ALL POOLS" }
				: emptyReason?.kind === "both"
					? { what: "all" as const, label: "CLEAR FILTERS" }
					: null;

	return (
		<div className="mt-4 border-t-2 border-ink pt-2.5">
			<div className="flex items-baseline justify-between">
				<span className="text-body font-semibold text-ink">
					{selectedCell
						? `${selectedCell.day} · ${formatHour(selectedCell.hour)}–${formatHour(selectedCell.hour + 1)}`
						: canDrag
							? "Drag across the grid"
							: "Tap a cell for details"}
				</span>
				{detail ? (
					<span className="font-mono text-label font-medium text-ink-2">
						{detail.length} SESSION{detail.length === 1 ? "" : "S"}
					</span>
				) : null}
			</div>
			<HeightRatchet enabled={ratchet} resetKey={filterKey} hold={holdFloor}>
			{detail?.map((d, i) => {
				const access = accessNote(d.tags);
				return (
					<div
						key={i}
						className="flex items-center gap-2.5 border-b border-line py-2 text-body"
					>
						<PoolChip token={d.pool} />
						{/* a wrapping flex row rather than inline text, so the lanes
						    and access note start flush left when they drop to a second
						    line instead of keeping the gap that separates them from
						    the name */}
						<span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 gap-y-1 font-medium text-ink">
							<span><ProgramName name={d.title} /></span>
							{d.badges.length ? (
								<span className="meta whitespace-nowrap">{d.badges.join(" · ")}</span>
							) : null}
							{/* set like the lanes rather than as a filled tag, whose
							    padding and smaller type stood out in the list */}
							{access ? <span className="meta whitespace-nowrap">{access}</span> : null}
						</span>
						<span className="font-mono text-small font-medium text-ink-2">
							{d.startTime}–{d.endTime}
						</span>
					</div>
				);
			})}
			{emptyReason ? (
				<div className="py-3.5 text-body text-ink-2">
					{emptyCellMessage(emptyReason)}
					{emptyAction ? (
						<button
							type="button"
							onClick={() => model.clearFilters(emptyAction.what, "empty_cell")}
							className="ml-2 cursor-pointer border border-line-strong bg-white px-2 py-0.5 align-baseline font-mono text-label font-medium text-ink-2"
						>
							{emptyAction.label}
						</button>
					) : (
						<> Try {canDrag ? "dragging across" : "tapping a colored cell in"} the grid.</>
					)}
				</div>
			) : null}
			</HeightRatchet>
		</div>
	);
});

export default DetailPanel;
