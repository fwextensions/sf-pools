"use client";

import { memo, useCallback, useMemo, useSyncExternalStore } from "react";
import ProgramName from "@/components/ProgramName";
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
}: {
	model: GridModel;
	filters: FilterView;
	canDrag: boolean;
	ratchet: boolean;
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
		<div className="mt-4 border-t-2 border-[#0e2733] pt-2.5">
			<div className="flex items-baseline justify-between">
				<span className="text-[14px] font-semibold text-[#0e2733]">
					{selectedCell
						? `${selectedCell.day} · ${formatHour(selectedCell.hour)}–${formatHour(selectedCell.hour + 1)}`
						: canDrag
							? "Drag across the grid"
							: "Tap a cell for details"}
				</span>
				{detail ? (
					<span className="plex-mono text-[11px] font-medium text-[#8a9aa4]">
						{detail.length} SESSION{detail.length === 1 ? "" : "S"}
					</span>
				) : null}
			</div>
			<HeightRatchet enabled={ratchet} resetKey={filterKey}>
			{detail?.map((d, i) => (
				<div
					key={i}
					className="flex items-center gap-2.5 border-b border-[#edf1f3] py-2 text-[14px]"
				>
					<span
						className="px-1.5 py-[3px] plex-mono text-[11px] font-semibold text-white"
						style={{ background: d.color }}
					>
						{d.code}
					</span>
					<span className="min-w-0 flex-1 font-medium text-[#0e2733]">
						<ProgramName name={d.title} />
						{[...d.badges, accessNote(d.tags)].filter(Boolean).map((note) => (
							<span
								key={note}
								className="ml-1.5 whitespace-nowrap plex-mono text-[11px] font-medium uppercase text-[#8a9aa4]"
							>
								{note}
							</span>
						))}
					</span>
					<span className="plex-mono text-[13px] font-medium text-[#5a707c]">
						{d.startTime}–{d.endTime}
					</span>
				</div>
			))}
			{emptyReason ? (
				<div className="py-3.5 text-[14px] text-[#8a9aa4]">
					{emptyCellMessage(emptyReason)}
					{emptyAction ? (
						<button
							type="button"
							onClick={() => model.clearFilters(emptyAction.what, "empty_cell")}
							className="ml-2 cursor-pointer border border-[#c4d2d9] bg-white px-2 py-0.5 align-baseline plex-mono text-[11px] font-medium text-[#5a707c]"
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
