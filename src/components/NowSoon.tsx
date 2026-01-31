"use client";

import { useEffect, useMemo, useState } from "react";
import type { PoolSchedule, ProgramEntry } from "@/lib/pdf-processor";
import { toTitleCase } from "@/lib/program-taxonomy";
import { ClockIcon } from "@/components/icons";
import { parseTimeToMinutes } from "@/lib/utils";

const DAYS: Array<ProgramEntry["dayOfWeek"]> = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
];

type Props = {
	all: PoolSchedule[];
};

type Session = {
	programName: string;
	poolId: string;
	poolDisplayName: string;
	startTime: string;
	endTime: string;
	startMin: number;
	endMin: number;
	notes?: string | null;
	pdf?: string | null;
	sfUrl?: string | null;
};

function getNowInPT(): { day: ProgramEntry["dayOfWeek"]; minutes: number; display: string } {
	const fmt = new Intl.DateTimeFormat("en-US", {
		timeZone: "America/Los_Angeles",
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
		weekday: "long",
	});
	const parts = fmt.formatToParts(new Date());
	const hourPart = parts.find((p) => p.type === "hour")?.value ?? "0";
	const minutePart = parts.find((p) => p.type === "minute")?.value ?? "00";
	const dayPeriod = (parts.find((p) => p.type === "dayPeriod")?.value ?? "AM").toLowerCase();
	const weekday = parts.find((p) => p.type === "weekday")?.value as ProgramEntry["dayOfWeek"];

	let h = parseInt(hourPart, 10);
	const min = parseInt(minutePart, 10);
	if (h === 12) h = 0;
	let minutes = h * 60 + min;
	if (dayPeriod.startsWith("p")) minutes += 12 * 60;

	const display = new Intl.DateTimeFormat("en-US", {
		timeZone: "America/Los_Angeles",
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	}).format(new Date());

	return { day: weekday, minutes, display };
}

function comparePoolNames(a: { pool: PoolSchedule }, b: { pool: PoolSchedule })
{
	const aPoolName = a.pool.shortName || a.pool.name || "";
	const bPoolName = b.pool.shortName || b.pool.name || "";

	return aPoolName.localeCompare(bPoolName);
}

export default function NowSoon({ all }: Props) {
	const [windowMin, setWindowMin] = useState<number>(120);
	const [now, setNow] = useState(() => getNowInPT());

	useEffect(() => {
		const id = setInterval(() => setNow(getNowInPT()), 60_000);
		return () => clearInterval(id);
	}, []);

	const perPool = useMemo(() => {
		return all.map((pool) => {
			const todays: Session[] = (pool.programs || [])
				.filter((p) => p.dayOfWeek === now.day)
				.map((p) => ({
					programName: p.programName,
					poolId: pool.id,
					poolDisplayName: pool.shortName || pool.nameTitle || toTitleCase(pool.name),
					startTime: p.startTime,
					endTime: p.endTime,
					startMin: parseTimeToMinutes(p.startTime),
					endMin: parseTimeToMinutes(p.endTime),
					notes: p.notes ?? "",
					pdf: pool.pdfScheduleUrl ?? null,
					sfUrl: pool.sfRecParkUrl ?? null,
				}));

			const current = todays
				.filter((s) => s.startMin <= now.minutes && now.minutes < s.endMin)
				.sort((a, b) => a.endMin - b.endMin)[0];

			const upcoming = todays
				.filter((s) => s.startMin >= now.minutes && s.startMin < now.minutes + windowMin)
				.sort((a, b) => a.startMin - b.startMin);

			const later = todays
				.filter((s) => s.startMin >= now.minutes + windowMin)
				.sort((a, b) => a.startMin - b.startMin)[0];

			return { pool, current, upcoming, later };
		});
	}, [all, now, windowMin]);

	const openNow = perPool
		.filter((x) => !!x.current)
		.sort((a, b) => (a.current!.endMin - b.current!.endMin) || comparePoolNames(a, b));
	const openingSoon = perPool
		.filter((x) => !x.current && x.upcoming.length > 0)
		.sort((a, b) => (a.upcoming[0]!.startMin - b.upcoming[0]!.startMin) || comparePoolNames(a, b));
	const closed = perPool
		.filter((x) => !x.current && x.upcoming.length === 0)
		.sort((a, b) => comparePoolNames(a, b));

	return (
		<div className="container py-8">
			<header className="mb-6">
				<h1 className="text-3xl font-semibold">Happening now & soon</h1>
				<p className="mt-1 text-slate-600">Times interpreted in Pacific Time. Window is configurable.</p>
			</header>

			<div className="mb-6 flex flex-wrap items-center gap-3">
				<label className="text-sm flex items-center gap-2">
					<span>Window (minutes)</span>
					<input
						type="number"
						className="w-24 rounded-md border border-slate-300 px-3 py-2 text-base focus:border-[var(--accent-color)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
						min={15}
						max={360}
						step={15}
						value={windowMin}
						onChange={(e) => setWindowMin(Math.max(15, Math.min(360, Number(e.target.value) || 0)))}
					/>
				</label>
				<div className="text-sm text-slate-600">Current PT time: {now.display} ({now.day})</div>
			</div>

			<section className="mb-8">
				<h2 className="mb-2 text-xl font-medium accent-left pl-3">Open now</h2>
				{openNow.length === 0 ? (
					<p className="text-slate-600">No pools have ongoing sessions right now.</p>
				) : (
					<ul className="grid gap-3 md:grid-cols-2">
						{openNow.map(({ pool, current }) => (
							<li key={pool.id} className="pool-open session-card rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
								<div className="flex items-center justify-between">
									<span className="font-semibold text-slate-800">{pool.shortName || pool.nameTitle || toTitleCase(pool.name)}</span>
									<span className="status-open rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white">open</span>
								</div>
								<div className="mt-2 inline-flex items-center gap-1.5 text-emerald-700">
									<ClockIcon className="h-4 w-4 icon-water" />
									<span>{current!.programName} — until {current!.endTime}</span>
								</div>
								<div className="mt-3 flex gap-4">
									<a className="link-accent text-sm font-medium py-1" href={pool.pdfScheduleUrl ?? "#"} target="_blank" rel="noreferrer">
										PDF schedule
									</a>
									<a className="link-accent text-sm font-medium py-1" href={pool.sfRecParkUrl ?? "#"} target="_blank" rel="noreferrer">
										Pool page
									</a>
								</div>
							</li>
						))}
					</ul>
				)}
			</section>

			<section className="mb-8">
				<h2 className="mb-2 text-xl font-medium accent-left pl-3">Starting soon (next {windowMin} min)</h2>
				{openingSoon.length === 0 ? (
					<p className="text-slate-600">No sessions starting soon within the selected window.</p>
				) : (
					<ul className="grid gap-3 md:grid-cols-2">
						{openingSoon.map(({ pool, upcoming }) => (
							<li key={pool.id} className="session-card rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
								<div className="flex items-center justify-between">
									<span className="font-semibold text-slate-800">{pool.shortName || pool.nameTitle || toTitleCase(pool.name)}</span>
									<span className="status-soon rounded-full bg-amber-500 px-2.5 py-1 text-xs font-medium text-white">opening soon</span>
								</div>
								<ul className="mt-2 space-y-1">
									{upcoming.slice(0, 2).map((u, idx) => (
										<li key={idx} className="flex items-center gap-1.5 text-amber-700">
											<ClockIcon className="h-4 w-4 icon-water" />
											<span>{u.programName} — {u.startTime} to {u.endTime}</span>
										</li>
									))}
								</ul>
								<div className="mt-3 flex gap-4">
									<a className="link-accent text-sm font-medium py-1" href={pool.pdfScheduleUrl ?? "#"} target="_blank" rel="noreferrer">
										PDF schedule
									</a>
									<a className="link-accent text-sm font-medium py-1" href={pool.sfRecParkUrl ?? "#"} target="_blank" rel="noreferrer">
										Pool page
									</a>
								</div>
							</li>
						))}
					</ul>
				)}
			</section>

			<section>
				<h2 className="mb-2 text-xl font-medium accent-left pl-3">Closed (no sessions now or soon)</h2>
				{closed.length === 0 ? (
					<p className="text-slate-600">All pools have activity now or starting soon.</p>
				) : (
					<ul className="grid gap-3 md:grid-cols-2">
						{closed.map(({ pool, later }) => (
							<li key={pool.id} className="session-card rounded-lg border accent-border bg-white p-4 text-sm">
								<div className="flex items-center justify-between">
									<span className="font-semibold text-slate-800">{pool.shortName || pool.nameTitle || toTitleCase(pool.name)}</span>
									<span className="rounded-full bg-slate-400 px-2.5 py-1 text-xs font-medium text-white">closed</span>
								</div>
								<div className="mt-2 text-slate-500">
									{later ? (
										<span className="inline-flex items-center gap-1.5"><ClockIcon className="h-4 w-4" />later today at {later.startTime} — {later.programName}</span>
									) : (
										<span className="italic">no more sessions today</span>
									)}
								</div>
								<div className="mt-3 flex gap-4">
									<a className="link-accent text-sm font-medium py-1" href={pool.pdfScheduleUrl ?? "#"} target="_blank" rel="noreferrer">
										PDF schedule
									</a>
									<a className="link-accent text-sm font-medium py-1" href={pool.sfRecParkUrl ?? "#"} target="_blank" rel="noreferrer">
										Pool page
									</a>
								</div>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
