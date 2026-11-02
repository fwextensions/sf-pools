import type { PoolSchedule, ProgramEntry } from "@/lib/schedule-schema";
import ClosureNotice from "@/components/ClosureNotice";
import ScheduledClosures from "@/components/ScheduledClosures";
import SessionBlock from "@/components/schedule/SessionBlock";
import TimelineBlock from "@/components/schedule/TimelineBlock";
import { toTitleCase } from "@/lib/program-taxonomy";
import type { PoolToken } from "@/lib/pool-tokens";
import { DAYS, programMinutes } from "@/lib/sessions";
import { parseTimeToMinutes } from "@/lib/time";
import { formatScheduleDate } from "@/lib/utils";

// One pool's weekly schedule, as a pool's own page shows it. Its day row pins
// straight under the site header.

// a time that doesn't parse sorts last
function startOrLast(p: ProgramEntry): number {
	return parseTimeToMinutes(p.startTime) ?? Number.MAX_SAFE_INTEGER;
}

function byStartTime(a: ProgramEntry, b: ProgramEntry): number {
	return startOrLast(a) - startOrLast(b);
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
			<div className="border-b border-line pb-1 font-mono text-label font-semibold tracking-[.08em] text-ink-2">
				{day.slice(0, 3).toUpperCase()}
			</div>
			{programs.length ? (
				<div className="mt-1 flex flex-col gap-[3px]">
					{programs.map((program, i) => (
						<SessionBlock key={i} program={program} color={color} row />
					))}
				</div>
			) : (
				// mirrors an empty cell in the week grid rather than collapsing the
				// column, so the seven-day rhythm survives a quiet day
				<div className="mt-1 flex h-[22px] items-center justify-center bg-tint font-mono text-label text-ink-2">
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
		const minutes = programMinutes(program);
		if (!minutes) continue;
		const { startMin, endMin } = minutes;
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
// wide enough for "10:30a" plus the labels' right inset. In rem, since the
// labels are: a px gutter let the longest ones poke out past the left edge,
// beyond the white of the pinned headers that cover the rest of the column
const GUTTER = "3.125rem";
// the hour labels are centred on their rules, so the first one rides half a
// line above the top of the axis. Dropping the axis this far keeps that label
// clear of the day row's white strip while the grid is still in its place on
// the page; once the day row pins, labels pass under it as they should
const AXIS_HEADROOM = "0.625rem";
// a block ends this many px short of its true end time, so back-to-back
// sessions (Learn to Swim into Rentals at the same 5:30 mark) get a hairline
// of open track between them instead of two borders touching edge to edge
const BLOCK_GAP_PX = 2;

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
	const unplacedByDay = byDay.map(({ programs }) => programs.filter((p) => !programMinutes(p)));

	return (
		<div
			className="hidden min-[900px]:grid"
			style={{ gridTemplateColumns: `${GUTTER} repeat(7, minmax(0, 1fr))`, columnGap: 3 }}
		>
			{/* the day names ride down the page under the site header, so a
			    session two screens into a schedule still has a column heading. The
			    strip behind them spans the time gutter and the column gaps, which
			    the seven cells alone would let the rows show through. */}
			<div
				aria-hidden
				style={{ gridRow: 1, gridColumn: "1 / -1", top: "var(--site-sticky-h)" }}
				className="sticky z-[3] bg-page"
			/>
			{DAYS.map((day, i) => (
				<div
					key={day}
					style={{ gridRow: 1, gridColumn: i + 2, top: "var(--site-sticky-h)" }}
					// the breathing room above the labels is padding on the pinned row
					// itself, not a margin above the grid: a margin is outside the
					// sticky box, so it collapses the moment the row pins and the
					// sessions scroll up through the space it was holding
					className="sticky z-[4] bg-page pt-3 pb-1 text-center font-mono text-label font-semibold tracking-[.08em] text-ink-2"
				>
					{day.slice(0, 3).toUpperCase()}
				</div>
			))}

			{/* time gutter */}
			<div style={{ gridRow: 2, gridColumn: 1, height: heightPx, marginTop: AXIS_HEADROOM }} className="relative">
				{ticks.map((t) => (
					<div
						key={t}
						className="absolute right-2 -translate-y-1/2 font-mono text-label font-medium text-ink-2"
						style={{ top: (t - dayStart) * PX_PER_MIN }}
					>
						{minutesToClock(t)}
					</div>
				))}
			</div>

			{laidOutByDay.map(({ day, items }, dayIndex) => (
				<div
					key={day}
					style={{ gridRow: 2, gridColumn: dayIndex + 2, height: heightPx, marginTop: AXIS_HEADROOM }}
					className="relative border-l border-line"
				>
					{/* hour/half-hour rules, so a quiet stretch still reads as time
					    passing rather than as empty space */}
					{ticks.map((t) => (
						<div
							key={t}
							aria-hidden
							className={t % 60 === 0 ? "absolute inset-x-0 border-t border-line" : "absolute inset-x-0 border-t border-dotted border-line"}
							style={{ top: (t - dayStart) * PX_PER_MIN }}
						/>
					))}

					{items.map((item, i) => {
						const top = (item.startMin - dayStart) * PX_PER_MIN;
						const height = Math.max(
							(item.endMin - item.startMin) * PX_PER_MIN - BLOCK_GAP_PX,
							4
						);
						const widthPct = 100 / item.lanes;
						return (
							<TimelineBlock
								key={i}
								program={item.program}
								color={color}
								compact={height < 46}
								style={{
									top,
									height,
									left: `${item.lane * widthPct}%`,
									width: `calc(${widthPct}% - 3px)`,
								}}
							/>
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
					className="mt-2 font-mono text-label font-medium text-ink-2"
				>
					Sessions with times this page can&rsquo;t parse are listed below their day, off the axis.
				</div>
			) : null}
		</div>
	);
}

type Props = {
	pool: PoolSchedule;
	token: PoolToken | null;
	/** the section's heading: the pool's page already names the pool */
	label: string;
};

export default function PoolScheduleSection({ pool, token, label }: Props) {
	const color = token?.color ?? "var(--color-ink-2)";
	const all = pool.programs || [];
	const byDay = DAYS.map((day) => ({
		day,
		programs: all.filter((p) => p.dayOfWeek === day).sort(byStartTime),
	}));
	const period = [
		pool.scheduleSeason ? toTitleCase(pool.scheduleSeason) : null,
		[pool.scheduleStartDate, pool.scheduleEndDate]
			.filter(Boolean)
			.map((d) => formatScheduleDate(d, { year: "numeric", month: "short", day: "numeric" }))
			.join(" – "),
	]
		.filter(Boolean)
		.join(" ");

	return (
		// ruled and labelled like the facts above it; a second pool's
		// schedule gets more room, so it doesn't read as the first one's tail
		<section id={`pool-${pool.id}`} className="mt-6 border-t border-line pt-2.5 [&+&]:mt-12">
			<h2 className="font-mono text-label font-semibold tracking-[.08em] text-ink-2 uppercase">{label}</h2>
			{period ? <p className="mt-0.5 text-body text-ink">{period}</p> : null}
			{pool.scheduledClosures?.length ? (
				<ScheduledClosures closures={pool.scheduledClosures} className="mt-0.5 text-body text-ink-2" />
			) : null}
			<p className="mt-0.5 text-body text-ink">
				{all.length} session{all.length === 1 ? "" : "s"}
				{pool.lanes ? ` · ${pool.lanes} lanes` : ""}
			</p>
			{pool.closure ? (
				<div className="mt-3">
					<ClosureNotice closure={pool.closure} poolName={toTitleCase(pool.name)} />
				</div>
			) : null}
			{/* with the day row's own top padding, this matches the space above
			    the section */}
			<div className="mt-3">
				<PoolWeek pool={pool} byDay={byDay} color={color} />
			</div>
		</section>
	);
}

/** the week itself: a time axis from 900px up, a list of days below that */
function PoolWeek({
	pool,
	byDay,
	color,
}: {
	pool: PoolSchedule;
	byDay: Array<{ day: ProgramEntry["dayOfWeek"]; programs: ProgramEntry[] }>;
	color: string;
}) {
	if (!byDay.some(({ programs }) => programs.length)) {
		return pool.closure ? null : (
			<div className="mt-3 bg-tint px-3 py-2.5 text-body text-ink-2">
				No programs listed for this pool.
			</div>
		);
	}

	return (
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
	);
}
