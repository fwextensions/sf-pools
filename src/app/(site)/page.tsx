import { Suspense } from "react";
import AvailabilityGrid from "@/components/grid/AvailabilityGrid";
import { loadAlerts, loadSchedules, loadUpcomingSchedules } from "@/lib/site-data";

export default async function HomePage() {
	const [all, upcoming, alerts] = await Promise.all([loadSchedules(), loadUpcomingSchedules(), loadAlerts()]);

	return (
		<main>
			<Suspense
				fallback={
					<div className="font-sans mt-4 bg-tint px-3 py-2.5 text-body text-ink-2">
						Loading…
					</div>
				}
			>
				<AvailabilityGrid all={all} upcoming={upcoming} alerts={alerts} />
			</Suspense>
		</main>
	);
}
