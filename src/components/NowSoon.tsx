"use client";

import { useEffect, useMemo, useState } from "react";
import type { PoolSchedule } from "@/lib/pdf-processor";
import { around, toSessions, withoutClosedDays, type Day, type Session } from "@/lib/sessions";
import { formatClosurePeriod, isClosureActive, pacificToday } from "@/lib/closures";
import { toTitleCase } from "@/lib/program-taxonomy";
import { getPoolToken } from "@/lib/pool-tokens";
import PoolChip from "./PoolChip";
import ProgramName from "@/components/ProgramName";

type Props = {
	all: PoolSchedule[];
};

type StatusKey = "open" | "soon" | "closed";

/**
 * Status is deliberately a separate channel from pool identity: the left rule
 * and code chip always carry the pool's token color, so status reads from a
 * glyph and a word in ink rather than from a color. A filled dot is open, a
 * ring is soon, and a faint ring is closed.
 */
const STATUS: Record<StatusKey, { label: string; glyph: string; text: string }> = {
	open: { label: "OPEN NOW", glyph: "bg-ink", text: "text-ink" },
	soon: { label: "SOON", glyph: "ring-2 ring-ink ring-inset", text: "text-ink" },
	closed: { label: "CLOSED", glyph: "ring-2 ring-ink-2 ring-inset opacity-60", text: "text-ink-2" },
};

function getNowInPT(): { day: Day; date: string; minutes: number; display: string } {
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
	const weekday = parts.find((p) => p.type === "weekday")?.value as Day;

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

	return { day: weekday, date: pacificToday(), minutes, display };
}

function comparePoolNames(a: { pool: PoolSchedule }, b: { pool: PoolSchedule }) {
	const aPoolName = a.pool.shortName || a.pool.name || "";
	const bPoolName = b.pool.shortName || b.pool.name || "";

	return aPoolName.localeCompare(bPoolName);
}

function poolLabel(pool: PoolSchedule): string {
	return pool.shortName || pool.nameTitle || toTitleCase(pool.name);
}

/** utility link, rendered only when the pool actually has the URL */
function SourceLink({ href, children }: { href?: string | null; children: React.ReactNode }) {
	if (!href) return null;
	return (
		<a href={href} target="_blank" rel="noreferrer" className="link-utility">
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
	const color = token?.color ?? "var(--color-ink-2)";
	const tag = STATUS[status];

	return (
		<li className="border-l-[3px] bg-tint px-3 py-2.5" style={{ borderColor: color }}>
			<div className="flex items-center gap-2">
				<PoolChip token={token} />
				<span className="min-w-0 flex-1 truncate text-body font-semibold text-ink">
					{poolLabel(pool)}
				</span>
				<span
					className={`flex-none whitespace-nowrap font-mono text-label font-semibold tracking-[.08em] ${tag.text}`}
				>
					<span aria-hidden className={`status-dot ${tag.glyph}`} />
					{tag.label}
				</span>
			</div>
			{children}
			{pool.pdfScheduleUrl || pool.sfRecParkUrl ? (
				<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
					<SourceLink href={pool.pdfScheduleUrl}>Source PDF ↗</SourceLink>
					<SourceLink href={pool.sfRecParkUrl}>Pool page ↗</SourceLink>
				</div>
			) : null}
		</li>
	);
}

/** one session line: mono time range in a fixed column, then the program
    name, so the names in a block line up and a long one wraps under itself
    rather than under the time. 14ch holds the longest, "11:00a–12:30p",
    with room for the rounding that left 13ch a hair short. */
function SessionLine({ time, name }: { time: string; name: string }) {
	return (
		<div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-2 text-small leading-snug">
			<span className="w-[14ch] whitespace-nowrap font-mono text-label font-medium text-ink-2">{time}</span>
			<span className="min-w-0 text-ink-2">
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
			<div className="flex items-baseline justify-between border-t-2 border-ink pt-2.5">
				<span className="font-mono text-label font-semibold tracking-[.08em] text-ink">
					{label}
				</span>
				<span className="font-mono text-label font-medium text-ink-2">
					{count} POOL{count === 1 ? "" : "S"}
				</span>
			</div>
			{count === 0 ? (
				<p className="mt-2.5 text-body text-ink-2">{empty}</p>
			) : (
				<ul className="mt-2.5 grid gap-[3px] min-[900px]:grid-cols-2">{children}</ul>
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

	// recomputed when the day turns over, so a closure starts or ends at midnight
	const sessionsByPool = useMemo(() => {
		const byPool = new Map<string, Session[]>();
		for (const s of toSessions(withoutClosedDays(all, now.date))) {
			const list = byPool.get(s.poolId);
			if (list) list.push(s);
			else byPool.set(s.poolId, [s]);
		}
		return byPool;
	}, [all, now.date]);

	const perPool = useMemo(
		() => all.map((pool) => ({ pool, ...around(sessionsByPool.get(pool.id) ?? [], now, windowMin) })),
		[all, sessionsByPool, now, windowMin]
	);

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
		<div className="font-sans text-ink">
			<div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
				<label className="flex items-center gap-2">
					<span className="font-mono text-label font-semibold tracking-[.08em] text-ink-2">
						WINDOW
					</span>
					<input
						type="number"
						className="control w-[76px] cursor-text px-2 font-mono text-small font-medium text-ink focus:border-ink focus:outline-none"
						min={15}
						max={360}
						step={15}
						value={windowMin}
						onChange={(e) =>
							setWindowMin(Math.max(15, Math.min(360, Number(e.target.value) || 0)))
						}
					/>
					<span className="font-mono text-label font-medium text-ink-2">MIN</span>
				</label>
				<span className="font-mono text-label font-medium text-ink-2">
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
								name={current!.title}
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
									name={u.title}
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
							{pool.closure?.suppressPrograms && isClosureActive(pool.closure, now.date) ? (
								<div className="text-small text-ink-2">
									Closed {formatClosurePeriod(pool.closure)}
									{pool.closure.reason ? ` for ${pool.closure.reason}` : ""}.
								</div>
							) : later ? (
								<SessionLine time={`later ${later.startTime}`} name={later.title} />
							) : (
								<div className="text-small text-ink-2">No more sessions today.</div>
							)}
						</div>
					</PoolBlock>
				))}
			</Section>
		</div>
	);
}
