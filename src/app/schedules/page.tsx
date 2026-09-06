import fs from "node:fs/promises";
import path from "node:path";
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import type { PoolSchedule, ProgramEntry } from "@/lib/pdf-processor";
import ClosureNotice from "@/components/ClosureNotice";
import ProgramName from "@/components/ProgramName";
import { toTitleCase } from "@/lib/program-taxonomy";
import { describeProgram } from "@/lib/program-display";
import { POOL_TOKENS, getPoolToken, type PoolToken } from "@/lib/pool-tokens";
import { formatScheduleDate, parseTimeToMinutes } from "@/lib/utils";

export const metadata: Metadata = {
	title: "Full schedules — SF Pools",
	description:
		"Every program on every San Francisco public pool weekly schedule.",
};

/**
 * Only jump-nav labels longer than this are allowed to truncate. Flex shrink is
 * proportional to a label's own width, so left alone it takes a slice off every
 * chip at once — and two pixels is all it takes to turn "Balboa" into "Balbo…"
 * while "North Beach (Warm)" stays readable. Short names are pinned to their
 * natural width and the long ones give up the whole difference instead.
 *
 * The row needs ~1040px of viewport to show every label in full; between that
 * and the 900px floor where labels appear at all, the two North Beach entries
 * are what shortens. Below 900px the labels drop and the codes stand alone.
 */
const SHRINKABLE_LABEL_CHARS = 10;

const DAYS: Array<ProgramEntry["dayOfWeek"]> = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
];

async function readSchedules(): Promise<PoolSchedule[] | null> {
	try {
		const file = path.join(process.cwd(), "public", "data", "all_schedules.json");
		const content = await fs.readFile(file, "utf-8");
		return JSON.parse(content) as PoolSchedule[];
	} catch {
		return null;
	}
}

function formatDate(d?: string | null): string {
	return formatScheduleDate(d, { year: "numeric", month: "short", day: "2-digit" });
}

function byStartTime(a: ProgramEntry, b: ProgramEntry): number {
	return parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime);
}

/**
 * Pools are listed in POOL_TOKENS order (BAL→SAV) so this page walks the pools
 * in the same fixed order the availability grid stacks its lanes in. Anything
 * without a token still renders, appended in file order.
 */
function orderPools(
	schedules: PoolSchedule[]
): Array<{ pool: PoolSchedule; token: PoolToken | null }> {
	const byId = new Map(schedules.map((p) => [p.id, p]));
	const out: Array<{ pool: PoolSchedule; token: PoolToken | null }> = [];
	for (const token of POOL_TOKENS) {
		const pool = byId.get(token.id);
		if (pool) {
			out.push({ pool, token });
			byId.delete(token.id);
		}
	}
	for (const pool of byId.values()) out.push({ pool, token: getPoolToken(pool.id) });
	return out;
}

/** meta line pieces, joined with a mono interpunct */
function MetaLine({ parts }: { parts: React.ReactNode[] }) {
	const shown = parts.filter(Boolean);
	if (!shown.length) return null;
	return (
		<div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 plex-mono text-[11px] font-medium tracking-[.06em] text-[#8a9aa4]">
			{shown.map((part, i) => (
				<span key={i} className="flex items-center gap-2">
					{i > 0 ? (
						<span aria-hidden className="text-[#c4d2d9]">
							·
						</span>
					) : null}
					{part}
				</span>
			))}
		</div>
	);
}

/**
 * The block repeats its start time even in the time-aligned grid, where the row
 * gutter already names it: the eye lands in the middle of a grid this size and
 * reads outward, so a block that only carried its end time would send you back
 * to the axis to find out when it began.
 *
 * `compact` drops the badges/notes and puts the time on the same line as the
 * name: a block sized to a 20-minute session has no room for a four-line
 * card, and a truncated name still beats a badge row spilling out of its box.
 */
function SessionBlock({
	program,
	color,
	compact = false,
}: {
	program: ProgramEntry;
	color: string;
	compact?: boolean;
}) {
	const { title, badges, notes } = describeProgram(program);
	if (compact) {
		return (
			<div
				className="flex h-full items-baseline gap-1.5 overflow-hidden border-l-[3px] bg-[#f7fafb] px-1.5 py-[3px]"
				style={{ borderColor: color }}
				title={`${program.startTime}–${program.endTime} ${title}`}
			>
				<span className="plex-mono text-[10px] font-medium text-[#5a707c]">{program.startTime}</span>
				<span className="truncate text-[12px] font-medium leading-snug text-[#0e2733]">
					<ProgramName name={title} />
				</span>
			</div>
		);
	}
	return (
		<div className="h-full overflow-hidden border-l-[3px] bg-[#f7fafb] px-2 py-1.5" style={{ borderColor: color }}>
			<div className="plex-mono text-[11px] font-medium text-[#5a707c]">
				{program.startTime}–{program.endTime}
			</div>
			{/* the badges ride in the space beside the title rather than under it:
			    a program name rarely fills its column, and a stacked badge row cost
			    every session a line of height it did not need */}
			<div className="mt-0.5 flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
				<div className="min-w-0 text-[13px] font-medium leading-snug text-[#0e2733]">
					<ProgramName name={title} />
				</div>
				{badges.length ? (
					<div className="ml-auto flex shrink-0 flex-wrap justify-end gap-1">
						{badges.map((badge) => (
							<span
								key={badge}
								className="border border-[#c4d2d9] bg-white px-1 py-px plex-mono text-[10px] font-medium text-[#5a707c]"
							>
								{badge}
							</span>
						))}
					</div>
				) : null}
			</div>
			{notes.map((note) => (
				<div key={note} className="mt-1 text-[11px] leading-snug text-[#8a9aa4]">
					{note}
				</div>
			))}
		</div>
	);
}

function DayColumn({
	day,
	programs,
	color,
}: {
	day: ProgramEntry["dayOfWeek"];
	programs: ProgramEntry[];
	color: string;
}) {
	return (
		<div className="min-w-0">
			<div className="border-b border-[#e2e8ec] pb-1 plex-mono text-[10px] font-semibold tracking-[.1em] text-[#5a707c]">
				{day.slice(0, 3).toUpperCase()}
			</div>
			{programs.length ? (
				<div className="mt-1 flex flex-col gap-[3px]">
					{programs.map((program, i) => (
						<SessionBlock key={i} program={program} color={color} />
					))}
				</div>
			) : (
				// mirrors an empty cell in the week grid rather than collapsing the
				// column, so the seven-day rhythm survives a quiet day
				<div className="mt-1 flex h-[22px] items-center justify-center bg-[#f5f8f9] plex-mono text-[11px] text-[#c4d2d9]">
					—
				</div>
			)}
		</div>
	);
}

/** Minutes since midnight, rounded outward to a half-hour, or null if unparseable. */
function floorHalfHour(min: number): number {
	return Math.floor(min / 30) * 30;
}
function ceilHalfHour(min: number): number {
	return Math.ceil(min / 30) * 30;
}

function minutesToClock(min: number): string {
	const h = Math.floor(min / 60) % 24;
	const m = min % 60;
	const suffix = h >= 12 ? "p" : "a";
	const h12 = h % 12 === 0 ? 12 : h % 12;
	return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

type TimedProgram = { program: ProgramEntry; startMin: number; endMin: number };

/** A program a whole day column, laid alongside its overlapping neighbors. */
type LaidOutProgram = TimedProgram & { lane: number; lanes: number };

/**
 * Greedy interval-graph coloring: sweep events by start time, drop each into
 * the first lane whose last occupant has already ended, opening a new lane
 * only when none is free. Events that never overlap anything end up alone in
 * lane 0 of a cluster of one, so the common case (no overlap) costs nothing —
 * only an actual double-booking (e.g. Family Swim run alongside Senior Swim)
 * pushes a program into a narrower side-by-side lane.
 */
function layoutDay(programs: ProgramEntry[]): LaidOutProgram[] {
	const timed: TimedProgram[] = [];
	for (const program of programs) {
		const startMin = parseTimeToMinutes(program.startTime);
		const endMin = parseTimeToMinutes(program.endTime);
		if (startMin === Number.MAX_SAFE_INTEGER || endMin === Number.MAX_SAFE_INTEGER) continue;
		timed.push({ program, startMin, endMin: Math.max(endMin, startMin + 15) });
	}
	timed.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

	const out: LaidOutProgram[] = [];
	let cluster: LaidOutProgram[] = [];
	let laneEnds: number[] = [];

	function flush() {
		if (!cluster.length) return;
		for (const item of cluster) item.lanes = laneEnds.length;
		out.push(...cluster);
		cluster = [];
		laneEnds = [];
	}

	for (const item of timed) {
		if (cluster.length && item.startMin >= Math.max(...laneEnds)) flush();

		let lane = laneEnds.findIndex((end) => end <= item.startMin);
		if (lane === -1) {
			lane = laneEnds.length;
			laneEnds.push(item.endMin);
		} else {
			laneEnds[lane] = item.endMin;
		}
		cluster.push({ ...item, lane, lanes: 1 });
	}
	flush();

	return out;
}

const PX_PER_MIN = 1.15;
const GUTTER_PX = 44;

/**
 * A real time axis: block height is proportional to a session's duration, so
 * a 2-hour Rentals block reads twice as tall as a 1-hour Rec Swim, and the
 * gaps where the pool is unstaffed are visibly empty instead of implied by
 * row spacing. All seven days share one [dayStart, dayEnd) range for the
 * pool, so a given clock time is the same pixel row in every column and
 * times still compare across days at a glance.
 *
 * Two programs at the same pool can genuinely overlap (a rental alongside a
 * lap lane, or two blocks the extractor split out of one schedule cell), and
 * a real calendar can't just stack them without lying about the hour — so an
 * overlapping cluster splits into side-by-side lanes (layoutDay) instead of
 * one ever-taller single column. Most cells never overlap and stay full width.
 */
function WeekTimeline({
	byDay,
	color,
}: {
	byDay: Array<{ day: ProgramEntry["dayOfWeek"]; programs: ProgramEntry[] }>;
	color: string;
}) {
	const laidOutByDay = byDay.map(({ day, programs }) => ({ day, items: layoutDay(programs) }));

	const allMinutes = laidOutByDay.flatMap(({ items }) => items.flatMap((i) => [i.startMin, i.endMin]));
	if (!allMinutes.length) return null;

	const dayStart = floorHalfHour(Math.min(...allMinutes));
	const dayEnd = ceilHalfHour(Math.max(...allMinutes));
	const totalMin = Math.max(dayEnd - dayStart, 30);
	const heightPx = totalMin * PX_PER_MIN;

	const ticks: number[] = [];
	for (let t = dayStart; t <= dayEnd; t += 30) ticks.push(t);

	// unparseable times can't be placed on an axis; they still render, listed
	// beneath that day's column rather than silently dropped
	const unplacedByDay = byDay.map(({ programs }) =>
		programs.filter(
			(p) =>
				parseTimeToMinutes(p.startTime) === Number.MAX_SAFE_INTEGER ||
				parseTimeToMinutes(p.endTime) === Number.MAX_SAFE_INTEGER
		)
	);

	return (
		<div
			className="hidden min-[900px]:grid"
			style={{ gridTemplateColumns: `${GUTTER_PX}px repeat(7, minmax(0, 1fr))`, columnGap: 3 }}
		>
			{/* the day names ride down the page under the pool's pinned name, so a
			    session two screens into a schedule still has a column heading. The
			    strip behind them spans the time gutter and the column gaps, which
			    the seven cells alone would let the rows show through. */}
			<div
				aria-hidden
				style={{ gridRow: 1, gridColumn: "1 / -1", top: "var(--schedule-day-row-top)" }}
				className="sticky z-[3] bg-white"
			/>
			{DAYS.map((day, i) => (
				<div
					key={day}
					style={{ gridRow: 1, gridColumn: i + 2, top: "var(--schedule-day-row-top)" }}
					// the breathing room above the labels is padding on the pinned row
					// itself, not a margin above the grid: a margin is outside the
					// sticky box, so it collapses the moment the row pins and the
					// sessions scroll up through the space it was holding
					className="sticky z-[4] border-b border-[#e2e8ec] bg-white pt-3 pb-1 plex-mono text-[10px] font-semibold tracking-[.1em] text-[#5a707c]"
				>
					{day.slice(0, 3).toUpperCase()}
				</div>
			))}

			{/* time gutter */}
			<div style={{ gridRow: 2, gridColumn: 1, height: heightPx }} className="relative">
				{ticks.map((t) => (
					<div
						key={t}
						className="absolute right-2 -translate-y-1/2 plex-mono text-[10px] font-medium text-[#8a9aa4]"
						style={{ top: (t - dayStart) * PX_PER_MIN }}
					>
						{minutesToClock(t)}
					</div>
				))}
			</div>

			{laidOutByDay.map(({ day, items }, dayIndex) => (
				<div
					key={day}
					style={{ gridRow: 2, gridColumn: dayIndex + 2, height: heightPx }}
					className="relative border-l border-[#edf1f3]"
				>
					{/* hour/half-hour rules, so a quiet stretch still reads as time
					    passing rather than as empty space */}
					{ticks.map((t) => (
						<div
							key={t}
							aria-hidden
							className={t % 60 === 0 ? "absolute inset-x-0 border-t border-[#edf1f3]" : "absolute inset-x-0 border-t border-dotted border-[#edf1f3]"}
							style={{ top: (t - dayStart) * PX_PER_MIN }}
						/>
					))}

					{items.map((item, i) => {
						const top = (item.startMin - dayStart) * PX_PER_MIN;
						const height = (item.endMin - item.startMin) * PX_PER_MIN;
						const widthPct = 100 / item.lanes;
						return (
							<div
								key={i}
								className="absolute overflow-hidden"
								style={{
									top,
									height,
									left: `${item.lane * widthPct}%`,
									width: `calc(${widthPct}% - 3px)`,
								}}
							>
								<SessionBlock program={item.program} color={color} compact={height < 46} />
							</div>
						);
					})}

					{unplacedByDay[dayIndex]?.length ? (
						<div className="absolute inset-x-0 flex flex-col gap-[3px]" style={{ top: heightPx + 6 }}>
							{unplacedByDay[dayIndex].map((program, i) => (
								<SessionBlock key={i} program={program} color={color} />
							))}
						</div>
					) : null}
				</div>
			))}

			{unplacedByDay.some((u) => u.length) ? (
				<div
					style={{ gridRow: 3, gridColumn: "1 / -1" }}
					className="mt-2 plex-mono text-[10px] font-medium text-[#c4d2d9]"
				>
					Sessions with times this page can&rsquo;t parse are listed below their day, off the axis.
				</div>
			) : null}
		</div>
	);
}

export default async function SchedulesPage() {
	const schedules = await readSchedules();
	const pools = schedules?.length ? orderPools(schedules) : [];

	return (
		<main className="plex-sans container py-8 text-[#0e2733]">
			<header className="border-b-2 border-[#0e2733] pb-3">
				<div className="plex-mono text-[11px] font-semibold tracking-[.14em] text-[#8a9aa4]">
					SF PUBLIC POOLS
				</div>
				<div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
					<h1 className="text-[26px] font-semibold leading-tight">Full schedules</h1>
					<Link
						href="/"
						className="plex-mono text-[12px] font-medium text-[#5a707c] underline underline-offset-2"
					>
						← WEEK GRID
					</Link>
				</div>
				<p className="mt-1.5 max-w-[62ch] text-[14px] text-[#5a707c]">
					Every program on every pool&rsquo;s weekly schedule. Times are Pacific.
				</p>
			</header>

			{!pools.length ? (
				<div className="mt-6 border-l-[3px] border-[#c4d2d9] bg-[#f7fafb] px-3 py-2.5 text-[14px] text-[#5a707c]">
					No schedule data found.
				</div>
			) : (
				<>
					{/* The pool codes double as the legend, same chips the grid uses.
					    Every chip stays on screen: the nav never scrolls (its height is
					    the anchor offset every section depends on). On a phone that
					    means two rows of five, which leaves each chip wide enough to
					    carry its name; from 900px up the ten fit one row and the labels
					    shrink and ellipsis instead. Short names rather than full ones
					    both because they fit and because they are what the grid's
					    legend calls these pools. */}
					<nav
						aria-label="Jump to a pool"
						className="sticky top-0 z-10 grid h-[var(--schedule-nav-h)] grid-cols-5 content-center gap-0.5 overflow-hidden border-b border-[#e2e8ec] bg-white min-[900px]:flex min-[900px]:items-center min-[900px]:gap-1"
					>
						{pools.map(({ pool, token }) => {
							const label = token?.name ?? pool.shortName ?? toTitleCase(pool.name);
							// five to a row leaves a phone chip about 60px of text, which
							// fits every name but the two North Beach pools
							const phoneLabel = label.replace(/^North Beach \((\w+)\)$/, "NB $1");
							const shrink =
								label.length > SHRINKABLE_LABEL_CHARS ? "shrink" : "shrink-0";
							return (
								<a
									key={pool.id}
									href={`#pool-${pool.id}`}
									title={label}
									// a grid cell on a phone, so five chips share the width
									// evenly; from 900px up each chip sizes to its own label
									className={`pool-jump-chip flex min-w-0 items-center gap-1 border border-[#e2e8ec] bg-white py-1 pl-1 pr-0.5 min-[900px]:grow-0 min-[900px]:basis-auto min-[900px]:gap-1.5 min-[900px]:pl-1 min-[900px]:pr-2 ${shrink}`}
									style={{ "--pool-color": token?.color ?? "#5a707c" } as CSSProperties}
								>
									{/* the code chip is the legend the grid and the section
									    headers use. On a phone the name is worth more than the
									    code and the chip's left edge carries the colour — but
									    below 400px five names to a row start clipping, so the
									    narrowest phones get the codes back, two rows of five. */}
									<span
										aria-hidden
										className="mx-auto flex h-[16px] w-[26px] flex-none items-center justify-center plex-mono text-[10px] font-semibold text-white min-[400px]:hidden min-[900px]:mx-0 min-[900px]:flex"
										style={{ background: token?.color ?? "#5a707c" }}
									>
										{token?.code ?? "—"}
									</span>
									<span className="hidden min-w-0 truncate text-[11px] font-medium text-[#37474f] min-[400px]:block min-[900px]:hidden">
										{phoneLabel}
									</span>
									<span className="hidden min-w-0 truncate text-[12px] font-medium text-[#37474f] min-[900px]:block">
										{label}
									</span>
								</a>
							);
						})}
					</nav>

					{pools.map(({ pool, token }) => {
						const color = token?.color ?? "#5a707c";
						const all = pool.programs || [];
						const byDay = DAYS.map((day) => ({
							day,
							programs: all.filter((p) => p.dayOfWeek === day).sort(byStartTime),
						}));
						const period = [
							pool.scheduleSeason,
							pool.scheduleStartDate ? formatDate(pool.scheduleStartDate) : null,
							pool.scheduleEndDate ? `– ${formatDate(pool.scheduleEndDate)}` : null,
						]
							.filter(Boolean)
							.join(" ");

						return (
							<section key={pool.id} id={`pool-${pool.id}`} className="scroll-mt-[var(--schedule-nav-h)] pt-7">
								{/* the pool's name follows its programs down the page, pinned
								    directly under the jump nav, so a session three screens into
								    a schedule still says whose pool it is. Only the identity row
								    sticks; the season, address and PDF link scroll away, since a
								    third of the screen held down by chrome is worse than the
								    question it answers. Below the nav's z-index, so the two never
								    bleed into each other. */}
								<header
									// the hairline is drawn outside the box so it reads as the
									// pinned bar's edge over the sessions passing under it,
									// without adding a rule between the name and the meta line
									className="sticky top-[var(--schedule-nav-h)] z-[5] border-t-[3px] bg-white pt-2.5 pb-2 shadow-[0_1px_0_#e2e8ec]"
									style={{ borderColor: color }}
								>
									<div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
										<span
											className="px-1.5 py-[3px] plex-mono text-[11px] font-semibold text-white"
											style={{ background: color }}
										>
											{token?.code ?? "—"}
										</span>
										<h2 className="text-[20px] font-semibold leading-tight">
											{toTitleCase(pool.name)}
										</h2>
										<span className="plex-mono text-[11px] font-medium text-[#8a9aa4]">
											{all.length} SESSION{all.length === 1 ? "" : "S"}
										</span>
									</div>
								</header>
								<MetaLine
									parts={[
										period ? <span className="uppercase">{period}</span> : null,
										pool.address ? <span className="uppercase">{pool.address}</span> : null,
										pool.lanes ? <span>{pool.lanes} LANES</span> : null,
										pool.pdfScheduleUrl ? (
											<a
												href={pool.pdfScheduleUrl}
												target="_blank"
												rel="noreferrer"
												className="text-[#5a707c] underline underline-offset-2"
											>
												SOURCE PDF ↗
											</a>
										) : null,
									]}
								/>

								{pool.closure ? (
									<div className="mt-3">
										<ClosureNotice closure={pool.closure} poolName={toTitleCase(pool.name)} />
									</div>
								) : null}

								{all.length ? (
									<>
										<WeekTimeline byDay={byDay} color={color} />
										{/* narrow screens show one day at a time, where aligning
										    across days buys nothing and seven columns will not fit */}
										<div className="mt-3 flex flex-col gap-4 min-[900px]:hidden">
											{byDay.map(({ day, programs }) => (
												<DayColumn key={day} day={day} programs={programs} color={color} />
											))}
										</div>
									</>
								) : !pool.closure ? (
									<div className="mt-3 border-l-[3px] border-[#c4d2d9] bg-[#f7fafb] px-3 py-2.5 text-[14px] text-[#5a707c]">
										No programs listed for this pool.
									</div>
								) : null}
							</section>
						);
					})}
				</>
			)}
		</main>
	);
}
