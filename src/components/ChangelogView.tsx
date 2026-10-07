import Link from "next/link";
import {
	formatShortDate,
	type ChangeKind,
	type ChangeRow,
	type ChangelogDetail,
	type ChangelogSummary,
	type PoolChanges,
} from "@/lib/changelog-data";
import PoolChip from "./PoolChip";

const RAW_JSON_URL = "https://github.com/fwextensions/sf-pools/blob/main/data/changelog";

// a pool with more rows than this shows the first few and folds the rest away,
// so one reworked schedule doesn't bury the other pools
const FOLD_AFTER = 10;
const SHOWN_WHEN_FOLDED = 8;

const TAGS: Record<ChangeKind, { label: string; className: string }> = {
	moved: { label: "MOVED", className: "bg-tint text-ink-2" },
	added: { label: "NEW", className: "bg-[#e3f1f7] text-[#135e7a]" },
	removed: { label: "DROPPED", className: "bg-[#f8e8e8] text-[#8a2a2a]" },
};

function plural(count: number, one: string, many = `${one}s`): string {
	return `${count} ${count === 1 ? one : many}`;
}

function poolCounts(pool: PoolChanges): string {
	return [
		pool.moved && `${pool.moved} MOVED`,
		pool.added && `${pool.added} NEW`,
		pool.removed && `${pool.removed} DROPPED`,
	]
		.filter(Boolean)
		.join(" · ");
}

// On a phone each row stacks: day and tag, then the program, then the times.
// From 900px up it's one line in a six-column table, and the times wrapper
// dissolves so its three pieces take their own columns.
const ROW_GRID =
	"min-[900px]:grid-cols-[110px_minmax(0,1fr)_150px_24px_150px_84px] min-[900px]:items-center min-[900px]:gap-3";

// an empty was/now column holds a dash in the table, but on a phone the times
// share one line and a lone dash beside them reads as a stray mark
function Blank() {
	return <span className="hidden font-normal text-ink-2 min-[900px]:inline">—</span>;
}

function Row({ row }: { row: ChangeRow }) {
	const tag = TAGS[row.kind];
	return (
		<li
			className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-line py-2 text-body [grid-template-areas:'day_tag'_'program_program'_'times_times'] min-[900px]:min-h-9 min-[900px]:py-1.5 min-[900px]:[grid-template-areas:none] ${ROW_GRID}`}
		>
			<span className="font-medium [grid-area:day] min-[900px]:[grid-area:auto]">{row.day}</span>
			<span className="[grid-area:program] min-[900px]:[grid-area:auto]">{row.program}</span>
			<span className="flex items-baseline gap-2 [grid-area:times] min-[900px]:contents">
				<span className={row.kind === "removed" ? "text-ink-2 line-through" : "text-ink-2"}>
					{row.was ?? <Blank />}
				</span>
				<span aria-hidden className="text-ink-2">
					{row.kind === "moved" ? "→" : ""}
				</span>
				<span className="font-semibold">{row.now ?? <Blank />}</span>
			</span>
			<span
				className={`font-mono self-start justify-self-end px-1.5 py-0.5 text-label font-semibold tracking-[.08em] [grid-area:tag] min-[900px]:self-center min-[900px]:[grid-area:auto] ${tag.className}`}
			>
				{tag.label}
			</span>
		</li>
	);
}

function PoolSection({ pool }: { pool: PoolChanges }) {
	const folded = pool.rows.length > FOLD_AFTER;
	const shown = folded ? pool.rows.slice(0, SHOWN_WHEN_FOLDED) : pool.rows;
	const hidden = folded ? pool.rows.slice(SHOWN_WHEN_FOLDED) : [];

	return (
		<section className="flex flex-col">
			<div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-ink pb-2.5">
				{pool.token && <PoolChip token={pool.token} />}
				<h3 className="flex-1 whitespace-nowrap text-body font-semibold">{pool.name}</h3>
				<span className="font-mono text-label tracking-[.08em] text-ink-2">{poolCounts(pool)}</span>
			</div>
			<div
				aria-hidden
				className={`font-mono hidden border-b border-line pb-1.5 pt-2 text-label tracking-[.08em] text-ink-2 min-[900px]:grid ${ROW_GRID}`}
			>
				<span>DAY</span>
				<span>PROGRAM</span>
				<span>WAS</span>
				<span />
				<span>NOW</span>
				<span />
			</div>
			<ul>
				{shown.map((row, i) => (
					<Row key={i} row={row} />
				))}
			</ul>
			{folded && (
				// opening it hides the button along with revealing the rest; there's
				// no "show fewer", since the rows above it would jump out from under it
				<details className="[&[open]>summary]:hidden">
					<summary className="font-mono mt-2.5 inline-flex h-10 cursor-pointer list-none items-center border border-line-strong px-3.5 text-label font-semibold tracking-[.08em] hover:border-ink [&::-webkit-details-marker]:hidden">
						SHOW ALL {pool.rows.length} CHANGES
					</summary>
					<ul>
						{hidden.map((row, i) => (
							<Row key={i} row={row} />
						))}
					</ul>
				</details>
			)}
		</section>
	);
}

function UpdateList({ updates, current }: { updates: ChangelogSummary[]; current: string }) {
	return (
		<nav aria-label="Updates" className="flex flex-col border-t-2 border-ink min-[900px]:sticky min-[900px]:top-4">
			<div className="font-mono pb-2 pt-3 text-label font-semibold tracking-[.08em]">ALL UPDATES</div>
			{updates.map((update) => {
				const selected = update.date === current;
				return (
					<Link
						key={update.date}
						href={`/changes/${update.date}`}
						aria-current={selected ? "page" : undefined}
						className={`flex flex-col gap-1 border-b border-l-[3px] border-b-line py-3 pl-[11px] hover:bg-tint ${
							selected ? "border-l-ink bg-tint" : "border-l-transparent"
						}`}
					>
						<span className="font-mono text-small font-semibold tracking-[.04em]">
							{formatShortDate(update.date).toUpperCase()}
						</span>
						<span className="text-small text-ink-2">
							{plural(update.totalChanges, "change")} at {plural(update.poolsChanged, "pool")}
						</span>
						{update.newSeason && update.season && (
							<span className="font-mono self-start bg-[#e3f1f7] px-1.5 py-0.5 text-label font-semibold tracking-[.08em] text-[#135e7a]">
								NEW SEASON: {update.season.toUpperCase()}
							</span>
						)}
					</Link>
				);
			})}
		</nav>
	);
}

export default function ChangelogView({
	detail,
	updates,
}: {
	detail: ChangelogDetail | null;
	updates: ChangelogSummary[];
}) {
	const stats = detail && [
		{ value: detail.poolsChanged, label: "POOLS CHANGED" },
		{ value: detail.moved, label: "SESSIONS MOVED" },
		{ value: detail.added, label: "SESSIONS ADDED" },
		{ value: detail.removed, label: "SESSIONS DROPPED" },
	];
	const range =
		detail?.scheduleStartDate && detail.scheduleEndDate
			? `${formatShortDate(detail.scheduleStartDate)} – ${formatShortDate(detail.scheduleEndDate)}`
			: null;
	const seasonLine = [detail?.season, range].filter(Boolean).join(" · ").toUpperCase();

	return (
		<main>
			<header className="pt-6">
				<h1 className="text-title font-semibold leading-tight">Schedule changes</h1>
				<p className="mt-1.5 max-w-[62ch] text-body text-ink-2">
					What moved in each weekly update, pool by pool. The schedules are checked every Friday; weeks
					with no changes aren&rsquo;t listed. Times are Pacific.
				</p>
			</header>

			{!detail || !stats ? (
				<p className="mt-6 border-l-[3px] border-line-strong bg-tint px-3 py-2.5 text-body">
					No schedule changes have been recorded yet.
				</p>
			) : (
				<div className="mt-7 flex flex-col-reverse gap-12 min-[900px]:grid min-[900px]:grid-cols-[220px_minmax(0,1fr)] min-[900px]:items-start min-[900px]:gap-14">
					<UpdateList updates={updates} current={detail.date} />

					<article className="flex flex-col gap-9">
						<section className="flex flex-col gap-4 border-t-2 border-ink pt-4">
							<div className="flex flex-col gap-1 min-[900px]:flex-row min-[900px]:items-baseline min-[900px]:justify-between">
								<h2 className="text-heading font-semibold">
									{formatShortDate(detail.date, { weekday: "long", month: "long" })}
								</h2>
								{seasonLine && (
									<span className="font-mono text-label tracking-[.08em] text-ink-2">{seasonLine}</span>
								)}
							</div>
							<div className="grid grid-cols-2 gap-1 min-[900px]:grid-cols-4">
								{stats.map(({ value, label }) => (
									<div key={label} className="flex flex-col gap-1 bg-tint px-3.5 py-3">
										<span className="text-heading font-semibold">{value}</span>
										<span className="font-mono text-label tracking-[.08em] text-ink-2">{label}</span>
									</div>
								))}
							</div>
						</section>

						{detail.pools.map((pool) => (
							<PoolSection key={pool.name} pool={pool} />
						))}

						<div className="font-mono flex flex-wrap items-baseline justify-between gap-3 text-label tracking-[.08em]">
							<span className="flex gap-6">
								{detail.older && (
									<Link href={`/changes/${detail.older}`} className="link-inline">
										← {formatShortDate(detail.older).toUpperCase()}
									</Link>
								)}
								{detail.newer && (
									<Link href={`/changes/${detail.newer}`} className="link-inline">
										{formatShortDate(detail.newer).toUpperCase()} →
									</Link>
								)}
							</span>
							<a
								href={`${RAW_JSON_URL}/${detail.date}.json`}
								target="_blank"
								rel="noreferrer"
								className="link-utility"
							>
								Raw JSON ↗
							</a>
						</div>
					</article>
				</div>
			)}
		</main>
	);
}
