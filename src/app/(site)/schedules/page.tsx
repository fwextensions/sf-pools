import type { CSSProperties } from "react";
import type { Metadata } from "next";
import type { PoolSchedule } from "@/lib/schedule-schema";
import PoolChip from "@/components/PoolChip";
import PoolScheduleSection from "@/components/schedule/PoolScheduleSection";
import { toTitleCase } from "@/lib/program-taxonomy";
import { poolPageHref } from "@/lib/pool-pages";
import { POOL_TOKENS, getPoolToken, type PoolToken } from "@/lib/pool-tokens";
import { loadSchedules } from "@/lib/site-data";

export const metadata: Metadata = {
	title: "Full schedules",
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
 * The North Beach pools are labelled "NB Cool" and "NB Warm" at every width,
 * since with the larger pool chips "North Beach (Cool)" no longer fits beside
 * the other nine at any width the container reaches, and its ellipsis cut off
 * the Cool/Warm that tells the two apart. The chip's title still spells out
 * the full name. Below 900px the labels drop and the codes stand alone.
 */
const SHRINKABLE_LABEL_CHARS = 10;

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

export default async function SchedulesPage() {
	const pools = orderPools(await loadSchedules());

	return (
		<main>
			<header className="pt-6 pb-3">
				<h1 className="text-title font-semibold leading-tight">Full schedules</h1>
				<p className="mt-1.5 max-w-[62ch] text-body text-ink-2">
					Every program on every pool&rsquo;s weekly schedule. Times are Pacific.
				</p>
			</header>

			{!pools.length ? (
				<div className="mt-6 bg-tint px-3 py-2.5 text-body text-ink-2">
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
						className="sticky top-[var(--site-sticky-h)] z-10 grid h-[var(--schedule-nav-h)] grid-cols-5 content-center gap-0.5 overflow-hidden border-b border-line bg-page min-[900px]:flex min-[900px]:items-center min-[900px]:gap-1"
					>
						{pools.map(({ pool, token }) => {
							const label = token?.name ?? pool.shortName ?? toTitleCase(pool.name);
							// five to a row leaves a phone chip about 60px of text, and the
							// desktop row has no room for the long form either
							const shortLabel = label.replace(/^North Beach \((\w+)\)$/, "NB $1");
							const shrink =
								shortLabel.length > SHRINKABLE_LABEL_CHARS ? "shrink" : "shrink-0";
							return (
								<a
									key={pool.id}
									href={`#pool-${pool.id}`}
									title={label}
									// a grid cell on a phone, so five chips share the width
									// evenly; from 900px up each chip sizes to its own label
									className={`pool-jump-chip flex min-w-0 items-center gap-1 border border-line bg-page py-1 pl-1 pr-0.5 min-[900px]:grow-0 min-[900px]:basis-auto min-[900px]:gap-1.5 min-[900px]:pl-1 min-[900px]:pr-2 ${shrink}`}
									style={{ "--pool-color": token?.color ?? "var(--color-ink-2)" } as CSSProperties}
								>
									{/* the code chip is the legend the grid and the section
									    headers use. On a phone the name is worth more than the
									    code and the chip's left edge carries the colour — but
									    below 400px five names to a row start clipping, so the
									    narrowest phones get the codes back, two rows of five. */}
									<PoolChip
										aria-hidden
										token={token}
										className="mx-auto min-[400px]:hidden min-[900px]:mx-0 min-[900px]:inline-block"
									/>
									<span className="hidden min-w-0 truncate text-label font-medium text-ink-2 min-[400px]:block min-[900px]:hidden">
										{shortLabel}
									</span>
									<span className="hidden min-w-0 truncate text-small font-medium text-ink-2 min-[900px]:block">
										{shortLabel}
									</span>
								</a>
							);
						})}
					</nav>

					{pools.map(({ pool, token }) => (
						<PoolScheduleSection key={pool.id} pool={pool} token={token} href={poolPageHref(pool.id)} />
					))}
				</>
			)}
		</main>
	);
}
