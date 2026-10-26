import { Suspense } from "react";
import AvailabilityGrid from "@/components/grid/AvailabilityGrid";
import { loadAlerts, loadCityHolidays, loadSchedules, loadUpcomingSchedules } from "@/lib/site-data";

export default async function HomePage() {
	const [all, upcoming, alerts, holidays] = await Promise.all([
		loadSchedules(),
		loadUpcomingSchedules(),
		loadAlerts(),
		loadCityHolidays(),
	]);

	return (
		<main>
			<Suspense
				fallback={
					<div className="font-sans mt-4 bg-tint px-3 py-2.5 text-body text-ink-2">
						Loading…
					</div>
				}
			>
				<AvailabilityGrid all={all} upcoming={upcoming} alerts={alerts} holidays={holidays} />
			</Suspense>
		</main>
	);
}
