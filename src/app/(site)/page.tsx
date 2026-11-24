import type { Metadata } from "next";
import AvailabilityGrid from "@/components/grid/AvailabilityGrid";
import { pacificToday } from "@/lib/closures";
import { GRID_PENDING_SCRIPT } from "@/lib/grid/pending";
import { loadAlerts, loadCityHolidays, loadSchedules, loadUpcomingSchedules } from "@/lib/site-data";

const DESCRIPTION =
	"Lap swim, family swim, lessons and every other session at San Francisco's public pools, " +
	"in one weekly grid you can filter by program and pool, with what's open now.";

export const metadata: Metadata = {
	title: { absolute: "SF Pools: swim times at San Francisco's public pools" },
	description: DESCRIPTION,
	// every filter and cell is its own url; they all show this one page
	alternates: { canonical: "/" },
	openGraph: {
		siteName: "SF Pools",
		type: "website",
		url: "/",
		title: "SF Pools",
		description: DESCRIPTION,
	},
};

export default async function HomePage() {
	const [all, upcoming, alerts, holidays] = await Promise.all([
		loadSchedules(),
		loadUpcomingSchedules(),
		loadAlerts(),
		loadCityHolidays(),
	]);

	return (
		<main>
			{/* the tabs and the grid's headings already say what the page is to
			    a reader; this says it to search engines and screen readers */}
			<h1 className="sr-only">Swim times at San Francisco&rsquo;s public pools</h1>
			<script dangerouslySetInnerHTML={{ __html: GRID_PENDING_SCRIPT }} />
			<AvailabilityGrid all={all} upcoming={upcoming} alerts={alerts} holidays={holidays} today={pacificToday()} />
		</main>
	);
}
