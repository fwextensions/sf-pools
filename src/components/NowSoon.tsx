"use client";

import { useEffect, useMemo, useState } from "react";
import type { PoolSchedule, ProgramEntry } from "@/lib/pdf-processor";
import { describeProgram } from "@/lib/program-display";
import { toTitleCase } from "@/lib/program-taxonomy";
import { getPoolToken } from "@/lib/pool-tokens";
import ProgramName from "@/components/ProgramName";
import { parseTimeToMinutes } from "@/lib/utils";

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

type StatusKey = "open" | "soon" | "closed";

/**
 * Status is deliberately a separate channel from pool identity: the left rule
 * and code chip always carry the pool's token color, so status has to read
 * from the tag alone rather than recoloring the block.
 */
const STATUS: Record<StatusKey, { label: string; fg: string; bg: string }> = {
	open: { label: "OPEN NOW", fg: "#2f7d32", bg: "#eef6ee" },
	soon: { label: "SOON", fg: "#a9761c", bg: "#fdf7ec" },
	closed: { label: "CLOSED", fg: "#8a9aa4", bg: "#f0f4f6" },
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

function comparePoolNames(a: { pool: PoolSchedule }, b: { pool: PoolSchedule }) {
	const aPoolName = a.pool.shortName || a.pool.name || "";
	const bPoolName = b.pool.shortName || b.pool.name || "";

	return aPoolName.localeCompare(bPoolName);
}

function poolLabel(pool: PoolSchedule): string {
	return pool.shortName || pool.nameTitle || toTitleCase(pool.name);
}

/** mono uppercase link, rendered only when the pool actually has the URL */
function SourceLink({ href, children }: { href?: string | null; children: React.ReactNode }) {
	if (!href) return null;
	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			className="plex-mono text-[11px] font-medium text-[#5a707c] underline underline-offset-2"
		>
			{children}
		</a>
	);
}

function PoolBlock({
	pool,
	status,
	children,
}: {
	pool: PoolSchedule;
	status: StatusKey;
	children: React.ReactNode;
}) {
	const token = getPoolToken(pool.id);
	const color = token?.color ?? "#5a707c";
	const tag = STATUS[status];

	return (
		<li className="border-l-[3px] bg-[#f7fafb] px-3 py-2.5" style={{ borderColor: color }}>
			<div className="flex items-center gap-2">
				<span
					aria-hidden
					className="flex h-[18px] w-[30px] flex-none items-center justify-center plex-mono text-[10px] font-semibold text-white"
					style={{ background: color }}
				>
					{token?.code ?? "—"}
				</span>
				<span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[#0e2733]">
					{poolLabel(pool)}
				</span>
				<span
					className="flex-none px-1.5 py-[3px] plex-mono text-[10px] font-semibold tracking-[.1em]"
					style={{ color: tag.fg, background: tag.bg }}
				>
					{tag.label}
				</span>
			</div>
			{children}
			{pool.pdfScheduleUrl || pool.sfRecParkUrl ? (
				<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
					<SourceLink href={pool.pdfScheduleUrl}>SOURCE PDF ↗</SourceLink>
					<SourceLink href={pool.sfRecParkUrl}>POOL PAGE ↗</SourceLink>
				</div>
			) : null}
		</li>
	);
}

/** one session line: mono time range, then the program name */
function SessionLine({ time, name }: { time: string; name: string }) {
	return (
		<div className="flex gap-2 text-[13px] leading-snug">
			<span className="flex-none plex-mono text-[11px] font-medium text-[#5a707c]">{time}</span>
			<span className="min-w-0 text-[#37474f]">
				<ProgramName name={name} />
			</span>
		</div>
	);
}

function Section({
	label,
	count,
	empty,
	children,
}: {
	label: string;
	count: number;
	empty: string;
	children: React.ReactNode;
}) {
	return (
		<section className="mt-6">
			<div className="flex items-baseline justify-between border-t-2 border-[#0e2733] pt-2.5">
				<span className="plex-mono text-[11px] font-semibold tracking-[.14em] text-[#0e2733]">
					{label}
				</span>
				<span className="plex-mono text-[11px] font-medium text-[#8a9aa4]">
					{count} POOL{count === 1 ? "" : "S"}
				</span>
			</div>
			{count === 0 ? (
				<p className="mt-2.5 text-[14px] text-[#8a9aa4]">{empty}</p>
			) : (
				<ul className="mt-2.5 grid gap-[3px] md:grid-cols-2">{children}</ul>
			)}
		</section>
	);
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
					programName: describeProgram(p).title,
					poolId: pool.id,
					poolDisplayName: poolLabel(pool),
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
		.sort((a, b) => a.current!.endMin - b.current!.endMin || comparePoolNames(a, b));
	const openingSoon = perPool
		.filter((x) => !x.current && x.upcoming.length > 0)
		.sort((a, b) => a.upcoming[0]!.startMin - b.upcoming[0]!.startMin || comparePoolNames(a, b));
	const closed = perPool
		.filter((x) => !x.current && x.upcoming.length === 0)
		.sort((a, b) => comparePoolNames(a, b));

	return (
		<div className="plex-sans text-[#0e2733]">
			<div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
				<label className="flex items-center gap-2">
					<span className="plex-mono text-[11px] font-semibold tracking-[.14em] text-[#8a9aa4]">
						WINDOW
					</span>
					<input
						type="number"
						className="w-[68px] border border-[#c4d2d9] bg-white px-2 py-1 plex-mono text-[12px] font-medium text-[#0e2733] focus:border-[#0e2733] focus:outline-none"
						min={15}
						max={360}
						step={15}
						value={windowMin}
						onChange={(e) =>
							setWindowMin(Math.max(15, Math.min(360, Number(e.target.value) || 0)))
						}
					/>
					<span className="plex-mono text-[11px] font-medium text-[#8a9aa4]">MIN</span>
				</label>
				<span className="plex-mono text-[11px] font-medium text-[#8a9aa4]">
					PACIFIC {now.display.toUpperCase()} · {now.day.slice(0, 3).toUpperCase()}
				</span>
			</div>

			<Section
				label="OPEN NOW"
				count={openNow.length}
				empty="No pools have a session running right now."
			>
				{openNow.map(({ pool, current }) => (
					<PoolBlock key={pool.id} pool={pool} status="open">
						<div className="mt-1.5">
							<SessionLine
								time={`until ${current!.endTime}`}
								name={current!.programName}
							/>
						</div>
					</PoolBlock>
				))}
			</Section>

			<Section
				label={`STARTING WITHIN ${windowMin} MIN`}
				count={openingSoon.length}
				empty="Nothing starts inside the current window."
			>
				{openingSoon.map(({ pool, upcoming }) => (
					<PoolBlock key={pool.id} pool={pool} status="soon">
						<div className="mt-1.5 flex flex-col gap-0.5">
							{upcoming.slice(0, 2).map((u, idx) => (
								<SessionLine
									key={idx}
									time={`${u.startTime}–${u.endTime}`}
									name={u.programName}
								/>
							))}
						</div>
					</PoolBlock>
				))}
			</Section>

			<Section
				label="CLOSED"
				count={closed.length}
				empty="Every pool is open now or opening soon."
			>
				{closed.map(({ pool, later }) => (
					<PoolBlock key={pool.id} pool={pool} status="closed">
						<div className="mt-1.5">
							{later ? (
								<SessionLine time={`later ${later.startTime}`} name={later.programName} />
							) : (
								<div className="text-[13px] text-[#8a9aa4]">No more sessions today.</div>
							)}
						</div>
					</PoolBlock>
				))}
			</Section>
		</div>
	);
}
