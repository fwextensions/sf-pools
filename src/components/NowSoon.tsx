"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { PoolSchedule } from "@/lib/pdf-processor";
import { toSessions, withoutClosedDays, type Day, type Session } from "@/lib/sessions";
import { pacificToday } from "@/lib/closures";
import { toTitleCase } from "@/lib/program-taxonomy";
import { getPoolToken } from "@/lib/pool-tokens";
import {
	formatDuration,
	joinNames,
	nowSoon,
	type ClosedStanding,
	type Mode,
	type NowSoonOptions,
	type OpenStanding,
	type ProgramChoice,
	type When,
} from "@/lib/now-soon";
import { initialNowSoonOptions, writeNowSoonUrl } from "@/lib/now-soon-url";
import PoolChip from "./PoolChip";
import ProgramName from "@/components/ProgramName";
import { Chevron, ExternalLinkIcon } from "@/components/icons";

type Props = {
	all: PoolSchedule[];
};

/**
 * Status is deliberately a separate channel from pool identity: the chip
 * always carries the pool's token color, so status reads from a glyph and a
 * word in ink rather than from a color. A filled dot is open, a ring is soon,
 * and a faint ring is not open. The group heading carries it, once.
 */
const GLYPHS = {
	open: "bg-ink",
	soon: "ring-2 ring-ink ring-inset",
	closed: "ring-2 ring-ink-2 ring-inset opacity-60",
};

const PROGRAM_OPTIONS: Array<[ProgramChoice | "", string]> = [
	["", "All programs"],
	["lap", "Lap swim"],
	["family", "Family swim"],
	["senior", "Senior swim"],
];

const WHEN_OPTIONS: Array<[When, string]> = [
	["next", "Next 2 hours"],
	["today", "Rest of today"],
	["tomorrow-am", "Tomorrow morning"],
	["tomorrow-pm", "Tomorrow afternoon"],
	["tomorrow-eve", "Tomorrow evening"],
];

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

	// written the way the schedules write times, "1:23p"
	const display = `${h % 12 || 12}:${String(min).padStart(2, "0")}${dayPeriod.startsWith("p") ? "p" : "a"}`;

	return { day: weekday, date: pacificToday(), minutes, display };
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

/** the program names, with the full list on hover when it is shortened */
function Names({ names }: { names: string[] }) {
	const joined = joinNames(names);
	return (
		<span title={names.length > 2 ? names.join(", ") : undefined}>
			<ProgramName name={joined} />
		</span>
	);
}

/** chip and pool name, the name linking to the pool's full schedule */
function PoolName({ pool, weight }: { pool: PoolSchedule; weight: "font-semibold" | "font-normal" }) {
	return (
		<>
			<PoolChip token={getPoolToken(pool.id)} className="self-center" />
			<a
				href={`/schedules#pool-${pool.id}`}
				className={`text-body ${weight} text-ink decoration-1 underline-offset-[3px] hover:underline`}
			>
				{poolLabel(pool)}
			</a>
		</>
	);
}

function OpenRow({
	standing,
	kind,
	now,
}: {
	standing: OpenStanding;
	kind: "open" | "soon" | "planned";
	now: number;
}) {
	const { pool, stretch } = standing;
	// a session you can't walk in on reads in the secondary ink, tagged; never
	// dimmed with opacity, which failed contrast
	const tone = stretch.restricted ? "text-ink-2" : "text-ink";
	const headline =
		kind === "open"
			? `Closes in ${formatDuration(stretch.end - now)}`
			: kind === "soon"
				? `Starts in ${formatDuration(stretch.start - now)}`
				: `${stretch.startTime}–${stretch.endTime}`;
	const detail = kind === "open" ? `until ${stretch.endTime}` : kind === "soon" ? `${stretch.startTime}–${stretch.endTime}` : null;

	return (
		<li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b border-line py-3">
			<div className="min-w-0">
				<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
					<PoolName pool={pool} weight="font-semibold" />
					<span className="text-body text-ink-2">
						<Names names={stretch.names} />
					</span>
					{stretch.restricted ? <span className="tag self-center">{stretch.restricted}</span> : null}
				</div>
				{stretch.then ? (
					<p className="mt-1 text-small text-ink-2">
						then <Names names={stretch.then.names} /> at {stretch.then.at}
					</p>
				) : null}
				{pool.pdfScheduleUrl || pool.sfRecParkUrl ? (
					<div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
						<SourceLink href={pool.pdfScheduleUrl}>PDF<ExternalLinkIcon /></SourceLink>
						<SourceLink href={pool.sfRecParkUrl}>Pool<ExternalLinkIcon /></SourceLink>
					</div>
				) : null}
			</div>
			<div className="text-right">
				<div className={`whitespace-nowrap text-body font-semibold ${tone}`}>{headline}</div>
				{detail ? <div className="whitespace-nowrap font-mono text-label font-medium text-ink-2">{detail}</div> : null}
			</div>
		</li>
	);
}

function ClosedRow({ standing }: { standing: ClosedStanding }) {
	const { pool, next, note, closedFor } = standing;
	return (
		<li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line py-2.5">
			<div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
				<PoolName pool={pool} weight="font-normal" />
				{closedFor ? <span className="text-small font-medium text-alert">{closedFor}</span> : null}
			</div>
			{next ? (
				<div className="text-small text-ink-2">
					Next:{" "}
					<span className="font-mono text-ink">
						{next.day} {next.time}
					</span>{" "}
					<Names names={next.names} />
				</div>
			) : (
				<div className="text-small text-ink-2">{note}</div>
			)}
		</li>
	);
}

function Section({
	label,
	glyph,
	count,
	empty,
	children,
}: {
	label: string;
	glyph: string;
	count: number;
	empty: string;
	children: React.ReactNode;
}) {
	return (
		<section className="mt-8">
			<div className="flex items-baseline justify-between border-t-2 border-ink pt-2.5">
				<span className="font-mono text-label font-semibold uppercase tracking-[.08em] text-ink">
					<span aria-hidden className={`status-dot ${glyph}`} />
					{label}
				</span>
				<span className="font-mono text-label font-medium text-ink-2">
					{count} POOL{count === 1 ? "" : "S"}
				</span>
			</div>
			{count === 0 ? (
				<p className="mt-2.5 text-body text-ink-2">{empty}</p>
			) : (
				<ul className="mt-1 grid gap-x-10 min-[900px]:grid-cols-2">{children}</ul>
			)}
		</section>
	);
}

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
	const options: Array<[Mode, string]> = [
		["drop-in", "Drop-in"],
		["all", "Everything"],
	];
	return (
		<div role="group" aria-label="Which sessions" className="col-span-2 flex">
			{options.map(([value, label], i) => (
				<button
					key={value}
					type="button"
					aria-pressed={mode === value}
					onClick={() => onChange(value)}
					className={`control flex-1 text-small min-[900px]:flex-none ${i > 0 ? "-ml-px" : ""} ${
						mode === value ? "relative z-10 border-ink text-white" : "text-ink"
					}`}
					// inline, since the control utility sets its own white background
					style={mode === value ? { background: "var(--color-ink)" } : undefined}
				>
					{label}
				</button>
			))}
		</div>
	);
}

function Select<T extends string>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: T;
	options: Array<[T, string]>;
	onChange: (value: T) => void;
}) {
	return (
		<label className="relative flex min-w-0">
			<span className="sr-only">{label}</span>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value as T)}
				className="control w-full appearance-none justify-start pr-9 text-small text-ink focus:border-ink focus:outline-none"
			>
				{options.map(([v, text]) => (
					<option key={v} value={v}>
						{text}
					</option>
				))}
			</select>
			{/* centered by flex rather than top-1/2, which the chevron's negative
			    margins pushed off center */}
			<span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-2">
				<Chevron />
			</span>
		</label>
	);
}

export default function NowSoon({ all }: Props) {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [options, setOptions] = useState<NowSoonOptions>(() => initialNowSoonOptions(searchParams));
	const [now, setNow] = useState(() => getNowInPT());

	useEffect(() => {
		const id = setInterval(() => setNow(getNowInPT()), 60_000);
		return () => clearInterval(id);
	}, []);

	const update = (change: Partial<NowSoonOptions>) => {
		const next = { ...options, ...change };
		setOptions(next);
		writeNowSoonUrl(pathname, next);
	};

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

	const view = useMemo(() => nowSoon(all, sessionsByPool, now, options), [all, sessionsByPool, now, options]);
	const quiet = `No ${view.noun} ${view.span}`;

	return (
		<div className="font-sans text-ink">
			<div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
				<span className="text-small text-ink-2">
					{now.day.slice(0, 3)} {now.display} Pacific
				</span>
				<div className="grid w-full grid-cols-2 gap-2 min-[900px]:flex min-[900px]:w-auto min-[900px]:items-center">
					<ModeSwitch mode={options.mode} onChange={(mode) => update({ mode })} />
					<Select
						label="Program"
						value={options.program ?? ""}
						options={PROGRAM_OPTIONS}
						onChange={(program) => update({ program: program || null })}
					/>
					<Select label="When" value={options.when} options={WHEN_OPTIONS} onChange={(when) => update({ when })} />
				</div>
			</div>

			{view.planned ? (
				<Section label={`Open ${view.span}`} glyph={GLYPHS.open} count={view.open.length} empty={`No pools have ${view.noun} ${view.span}.`}>
					{view.open.map((s) => (
						<OpenRow key={s.pool.id} standing={s} kind="planned" now={now.minutes} />
					))}
				</Section>
			) : (
				<>
					<Section label="Open now" glyph={GLYPHS.open} count={view.open.length} empty={`No pools have ${view.noun} running right now.`}>
						{view.open.map((s) => (
							<OpenRow key={s.pool.id} standing={s} kind="open" now={now.minutes} />
						))}
					</Section>
					<Section
						label={`Starting ${view.span}`}
						glyph={GLYPHS.soon}
						count={view.soon.length}
						empty={`Nothing else starts ${view.span}.`}
					>
						{view.soon.map((s) => (
							<OpenRow key={s.pool.id} standing={s} kind="soon" now={now.minutes} />
						))}
					</Section>
				</>
			)}

			{view.closed.length ? (
				<Section label={quiet} glyph={GLYPHS.closed} count={view.closed.length} empty="">
					{view.closed.map((s) => (
						<ClosedRow key={s.pool.id} standing={s} />
					))}
				</Section>
			) : null}
		</div>
	);
}
