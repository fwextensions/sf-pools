import Link from "next/link";
import {
	formatShortDate,
	type ChangeKind,
	type ChangeRow,
	type ChangelogDetail,
	type ChangelogSummary,
	type PoolChanges,
} from "@/lib/changelog-data";

const RAW_JSON_URL = "https://github.com/fwextensions/sf-pools/blob/main/data/changelog";

// a pool with more rows than this shows the first few and folds the rest away,
// so one reworked schedule doesn't bury the other pools
const FOLD_AFTER = 10;
const SHOWN_WHEN_FOLDED = 8;

const TAGS: Record<ChangeKind, { label: string; className: string }> = {
	moved: { label: "MOVED", className: "bg-[#eef2f4] text-[#3d5663]" },
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
	return <span className="hidden font-normal text-[#9aabb4] min-[900px]:inline">—</span>;
}

function Row({ row }: { row: ChangeRow }) {
	const tag = TAGS[row.kind];
	return (
		<li
			className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-[#eef2f4] py-2 text-[14px] [grid-template-areas:'day_tag'_'program_program'_'times_times'] min-[900px]:min-h-9 min-[900px]:py-1.5 min-[900px]:[grid-template-areas:none] ${ROW_GRID}`}
		>
			<span className="font-medium [grid-area:day] min-[900px]:[grid-area:auto]">{row.day}</span>
			<span className="[grid-area:program] min-[900px]:[grid-area:auto]">{row.program}</span>
			<span className="flex items-baseline gap-2 [grid-area:times] min-[900px]:contents">
				<span className={row.kind === "removed" ? "text-[#5a707c] line-through" : "text-[#5a707c]"}>
					{row.was ?? <Blank />}
				</span>
				<span aria-hidden className="text-[#5a707c]">
					{row.kind === "moved" ? "→" : ""}
				</span>
				<span className="font-semibold">{row.now ?? <Blank />}</span>
			</span>
			<span
				className={`plex-mono self-start justify-self-end px-1.5 py-0.5 text-[10px] font-semibold tracking-[.06em] [grid-area:tag] min-[900px]:self-center min-[900px]:[grid-area:auto] ${tag.className}`}
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
			<div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-[#0e2733] pb-2.5">
				{pool.token && (
					<span
						className="plex-mono px-[5px] py-[3px] text-[10px] font-semibold text-white"
						style={{ background: pool.token.color }}
					>
						{pool.token.code}
					</span>
				)}
				<h3 className="flex-1 whitespace-nowrap text-[16px] font-semibold">{pool.name}</h3>
				<span className="plex-mono text-[11px] tracking-[.06em] text-[#5a707c]">{poolCounts(pool)}</span>
			</div>
			<div
				aria-hidden
				className={`plex-mono hidden border-b border-[#e2e8ec] pb-1.5 pt-2 text-[10px] tracking-[.08em] text-[#5a707c] min-[900px]:grid ${ROW_GRID}`}
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
					<summary className="plex-mono mt-2.5 inline-flex h-10 cursor-pointer list-none items-center border border-[#c9d4da] px-3.5 text-[11px] font-semibold tracking-[.06em] hover:border-[#0e2733] [&::-webkit-details-marker]:hidden">
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
		<nav aria-label="Updates" className="flex flex-col border-t-2 border-[#0e2733] min-[900px]:sticky min-[900px]:top-4">
			<div className="plex-mono pb-2 pt-3 text-[11px] font-semibold tracking-[.08em]">ALL UPDATES</div>
			{updates.map((update) => {
				const selected = update.date === current;
				return (
					<Link
						key={update.date}
						href={`/changes/${update.date}`}
						aria-current={selected ? "page" : undefined}
						className={`flex flex-col gap-1 border-b border-l-[3px] border-b-[#e2e8ec] py-3 pl-[11px] hover:bg-[#f7fafb] ${
							selected ? "border-l-[#0e2733] bg-[#f7fafb]" : "border-l-transparent"
						}`}
					>
						<span className="plex-mono text-[12px] font-semibold tracking-[.04em]">
							{formatShortDate(update.date).toUpperCase()}
						</span>
						<span className="text-[13px] text-[#3d5663]">
							{plural(update.totalChanges, "change")} at {plural(update.poolsChanged, "pool")}
						</span>
						{update.newSeason && update.season && (
							<span className="plex-mono self-start bg-[#e3f1f7] px-1.5 py-0.5 text-[10px] font-semibold tracking-[.06em] text-[#135e7a]">
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
		{ value: detail.moved, label: "TIMES MOVED" },
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
				<h1 className="text-[26px] font-semibold leading-tight">Schedule changes</h1>
				<p className="mt-1.5 max-w-[62ch] text-[14px] text-[#5a707c]">
					What moved in each weekly update, pool by pool. The schedules are checked every Friday; weeks
					with no changes aren&rsquo;t listed. Times are Pacific.
				</p>
			</header>

			{!detail || !stats ? (
				<p className="mt-6 border-l-[3px] border-[#c4d2d9] bg-[#f7fafb] px-3 py-2.5 text-[14px]">
					No schedule changes have been recorded yet.
				</p>
			) : (
				<div className="mt-7 flex flex-col-reverse gap-12 min-[900px]:grid min-[900px]:grid-cols-[220px_minmax(0,1fr)] min-[900px]:items-start min-[900px]:gap-14">
					<UpdateList updates={updates} current={detail.date} />

					<article className="flex flex-col gap-9">
						<section className="flex flex-col gap-4 border-t-2 border-[#0e2733] pt-4">
							<div className="flex flex-col gap-1 min-[900px]:flex-row min-[900px]:items-baseline min-[900px]:justify-between">
								<h2 className="text-[20px] font-semibold">
									{formatShortDate(detail.date, { weekday: "long", month: "long" })}
								</h2>
								{seasonLine && (
									<span className="plex-mono text-[11px] tracking-[.06em] text-[#5a707c]">{seasonLine}</span>
								)}
							</div>
							<div className="grid grid-cols-2 gap-1 min-[900px]:grid-cols-4">
								{stats.map(({ value, label }) => (
									<div key={label} className="flex flex-col gap-1 bg-[#f7fafb] px-3.5 py-3">
										<span className="text-[22px] font-semibold">{value}</span>
										<span className="plex-mono text-[11px] tracking-[.06em] text-[#5a707c]">{label}</span>
									</div>
								))}
							</div>
						</section>

						{detail.pools.map((pool) => (
							<PoolSection key={pool.name} pool={pool} />
						))}

						<div className="plex-mono flex flex-wrap items-baseline justify-between gap-3 text-[11px] tracking-[.06em]">
							<span className="flex gap-6">
								{detail.older && (
									<Link href={`/changes/${detail.older}`} className="underline underline-offset-[3px]">
										← {formatShortDate(detail.older).toUpperCase()}
									</Link>
								)}
								{detail.newer && (
									<Link href={`/changes/${detail.newer}`} className="underline underline-offset-[3px]">
										{formatShortDate(detail.newer).toUpperCase()} →
									</Link>
								)}
							</span>
							<a
								href={`${RAW_JSON_URL}/${detail.date}.json`}
								target="_blank"
								rel="noreferrer"
								className="text-[#5a707c] underline underline-offset-[3px]"
							>
								RAW JSON ↗
							</a>
						</div>
					</article>
				</div>
			)}
		</main>
	);
}
