"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import type { PoolSchedule } from "@/lib/schedule-schema";
import type { CityHoliday } from "@/lib/city-holidays";
import type { Day } from "@/lib/sessions";
import { createPoolCalendar, weekdayOf } from "@/lib/pool-calendar";
import { pacificToday } from "@/lib/closures";
import { toTitleCase } from "@/lib/program-taxonomy";
import { poolSessionHref } from "@/lib/pool-pages";
import { getPoolToken } from "@/lib/pool-tokens";
import {
	formatDuration,
	joinNames,
	nowSoon,
	nowSoonSpans,
	type LaterStanding,
	type OpenStanding,
	type Stretch,
} from "@/lib/now-soon";
import type { GridFilter } from "@/lib/grid/filters";
import { PUBLIC_SESSIONS, nowSoonFilter } from "@/lib/grid/now-filter";
import type { SessionSpan } from "@/lib/session-span";
import PoolChip from "./PoolChip";
import SessionBar from "./SessionBar";
import ProgramName from "@/components/ProgramName";

type Props = {
	all: PoolSchedule[];
	/** schedules posted to take over on their start dates */
	upcoming?: PoolSchedule[];
	/** the city's, which close every pool */
	holidays?: CityHoliday[];
	/** the grid's program and pool filters; without them, every pool's public sessions */
	filter?: GridFilter | null;
	/** a fixed San Francisco date and time, "2026-11-26T10:00", in place of
	    the live clock; the preview page passes it */
	at?: string | null;
};

/**
 * Status is deliberately a separate channel from pool identity: the chip
 * always carries the pool's token color, so status reads from a glyph and a
 * word in ink rather than from a color. A filled dot is open, a ring is soon,
 * and a faint ring is later. The group heading carries it, once.
 */
const GLYPHS = {
	open: "bg-ink",
	soon: "ring-2 ring-ink ring-inset",
	later: "ring-2 ring-ink-2 ring-inset opacity-60",
};

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

/** the program names, with the full list on hover when it is shortened */
function Names({ names }: { names: string[] }) {
	const joined = joinNames(names);
	return (
		<span title={names.length > 2 ? names.join(", ") : undefined}>
			<ProgramName name={joined} />
		</span>
	);
}

/** chip and pool name, the name underlining while the row it heads is hovered */
function PoolName({ pool, weight }: { pool: PoolSchedule; weight: "font-semibold" | "font-normal" }) {
	return (
		<>
			<PoolChip token={getPoolToken(pool.id)} className="self-center" />
			<span className={`text-body ${weight} text-ink decoration-1 underline-offset-[3px] group-hover:underline`}>
				{poolLabel(pool)}
			</span>
		</>
	);
}

/**
 * A row that links as a whole to the pool's page with its sessions picked
 * out, like the grid's list of a cell's sessions
 */
function RowLink({
	pool,
	stretch,
	span = null,
	children,
}: {
	pool: PoolSchedule;
	stretch: Stretch | null;
	/** where the row's times sit against the other rows', as the grid's list shows */
	span?: SessionSpan | null;
	children: React.ReactNode;
}) {
	return (
		<li className="border-b border-line">
			<Link
				href={poolSessionHref(pool.id, stretch?.running ?? [])}
				className="group relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 py-3"
			>
				{children}
				{span ? <SessionBar span={span} className="text-label" /> : null}
			</Link>
		</li>
	);
}

function OpenRow({
	standing,
	kind,
	now,
	bar,
}: {
	standing: OpenStanding;
	kind: "open" | "soon";
	now: number;
	bar: SessionSpan;
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
			: `Starts in ${formatDuration(stretch.start - now)}`;
	const detail = kind === "open" ? `until ${stretch.namesEndTime}` : span;

	return (
		<RowLink pool={pool} stretch={stretch} span={bar}>
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
			</div>
			<div className="text-right">
				<div className={`whitespace-nowrap text-body font-semibold ${tone}`}>{headline}</div>
				<div className="whitespace-nowrap font-mono text-label font-medium text-ink-2">{detail}</div>
			</div>
		</RowLink>
	);
}

function LaterRow({ standing }: { standing: LaterStanding }) {
	const { pool, day, stretch, note, closedFor } = standing;
	const tone = stretch?.restricted ? "text-ink-2" : "text-ink";
	return (
		<RowLink pool={pool} stretch={stretch}>
			<div className="min-w-0">
				<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
					<PoolName pool={pool} weight="font-semibold" />
					{stretch ? (
						<span className="text-body text-ink-2">
							<Names names={stretch.names} />
						</span>
					) : null}
					{stretch?.restricted ? <span className="tag self-center">{stretch.restricted}</span> : null}
				</div>
				{closedFor ? <p className="mt-1 text-small font-medium text-alert">{closedFor}</p> : null}
				{stretch?.then ? (
					<p className="mt-1 text-small text-ink-2">
						then <Names names={stretch.then.names} /> at {stretch.then.at}
					</p>
				) : null}
			</div>
			{stretch ? (
				<div className="text-right">
					<div className={`whitespace-nowrap text-body font-semibold ${tone}`}>{day}</div>
					<div className="whitespace-nowrap font-mono text-label font-medium text-ink-2">
						{stretch.startTime}–{stretch.namesEndTime}
					</div>
				</div>
			) : (
				<div className="text-right text-small text-ink-2">{note}</div>
			)}
		</RowLink>
	);
}

function Section({
	first = false,
	label,
	glyph,
	count,
	empty,
	children,
}: {
	first?: boolean;
	label: string;
	glyph: string;
	count: number;
	empty: string;
	children: React.ReactNode;
}) {
	return (
		<section className={first ? "mt-3" : "mt-8"}>
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

/**
 * Where every pool stands: open now, opening later today, and its first
 * opening after today, counting what the grid's filters pick. It fills the
 * panel under the grid until a cell is picked.
 */
export default function NowSoon({ all, upcoming = [], holidays = [], filter = null, at = null }: Props) {
	const [liveNow, setLiveNow] = useState(() => getNowInPT());
	const fixedNow = useMemo(() => (at ? pacificMoment(at) : null), [at]);
	const now = fixedNow ?? liveNow;

	useEffect(() => {
		if (fixedNow) return;
		const id = setInterval(() => setLiveNow(getNowInPT()), 60_000);
		return () => clearInterval(id);
	}, [fixedNow]);

	const calendar = useMemo(() => createPoolCalendar(all, upcoming, holidays), [all, upcoming, holidays]);
	// just the picked pools, rather than the rest saying they have nothing
	const pools = useMemo(() => {
		const picked = filter?.poolSet;
		return picked ? all.filter((p) => picked.has(p.id)) : all;
	}, [all, filter]);
	const counted = useMemo(() => (filter ? nowSoonFilter(filter) : PUBLIC_SESSIONS), [filter]);
	const view = useMemo(() => nowSoon(pools, calendar, now, counted), [pools, calendar, now, counted]);
	const spans = useMemo(() => nowSoonSpans(view.open, view.soon, now.minutes), [view, now.minutes]);

	return (
		<div className="font-sans text-ink">
			<div className="flex items-baseline justify-between gap-4">
				<h2 className="text-body font-semibold text-ink">Now &amp; soon</h2>
				<span className="text-small text-ink-2">
					{now.day.slice(0, 3)} {now.display} Pacific
				</span>
			</div>

			<Section first label="Now" glyph={GLYPHS.open} count={view.open.length} empty={`No pools have ${view.noun} running right now.`}>
				{view.open.map((s, i) => (
					<OpenRow key={s.pool.id} standing={s} kind="open" now={now.minutes} bar={spans.open[i]} />
				))}
			</Section>
			{/* nothing more today needs no section of its own; Later has the rest */}
			{view.soon.length ? (
				<Section label="Soon" glyph={GLYPHS.soon} count={view.soon.length} empty="">
					{view.soon.map((s, i) => (
						<OpenRow key={s.pool.id} standing={s} kind="soon" now={now.minutes} bar={spans.soon[i]} />
					))}
				</Section>
			) : null}
			<Section label="Later" glyph={GLYPHS.later} count={view.later.length} empty="">
				{view.later.map((s) => (
					<LaterRow key={s.pool.id} standing={s} />
				))}
			</Section>
		</div>
	);
}
