"use client";

import type { ReactNode } from "react";
import type { FilterView, GridModel } from "@/lib/grid/grid-model";
import { Expand, X } from "lucide-react";
import { Chevron } from "@/components/icons";
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
	// one row at every common phone width: on phones narrower than 391px
	// the pickers drop to the small text size, which leaves room for both of
	// them plus the reset and full-screen buttons down to 360px. Only the
	// label word truncates, as a last resort on anything narrower, so the
	// count always shows. A media query, not a container query: with the
	// container query, iOS Safari left a strip of the old, wider picker
	// painted behind the sticky bar after its width changed.
	return (
		<div className="flex items-center justify-between gap-1">
			<div className="flex min-w-0 items-center gap-1">
				<button
					type="button"
					onClick={() => onOpenPanel(openPanel === "programs" ? null : "programs")}
					className="control min-w-0 px-2.5 text-body font-medium max-[391px]:gap-1 max-[391px]:px-2 max-[391px]:text-small"
					style={{
						background: selectedTags.length ? "var(--color-ink)" : "#fff",
						borderColor: selectedTags.length ? "var(--color-ink)" : undefined,
						color: selectedTags.length ? "#fff" : "var(--color-ink)",
					}}
				>
					<span className="truncate">Programs:</span>
					<span className="-ml-0.5 max-[391px]:ml-0">{selectedTags.length || "All"}</span>
					<Chevron open={openPanel === "programs"} />
				</button>
				<button
					type="button"
					onClick={() => onOpenPanel(openPanel === "pools" ? null : "pools")}
					className="control min-w-0 px-2.5 text-body font-medium max-[391px]:gap-1 max-[391px]:px-2 max-[391px]:text-small"
					style={{
						background: selectedPools.length ? "var(--color-ink)" : "#fff",
						borderColor: selectedPools.length ? "var(--color-ink)" : undefined,
						color: selectedPools.length ? "#fff" : "var(--color-ink)",
					}}
				>
					<span className="truncate">Pools:</span>
					<span className="-ml-0.5 max-[391px]:ml-0">{selectedPools.length || "All"}</span>
					<Chevron open={openPanel === "pools"} />
				</button>
			</div>
			<div className="flex flex-none items-center gap-1">
				{selectedTags.length || selectedPools.length ? <ClearIconButton model={model} /> : null}
				{/* the grid can only take a touch drag when the page behind it
				    holds still, so this is the way into that mode */}
				<button
					type="button"
					aria-label={focusMode ? "Leave full screen" : "Fill the screen to drag across the grid"}
					aria-pressed={focusMode}
					onClick={onToggleFocus}
					className="control w-11 flex-none px-0"
					style={{
						background: focusMode ? "var(--color-ink)" : "#fff",
						borderColor: focusMode ? "var(--color-ink)" : undefined,
						color: focusMode ? "#fff" : "var(--color-ink)",
					}}
				>
					{focusMode ? (
						<X aria-hidden className="inline-block h-4 w-4 align-middle" />
					) : (
						<Expand aria-hidden className="inline-block h-4 w-4 align-middle" />
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
// panel scrolls there, so it shrinks to fit the space the grid leaves and
// contains its own overscroll rather than pushing the grid off a short
// screen. It never grows past its rows, though: a short list stretched to
// fill that space left a blank gap between it and the grid.
export function MobilePanel({
	fill = false,
	openPanel,
	children,
}: {
	fill?: boolean;
	openPanel: OpenPanel;
	children: { programs: ReactNode; pools: ReactNode };
}) {
	const className = `border-b-2 border-ink bg-tint ${
		fill ? "overflow-y-auto overscroll-contain min-h-0 flex-initial" : ""
	}`;
	if (openPanel === "programs") {
		return <div className={className}>{children.programs}</div>;
	}
	if (openPanel === "pools") {
		return <div className={className}>{children.pools}</div>;
	}
	return null;
}
