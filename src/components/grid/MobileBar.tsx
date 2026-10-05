"use client";

import type { ReactNode } from "react";
import type { FilterView, GridModel } from "@/lib/grid/grid-model";
import { ClearIconButton } from "./FilterPicker";

// ----- mobile chrome (shared by the scrolling page and focus mode) -----

export type OpenPanel = "programs" | "pools" | null;

export function MobileChips({
	model,
	filters,
	openPanel,
	onOpenPanel,
	focusMode,
	onToggleFocus,
}: {
	model: GridModel;
	filters: FilterView;
	openPanel: OpenPanel;
	onOpenPanel: (panel: OpenPanel) => void;
	focusMode: boolean;
	onToggleFocus: () => void;
}) {
	const selectedTags = filters.tags;
	const selectedPools = filters.pools;
	return (
		<div className="flex items-center justify-between gap-1.5">
			<div className="flex min-w-0 flex-wrap items-center gap-1.5">
				<button
					type="button"
					onClick={() => onOpenPanel(openPanel === "programs" ? null : "programs")}
					className="cursor-pointer border-[1.5px] border-[#0e2733] px-2.5 py-2 plex-mono text-[12px] font-semibold"
					style={{
						background: selectedTags.length ? "#0e2733" : "#fff",
						color: selectedTags.length ? "#fff" : "#0e2733",
					}}
				>
					PROGRAMS {selectedTags.length || "ALL"} <span className="text-[15px] leading-none">{openPanel === "programs" ? "▴" : "▾"}</span>
				</button>
				<button
					type="button"
					onClick={() => onOpenPanel(openPanel === "pools" ? null : "pools")}
					className="cursor-pointer border-[1.5px] border-[#0e2733] px-2.5 py-2 plex-mono text-[12px] font-semibold"
					style={{
						background: selectedPools.length ? "#0e2733" : "#fff",
						color: selectedPools.length ? "#fff" : "#0e2733",
					}}
				>
					POOLS {selectedPools.length || "ALL"} <span className="text-[15px] leading-none">{openPanel === "pools" ? "▴" : "▾"}</span>
				</button>
			</div>
			<div className="flex flex-none items-center gap-1.5">
				{selectedTags.length || selectedPools.length ? <ClearIconButton model={model} /> : null}
				{/* the grid can only take a touch drag when the page behind it
				    holds still, so this is the way into that mode */}
				<button
					type="button"
					aria-label={focusMode ? "Leave full screen" : "Fill the screen to drag across the grid"}
					aria-pressed={focusMode}
					onClick={onToggleFocus}
					className="w-9 flex-none cursor-pointer border-[1.5px] border-[#0e2733] px-2.5 py-2 text-center plex-mono text-[12px] font-semibold"
					style={{
						background: focusMode ? "#0e2733" : "#fff",
						color: focusMode ? "#fff" : "#0e2733",
					}}
				>
					{focusMode ? (
						<span className="text-[15px] leading-none">✕</span>
					) : (
						<svg
							aria-hidden
							viewBox="0 0 14 14"
							className="inline-block h-[14px] w-[14px] align-middle"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<path d="M1 5V1h4M13 5V1H9M1 9v4h4M13 9v4H9" />
						</svg>
					)}
				</button>
			</div>
		</div>
	);
}

// on the page a panel is just tall and the rest scrolls past it: no height
// cap and no scroller of its own, so the page is the only thing that
// scrolls and a swipe started anywhere behaves the same. A capped panel
// scrolled on its own instead, and a touch that starts inside a scroller
// stays with it for the whole gesture, so reaching the grid meant
// scrolling the filters to their end, lifting, and swiping again — or
// knowing to start outside the panel. The chip bar above it is sticky, so
// a long list is still one tap from being closed.
//
// Focus mode is the opposite case and keeps both: nothing behind the
// panel scrolls there, so it takes the leftover space and contains its
// own overscroll rather than pushing the grid off a short screen.
export function MobilePanel({
	fill = false,
	openPanel,
	children,
}: {
	fill?: boolean;
	openPanel: OpenPanel;
	children: { programs: ReactNode; pools: ReactNode };
}) {
	const className = `border-b-2 border-[#0e2733] bg-[#fbfdfe] ${
		fill ? "overflow-y-auto overscroll-contain min-h-0 flex-1" : ""
	}`;
	if (openPanel === "programs") {
		return <div className={className}>{children.programs}</div>;
	}
	if (openPanel === "pools") {
		return <div className={className}>{children.pools}</div>;
	}
	return null;
}
