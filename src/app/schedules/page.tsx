import fs from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import type { PoolSchedule, ProgramEntry } from "@/lib/pdf-processor";
import ClosureNotice from "@/components/ClosureNotice";
import { toTitleCase, programLocationQualifier } from "@/lib/program-taxonomy";
import { POOL_TOKENS, getPoolToken, type PoolToken } from "@/lib/pool-tokens";
import { parseTimeToMinutes } from "@/lib/utils";

export const metadata: Metadata = {
	title: "Full schedules — SF Pools",
	description:
		"Every program on every San Francisco public pool weekly schedule.",
};

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

function SessionBlock({ program, color }: { program: ProgramEntry; color: string }) {
	const qualifier = programLocationQualifier(program.programNameOriginal);
	return (
		<div className="border-l-[3px] bg-[#f7fafb] px-2 py-1.5" style={{ borderColor: color }}>
			<div className="plex-mono text-[11px] font-medium text-[#5a707c]">
				{program.startTime}–{program.endTime}
			</div>
			<div className="mt-0.5 text-[13px] font-medium leading-snug text-[#0e2733]">
				{program.programName}
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
					{/* the pool codes double as the legend, same chips the grid uses */}
					<nav
						aria-label="Jump to a pool"
						className="nav-scroller sticky top-0 z-10 flex h-[var(--schedule-nav-h)] flex-nowrap items-center gap-1 overflow-x-auto border-b border-[#e2e8ec] bg-white"
					>
						{pools.map(({ pool, token }) => (
							<a
								key={pool.id}
								href={`#pool-${pool.id}`}
								className="flex flex-none items-center gap-1.5 border border-[#e2e8ec] bg-white py-1 pl-1 pr-1.5 sm:pr-2"
							>
								<span
									aria-hidden
									className="flex h-[16px] w-[26px] flex-none items-center justify-center plex-mono text-[10px] font-semibold text-white"
									style={{ background: token?.color ?? "#5a707c" }}
								>
									{token?.code ?? "—"}
								</span>
								<span className="hidden text-[12px] font-medium text-[#37474f] sm:inline">
									{toTitleCase(pool.name)}
								</span>
							</a>
						))}
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
									// one markup, two shapes: stacked days on narrow screens,
									// the grid's seven columns at the same breakpoint it uses
									<div className="mt-3 grid grid-cols-1 gap-x-[3px] gap-y-4 min-[900px]:grid-cols-7 min-[900px]:gap-y-0">
										{byDay.map(({ day, programs }) => (
											<DayColumn key={day} day={day} programs={programs} color={color} />
										))}
									</div>
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
