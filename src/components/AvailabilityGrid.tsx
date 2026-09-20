"use client";

import {
	memo,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
	type PointerEvent,
	type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { PoolSchedule, ProgramEntry } from "@/lib/pdf-processor";
import { validatePoolId } from "@/lib/pool-mapping";
import { POOL_TOKENS } from "@/lib/pool-tokens";
import { parseTimeToMinutes } from "@/lib/utils";
import PoolAlerts from "@/components/PoolAlerts";
import ProgramName from "@/components/ProgramName";
import { TAG_FACETS, tagFacet, tagLabel } from "@/lib/program-taxonomy";
import { describeProgram } from "@/lib/program-display";
import {
	trackCategoryFilter,
	trackCellSelected,
	trackFiltersCleared,
	trackFocusMode,
	trackPoolFilter,
	trackProgramFilter,
} from "@/lib/analytics";
import type { AlertsData } from "../../scripts/scrape-alerts";

const DAYS: Array<ProgramEntry["dayOfWeek"]> = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
];

const FIRST_HOUR = 6;
const LAST_HOUR = 21;
const HOURS: number[] = [];
for (let h = FIRST_HOUR; h <= LAST_HOUR; h++) HOURS.push(h);

// ?cell=thu-14 — the three-letter day the grid already labels its columns
// with, and the hour the selection starts on
function formatCellParam(cell: SelectedCell): string {
	return `${cell.day.slice(0, 3).toLowerCase()}-${cell.hour}`;
}

function parseCellParam(raw: string | null): SelectedCell | null {
	if (!raw) return null;
	const [abbr, rest] = raw.toLowerCase().split("-");
	const day = DAYS.find((d) => d.slice(0, 3).toLowerCase() === abbr);
	const hour = Number(rest);
	if (!day || !Number.isInteger(hour) || hour < FIRST_HOUR || hour > LAST_HOUR) return null;
	return { day, hour };
}

// a session you cannot simply show up for says so on the card; drop-in is the
// unremarkable case and stays unlabelled
function accessNote(tags: string[]): string | null {
	for (const tag of ["access:closed", "access:rental", "access:school-group", "access:registration"]) {
		if (tags.includes(tag)) return tagLabel(tag);
	}
	return null;
}

function formatHour(h: number): string {
	return (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? "a" : "p");
}

function toMinutes(t: string): number | null {
	const m = parseTimeToMinutes(t);
	return m === Number.MAX_SAFE_INTEGER ? null : m;
}

// v2: selection moved from raw program names to tags, so a v1 payload would
// restore a set of strings that now match nothing
const STORAGE_KEY = "sfpools-grid-v2";

// Whether the grid has already rewritten the query string in this document.
//
// Until it has, the address bar holds what the reader arrived on, and it
// outranks the stored filters — that is what makes a shared link work. Once
// the grid has written the url itself, any url a later mount sees is either
// its own write, which localStorage already agrees with, or a stale one the
// router put back: writeUrl uses replaceState, which the App Router never
// hears about, so tabbing to another section and back restores whatever
// query string the route was last navigated to. That resurrected the filters
// a reader had just cleared. From that point on the stored filters are at
// least as fresh as the url, so they win.
//
// Module scope, not a ref: it is per document, and has to outlive the
// unmount that a section change puts the grid through.
let urlRewritten = false;

type SelectedCell = { day: ProgramEntry["dayOfWeek"]; hour: number };

function sameCell(a: SelectedCell | null, b: SelectedCell | null): boolean {
	return a === b || (a != null && b != null && a.day === b.day && a.hour === b.hour);
}

// The selected cell lives outside React state. A drag moves it on every cell
// the pointer crosses, and keeping it in state re-rendered the whole page each
// time: both copies of the grid (mobile and desktop stay mounted), ~2,500
// elements, all for a highlight. The grid paints it straight onto the DOM
// instead (see paintSelection) and never re-renders for it; only the detail
// list subscribes, since its contents really do depend on the cell
type SelectionStore = {
	get: () => SelectedCell | null;
	set: (cell: SelectedCell | null) => void;
	subscribe: (listener: () => void) => () => void;
};

function createSelectionStore(): SelectionStore {
	let current: SelectedCell | null = null;
	const listeners = new Set<() => void>();
	return {
		get: () => current,
		set(cell) {
			if (sameCell(cell, current)) return;
			current = cell;
			for (const listener of listeners) listener();
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

const noSelection = () => null;

// Marks the selection with attributes that globals.css styles: data-selected
// on the cell, data-band on everything in its row and column (the cells, the
// day heading and the hour label), data-has-selection on the grid. A move
// touches the dozen or so elements involved rather than re-rendering 2,500.
// React never renders these attributes, so a re-render of the grid leaves
// them alone; aria-pressed it renders once as false and never changes, so
// that too stays as set here
function paintSelection(root: HTMLElement, cell: SelectedCell | null) {
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

function cellAtPoint(x: number, y: number): SelectedCell | null {
	const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-day][data-hour]");
	if (!el) return null;
	const day = el.dataset.day as ProgramEntry["dayOfWeek"];
	const hour = Number(el.dataset.hour);
	if (!DAYS.includes(day) || Number.isNaN(hour)) return null;
	return { day, hour };
}

type Session = {
	poolId: string;
	title: string;
	badges: string[];
	tags: string[];
	dayOfWeek: ProgramEntry["dayOfWeek"];
	startTime: string;
	endTime: string;
	startMin: number | null;
	endMin: number | null;
};

type Props = {
	all: PoolSchedule[];
	alerts?: AlertsData | null;
};

// The detail list sits under the grid, so a shorter list pulls everything
// below it upward — pick a sparse cell while scrolled down and the page
// shifts under you. Hold the tallest list rendered so far as a floor: the
// space can grow but never shrink, so switching cells never moves the page.
// Changing the filters is the one time a smaller list is expected, so the
// floor resets there rather than stranding a gap for the rest of the session.
// Focus mode opts out: the page doesn't scroll there and the list has its
// own scroller, so a floor would only add one.
function HeightRatchet({
	enabled,
	resetKey,
	children,
}: {
	enabled: boolean;
	resetKey: string;
	children: ReactNode;
}) {
	const inner = useRef<HTMLDivElement>(null);
	const [floor, setFloor] = useState(0);

	// reset during render rather than in an effect, so the stale floor is
	// never committed for a frame before being cleared
	const key = `${resetKey}|${enabled}`;
	const [floorKey, setFloorKey] = useState(key);
	if (floorKey !== key) {
		setFloorKey(key);
		setFloor(0);
	}

	// every commit, not just when the content changes: fonts and wrapping can
	// settle a row later. offsetHeight is 0 while this copy of the grid is
	// display:none (the layout keeps both the mobile and desktop trees
	// mounted), which leaves the floor alone rather than crushing it
	useLayoutEffect(() => {
		if (!enabled) return;
		const h = inner.current?.offsetHeight ?? 0;
		setFloor((prev) => (h > prev ? h : prev));
	});

	return (
		<div style={{ minHeight: enabled && floor ? floor : undefined }}>
			<div ref={inner}>{children}</div>
		</div>
	);
}

type GridHandlers = {
	pointerDown: (
		e: PointerEvent<HTMLDivElement>,
		day: ProgramEntry["dayOfWeek"],
		hour: number,
		touchDrag: boolean
	) => void;
	pointerMove: (e: PointerEvent<HTMLDivElement>) => void;
	pointerUp: (e: PointerEvent<HTMLDivElement>) => void;
	click: (day: ProgramEntry["dayOfWeek"], hour: number) => void;
	choose: (day: ProgramEntry["dayOfWeek"], hour: number) => void;
};

// Memoized, and none of its props change with the selection, so a click or a
// drag never re-renders it: the selection is painted onto its DOM by
// paintSelection. It re-renders only when the filters change what it shows
const GridBody = memo(function GridBody({
	store,
	hitMatrix,
	poolSet,
	cellHeightClass,
	touchDrag,
	handlers,
}: {
	store: SelectionStore;
	hitMatrix: Set<string>;
	poolSet: Set<string> | null;
	cellHeightClass: string;
	touchDrag: boolean;
	handlers: GridHandlers;
}) {
	const root = useRef<HTMLDivElement>(null);

	// on mount as well as on every change: focus mode mounts a fresh copy of
	// the grid, which has to come up showing the current selection
	useLayoutEffect(() => {
		const el = root.current;
		if (!el) return;
		const paint = () => paintSelection(el, store.get());
		paint();
		return store.subscribe(paint);
	}, [store]);

	function cellAriaLabel(day: string, hour: number): string {
		const poolNames = POOL_TOKENS.filter((t) => hitMatrix.has(`${day}|${hour}|${t.id}`)).map(
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
			{HOURS.map((h) => (
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
								const hit = hitMatrix.has(`${day}|${h}|${token.id}`);
								const unselected = poolSet != null && !poolSet.has(token.id);
								return (
									<span
										key={token.id}
										className="flex-1"
										style={{
											background: hit ? token.color : "transparent",
											// --dim is the selection's fade, set in globals.css.
											// Unselected pools fade rather than vanish, so "my
											// pools" still read in context
											opacity: hit && unselected ? "calc(var(--dim) * 0.13)" : "var(--dim)",
										}}
									/>
								);
							})}
							{/* the ring's inner gutter, shown only on the selected cell.
							    As an inset shadow on the cell it painted under the lane
							    spans and only showed through where a cell was empty, so
							    it has to be its own layer above them */}
							<span aria-hidden className="grid-ring pointer-events-none absolute inset-[1px]" />
						</div>
					))}
				</div>
			))}
		</div>
	);
});

type DetailRow = {
	code: string;
	color: string;
	title: string;
	badges: string[];
	tags: string[];
	startTime: string;
	endTime: string;
	startMin: number;
};

// the one part of the page that does depend on the selected cell, so the one
// part that re-renders as a drag moves it
const DetailPanel = memo(function DetailPanel({
	store,
	sessions,
	matchesTags,
	poolSet,
	filterKey,
	canDrag,
	ratchet,
}: {
	store: SelectionStore;
	sessions: Session[];
	matchesTags: (s: Session) => boolean;
	poolSet: Set<string> | null;
	filterKey: string;
	canDrag: boolean;
	ratchet: boolean;
}) {
	const selectedCell = useSyncExternalStore(store.subscribe, store.get, noSelection);

	// detail list for the selected cell, honoring both filters
	const detail = useMemo(() => {
		if (!selectedCell) return null;
		const rows: DetailRow[] = [];
		for (const token of POOL_TOKENS) {
			if (poolSet && !poolSet.has(token.id)) continue;
			for (const s of sessions) {
				if (s.poolId !== token.id) continue;
				if (s.dayOfWeek !== selectedCell.day) continue;
				if (!matchesTags(s)) continue;
				if (s.startMin == null || s.endMin == null) continue;
				if (s.startMin >= (selectedCell.hour + 1) * 60 || s.endMin <= selectedCell.hour * 60) continue;
				rows.push({
					code: token.code,
					color: token.color,
					title: s.title,
					badges: s.badges,
					tags: s.tags,
					startTime: s.startTime,
					endTime: s.endTime,
					startMin: s.startMin,
				});
			}
		}
		rows.sort((a, b) => a.startMin - b.startMin);
		return rows;
	}, [selectedCell, sessions, matchesTags, poolSet]);

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
			{detail && detail.length === 0 ? (
				<div className="py-3.5 text-[14px] text-[#8a9aa4]">
					Nothing scheduled here — {canDrag ? "drag across" : "tap a colored cell in"} the grid.
				</div>
			) : null}
			</HeightRatchet>
		</div>
	);
});

export default function AvailabilityGrid({ all, alerts }: Props) {
	// selection is a set of tag ids from the closed vocabulary in
	// program-taxonomy, so it survives the churn in the PDFs' own wording
	const [selectedTags, setSelectedTags] = useState<string[]>([]);
	const [selectedPools, setSelectedPools] = useState<string[]>([]);
	const [store] = useState(createSelectionStore);
	// what the URL says. It trails the store: a drag repaints the grid on every
	// cell it crosses, but only the cell the gesture settles on goes in the url
	const committedCellRef = useRef<SelectedCell | null>(null);
	// the current filters, kept where writeUrl can read them when a gesture
	// ends, not only when the filters themselves change
	const filtersRef = useRef<{ tags: string[]; pools: string[] }>({ tags: [], pools: [] });
	const [openPanel, setOpenPanel] = useState<"programs" | "pools" | null>(null);
	const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({ activity: true });
	// phones only: pins the whole thing to the viewport so the page itself
	// stops scrolling, which frees the grid to take touch drags
	const [focusMode, setFocusMode] = useState(false);

	const searchParams = useSearchParams();
	const pathname = usePathname();
	const didInit = useRef(false);
	// the state half of didInit. The effects below would otherwise run on
	// the same commit as the init effect, before its state lands, and write
	// the empty initial state out over the url the reader arrived on
	const [initialized, setInitialized] = useState(false);
	const isDraggingRef = useRef(false);
	const suppressClickRef = useRef(false);
	const scrollBeforeFocusRef = useRef<number | null>(null);

	// init once: URL params win over localStorage
	useEffect(() => {
		if (didInit.current) return;

		let saved: { tags?: string[]; poolIds?: string[] } = {};
		try {
			saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
		} catch {}

		const qTags = urlRewritten ? null : searchParams.get("tags");
		const qPools = urlRewritten ? null : searchParams.get("pools");

		const tags = qTags ? qTags.split(",").filter(Boolean) : (saved.tags ?? []);
		const pools = (qPools ? qPools.split(",") : (saved.poolIds ?? [])).filter((id) =>
			validatePoolId(id)
		);

		setSelectedTags(tags);
		setSelectedPools(pools);
		// persist straight away rather than leaving it to the effect below.
		// Under StrictMode the init effect runs, is torn down, and runs again
		// before that state has landed, and the second pass reads storage
		// instead of the url — so the link's filters have to be in storage by
		// then or the remount drops them
		if (qTags || qPools) {
			try {
				window.localStorage.setItem(
					STORAGE_KEY,
					JSON.stringify({ tags, poolIds: pools })
				);
			} catch {}
		}
		// only a cell someone linked to. It is deliberately not restored from
		// localStorage: filters are a standing preference, but a highlighted
		// cell on arrival reads as a claim the page is making rather than one
		// the reader made
		const cell = parseCellParam(searchParams.get("cell"));
		store.set(cell);
		committedCellRef.current = cell;

		didInit.current = true;
		setInitialized(true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// the filters are the standing preference worth carrying between visits
	useEffect(() => {
		if (!initialized) return;

		try {
			window.localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ tags: selectedTags, poolIds: selectedPools })
			);
		} catch {}
	}, [initialized, selectedTags, selectedPools]);

	// keep the url shareable
	const writeUrl = useCallback(() => {
		const { tags, pools } = filtersRef.current;
		const params = new URLSearchParams();
		if (tags.length) params.set("tags", tags.join(","));
		if (pools.length) params.set("pools", pools.join(","));
		if (committedCellRef.current) params.set("cell", formatCellParam(committedCellRef.current));
		const qs = params.toString();
		urlRewritten = true;
		// the native history call, not router.replace: the router treats a new
		// query as a navigation, fetching the page from the server and
		// re-rendering it on every click, and scrolling to the top besides.
		// Next keeps useSearchParams in step with replaceState on its own
		window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
	}, [pathname]);

	useEffect(() => {
		filtersRef.current = { tags: selectedTags, pools: selectedPools };
		if (!initialized) return;
		writeUrl();
	}, [initialized, selectedTags, selectedPools, writeUrl]);

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

	const sessions: Session[] = useMemo(() => {
		const out: Session[] = [];
		for (const pool of all) {
			for (const p of pool.programs || []) {
				const display = describeProgram(p);
				out.push({
					poolId: pool.id,
					title: display.title,
					badges: display.badges,
					tags: p.tags ?? [],
					dayOfWeek: p.dayOfWeek,
					startTime: p.startTime,
					endTime: p.endTime,
					startMin: toMinutes(p.startTime),
					endMin: toMinutes(p.endTime),
				});
			}
		}
		return out;
	}, [all]);

	// how many sessions carry each tag, so the picker can show real counts and
	// hide tags no current schedule uses
	const tagCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const s of sessions) for (const t of s.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
		return counts;
	}, [sessions]);

	// one set of wanted tags per facet the viewer picked in
	const facetFilters = useMemo(() => {
		const byFacet = new Map<string, Set<string>>();
		for (const tag of selectedTags) {
			const facet = tagFacet(tag);
			if (!byFacet.has(facet)) byFacet.set(facet, new Set());
			byFacet.get(facet)!.add(tag);
		}
		return [...byFacet.values()];
	}, [selectedTags]);

	// a session matches when it carries one of the selected tags in every facet
	// that has a selection: OR within a facet, AND across facets. Picking "Lap
	// swim" and "Drop in" means lap swim you can walk into, not either one.
	const matchesTags = useCallback(
		(s: Session) => facetFilters.every((wanted) => s.tags.some((t) => wanted.has(t))),
		[facetFilters]
	);

	const tagSet = useMemo(() => new Set(selectedTags), [selectedTags]);
	const poolSet = useMemo(
		() => (selectedPools.length ? new Set(selectedPools) : null),
		[selectedPools]
	);

	// hit matrix: day -> hour -> poolId, true when any filter-matching program
	// overlaps [h, h+1). pure derived render, memoized on [sessions, programSet]
	const hitMatrix = useMemo(() => {
		const hits = new Set<string>();
		const progFiltered = sessions.filter(matchesTags);
		for (const s of progFiltered) {
			if (s.startMin == null || s.endMin == null) continue;
			for (const h of HOURS) {
				if (s.startMin < (h + 1) * 60 && s.endMin > h * 60) {
					hits.add(`${s.dayOfWeek}|${h}|${s.poolId}`);
				}
			}
		}
		return hits;
	}, [sessions, matchesTags]);

	// one picker group per facet, listing only the tags this season's schedules
	// actually use, most common first
	const categories = useMemo(() => {
		return TAG_FACETS.map((facet) => {
			const names = [...tagCounts.keys()]
				.filter((t) => tagFacet(t) === facet.id)
				.sort((a, b) => (tagCounts.get(b) ?? 0) - (tagCounts.get(a) ?? 0) || a.localeCompare(b));
			if (!names.length) return null;
			const selCount = names.filter((n) => tagSet.has(n)).length;
			return {
				id: facet.id,
				label: facet.label,
				names,
				allSelected: selCount === names.length,
				someSelected: selCount > 0,
			};
		}).filter((c): c is NonNullable<typeof c> => c != null);
	}, [tagCounts, tagSet]);

	const hasAnyFilter = selectedTags.length > 0 || selectedPools.length > 0;
	// what the detail list's height floor resets on
	const filterKey = `${selectedTags.join(",")}|${selectedPools.join(",")}`;

	// the toggles report the selection they are about to produce rather than
	// the one on screen, so an event always describes the state the reader
	// ends up looking at
	function toggleProgram(name: string) {
		const next = selectedTags.includes(name)
			? selectedTags.filter((n) => n !== name)
			: [...selectedTags, name];
		trackProgramFilter(name, !selectedTags.includes(name), next.length);
		setSelectedTags(next);
	}

	function toggleCategory(id: string, names: string[], allSelected: boolean) {
		const next = allSelected
			? selectedTags.filter((n) => !names.includes(n))
			: Array.from(new Set([...selectedTags, ...names]));
		trackCategoryFilter(id, !allSelected, next.length);
		setSelectedTags(next);
	}

	function togglePool(id: string) {
		const next = selectedPools.includes(id)
			? selectedPools.filter((p) => p !== id)
			: [...selectedPools, id];
		trackPoolFilter(id, !selectedPools.includes(id), next.length);
		setSelectedPools(next);
	}

	function clearAll() {
		trackFiltersCleared(selectedTags.length, selectedPools.length);
		setSelectedTags([]);
		setSelectedPools([]);
	}

	// live-preview drag: pressing a cell and moving the pointer across the
	// grid updates the selection to whatever cell is under the pointer, so the
	// detail panel updates as you drag rather than only on release.
	//
	// a mouse can always drag — it has no scroll gesture to collide with. A
	// finger only gets to drag where the page underneath doesn't scroll at
	// all, which is what focus mode is for; anywhere else touch is left
	// entirely alone so scrolling stays native, and a tap still selects.
	//
	// the url trails the grid by a gesture: store.set paints, commitCell is
	// what the reader settled on and the only thing the address bar hears about
	const handlers = useMemo<GridHandlers>(() => {
		function commitCell(cell: SelectedCell | null) {
			if (sameCell(committedCellRef.current, cell)) return;
			committedCellRef.current = cell;
			writeUrl();
		}

		function pointerUp(e: PointerEvent<HTMLDivElement>) {
			if (isDraggingRef.current) {
				// a drag just decided the selection; ignore the click the browser
				// synthesizes right after, or it'd snap the selection back to
				// wherever the gesture started
				suppressClickRef.current = true;
				// the gesture is over, so wherever it ended is the real selection
				const ended = store.get();
				if (ended) trackCellSelected(ended.day, ended.hour, "drag");
				commitCell(ended);
			}
			isDraggingRef.current = false;
			if (e.currentTarget.hasPointerCapture(e.pointerId)) {
				e.currentTarget.releasePointerCapture(e.pointerId);
			}
		}

		function choose(day: ProgramEntry["dayOfWeek"], hour: number) {
			trackCellSelected(day, hour, "click");
			store.set({ day, hour });
			commitCell({ day, hour });
		}

		return {
			pointerDown(e, day, hour, touchDrag) {
				if (e.pointerType !== "mouse" && !touchDrag) return;
				isDraggingRef.current = true;
				e.currentTarget.setPointerCapture(e.pointerId);
				store.set({ day, hour });
			},
			pointerMove(e) {
				if (!isDraggingRef.current) return;
				e.preventDefault();
				const cell = cellAtPoint(e.clientX, e.clientY);
				if (cell) store.set(cell);
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
	}, [store, writeUrl]);

	// ----- shared picker sub-renders -----

	function renderCategoryRows(compact: boolean) {
		return categories.map((cat) => (
			<div key={cat.id} className="border-b border-[#edf1f3]">
				<div className={`flex items-center gap-2.5 ${compact ? "px-4 py-2" : "px-4 py-2.5"}`}>
					<button
						type="button"
						aria-label={`Toggle every ${cat.label} tag`}
						aria-pressed={cat.allSelected}
						onClick={() => toggleCategory(cat.id, cat.names, cat.allSelected)}
						className="flex h-[18px] w-[18px] flex-none cursor-pointer items-center justify-center border-2 border-[#0e2733] plex-mono text-[12px] font-bold text-white"
						style={{
							background: cat.allSelected ? "#0e2733" : cat.someSelected ? "#5a8ba3" : "#fff",
						}}
					>
						{cat.allSelected ? "✓" : cat.someSelected ? "–" : ""}
					</button>
					<button
						type="button"
						onClick={() => toggleCategory(cat.id, cat.names, cat.allSelected)}
						className="flex-1 cursor-pointer text-left text-[14px] font-semibold text-[#0e2733]"
					>
						{cat.label}{" "}
						<span className="plex-mono text-[12px] font-medium text-[#8a9aa4]">
							({cat.names.length})
						</span>
					</button>
					<button
						type="button"
						aria-label={`${expandedCats[cat.id] ? "Collapse" : "Expand"} ${cat.label}`}
						onClick={() =>
							setExpandedCats((prev) => ({ ...prev, [cat.id]: !prev[cat.id] }))
						}
						// the glyph is small inside its em box, so it needs roughly
						// double the label's size to carry the same weight as the
						// checkbox and text it sits with. leading-none keeps that off
						// the row height
						className="cursor-pointer px-2 py-1 plex-mono text-[26px] font-medium leading-none text-[#5a707c]"
					>
						{expandedCats[cat.id] ? "▴" : "▾"}
					</button>
				</div>
				{expandedCats[cat.id] ? (
					<div className="flex flex-col gap-0.5 pb-2.5 pl-11 pr-4">
						{cat.names.map((name) => (
							<label
								key={name}
								className="flex cursor-pointer items-center gap-2 py-1.5"
							>
								<input
									type="checkbox"
									checked={tagSet.has(name)}
									onChange={() => toggleProgram(name)}
									className="picker-checkbox"
								/>
								<span className="flex-1 text-[14px] text-[#37474f]">{tagLabel(name)}</span>
								<span className="plex-mono text-[12px] font-medium text-[#8a9aa4]">
									{tagCounts.get(name)}
								</span>
							</label>
						))}
					</div>
				) : null}
			</div>
		));
	}

	function renderPoolRows() {
		return POOL_TOKENS.map((token) => {
			const active = !poolSet || poolSet.has(token.id);
			return (
				<label
					key={token.id}
					className="flex cursor-pointer items-center gap-2.5 border-b border-[#edf1f3] px-4 py-2"
					style={{ opacity: active ? 1 : 0.45 }}
				>
					<input
						type="checkbox"
						checked={selectedPools.includes(token.id)}
						onChange={() => togglePool(token.id)}
						className="sr-only"
					/>
					<span
						aria-hidden
						className="flex h-[18px] w-[18px] flex-none items-center justify-center plex-mono text-[12px] font-bold text-white"
						style={{ background: token.color }}
					>
						{selectedPools.includes(token.id) ? "✓" : ""}
					</span>
					<span className="w-[34px] plex-mono text-[12px] font-semibold text-[#5a707c]">
						{token.code}
					</span>
					<span className="flex-1 text-[14px] font-medium text-[#0e2733]">{token.name}</span>
				</label>
			);
		});
	}

	// compact is for the sidebar, where it sits beside the PROGRAMS label and
	// must fit inside that line's height, or the whole sidebar drops when the
	// first filter is picked and the button appears
	function renderClearButton(compact = false) {
		return (
			<button
				type="button"
				onClick={clearAll}
				className={`cursor-pointer border border-[#c4d2d9] bg-white plex-mono font-medium text-[#5a707c] ${
					compact ? "px-2 py-px text-[11px] leading-none" : "px-2.5 py-1.5 text-[12px]"
				}`}
			>
				CLEAR
			</button>
		);
	}

	// the word CLEAR wrapped the chip row to a second line once two pools were
	// picked (the counts widen both chips), which shoves the grid down in focus
	// mode, so on mobile it's a reset glyph sized like the focus toggle
	function renderClearIconButton() {
		return (
			<button
				type="button"
				onClick={clearAll}
				aria-label="Clear filters"
				title="Clear filters"
				className="w-9 flex-none cursor-pointer border-[1.5px] border-[#0e2733] bg-white px-2.5 py-2 text-center plex-mono text-[12px] font-semibold text-[#0e2733]"
			>
				<svg
					aria-hidden
					viewBox="0 0 14 14"
					className="inline-block h-[14px] w-[14px] align-middle"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M1.6 7a5.4 5.4 0 1 0 1.6-3.8" />
					<path d="M1.4 1.6v3.2h3.2" />
				</svg>
			</button>
		);
	}

	// ----- mobile chrome (shared by the scrolling page and focus mode) -----

	function renderMobileChips() {
		return (
			<div className="flex items-center justify-between gap-1.5">
				<div className="flex min-w-0 flex-wrap items-center gap-1.5">
					<button
						type="button"
						onClick={() => setOpenPanel(openPanel === "programs" ? null : "programs")}
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
						onClick={() => setOpenPanel(openPanel === "pools" ? null : "pools")}
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
					{hasAnyFilter ? renderClearIconButton() : null}
					{/* the grid can only take a touch drag when the page behind it
					    holds still, so this is the way into that mode */}
					<button
						type="button"
						aria-label={focusMode ? "Leave full screen" : "Fill the screen to drag across the grid"}
						aria-pressed={focusMode}
						onClick={() => {
							if (!focusMode) {
								scrollBeforeFocusRef.current = window.scrollY;
								setOpenPanel(null);
							}
							trackFocusMode(!focusMode);
							setFocusMode((on) => !on);
						}}
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

	// on the page a panel is just tall and the rest scrolls past it. In focus
	// mode nothing scrolls, so it takes the leftover space instead of a fixed
	// height — otherwise it pushes the grid off a short screen with no way to
	// scroll back to it
	//
	// overscroll-contain belongs to focus mode alone, where the point is that
	// nothing behind the panel moves. On the page it strands the reader: the
	// list stops at its own end and the page underneath refuses to take over,
	// so scrolling past the filters means knowing to start the gesture
	// somewhere else
	function renderMobilePanels(fill = false) {
		const className = `overflow-y-auto border-b-2 border-[#0e2733] bg-[#fbfdfe] ${
			fill ? "overscroll-contain min-h-0 flex-1" : "max-h-[340px] flex-none"
		}`;
		if (openPanel === "programs") {
			return <div className={className}>{renderCategoryRows(false)}</div>;
		}
		if (openPanel === "pools") {
			return <div className={className}>{renderPoolRows()}</div>;
		}
		return null;
	}

	// ----- layout -----

	return (
		<div className="plex-sans py-6 text-[#0e2733]">
			{alerts?.poolAlerts && alerts.poolAlerts.length > 0 && (
				<PoolAlerts alerts={alerts} pools={all} selectedPools={selectedPools} />
			)}

			{/* mobile: single column, sticky chip bar with accordion panels. Focus
			    mode pins those same pieces to the viewport instead, so the page
			    stops scrolling and the grid is free to take touch drags while the
			    results keep their own native scroll */}
			{focusMode ? (
				<div className="fixed inset-0 z-50 flex flex-col bg-[#f7fafb] min-[900px]:hidden">
					<div className="mx-auto flex h-full w-full max-w-[430px] flex-col px-3.5">
						<div className="flex-none border-b border-[#e2e8ec] px-3.5 py-2.5">
							{renderMobileChips()}
						</div>
						{renderMobilePanels(true)}
						<div className="flex-none"><GridBody store={store} hitMatrix={hitMatrix} poolSet={poolSet} cellHeightClass="h-[19px]" touchDrag handlers={handlers} /></div>
						{/* while filtering, the grid itself is the live feedback; the
						    list gives its space to the panel and comes back after */}
						{openPanel ? null : (
							<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
								<DetailPanel store={store} sessions={sessions} matchesTags={matchesTags} poolSet={poolSet} filterKey={filterKey} canDrag={true} ratchet={false} />
							</div>
						)}
					</div>
				</div>
			) : (
				<div className="mx-auto max-w-[430px] min-[900px]:hidden">
					<div className="sticky top-0 z-10 border-b border-[#e2e8ec] bg-[#f7fafb] px-3.5 py-2.5">
						{renderMobileChips()}
					</div>
					{renderMobilePanels()}
					<GridBody store={store} hitMatrix={hitMatrix} poolSet={poolSet} cellHeightClass="h-[15px]" touchDrag={false} handlers={handlers} />
					<DetailPanel store={store} sessions={sessions} matchesTags={matchesTags} poolSet={poolSet} filterKey={filterKey} canDrag={false} ratchet={true} />
				</div>
			)}

			{/* desktop: fixed sidebar (the pool list doubles as the legend) + main column */}
			<div className="mx-auto hidden max-w-[1020px] items-stretch min-[900px]:flex">
				<div className="w-[280px] flex-none border-r border-[#e2e8ec] bg-[#fbfdfe]">
					<div className="flex items-baseline justify-between px-4 pb-1.5 pt-4">
						<span className="plex-mono text-[11px] font-semibold tracking-[.14em] text-[#8a9aa4]">
							PROGRAMS
						</span>
						{hasAnyFilter ? renderClearButton(true) : null}
					</div>
					{renderCategoryRows(true)}
					<div className="px-4 pb-1.5 pt-4 plex-mono text-[11px] font-semibold tracking-[.14em] text-[#8a9aa4]">
						POOLS
					</div>
					{renderPoolRows()}
				</div>
				<div className="min-w-0 flex-1 pl-4">
					<GridBody store={store} hitMatrix={hitMatrix} poolSet={poolSet} cellHeightClass="h-[19px]" touchDrag={false} handlers={handlers} />
					<DetailPanel store={store} sessions={sessions} matchesTags={matchesTags} poolSet={poolSet} filterKey={filterKey} canDrag={false} ratchet={true} />
				</div>
			</div>
		</div>
	);
}
