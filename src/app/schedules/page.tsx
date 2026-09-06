import fs from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import type { PoolSchedule, ProgramEntry } from "@/lib/pdf-processor";
import ClosureNotice from "@/components/ClosureNotice";
import ProgramName from "@/components/ProgramName";
import { toTitleCase, programLocationQualifier } from "@/lib/program-taxonomy";
import { POOL_TOKENS, getPoolToken, type PoolToken } from "@/lib/pool-tokens";
import { parseTimeToMinutes } from "@/lib/utils";

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
	if (!d) return "";
	return new Date(d).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "2-digit",
		timeZone: "America/Los_Angeles",
	});
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
 */
function SessionBlock({ program, color }: { program: ProgramEntry; color: string }) {
	const qualifier = programLocationQualifier(program.programNameOriginal);
	return (
		<div className="border-l-[3px] bg-[#f7fafb] px-2 py-1.5" style={{ borderColor: color }}>
			<div className="plex-mono text-[11px] font-medium text-[#5a707c]">
				{program.startTime}–{program.endTime}
			</div>
			<div className="mt-0.5 text-[13px] font-medium leading-snug text-[#0e2733]">
				<ProgramName name={program.programName} />
			</div>
			{qualifier || program.lanes ? (
				<div className="mt-1 flex flex-wrap gap-1">
					{qualifier ? (
						<span className="border border-[#c4d2d9] bg-white px-1 py-px plex-mono text-[10px] font-medium text-[#5a707c]">
							{qualifier}
						</span>
					) : null}
					{program.lanes ? (
						<span className="border border-[#c4d2d9] bg-white px-1 py-px plex-mono text-[10px] font-medium text-[#5a707c]">
							{program.lanes} LN
						</span>
					) : null}
				</div>
			) : null}
			{program.notes ? (
				<div className="mt-1 text-[11px] leading-snug text-[#8a9aa4]">{program.notes}</div>
			) : null}
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

/**
 * The stacked-by-day layout gives each column its own independent run of blocks,
 * so 9:00a on Monday sits at whatever height Monday's earlier sessions happen to
 * push it to and lines up with nothing on Tuesday. This lays the week on a shared
 * vertical axis instead: one row per distinct start time across the pool's week,
 * so a given time is the same band in all seven columns and the eye can compare
 * days by scanning across.
 *
 * Rows are keyed on the raw startTime string, ordered by parsed minutes. Keying
 * on the string rather than the parsed value means a time this build cannot parse
 * still gets its own row and its programs still render, instead of silently
 * dropping out of the grid.
 *
 * The rows are the distinct times only, not a uniform hour scale — with 9-15 of
 * them per pool a proportional 6a-9p axis would leave most of the page empty and
 * squeeze each block far below a readable height. The home page's availability
 * grid already carries the proportional view; this one trades exact spacing for
 * legible text while keeping the alignment.
 */
function WeekGrid({
	byDay,
	color,
}: {
	byDay: Array<{ day: ProgramEntry["dayOfWeek"]; programs: ProgramEntry[] }>;
	color: string;
}) {
	const times = Array.from(
		new Set(byDay.flatMap(({ programs }) => programs.map((p) => p.startTime)))
	).sort((a, b) => parseTimeToMinutes(a) - parseTimeToMinutes(b));
	const rowOf = new Map(times.map((t, i) => [t, i]));

	// several programs can share one day + start time (the extractor splits a
	// time block that shows two programs across different lanes), so a cell
	// holds a list rather than a single session
	const cells = new Map<string, ProgramEntry[]>();
	byDay.forEach(({ programs }, dayIndex) => {
		for (const program of programs) {
			const key = `${rowOf.get(program.startTime)}|${dayIndex}`;
			const list = cells.get(key);
			if (list) list.push(program);
			else cells.set(key, [program]);
		}
	});

	return (
		<div
			className="mt-3 hidden min-[900px]:grid"
			style={{ gridTemplateColumns: "52px repeat(7, minmax(0, 1fr))", columnGap: 3 }}
		>
			{DAYS.map((day, i) => (
				<div
					key={day}
					style={{ gridRow: 1, gridColumn: i + 2 }}
					className="border-b border-[#e2e8ec] pb-1 plex-mono text-[10px] font-semibold tracking-[.1em] text-[#5a707c]"
				>
					{day.slice(0, 3).toUpperCase()}
				</div>
			))}

			{/* a rule spanning the day columns, so a row still reads across the full
			    width where no day has a session at that time */}
			{times.map((time, r) => (
				<div
					key={`rule-${time}`}
					aria-hidden
					style={{ gridRow: r + 2, gridColumn: "2 / -1" }}
					className="border-t border-[#edf1f3]"
				/>
			))}

			{times.map((time, r) => (
				<div
					key={`time-${time}`}
					style={{ gridRow: r + 2, gridColumn: 1 }}
					className="border-t border-[#edf1f3] pr-2 pt-[5px] text-right plex-mono text-[10px] font-medium text-[#8a9aa4]"
				>
					{time}
				</div>
			))}

			{Array.from(cells.entries()).map(([key, programs]) => {
				const [r, c] = key.split("|").map(Number);
				return (
					<div
						key={key}
						style={{ gridRow: r! + 2, gridColumn: c! + 2 }}
						className="flex min-w-0 flex-col gap-[3px] pt-[5px]"
					>
						{programs.map((program, i) => (
							<SessionBlock key={i} program={program} color={color} />
						))}
					</div>
				);
			})}
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
					    Every chip stays on screen: the row never scrolls or wraps (its
					    height is the anchor offset every section depends on), so the
					    labels shrink and ellipsis instead. Short names rather than full
					    ones both because they fit and because they are what the grid's
					    legend calls these pools. Below the week grid's breakpoint the
					    label is dropped entirely and the codes stand alone. */}
					<nav
						aria-label="Jump to a pool"
						className="sticky top-0 z-10 flex h-[var(--schedule-nav-h)] items-center gap-0.5 overflow-hidden border-b border-[#e2e8ec] bg-white min-[900px]:gap-1"
					>
						{pools.map(({ pool, token }) => {
							const label = token?.name ?? pool.shortName ?? toTitleCase(pool.name);
							const shrink =
								label.length > SHRINKABLE_LABEL_CHARS ? "shrink" : "shrink-0";
							return (
								<a
									key={pool.id}
									href={`#pool-${pool.id}`}
									title={label}
									// below the label breakpoint the ten codes divide the row
									// evenly (basis-0 + grow), so they fit any width instead of
									// overflowing; above it each chip sizes to its own label
									className={`flex min-w-0 grow basis-0 items-center gap-1.5 border border-[#e2e8ec] bg-white px-0 py-1 min-[900px]:grow-0 min-[900px]:basis-auto min-[900px]:pl-1 min-[900px]:pr-2 ${shrink}`}
								>
									<span
										aria-hidden
										className="flex h-[16px] w-full flex-none items-center justify-center plex-mono text-[10px] font-semibold text-white min-[900px]:w-[26px]"
										style={{ background: token?.color ?? "#5a707c" }}
									>
										{token?.code ?? "—"}
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
								<header className="border-t-[3px] pt-2.5" style={{ borderColor: color }}>
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
								</header>

								{pool.closure ? (
									<div className="mt-3">
										<ClosureNotice closure={pool.closure} poolName={toTitleCase(pool.name)} />
									</div>
								) : null}

								{all.length ? (
									<>
										<WeekGrid byDay={byDay} color={color} />
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
