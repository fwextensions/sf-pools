"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { PoolSchedule } from "@/lib/pdf-processor";
import PoolAlerts from "@/components/PoolAlerts";
import { createGridModel } from "@/lib/grid/grid-model";
import { trackGridChange } from "@/lib/grid/grid-analytics";
import { toSessions } from "@/lib/sessions";
import { initialGridState, writeGridUrl } from "@/lib/grid/url";
import { trackFocusMode } from "@/lib/analytics";
import type { AlertsData } from "../../../scripts/scrape-alerts";
import GridBody from "./GridBody";
import DetailPanel from "./DetailPanel";
import { CategoryRows, ClearButton, PoolRows } from "./FilterPicker";
import { MobileChips, MobilePanel, type OpenPanel } from "./MobileBar";

type Props = {
	all: PoolSchedule[];
	alerts?: AlertsData | null;
};

export default function AvailabilityGrid({ all, alerts }: Props) {
	const searchParams = useSearchParams();
	const pathname = usePathname();
	// created during the first render from the url rather than in an effect,
	// so the grid never paints a frame unfiltered before the filters land
	const [model] = useState(() => createGridModel(toSessions(all), initialGridState(searchParams)));
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
	const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({ activity: true });
	// phones only: pins the whole thing to the viewport so the page itself
	// stops scrolling, which frees the grid to take touch drags
	const [focusMode, setFocusMode] = useState(false);
	const scrollBeforeFocusRef = useRef<number | null>(null);

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

	const hasAnyFilter = filters.tags.length > 0 || filters.pools.length > 0;

	function toggleExpanded(id: string) {
		setExpandedCats((prev) => ({ ...prev, [id]: !prev[id] }));
	}

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
				expanded={expandedCats}
				onToggleExpanded={toggleExpanded}
			/>
		),
		pools: <PoolRows model={model} filters={filters} />,
	};

	return (
		<div className="font-sans py-6 text-ink">
			{alerts?.poolAlerts && alerts.poolAlerts.length > 0 && (
				<PoolAlerts alerts={alerts} pools={all} selectedPools={filters.pools} />
			)}

			{/* mobile: single column, sticky chip bar with accordion panels. Focus
			    mode pins those same pieces to the viewport instead, so the page
			    stops scrolling and the grid is free to take touch drags while the
			    results keep their own native scroll */}
			{focusMode ? (
				<div className="fixed inset-0 z-50 flex flex-col bg-tint min-[900px]:hidden">
					<div className="mx-auto flex h-full w-full max-w-[430px] flex-col px-3.5">
						<div className="flex-none border-b border-line px-3.5 py-2.5">
							{mobileChips}
						</div>
						<MobilePanel fill openPanel={openPanel}>{mobilePanelRows}</MobilePanel>
						<div className="flex-none"><GridBody model={model} filters={filters} cellHeightClass="h-[19px]" touchDrag /></div>
						{/* while filtering, the grid itself is the live feedback; the
						    list gives its space to the panel and comes back after */}
						{openPanel ? null : (
							<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
								<DetailPanel model={model} filters={filters} canDrag={true} ratchet={false} />
							</div>
						)}
					</div>
				</div>
			) : (
				<div className="mx-auto max-w-[430px] min-[900px]:hidden">
					<div className="sticky top-0 z-10 border-b border-line bg-tint px-3.5 py-2.5">
						{mobileChips}
					</div>
					<MobilePanel openPanel={openPanel}>{mobilePanelRows}</MobilePanel>
					<GridBody model={model} filters={filters} cellHeightClass="h-[15px]" touchDrag={false} />
					<DetailPanel model={model} filters={filters} canDrag={false} ratchet={true} />
				</div>
			)}

			{/* desktop: fixed sidebar (the pool list doubles as the legend) + main column */}
			<div className="mx-auto hidden max-w-[1020px] items-stretch min-[900px]:flex">
				<div className="w-[280px] flex-none border-r border-line bg-tint">
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
						expanded={expandedCats}
						onToggleExpanded={toggleExpanded}
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
