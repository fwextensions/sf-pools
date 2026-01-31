"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { PoolSchedule, ProgramEntry } from "@/lib/pdf-processor";
import { toTitleCase } from "@/lib/program-taxonomy";
import { validatePoolId } from "@/lib/pool-mapping";
import PoolAlerts from "@/components/PoolAlerts";
import type { AlertsData } from "../../scripts/scrape-alerts";
import { parseTimeToMinutes } from "@/lib/utils";

function getProgramTypeClass(programName: string): string {
	const lower = programName.toLowerCase();
	if (lower.includes("lap") || lower.includes("adult swim")) return "program-lap";
	if (lower.includes("lesson") || lower.includes("learn")) return "program-lessons";
	if (lower.includes("aerobic") || lower.includes("exercise") || lower.includes("fitness")) return "program-aerobics";
	if (lower.includes("recreation") || lower.includes("open") || lower.includes("family") || lower.includes("free")) return "program-recreation";
	return "program-default";
}

type Props = {
	all: PoolSchedule[];
	alerts?: AlertsData | null;
};

const DAYS: Array<ProgramEntry["dayOfWeek"]> = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
];

export default function HomeFilters({ all, alerts }: Props) {
	const [selectedPrograms, setSelectedPrograms] = useState<string[]>([]);
	const [selectedPools, setSelectedPools] = useState<string[]>([]);
	const [selectedDays, setSelectedDays] = useState<Array<ProgramEntry["dayOfWeek"]>>([...DAYS]);
	const [timePreset, setTimePreset] = useState<"all" | "morning" | "afternoon" | "evening" | "custom">("all");
	const [timeStart, setTimeStart] = useState<string>("6:00a");
	const [timeEnd, setTimeEnd] = useState<string>("10:00p");

	// url state sync
	const searchParams = useSearchParams();
	const pathname = usePathname();
	const router = useRouter();
	const didInit = useRef(false);

	const programOptions = useMemo(() => {
		const set = new Set<string>();
		for (const pool of all) {
			for (const p of pool.programs || []) set.add(p.programName);
		}
		return Array.from(set).sort((a, b) => a.localeCompare(b));
	}, [all]);

	const poolOptions = useMemo(() => {
		return all
			.map(schedule => ({
				id: schedule.id,
				label: schedule.shortName || schedule.nameTitle || toTitleCase(schedule.name)
			}))
			.filter((v, i, arr) => arr.findIndex(x => x.id === v.id) === i)
			.sort((a, b) => a.label.localeCompare(b.label));
	}, [all]);

	// init from query params once
	useEffect(() => {
		if (didInit.current) return;
		const qPrograms = searchParams.get("programs");
		const qPools = searchParams.get("pools");
		const qDays = searchParams.get("days");
		const qPreset = searchParams.get("preset");
		const qStart = searchParams.get("start");
		const qEnd = searchParams.get("end");

		if (qPrograms) setSelectedPrograms(qPrograms.split(",").filter(Boolean));
		if (qPools) {
			const poolIds = qPools.split(",").filter(id => validatePoolId(id));
			setSelectedPools(poolIds);
		}
		if (qDays) {
			const days = qDays.split(",").filter((d): d is ProgramEntry["dayOfWeek"] => (DAYS as string[]).includes(d));
			if (days.length > 0) setSelectedDays(days);
		}
		if (qPreset === "morning" || qPreset === "afternoon" || qPreset === "evening" || qPreset === "custom" || qPreset === "all") {
			setTimePreset(qPreset);
		}
		if (qStart) setTimeStart(qStart);
		if (qEnd) setTimeEnd(qEnd);

		didInit.current = true;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// push state to url when filters change
	useEffect(() => {
		if (!didInit.current) return;
		const params = new URLSearchParams();
		if (selectedPrograms.length) params.set("programs", selectedPrograms.join(","));
		if (selectedPools.length) params.set("pools", selectedPools.join(","));
		if (selectedDays.length && selectedDays.length < DAYS.length) params.set("days", selectedDays.join(","));
		if (timePreset && timePreset !== "all") params.set("preset", timePreset);
		if (timePreset === "custom") {
			params.set("start", timeStart);
			params.set("end", timeEnd);
		}
		const qs = params.toString();
		router.replace(qs ? `${pathname}?${qs}` : pathname);
	}, [selectedPrograms, selectedPools, selectedDays, timePreset, timeStart, timeEnd, pathname, router]);

	type Session = {
		programName: string;
		programNameOriginal?: string | null;
		lanes?: number | null;
		poolId: string;
		dayOfWeek: ProgramEntry["dayOfWeek"];
		startTime: string;
		endTime: string;
		notes?: string | null;
	};

	const sessions: Session[] = useMemo(() => {
		const out: Session[] = [];
		for (const pool of all) {
			for (const p of pool.programs || []) {
				out.push({
					programName: p.programName,
					programNameOriginal: (p as any).programNameOriginal ?? null,
					lanes: (p as any).lanes ?? null,
					poolId: pool.id,
					dayOfWeek: p.dayOfWeek,
					startTime: p.startTime,
					endTime: p.endTime,
					notes: p.notes ?? "",
				});
			}
		}
		return out;
	}, [all]);

	const filtered = useMemo(() => {
		// day filter
		const daySet = new Set(selectedDays.length ? selectedDays : DAYS);

		// time window
		let rangeStart = 0;
		let rangeEnd = 24 * 60;
		if (timePreset === "morning") {
			rangeStart = parseTimeToMinutes("6:00a");
			rangeEnd = parseTimeToMinutes("12:00p");
		} else if (timePreset === "afternoon") {
			rangeStart = parseTimeToMinutes("12:00p");
			rangeEnd = parseTimeToMinutes("5:00p");
		} else if (timePreset === "evening") {
			rangeStart = parseTimeToMinutes("5:00p");
			rangeEnd = parseTimeToMinutes("10:00p");
		} else if (timePreset === "custom") {
			const s = parseTimeToMinutes(timeStart);
			const e = parseTimeToMinutes(timeEnd);
			if (s !== Number.MAX_SAFE_INTEGER && e !== Number.MAX_SAFE_INTEGER) {
				rangeStart = Math.min(s, e);
				rangeEnd = Math.max(s, e);
			}
		}

		return sessions.filter((s) => {
			const progOk = selectedPrograms.length === 0 || selectedPrograms.includes(s.programName);
			const poolOk = selectedPools.length === 0 || selectedPools.includes(s.poolId);
			const dayOk = daySet.has(s.dayOfWeek);
			const start = parseTimeToMinutes(s.startTime);
			const end = parseTimeToMinutes(s.endTime);
			// overlap logic: session intersects [rangeStart, rangeEnd)
			const timeOk = !(end <= rangeStart || start >= rangeEnd);
			return progOk && poolOk && dayOk && timeOk;
		});
	}, [sessions, selectedPrograms, selectedPools, selectedDays, timePreset, timeStart, timeEnd]);

	const grouped = useMemo(() => {
		const map = new Map<Session["dayOfWeek"], Session[]>();
		for (const d of DAYS) map.set(d, []);
		for (const s of filtered) map.get(s.dayOfWeek)!.push(s);
		for (const d of DAYS) map.get(d)!.sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));
		return map;
	}, [filtered]);

	function toggleSelection(list: string[], setList: (v: string[]) => void, value: string) {
		setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
	}

	function clearAll() {
		setSelectedPrograms([]);
		setSelectedPools([]);
		setSelectedDays([...DAYS]);
		setTimePreset("all");
		setTimeStart("6:00a");
		setTimeEnd("10:00p");
	}

	return (
		<div className="py-8">
			<header className="mb-6 flex items-center justify-between">
				<h1 className="text-3xl font-semibold accent-left pl-3">Find programs</h1>
				<a href="/schedules" className="link-accent">
					View full schedules
				</a>
			</header>

			<div className="grid gap-6 md:grid-cols-3">
				<section className="md:col-span-1 rounded border accent-border bg-white p-4">
					<h2 className="text-lg font-medium">Filters</h2>

					{/* Pools filter */}
					<div className="mt-4">
						<div className="flex items-center justify-between">
							<h3 className="font-medium">Pools</h3>
							<button
								className="text-sm link-accent"
								onClick={() => (selectedPools.length ? setSelectedPools([]) : setSelectedPools(poolOptions.map(p => p.id)))}
							>
								{selectedPools.length ? "clear" : "all"}
							</button>
						</div>
						<ul className="mt-2 max-h-64 space-y-0.5 overflow-auto pr-1">
							{poolOptions.map((pool) => (
								<li key={pool.id}>
									<label className="flex items-center gap-3 rounded-md px-2 py-1.5 -mx-2 cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition-colors">
										<input
											type="checkbox"
											className="h-5 w-5 flex-shrink-0 rounded"
											checked={selectedPools.includes(pool.id)}
											onChange={() => toggleSelection(selectedPools, setSelectedPools, pool.id)}
										/>
										<span className="text-sm">{pool.label}</span>
									</label>
								</li>
							))}
						</ul>
					</div>

					<div className="mt-4">
						<div className="flex items-center justify-between">
							<h3 className="font-medium">Programs</h3>
							<button
								className="text-sm link-accent"
								onClick={() => (selectedPrograms.length ? setSelectedPrograms([]) : setSelectedPrograms(programOptions))}
							>
								{selectedPrograms.length ? "clear" : "all"}
							</button>
						</div>
						<ul className="mt-2 max-h-64 space-y-0.5 overflow-y-auto overflow-x-hidden pr-1">
							{programOptions.map((name) => (
								<li key={name}>
									<label className="flex items-center gap-3 rounded-md px-2 py-1.5 -mx-2 cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition-colors">
										<input
											type="checkbox"
											className="h-5 w-5 shrink-0 rounded"
											checked={selectedPrograms.includes(name)}
											onChange={() => toggleSelection(selectedPrograms, setSelectedPrograms, name)}
										/>
										<span className="text-sm">{name}</span>
									</label>
								</li>
							))}
						</ul>
					</div>

					{/* Days filter */}
					<div className="mt-4">
						<div className="flex items-center justify-between">
							<h3 className="font-medium">Days</h3>
							<button
								className="text-sm link-accent"
								onClick={() => (selectedDays.length ? setSelectedDays([]) : setSelectedDays([...DAYS]))}
							>
								{selectedDays.length ? "clear" : "all"}
							</button>
						</div>
						<ul className="mt-2 grid grid-cols-2 gap-0.5">
							{DAYS.map((day) => (
								<li key={day}>
									<label className="flex items-center gap-3 rounded-md px-2 py-1.5 -mx-2 cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition-colors">
										<input
											type="checkbox"
											className="h-5 w-5 flex-shrink-0 rounded"
											checked={selectedDays.includes(day)}
											onChange={() =>
												setSelectedDays(
													selectedDays.includes(day)
														? selectedDays.filter((d) => d !== day)
														: [...selectedDays, day]
												)
											}
										/>
										<span className="text-sm">{day}</span>
									</label>
								</li>
							))}
						</ul>
					</div>
					<div className="mt-4">
						<h3 className="font-medium">Time</h3>
						<div className="mt-2 space-y-0.5">
							<label className="flex items-center gap-3 rounded-md px-2 py-1.5 -mx-2 cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition-colors">
								<input type="radio" name="timepreset" className="h-5 w-5" checked={timePreset === "all"} onChange={() => setTimePreset("all")} />
								<span className="text-sm">All day</span>
							</label>
							<label className="flex items-center gap-3 rounded-md px-2 py-1.5 -mx-2 cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition-colors">
								<input type="radio" name="timepreset" className="h-5 w-5" checked={timePreset === "morning"} onChange={() => setTimePreset("morning")} />
								<span className="text-sm">Morning (6a–12p)</span>
							</label>
							<label className="flex items-center gap-3 rounded-md px-2 py-1.5 -mx-2 cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition-colors">
								<input type="radio" name="timepreset" className="h-5 w-5" checked={timePreset === "afternoon"} onChange={() => setTimePreset("afternoon")} />
								<span className="text-sm">Afternoon (12p–5p)</span>
							</label>
							<label className="flex items-center gap-3 rounded-md px-2 py-1.5 -mx-2 cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition-colors">
								<input type="radio" name="timepreset" className="h-5 w-5" checked={timePreset === "evening"} onChange={() => setTimePreset("evening")} />
								<span className="text-sm">Evening (5p–10p)</span>
							</label>
							<label className="flex items-center gap-3 rounded-md px-2 py-1.5 -mx-2 cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition-colors">
								<input type="radio" name="timepreset" className="h-5 w-5" checked={timePreset === "custom"} onChange={() => setTimePreset("custom")} />
								<span className="text-sm">Custom</span>
							</label>
							{timePreset === "custom" ? (
								<div className="ml-8 mt-2 grid grid-cols-2 gap-3">
									<label className="text-sm">
										<span className="block text-slate-700 mb-1">Start</span>
										<input
											type="text"
											className="w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-[var(--accent-color)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
											placeholder="9:00a"
											value={timeStart}
											onChange={(e) => setTimeStart(e.target.value)}
										/>
									</label>
									<label className="text-sm">
										<span className="block text-slate-700 mb-1">End</span>
										<input
											type="text"
											className="w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-[var(--accent-color)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
											placeholder="2:15p"
											value={timeEnd}
											onChange={(e) => setTimeEnd(e.target.value)}
										/>
									</label>
								</div>
							) : null}
						</div>
					</div>
					<div className="mt-5 flex gap-3">
						<button
							className="btn-outline-accent rounded-md px-4 py-2.5 text-sm font-medium transition-all active:scale-95"
							onClick={clearAll}
						>
							Clear all filters
						</button>
					</div>
				</section>

				<section className="md:col-span-2 rounded border accent-border bg-white p-4">
					<h2 className="text-lg font-medium">Results</h2>
					<p className="mt-1 text-sm text-slate-600">
						{filtered.length} session{filtered.length === 1 ? "" : "s"} matching
					</p>

					{alerts?.poolAlerts && alerts.poolAlerts.length > 0 && (
						<PoolAlerts alerts={alerts} pools={all} selectedPools={selectedPools} />
					)}

					<div className="mt-4 grid gap-4 md:grid-cols-2">
						{DAYS.map((day) => {
							const items = grouped.get(day)!;
							if (!items || items.length === 0) return null;
							return (
								<div key={day} className="rounded-lg border accent-border overflow-hidden">
									<div className="day-header accent-muted-bg px-3 py-2.5 font-medium">{day}</div>
									<ul className="divide-y divide-slate-100">
										{items.map((s, idx) => (
											<li key={idx} className={`session-card px-3 py-2.5 text-sm ${getProgramTypeClass(s.programName)}`}>
												<div className="flex items-center justify-between gap-3">
													<span
														className="min-w-0 font-medium text-slate-800"
														title={s.programNameOriginal && s.programNameOriginal !== s.programName ? s.programNameOriginal : undefined}
													>
														{s.programName.replace(/\//g, " / ")}
													</span>
													<span className="flex shrink-0 items-center gap-2">
														{(s as any).lanes ? (
															<span className="lane-badge whitespace-nowrap rounded-full px-2 py-0.5 text-xs text-slate-600">{s.lanes} lanes</span>
														) : null}
														<span className="whitespace-nowrap text-slate-500 font-medium">{s.startTime}&nbsp;–&nbsp;{s.endTime}</span>
													</span>
												</div>
												<div className="mt-1.5 flex justify-between text-slate-500 text-xs">
													<span className="font-medium">{(all.find((p) => p.id === s.poolId)?.shortName) ?? (all.find((p) => p.id === s.poolId)?.nameTitle) ?? "Unknown Pool"}</span>
													{s.notes ? <span className="ml-2 italic">{s.notes}</span> : null}
												</div>
											</li>
										))}
									</ul>
								</div>
							);
						})}
					</div>
				</section>
			</div>
		</div>
	);
}
