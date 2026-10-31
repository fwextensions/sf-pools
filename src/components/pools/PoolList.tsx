import Link from "next/link";
import PoolChip from "@/components/PoolChip";
import type { PoolPage } from "@/lib/pool-pages";

/**
 * A row per pool page, linking to it: the pools list shows every pool, and a
 * pool's own page shows the others below its schedule.
 */
export default function PoolList({ pages, className = "" }: { pages: PoolPage[]; className?: string }) {
	return (
		<ul className={`flex flex-col ${className}`}>
			{pages.map((page) => {
				const sessions = page.pools.reduce((n, { schedule }) => n + schedule.programs.length, 0);
				return (
					<li key={page.slug} className="border-b border-line">
						<Link
							href={`/pools/${page.slug}`}
							className="group flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3"
						>
							<span className="flex gap-1 self-center">
								{page.pools.map(({ schedule, token }) => (
									<PoolChip key={schedule.id} token={token} />
								))}
							</span>
							<span className="text-heading font-semibold leading-tight text-ink underline-offset-[3px] group-hover:underline">
								{page.facilityName}
							</span>
							<span className="text-body text-ink-2">{page.address}</span>
							<span className="ml-auto font-mono text-label font-medium text-ink-2">
								{sessions} SESSION{sessions === 1 ? "" : "S"} A WEEK
							</span>
						</Link>
					</li>
				);
			})}
		</ul>
	);
}
