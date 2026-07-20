"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { PoolSchedule, ProgramEntry } from "@/lib/pdf-processor";
import { validatePoolId } from "@/lib/pool-mapping";
import { POOL_TOKENS } from "@/lib/pool-tokens";
import { parseTimeToMinutes } from "@/lib/utils";
import PoolAlerts from "@/components/PoolAlerts";
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

// program names churn, so the picker groups raw programName values into
// categories by regex, evaluated in order, first match wins
// (order matters: "Adult Swim Lessons" must land in Lessons)
const CATEGORIES: Array<{ id: string; label: string; test: (lower: string) => boolean }> = [
	{ id: "lessons", label: "Lessons", test: (n) => /lesson|learn|lts|school/.test(n) },
	{ id: "lap", label: "Lap Swim", test: (n) => /lap|adult swim/.test(n) },
	{
		id: "aerobics",
		label: "Aerobics + Exercise",
		test: (n) => /aerobic|exercise|fitness|aqua zumba|arthritis/.test(n),
	},
	{
		id: "rec",
		label: "Rec + Family",
		test: (n) => /recreation|rec swim|open|family|free|play|parent/.test(n),
	},
	{ id: "other", label: "Other", test: () => true },
];

function categoryOf(programName: string): string {
	const lower = programName.toLowerCase();
	for (const cat of CATEGORIES) {
		if (cat.test(lower)) return cat.id;
	}
	return "other";
}

function formatHour(h: number): string {
	return (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? "a" : "p");
}

function toMinutes(t: string): number | null {
	const m = parseTimeToMinutes(t);
	return m === Number.MAX_SAFE_INTEGER ? null : m;
}

const STORAGE_KEY = "sfpools-grid-v1";

type SelectedCell = { day: ProgramEntry["dayOfWeek"]; hour: number };

type Session = {
	poolId: string;
	programName: string;
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
	// selection state is a set of raw program names (not category ids) so it
	// survives name churn gracefully: unknown saved names simply match nothing
	const [selectedPrograms, setSelectedPrograms] = useState<string[]>([]);
	const [selectedPools, setSelectedPools] = useState<string[]>([]);
	const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
	const [openPanel, setOpenPanel] = useState<"programs" | "pools" | null>(null);
	const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});

	const searchParams = useSearchParams();
	const pathname = usePathname();
	const router = useRouter();
	const didInit = useRef(false);

	// init once: URL params win over localStorage
	useEffect(() => {
		if (didInit.current) return;

		let saved: { programNames?: string[]; poolIds?: string[]; selectedCell?: SelectedCell | null } = {};
		try {
			saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
		} catch {}

		const qPrograms = searchParams.get("programs");
		const qPools = searchParams.get("pools");

		const programs = qPrograms
			? qPrograms.split(",").filter(Boolean)
			: (saved.programNames ?? []);
		const pools = (qPools ? qPools.split(",") : (saved.poolIds ?? [])).filter((id) =>
			validatePoolId(id)
		);

		setSelectedPrograms(programs);
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
				JSON.stringify({ programNames: selectedPrograms, poolIds: selectedPools, selectedCell })
			);
		} catch {}

		const params = new URLSearchParams();
		if (selectedPrograms.length) params.set("programs", selectedPrograms.join(","));
		if (selectedPools.length) params.set("pools", selectedPools.join(","));
		const qs = params.toString();
		router.replace(qs ? `${pathname}?${qs}` : pathname);
	}, [selectedPrograms, selectedPools, selectedCell, pathname, router]);

	const sessions: Session[] = useMemo(() => {
		const out: Session[] = [];
		for (const pool of all) {
			for (const p of pool.programs || []) {
				out.push({
					poolId: pool.id,
					programName: p.programName,
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

	const allProgramNames = useMemo(() => {
		const set = new Set<string>();
		for (const s of sessions) set.add(s.programName);
		return Array.from(set).sort((a, b) => a.localeCompare(b));
	}, [sessions]);

	const programSet = useMemo(() => new Set(selectedPrograms), [selectedPrograms]);
	const poolSet = useMemo(
		() => (selectedPools.length ? new Set(selectedPools) : null),
		[selectedPools]
	);

	// hit matrix: day -> hour -> poolId, true when any filter-matching program
	// overlaps [h, h+1). pure derived render, memoized on [sessions, programSet]
	const hitMatrix = useMemo(() => {
		const hits = new Set<string>();
		const progFiltered = programSet.size
			? sessions.filter((s) => programSet.has(s.programName))
			: sessions;
		for (const s of progFiltered) {
			if (s.startMin == null || s.endMin == null) continue;
			for (const h of HOURS) {
				if (s.startMin < (h + 1) * 60 && s.endMin > h * 60) {
					hits.add(`${s.dayOfWeek}|${h}|${s.poolId}`);
				}
			}
		}
		return hits;
	}, [sessions, programSet]);

	// program categories for the picker
	const categories = useMemo(() => {
		return CATEGORIES.map((cat) => {
			const names = allProgramNames.filter((n) => categoryOf(n) === cat.id);
			if (!names.length) return null;
			const selCount = names.filter((n) => programSet.has(n)).length;
			return {
				...cat,
				names,
				allSelected: selCount === names.length,
				someSelected: selCount > 0,
			};
		}).filter((c): c is NonNullable<typeof c> => c != null);
	}, [allProgramNames, programSet]);

	// detail list for the selected cell, honoring both filters
	const detail = useMemo(() => {
		if (!selectedCell) return null;
		const rows: Array<{ code: string; color: string; programName: string; startTime: string; endTime: string; startMin: number }> = [];
		for (const token of POOL_TOKENS) {
			if (poolSet && !poolSet.has(token.id)) continue;
			for (const s of sessions) {
				if (s.poolId !== token.id) continue;
				if (s.dayOfWeek !== selectedCell.day) continue;
				if (programSet.size && !programSet.has(s.programName)) continue;
				if (s.startMin == null || s.endMin == null) continue;
				if (s.startMin >= (selectedCell.hour + 1) * 60 || s.endMin <= selectedCell.hour * 60) continue;
				rows.push({
					code: token.code,
					color: token.color,
					programName: s.programName,
					startTime: s.startTime,
					endTime: s.endTime,
					startMin: s.startMin,
				});
			}
		}
		rows.sort((a, b) => a.startMin - b.startMin);
		return rows;
	}, [selectedCell, sessions, programSet, poolSet]);

	const hasAnyFilter = selectedPrograms.length > 0 || selectedPools.length > 0;

	function toggleProgram(name: string) {
		setSelectedPrograms((prev) =>
			prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
		);
	}

	function toggleCategory(names: string[], allSelected: boolean) {
		setSelectedPrograms((prev) =>
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
		setSelectedPrograms([]);
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
						aria-label={`Toggle all ${cat.label} programs`}
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
									checked={programSet.has(name)}
									onChange={() => toggleProgram(name)}
									className="picker-checkbox"
								/>
								<span className="text-[14px] text-[#37474f]">{name}</span>
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
						<span className="flex-1 font-medium text-[#0e2733]">{d.programName}</span>
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
							background: selectedPrograms.length ? "#0e2733" : "#fff",
							color: selectedPrograms.length ? "#fff" : "#0e2733",
						}}
					>
						PROGRAMS · {selectedPrograms.length || "ALL"} {openPanel === "programs" ? "▴" : "▾"}
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
