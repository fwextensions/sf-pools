"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { PoolSchedule } from "@/lib/schedule-schema";
import type { CityHoliday } from "@/lib/city-holidays";
import type { Day } from "@/lib/sessions";
import { createPoolCalendar, weekdayOf } from "@/lib/pool-calendar";
import { pacificToday } from "@/lib/closures";
import { toTitleCase } from "@/lib/program-taxonomy";
import { poolPageHref } from "@/lib/pool-pages";
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
	/** schedules posted to take over on their start dates */
	upcoming?: PoolSchedule[];
	/** the city's, which close every pool */
	holidays?: CityHoliday[];
	/** a fixed San Francisco date and time, "2026-11-26T10:00", in place of
	    the live clock; the preview page passes it */
	at?: string | null;
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

type Now = { day: Day; date: string; minutes: number; display: string };

// written the way the schedules write times, "1:23p"
function displayTime(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const min = minutes % 60;
	return `${h % 12 || 12}:${String(min).padStart(2, "0")}${h >= 12 ? "p" : "a"}`;
}

/** "2026-11-26T10:00" read as San Francisco time, or null when it isn't one */
export function pacificMoment(at: string): Now | null {
	const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(at);
	if (!match) return null;
	const [, date, hh, mm] = match;
	const minutes = Number(hh) * 60 + Number(mm);
	if (Number(hh) > 23 || Number(mm) > 59 || Number.isNaN(Date.parse(date))) return null;
	return { day: weekdayOf(date), date, minutes, display: displayTime(minutes) };
}

function getNowInPT(): Now {
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

	return { day: weekday, date: pacificToday(), minutes, display: displayTime(minutes) };
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

/** chip and pool name, the name linking to the pool's page */
function PoolName({ pool, weight }: { pool: PoolSchedule; weight: "font-semibold" | "font-normal" }) {
	return (
		<>
			<PoolChip token={getPoolToken(pool.id)} className="self-center" />
			<a
				href={poolPageHref(pool.id)}
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
	// the times are those of the programs named, so a different program
	// following straight on reads as "then …", not as more of the same; it
	// says "Ends", not "Closes", since the building may stay open between
	// sessions
	const span = `${stretch.startTime}–${stretch.namesEndTime}`;
	const headline =
		kind === "open"
			? `Ends in ${formatDuration(stretch.namesEnd - now)}`
			: kind === "soon"
				? `Starts in ${formatDuration(stretch.start - now)}`
				: span;
	const detail = kind === "open" ? `until ${stretch.namesEndTime}` : kind === "soon" ? span : null;

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
				// two columns read down the first and then the second, so the
				// order the rows are sorted in runs down the page
				<ul
					className="mt-1 grid gap-x-10 min-[900px]:grid-flow-col min-[900px]:grid-cols-2 min-[900px]:grid-rows-[repeat(var(--rows),auto)]"
					style={{ "--rows": Math.ceil(count / 2) } as CSSProperties}
				>
					{children}
				</ul>
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
						mode === value ? "relative z-10 border-ink text-on-ink" : "text-ink"
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

export default function NowSoon({ all, upcoming = [], holidays = [], at = null }: Props) {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [options, setOptions] = useState<NowSoonOptions>(() => initialNowSoonOptions(searchParams));
	const [liveNow, setLiveNow] = useState(() => getNowInPT());
	const fixedNow = useMemo(() => (at ? pacificMoment(at) : null), [at]);
	const now = fixedNow ?? liveNow;

	useEffect(() => {
		if (fixedNow) return;
		const id = setInterval(() => setLiveNow(getNowInPT()), 60_000);
		return () => clearInterval(id);
	}, [fixedNow]);

	const update = (change: Partial<NowSoonOptions>) => {
		const next = { ...options, ...change };
		setOptions(next);
		writeNowSoonUrl(pathname, next);
	};

	const calendar = useMemo(() => createPoolCalendar(all, upcoming, holidays), [all, upcoming, holidays]);
	const view = useMemo(() => nowSoon(all, calendar, now, options), [all, calendar, now, options]);
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
