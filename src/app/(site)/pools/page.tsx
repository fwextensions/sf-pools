import type { Metadata } from "next";
import Link from "next/link";
import PoolChip from "@/components/PoolChip";
import { buildPoolPages } from "@/lib/pool-pages";
import { loadPools, loadSchedules } from "@/lib/site-data";

export const metadata: Metadata = {
	title: "Pools",
	description: "San Francisco's public swimming pools, with each one's address and weekly swim schedule.",
	alternates: { canonical: "/pools" },
};

export default async function PoolsPage() {
	const [records, schedules] = await Promise.all([loadPools(), loadSchedules()]);
	const pages = buildPoolPages(records, schedules);

	return (
		<main>
			<header className="pt-6 pb-3">
				<h1 className="text-title font-semibold leading-tight">Pools</h1>
				<p className="mt-1.5 max-w-[62ch] text-body text-ink-2">
					San Francisco&rsquo;s public pools, run by SF Rec &amp; Parks. Each page has the pool&rsquo;s
					address and its full weekly schedule.
				</p>
			</header>

			<ul className="mt-3 flex flex-col border-t-2 border-ink">
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
									{page.name}
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
		</main>
	);
}
