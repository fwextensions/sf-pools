"use client";

import { useEffect, useMemo, useState } from "react";
import type { PoolSchedule, ProgramEntry } from "@/lib/pdf-processor";

type Props = {
	all: PoolSchedule[];
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

function parseTimeToMinutes(t: string): number {
	const m = /^(\d{1,2}):(\d{2})([ap])$/.exec(t);
	if (m) {
		let h = parseInt(m[1]!, 10);
		const min = parseInt(m[2]!, 10);
		const suffix = m[3]!;
		if (h === 12) h = 0;
		let total = h * 60 + min;
		if (suffix === "p") total += 12 * 60;
		return total;
	}
	const m24 = /^(\d{2}):(\d{2})$/.exec(t);
	if (m24) {
		const h = parseInt(m24[1]!, 10);
		const min = parseInt(m24[2]!, 10);
		return h * 60 + min;
	}
	return Number.MAX_SAFE_INTEGER;
}

export default function HomeFilters({ all }: Props) {
	const [selectedPrograms, setSelectedPrograms] = useState<string[]>([]);
	const [selectedPools, setSelectedPools] = useState<string[]>([]);

	const programOptions = useMemo(() => {
		const set = new Set<string>();
		for (const pool of all) {
			for (const p of pool.programs || []) set.add(p.programName);
		}
		return Array.from(set).sort((a, b) => a.localeCompare(b));
	}, [all]);

	const poolOptions = useMemo(() => {
		return Array.from(new Set(all.map((p) => p.poolName))).sort((a, b) => a.localeCompare(b));
	}, [all]);

	type Session = {
		programName: string;
		poolName: string;
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
					poolName: pool.poolName,
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
		return sessions.filter((s) => {
			const progOk = selectedPrograms.length === 0 || selectedPrograms.includes(s.programName);
			const poolOk = selectedPools.length === 0 || selectedPools.includes(s.poolName);
			return progOk && poolOk;
		});
	}, [sessions, selectedPrograms, selectedPools]);

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
	}

	return (
		<div className="container py-8">
			<header className="mb-6 flex items-center justify-between">
				<h1 className="text-3xl font-semibold">Find programs</h1>
				<a href="/schedules" className="text-blue-700 hover:underline">
					View full schedules
				</a>
			</header>

			<div className="grid gap-6 md:grid-cols-3">
				<section className="md:col-span-1 rounded border border-slate-200 bg-white p-4">
					<h2 className="text-lg font-medium">Filters</h2>
					<div className="mt-4">
						<div className="flex items-center justify-between">
							<h3 className="font-medium">Programs</h3>
							<button
								className="text-sm text-blue-700 hover:underline"
								onClick={() => setSelectedPrograms(programOptions)}
							>
								all
							</button>
						</div>
						<ul className="mt-2 max-h-64 space-y-1 overflow-auto pr-1">
							{programOptions.map((name) => (
								<li key={name}>
									<label className="inline-flex items-center gap-2">
										<input
											type="checkbox"
											className="h-4 w-4"
											checked={selectedPrograms.includes(name)}
											onChange={() => toggleSelection(selectedPrograms, setSelectedPrograms, name)}
										/>
										<span className="text-sm">{name}</span>
									</label>
								</li>
							))}
						</ul>
					</div>
					<div className="mt-4">
						<div className="flex items-center justify-between">
							<h3 className="font-medium">Pools</h3>
							<button
								className="text-sm text-blue-700 hover:underline"
								onClick={() => setSelectedPools(poolOptions)}
							>
								all
							</button>
						</div>
						<ul className="mt-2 space-y-1">
							{poolOptions.map((name) => (
								<li key={name}>
									<label className="inline-flex items-center gap-2">
										<input
											type="checkbox"
											className="h-4 w-4"
											checked={selectedPools.includes(name)}
											onChange={() => toggleSelection(selectedPools, setSelectedPools, name)}
										/>
										<span className="text-sm">{name}</span>
									</label>
								</li>
							))}
						</ul>
					</div>
					<div className="mt-4 flex gap-3">
						<button
							className="rounded border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-50"
							onClick={clearAll}
						>
							Clear
						</button>
					</div>
				</section>

				<section className="md:col-span-2 rounded border border-slate-200 bg-white p-4">
					<h2 className="text-lg font-medium">Results</h2>
					<p className="mt-1 text-sm text-slate-600">
						{filtered.length} session{filtered.length === 1 ? "" : "s"} matching
					</p>
					<div className="mt-4 grid gap-4 md:grid-cols-2">
						{DAYS.map((day) => {
							const items = grouped.get(day)!;
							if (!items || items.length === 0) return null;
							return (
								<div key={day} className="rounded border border-slate-200">
									<div className="bg-slate-50 px-3 py-2 font-medium">{day}</div>
									<ul className="divide-y divide-slate-200">
										{items.map((s, idx) => (
											<li key={idx} className="px-3 py-2 text-sm">
												<div className="flex items-center justify-between gap-3">
													<span className="font-medium">{s.programName}</span>
													<span className="text-slate-600">{s.startTime} – {s.endTime}</span>
												</div>
												<div className="mt-1 flex items-center justify-between text-slate-600">
													<span>{s.poolName}</span>
													{s.notes ? <span className="ml-2">{s.notes}</span> : null}
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
