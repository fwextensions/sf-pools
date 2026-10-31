import type { Metadata } from "next";
import PoolAnchorRedirect from "@/components/pools/PoolAnchorRedirect";
import PoolList from "@/components/pools/PoolList";
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

			<PoolList pages={pages} className="mt-3 border-t-2 border-ink" />
			<PoolAnchorRedirect />
		</main>
	);
}
