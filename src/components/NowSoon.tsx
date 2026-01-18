"use client";

import { useEffect, useMemo, useState } from "react";
import type { PoolSchedule, ProgramEntry } from "@/lib/pdf-processor";
import { toTitleCase } from "@/lib/program-taxonomy";
import { ClockIcon } from "@/components/icons";

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
				<label className="text-sm">
					<span className="mr-2">Window (minutes)</span>
					<input
						type="number"
						className="w-28 rounded border border-slate-300 px-2 py-1"
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
							<li key={pool.id} className="rounded border accent-border bg-emerald-50 p-3 text-sm">
								<div className="flex items-center justify-between">
									<span className="font-medium">{pool.shortName || pool.nameTitle || toTitleCase(pool.name)}</span>
									<span className="rounded bg-emerald-600 px-2 py-0.5 text-white">open</span>
								</div>
								<div className="mt-1 inline-flex items-center gap-1"><ClockIcon className="h-3.5 w-3.5" />{current!.programName} — until {current!.endTime}</div>
								<div className="mt-1 flex gap-3">
									<a className="link-accent" href={pool.pdfScheduleUrl ?? "#"} target="_blank" rel="noreferrer">
										PDF
									</a>
									<a className="link-accent" href={pool.sfRecParkUrl ?? "#"} target="_blank" rel="noreferrer">
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
							<li key={pool.id} className="rounded border accent-border bg-amber-50 p-3 text-sm">
								<div className="flex items-center justify-between">
									<span className="font-medium">{pool.shortName || pool.nameTitle || toTitleCase(pool.name)}</span>
									<span className="rounded bg-amber-600 px-2 py-0.5 text-white">opening soon</span>
								</div>
								<ul className="mt-1 list-disc pl-5">
									{upcoming.slice(0, 2).map((u, idx) => (
										<li key={idx} className="inline-flex items-center gap-1">
											<ClockIcon className="h-3.5 w-3.5" />{u.programName} — {u.startTime} to {u.endTime}
										</li>
									))}
								</ul>
								<div className="mt-1 flex gap-3">
									<a className="link-accent" href={pool.pdfScheduleUrl ?? "#"} target="_blank" rel="noreferrer">
										PDF
									</a>
									<a className="link-accent" href={pool.sfRecParkUrl ?? "#"} target="_blank" rel="noreferrer">
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
							<li key={pool.id} className="rounded border accent-border bg-white p-3 text-sm">
								<div className="flex items-center justify-between">
									<span className="font-medium">{pool.shortName || pool.nameTitle || toTitleCase(pool.name)}</span>
									<span className="rounded bg-slate-600 px-2 py-0.5 text-white">closed</span>
								</div>
								<div className="mt-1 text-slate-600">
									{later ? (
										<span className="inline-flex items-center gap-1"><ClockIcon className="h-3.5 w-3.5" />later today at {later.startTime} — {later.programName}</span>
									) : (
										<span>no more sessions today</span>
									)}
								</div>
								<div className="mt-1 flex gap-3">
									<a className="link-accent" href={pool.pdfScheduleUrl ?? "#"} target="_blank" rel="noreferrer">
										PDF
									</a>
									<a className="link-accent" href={pool.sfRecParkUrl ?? "#"} target="_blank" rel="noreferrer">
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
