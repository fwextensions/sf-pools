"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { PoolSchedule } from "@/lib/schedule-schema";
import type { CityHoliday } from "@/lib/city-holidays";
import PoolAlerts from "@/components/PoolAlerts";
import { createGridModel } from "@/lib/grid/grid-model";
import { trackGridChange } from "@/lib/grid/grid-analytics";
import { addDays, createPoolCalendar } from "@/lib/pool-calendar";
import { pacificToday } from "@/lib/closures";
import { initialGridState, writeGridUrl } from "@/lib/grid/url";
import { trackFocusMode } from "@/lib/analytics";
import type { AlertsData } from "@/lib/site-data";
import GridBody from "./GridBody";
import DetailPanel from "./DetailPanel";
import { CategoryRows, ClearButton, PoolRows } from "./FilterPicker";
import { MobileChips, MobilePanel, type OpenPanel } from "./MobileBar";

type Props = {
	all: PoolSchedule[];
	/** schedules posted to take over on their start dates */
	upcoming?: PoolSchedule[];
	alerts?: AlertsData | null;
	/** the city's, which close every pool */
	holidays?: CityHoliday[];
};

export default function AvailabilityGrid({ all, upcoming = [], alerts, holidays = [] }: Props) {
	const searchParams = useSearchParams();
	const pathname = usePathname();
	// each weekday column is that day's next date, from today, so a closed
	// pool's sessions drop out on the days its closure covers this week, as
	// do the days outside its printed schedule; the notices above the grid
	// say why
	const [week] = useState(() => {
		const today = pacificToday();
		const calendar = createPoolCalendar(all, upcoming, holidays);
		const last = addDays(today, 6);
		return {
			today,
			sessions: calendar.sessions(today, last),
			closures: calendar.closures(today, last),
			gaps: calendar.scheduleGaps(today, last),
		};
	});
	// created during the first render from the url rather than in an effect,
	// so the grid never paints a frame unfiltered before the filters land
	const [model] = useState(() => createGridModel(week.sessions, initialGridState(searchParams)));
	const subscribeFilters = useCallback(
		(onChange: () => void) =>
			model.subscribe((change) => {
				if (change.kind === "filters") onChange();
			}),
		[model]
	);
	// only a filter change re-renders the page; the selection is painted and
	// read by the parts that show it
	const filters = useSyncExternalStore(subscribeFilters, model.getFilters, model.getFilters);
	const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
	// phones only: pins the whole thing to the viewport so the page itself
	// stops scrolling, which frees the grid to take touch drags
	const [focusMode, setFocusMode] = useState(false);
	const scrollBeforeFocusRef = useRef<number | null>(null);
	// the closure notices above the grid follow the pool filter, so picking
	// a pool in the phone panel shrank the page above the chip bar and
	// yanked the bar and the list out from under the finger. They catch up
	// when the panel closes instead.
	const [alertPools, setAlertPools] = useState(filters.pools);
	if (openPanel !== "pools" && alertPools !== filters.pools) {
		setAlertPools(filters.pools);
	}

	// keep the url shareable: every filter change, and the cell the reader
	// settles on, but not each cell a drag passes over
	useEffect(() => {
		const write = () => {
			const f = model.getFilters();
			writeGridUrl(pathname, { tags: f.filter.urlTags, pools: f.pools, cell: model.getCommittedCell() });
		};
		write();
		return model.subscribe((change) => {
			if (change.kind === "filters" || (change.kind === "cell" && change.changed)) write();
		});
	}, [model, pathname]);

	useEffect(() => model.subscribe(trackGridChange), [model]);

	// focus mode takes the scrolling layout out of the flow, which collapses
	// the document and clamps the page's scroll offset; stash it on the way in
	// so leaving lands back where the reader was instead of at the top
	useLayoutEffect(() => {
		if (focusMode) {
			document.body.style.overflow = "hidden";
			return;
		}
		document.body.style.overflow = "";
		if (scrollBeforeFocusRef.current != null) {
			window.scrollTo(0, scrollBeforeFocusRef.current);
			scrollBeforeFocusRef.current = null;
		}
	}, [focusMode]);

	// focus mode only exists in the phone layout; turning a phone on its side
	// switches to the sidebar layout, which would leave the page locked behind
	// an overlay that's no longer shown
	useEffect(() => {
		if (!focusMode) return;
		const wide = window.matchMedia("(min-width: 560px)");
		const leave = () => {
			if (wide.matches) setFocusMode(false);
		};
		leave();
		wide.addEventListener("change", leave);
		return () => wide.removeEventListener("change", leave);
	}, [focusMode]);

	const hasAnyFilter = filters.tags.length > 0 || filters.pools.length > 0;

	function toggleFocus() {
		if (!focusMode) {
			scrollBeforeFocusRef.current = window.scrollY;
			setOpenPanel(null);
		}
		trackFocusMode(!focusMode);
		setFocusMode((on) => !on);
	}

	const mobileChips = (
		<MobileChips
			model={model}
			filters={filters}
			openPanel={openPanel}
			onOpenPanel={setOpenPanel}
			focusMode={focusMode}
			onToggleFocus={toggleFocus}
		/>
	);
	const mobilePanelRows = {
		programs: (
			<CategoryRows
				model={model}
				filters={filters}
				compact={false}
			/>
		),
		pools: <PoolRows model={model} filters={filters} />,
	};

	return (
		<div className="font-sans py-6 text-ink">
			<PoolAlerts
				alerts={alerts}
				pools={all}
				selectedPools={alertPools}
				weekClosures={week.closures}
				scheduleGaps={week.gaps}
				from={week.today}
			/>

			{/* mobile: single column, sticky chip bar with accordion panels. Focus
			    mode pins those same pieces to the viewport instead, so the page
			    stops scrolling and the grid is free to take touch drags while the
			    results keep their own native scroll */}
			{focusMode ? (
				<div className="fixed inset-0 z-50 flex flex-col bg-tint min-[560px]:hidden">
					{/* the page container's 1rem gutter, and 430px inside it, so the
					    grid keeps exactly its width from the scrolling view */}
					<div className="mx-auto flex h-full w-full max-w-[calc(430px+2rem)] flex-col px-4 min-[560px]:max-w-none">
						<div className="flex-none border-b border-line py-2.5 short:py-1.5">
							{mobileChips}
						</div>
						<MobilePanel fill openPanel={openPanel}>{mobilePanelRows}</MobilePanel>
						{/* on a phone on its side the list sits beside the grid rather
						    than under it, and the cells shorten so the whole week fits
						    the height */}
						<div className={`flex flex-col short:flex-row short:gap-4 ${openPanel ? "flex-none" : "min-h-0 flex-1"}`}>
							<div className="flex-none short:min-w-0 short:flex-1">
								<GridBody model={model} filters={filters} cellHeightClass="h-[19px] short:h-[13px]" touchDrag />
							</div>
							{/* while filtering, the grid itself is the live feedback; the
							    list gives its space to the panel and comes back after */}
							{openPanel ? null : (
								<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 short:w-2/5 short:flex-none">
									<DetailPanel model={model} filters={filters} canDrag={true} ratchet={false} />
								</div>
							)}
						</div>
					</div>
				</div>
			) : (
				<div className="mx-auto max-w-[430px] min-[560px]:hidden">
					<div className="sticky top-[var(--site-sticky-h)] z-10 border-b border-line bg-tint py-2.5 short:py-1.5">
						{mobileChips}
					</div>
					<MobilePanel openPanel={openPanel}>{mobilePanelRows}</MobilePanel>
					<GridBody model={model} filters={filters} cellHeightClass="h-[15px]" touchDrag={false} />
					<DetailPanel
						model={model}
						filters={filters}
						canDrag={false}
						ratchet={true}
						holdFloor={openPanel !== null}
					/>
				</div>
			)}

			{/* desktop, and from 560px up (a phone on its side, an upright tablet):
			    fixed sidebar (the pool list doubles as the legend) + main column,
			    spanning the full container so the sidebar's edge lines up with
			    the tabs and the footer. Below 900px the sidebar is narrower */}
			<div className="hidden items-stretch min-[560px]:flex">
				<div className="w-[260px] flex-none bg-tint min-[900px]:w-[280px]">
					<div className="mx-4 mt-4 flex items-baseline justify-between border-t-2 border-ink pb-1.5 pt-2.5">
						<span className="font-mono text-label font-semibold tracking-[.08em] text-ink-2">
							PROGRAMS
						</span>
						{hasAnyFilter ? <ClearButton model={model} compact /> : null}
					</div>
					<CategoryRows
						model={model}
						filters={filters}
						compact
					/>
					<div className="mx-4 mt-4 border-t-2 border-ink pb-1.5 pt-2.5 font-mono text-label font-semibold tracking-[.08em] text-ink-2">
						POOLS
					</div>
					<PoolRows model={model} filters={filters} />
				</div>
				<div className="min-w-0 flex-1 pl-4">
					<GridBody model={model} filters={filters} cellHeightClass="h-[19px]" touchDrag={false} />
					<DetailPanel model={model} filters={filters} canDrag={false} ratchet={true} />
				</div>
			</div>
		</div>
	);
}
