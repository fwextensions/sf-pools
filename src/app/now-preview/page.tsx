import { Suspense } from "react";
import type { Metadata } from "next";
import NowPreview from "@/components/NowPreview";
import { loadCityHolidays, loadSchedules, loadUpcomingSchedules } from "@/lib/site-data";

// Internal page showing Now & Soon as it would read at a chosen San Francisco
// date and time, for checking closures, holidays and schedule changeovers
// before they happen. Not linked from anywhere and kept out of search results;
// it sits outside the (site) group so it has no water, tabs or footer.
export const metadata: Metadata = {
	title: "Now & soon preview",
	robots: { index: false, follow: false },
};

export default async function NowPreviewPage() {
	const [all, upcoming, holidays] = await Promise.all([loadSchedules(), loadUpcomingSchedules(), loadCityHolidays()]);

	return (
		<main className="container py-6 font-sans text-ink">
			{/* the chosen time lives in the url, which a static page only has in the browser */}
			<Suspense fallback={<div className="bg-tint px-3 py-2.5 text-body text-ink-2">Loading…</div>}>
				<NowPreview all={all} upcoming={upcoming} holidays={holidays} />
			</Suspense>
		</main>
	);
}
