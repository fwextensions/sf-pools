"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { PoolSchedule, ProgramEntry } from "@/lib/pdf-processor";
import { validatePoolId } from "@/lib/pool-mapping";
import { POOL_TOKENS } from "@/lib/pool-tokens";
import { parseTimeToMinutes } from "@/lib/utils";
import PoolAlerts from "@/components/PoolAlerts";
import ProgramName from "@/components/ProgramName";
import { TAG_FACETS, tagFacet, tagLabel } from "@/lib/program-taxonomy";
import { describeProgram } from "@/lib/program-display";
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

type SelectedCell = { day: ProgramEntry["dayOfWeek"]; hour: number };

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

export default function AvailabilityGrid({ all, alerts }: Props) {
	// selection is a set of tag ids from the closed vocabulary in
	// program-taxonomy, so it survives the churn in the PDFs' own wording
	const [selectedTags, setSelectedTags] = useState<string[]>([]);
	const [selectedPools, setSelectedPools] = useState<string[]>([]);
	const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
	const [openPanel, setOpenPanel] = useState<"programs" | "pools" | null>(null);
	const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({ activity: true });

	const searchParams = useSearchParams();
	const pathname = usePathname();
	const router = useRouter();
	const didInit = useRef(false);

	// init once: URL params win over localStorage
	useEffect(() => {
		if (didInit.current) return;

		let saved: { tags?: string[]; poolIds?: string[]; selectedCell?: SelectedCell | null } = {};
		try {
			saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
		} catch {}

		const qTags = searchParams.get("tags");
		const qPools = searchParams.get("pools");

		const tags = qTags ? qTags.split(",").filter(Boolean) : (saved.tags ?? []);
		const pools = (qPools ? qPools.split(",") : (saved.poolIds ?? [])).filter((id) =>
			validatePoolId(id)
		);

		setSelectedTags(tags);
		setSelectedPools(pools);
		if (
			saved.selectedCell &&
			DAYS.includes(saved.selectedCell.day) &&
			typeof saved.selectedCell.hour === "number" &&
			saved.selectedCell.hour >= FIRST_HOUR &&
			saved.selectedCell.hour <= LAST_HOUR
		) {
			setSelectedCell(saved.selectedCell);
		}

		didInit.current = true;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// persist + sync url when filters change
	useEffect(() => {
		if (!didInit.current) return;

		try {
			window.localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ tags: selectedTags, poolIds: selectedPools, selectedCell })
			);
		} catch {}

		const params = new URLSearchParams();
		if (selectedTags.length) params.set("tags", selectedTags.join(","));
		if (selectedPools.length) params.set("pools", selectedPools.join(","));
		const qs = params.toString();
		router.replace(qs ? `${pathname}?${qs}` : pathname);
	}, [selectedTags, selectedPools, selectedCell, pathname, router]);

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

	// detail list for the selected cell, honoring both filters
	const detail = useMemo(() => {
		if (!selectedCell) return null;
		const rows: Array<{ code: string; color: string; title: string; badges: string[]; tags: string[]; startTime: string; endTime: string; startMin: number }> = [];
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

	const hasAnyFilter = selectedTags.length > 0 || selectedPools.length > 0;

	function toggleProgram(name: string) {
		setSelectedTags((prev) =>
			prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
		);
	}

	function toggleCategory(names: string[], allSelected: boolean) {
		setSelectedTags((prev) =>
			allSelected
				? prev.filter((n) => !names.includes(n))
				: Array.from(new Set([...prev, ...names]))
		);
	}

	function togglePool(id: string) {
		setSelectedPools((prev) =>
			prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
		);
	}

	function clearAll() {
		setSelectedTags([]);
		setSelectedPools([]);
	}

	function cellAriaLabel(day: string, hour: number): string {
		const poolNames = POOL_TOKENS.filter((t) => hitMatrix.has(`${day}|${hour}|${t.id}`)).map(
			(t) => t.name
		);
		const time = formatHour(hour).replace("a", "am").replace("p", "pm");
		return poolNames.length
			? `${day} ${time}: ${poolNames.join(", ")}`
			: `${day} ${time}: no sessions`;
	}

	// ----- shared picker sub-renders -----

	function renderCategoryRows(compact: boolean) {
		return categories.map((cat) => (
			<div key={cat.id} className="border-b border-[#edf1f3]">
				<div className={`flex items-center gap-2.5 ${compact ? "px-4 py-2" : "px-4 py-2.5"}`}>
					<button
						type="button"
						aria-label={`Toggle every ${cat.label} tag`}
						aria-pressed={cat.allSelected}
						onClick={() => toggleCategory(cat.names, cat.allSelected)}
						className="flex h-[18px] w-[18px] flex-none cursor-pointer items-center justify-center border-2 border-[#0e2733] plex-mono text-[12px] font-bold text-white"
						style={{
							background: cat.allSelected ? "#0e2733" : cat.someSelected ? "#5a8ba3" : "#fff",
						}}
					>
						{cat.allSelected ? "✓" : cat.someSelected ? "–" : ""}
					</button>
					<button
						type="button"
						onClick={() => toggleCategory(cat.names, cat.allSelected)}
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
						className="cursor-pointer px-2 py-1 plex-mono text-[13px] font-medium text-[#5a707c]"
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

	function renderClearButton() {
		return (
			<button
				type="button"
				onClick={clearAll}
				className="cursor-pointer border border-[#c4d2d9] bg-white px-2.5 py-1.5 plex-mono text-[12px] font-medium text-[#5a707c]"
			>
				CLEAR
			</button>
		);
	}

	// ----- grid -----

	function renderGrid(cellHeightClass: string) {
		return (
			<div className="pt-3">
				<div className="grid grid-cols-[44px_repeat(7,1fr)] gap-x-[3px] plex-mono text-[10px] font-semibold text-[#5a707c]">
					<span />
					{DAYS.map((day) => (
						<span
							key={day}
							className="text-center"
							style={{
								color: selectedCell?.day === day ? "#0e2733" : "#5a707c",
							}}
						>
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
						<span className="self-center plex-mono text-[10px] font-medium text-[#8a9aa4]">
							{h % 2 === 0 ? formatHour(h) : ""}
						</span>
						{DAYS.map((day) => {
							const isSelected = selectedCell?.day === day && selectedCell?.hour === h;
							return (
								// a div, not a <button>: Safari mangles flex layout inside
								// buttons, collapsing the lane spans to zero height
								<div
									key={day}
									role="button"
									tabIndex={0}
									aria-label={cellAriaLabel(day, h)}
									aria-pressed={isSelected}
									onClick={() => setSelectedCell({ day, hour: h })}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											setSelectedCell({ day, hour: h });
										}
									}}
									className={`grid-cell relative flex cursor-pointer bg-[#f5f8f9] ${cellHeightClass}`}
									style={{
										outline: isSelected ? "2px solid #0e2733" : "none",
										outlineOffset: -1.5,
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
													// unselected pools fade rather than vanish, so
													// "my pools" still read in context
													opacity: hit && unselected ? 0.13 : 1,
												}}
											/>
										);
									})}
								</div>
							);
						})}
					</div>
				))}
			</div>
		);
	}

	// ----- detail -----

	function renderDetail() {
		return (
			<div className="mt-4 border-t-2 border-[#0e2733] pt-2.5">
				<div className="flex items-baseline justify-between">
					<span className="text-[14px] font-semibold text-[#0e2733]">
						{selectedCell
							? `${selectedCell.day} · ${formatHour(selectedCell.hour)}–${formatHour(selectedCell.hour + 1)}`
							: "Tap a cell for details"}
					</span>
					{detail ? (
						<span className="plex-mono text-[11px] font-medium text-[#8a9aa4]">
							{detail.length} SESSION{detail.length === 1 ? "" : "S"}
						</span>
					) : null}
				</div>
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
						Nothing scheduled here — tap a colored cell in the grid.
					</div>
				) : null}
			</div>
		);
	}

	// ----- layout -----

	return (
		<div className="plex-sans py-6 text-[#0e2733]">
			{alerts?.poolAlerts && alerts.poolAlerts.length > 0 && (
				<PoolAlerts alerts={alerts} pools={all} selectedPools={selectedPools} />
			)}

			{/* mobile: single column, sticky chip bar with accordion panels */}
			<div className="mx-auto max-w-[430px] min-[900px]:hidden">
				<div className="sticky top-0 z-10 flex flex-wrap gap-1.5 border-b border-[#e2e8ec] bg-[#f7fafb] px-3.5 py-2.5">
					<button
						type="button"
						onClick={() => setOpenPanel(openPanel === "programs" ? null : "programs")}
						className="cursor-pointer border-[1.5px] border-[#0e2733] px-2.5 py-2 plex-mono text-[12px] font-semibold"
						style={{
							background: selectedTags.length ? "#0e2733" : "#fff",
							color: selectedTags.length ? "#fff" : "#0e2733",
						}}
					>
						PROGRAMS · {selectedTags.length || "ALL"} {openPanel === "programs" ? "▴" : "▾"}
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
						POOLS · {selectedPools.length || "ALL"} {openPanel === "pools" ? "▴" : "▾"}
					</button>
					{hasAnyFilter ? renderClearButton() : null}
				</div>
				{openPanel === "programs" ? (
					<div className="max-h-[340px] overflow-y-auto border-b-2 border-[#0e2733] bg-[#fbfdfe]">
						{renderCategoryRows(false)}
					</div>
				) : null}
				{openPanel === "pools" ? (
					<div className="border-b-2 border-[#0e2733] bg-[#fbfdfe]">{renderPoolRows()}</div>
				) : null}
				{renderGrid("h-[15px]")}
				{renderDetail()}
			</div>

			{/* desktop: fixed sidebar (the pool list doubles as the legend) + main column */}
			<div className="mx-auto hidden max-w-[1020px] items-stretch min-[900px]:flex">
				<div className="w-[280px] flex-none border-r border-[#e2e8ec] bg-[#fbfdfe]">
					<div className="flex items-baseline justify-between px-4 pb-1.5 pt-4">
						<span className="plex-mono text-[11px] font-semibold tracking-[.14em] text-[#8a9aa4]">
							PROGRAMS
						</span>
						{hasAnyFilter ? renderClearButton() : null}
					</div>
					{renderCategoryRows(true)}
					<div className="px-4 pb-1.5 pt-4 plex-mono text-[11px] font-semibold tracking-[.14em] text-[#8a9aa4]">
						POOLS
					</div>
					{renderPoolRows()}
				</div>
				<div className="min-w-0 flex-1 pl-4">
					{renderGrid("h-[19px]")}
					{renderDetail()}
				</div>
			</div>
		</div>
	);
}
