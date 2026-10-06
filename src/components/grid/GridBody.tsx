"use client";

import { memo, useLayoutEffect, useMemo, useRef, type PointerEvent } from "react";
import { POOL_TOKENS } from "@/lib/pool-tokens";
import type { FilterView, GridModel } from "@/lib/grid/grid-model";
import { DAYS, formatHour, hitKey, type Day, type GridCell } from "@/lib/grid/sessions";

// Marks the selection with attributes that globals.css styles: data-selected
// on the cell, data-band on everything in its row and column (the cells, the
// day heading and the hour label), data-has-selection on the grid. A move
// touches the dozen or so elements involved rather than re-rendering 2,500.
// React never renders these attributes, so a re-render of the grid leaves
// them alone; aria-pressed it renders once as false and never changes, so
// that too stays as set here
function paintSelection(root: HTMLElement, cell: GridCell | null) {
	for (const el of root.querySelectorAll("[data-band]")) el.removeAttribute("data-band");
	const prev = root.querySelector("[data-selected]");
	if (prev) {
		prev.removeAttribute("data-selected");
		prev.setAttribute("aria-pressed", "false");
	}
	if (!cell) {
		root.removeAttribute("data-has-selection");
		return;
	}
	root.setAttribute("data-has-selection", "");
	for (const el of root.querySelectorAll(`[data-day="${cell.day}"], [data-hour="${cell.hour}"]`)) {
		el.setAttribute("data-band", "");
	}
	const selected = root.querySelector(`.grid-cell[data-day="${cell.day}"][data-hour="${cell.hour}"]`);
	selected?.setAttribute("data-selected", "");
	selected?.setAttribute("aria-pressed", "true");
}

function cellAtPoint(x: number, y: number): GridCell | null {
	const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-day][data-hour]");
	if (!el) return null;
	const day = el.dataset.day as Day;
	const hour = Number(el.dataset.hour);
	if (!DAYS.includes(day) || Number.isNaN(hour)) return null;
	return { day, hour };
}

type GridHandlers = {
	pointerDown: (
		e: PointerEvent<HTMLDivElement>,
		day: Day,
		hour: number,
		touchDrag: boolean
	) => void;
	pointerMove: (e: PointerEvent<HTMLDivElement>) => void;
	pointerUp: (e: PointerEvent<HTMLDivElement>) => void;
	click: (day: Day, hour: number) => void;
	choose: (day: Day, hour: number) => void;
};

// live-preview drag: pressing a cell and moving the pointer across the
// grid updates the selection to whatever cell is under the pointer, so the
// detail panel updates as you drag rather than only on release.
//
// a mouse can always drag — it has no scroll gesture to collide with. A
// finger only gets to drag where the page underneath doesn't scroll at
// all, which is what focus mode is for; anywhere else touch is left
// entirely alone so scrolling stays native, and a tap still selects.
//
// the url trails the grid by a gesture: previewCell only paints, selectCell
// is what the reader settled on and the only thing the address bar hears about
function useGestures(model: GridModel): GridHandlers {
	const isDraggingRef = useRef(false);
	const suppressClickRef = useRef(false);

	return useMemo<GridHandlers>(() => {
		function pointerUp(e: PointerEvent<HTMLDivElement>) {
			if (isDraggingRef.current) {
				// a drag just decided the selection; ignore the click the browser
				// synthesizes right after, or it'd snap the selection back to
				// wherever the gesture started
				suppressClickRef.current = true;
				// the gesture is over, so wherever it ended is the real selection
				model.selectCell(model.getCell(), "drag");
			}
			isDraggingRef.current = false;
			if (e.currentTarget.hasPointerCapture(e.pointerId)) {
				e.currentTarget.releasePointerCapture(e.pointerId);
			}
		}

		function choose(day: Day, hour: number) {
			model.selectCell({ day, hour }, "click");
		}

		return {
			pointerDown(e, day, hour, touchDrag) {
				if (e.pointerType !== "mouse" && !touchDrag) return;
				isDraggingRef.current = true;
				e.currentTarget.setPointerCapture(e.pointerId);
				model.previewCell({ day, hour });
			},
			pointerMove(e) {
				if (!isDraggingRef.current) return;
				e.preventDefault();
				const cell = cellAtPoint(e.clientX, e.clientY);
				if (cell) model.previewCell(cell);
			},
			pointerUp,
			click(day, hour) {
				if (suppressClickRef.current) {
					suppressClickRef.current = false;
					return;
				}
				choose(day, hour);
			},
			choose,
		};
	}, [model]);
}

// Memoized, and none of its props change with the selection, so a click or a
// drag never re-renders it: the selection is painted onto its DOM by
// paintSelection. It re-renders only when the filters change what it shows
const GridBody = memo(function GridBody({
	model,
	filters,
	cellHeightClass,
	touchDrag,
}: {
	model: GridModel;
	filters: FilterView;
	cellHeightClass: string;
	touchDrag: boolean;
}) {
	const root = useRef<HTMLDivElement>(null);
	const handlers = useGestures(model);
	const { hitMatrix, anyHitMatrix, hours } = filters;
	const { poolSet } = filters.filter;

	// on mount as well as on every change: focus mode mounts a fresh copy of
	// the grid, which has to come up showing the current selection
	useLayoutEffect(() => {
		const el = root.current;
		if (!el) return;
		const paint = () => paintSelection(el, model.getCell());
		paint();
		return model.subscribe((change) => {
			if (change.kind !== "filters") paint();
		});
	}, [model]);

	function cellAriaLabel(day: Day, hour: number): string {
		const poolNames = POOL_TOKENS.filter((t) => hitMatrix.has(hitKey(day, hour, t.id))).map(
			(t) => t.name
		);
		const time = formatHour(hour).replace("a", "am").replace("p", "pm");
		return poolNames.length
			? `${day} ${time}: ${poolNames.join(", ")}`
			: `${day} ${time}: no sessions`;
	}

	return (
		<div ref={root} className="pt-3">
			<div className="grid grid-cols-[44px_repeat(7,1fr)] gap-x-[3px] plex-mono text-[10px] font-semibold">
				<span />
				{DAYS.map((day) => (
					<span key={day} data-day={day} className="grid-day text-center">
						{day.slice(0, 3).toUpperCase()}
					</span>
				))}
			</div>
			{hours.map((h) => (
				<div
					key={h}
					className="grid grid-cols-[44px_repeat(7,1fr)] gap-x-[3px]"
					style={{ marginTop: h === 12 || h === 17 ? 8 : 2 }}
				>
					<span
						data-hour={h}
						// every hour is labelled, and the odd ones hidden by CSS until
						// the selection lands on one
						data-odd={h % 2 === 1 ? "" : undefined}
						// stretched rather than self-centred so the selected
						// hour's wash fills the row, not just the text's line box.
						// leading-none keeps that line box under the cell height, so
						// the label can't push the row taller than an unlabelled one
						className="grid-hour flex items-center justify-end pr-1.5 plex-mono text-[10px] font-medium leading-none"
					>
						{formatHour(h)}
					</span>
					{DAYS.map((day) => (
						// a div, not a <button>: Safari mangles flex layout inside
						// buttons, collapsing the lane spans to zero height
						<div
							key={day}
							role="button"
							tabIndex={0}
							aria-label={cellAriaLabel(day, h)}
							aria-pressed={false}
							data-day={day}
							data-hour={h}
							onClick={() => handlers.click(day, h)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									handlers.choose(day, h);
								}
							}}
							onPointerDown={(e) => handlers.pointerDown(e, day, h, touchDrag)}
							onPointerMove={handlers.pointerMove}
							onPointerUp={handlers.pointerUp}
							onPointerCancel={handlers.pointerUp}
							className={`grid-cell relative flex cursor-pointer ${cellHeightClass}`}
							style={{
								// only claim the touch gesture where nothing behind the
								// grid scrolls; elsewhere the browser keeps it
								touchAction: touchDrag ? "none" : undefined,
							}}
						>
							{POOL_TOKENS.map((token) => {
								const key = hitKey(day, h, token.id);
								const scheduled = anyHitMatrix.has(key);
								const shown = hitMatrix.has(key) && (poolSet == null || poolSet.has(token.id));
								return (
									<span
										key={token.id}
										className="flex-1"
										style={{
											background: scheduled ? token.color : "transparent",
											// --dim is the selection's fade, set in globals.css.
											// Whatever either filter leaves out fades rather than
											// vanishes, so a cell the filters emptied still reads
											// as busy, unlike one where nothing is scheduled
											opacity: scheduled && !shown ? "calc(var(--dim) * 0.13)" : "var(--dim)",
										}}
									/>
								);
							})}
							{/* the ring's inner gutter, shown only on the selected cell:
							    a 1px white line just outside the cell's edge, between the
							    lanes and the amber outline */}
							<span aria-hidden className="grid-ring pointer-events-none absolute inset-[-1px]" />
						</div>
					))}
				</div>
			))}
		</div>
	);
});

export default GridBody;
