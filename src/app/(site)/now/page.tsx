import { Suspense } from "react";
import type { Metadata } from "next";
import NowSoon from "@/components/NowSoon";
import { loadCityHolidays, loadSchedules, loadUpcomingSchedules } from "@/lib/site-data";

export const metadata: Metadata = {
	title: "Now & soon",
	description: "What is running right now across San Francisco public pools, and what starts soon.",
};

export default async function NowPage() {
	const [all, upcoming, holidays] = await Promise.all([loadSchedules(), loadUpcomingSchedules(), loadCityHolidays()]);

	return (
		<main>
			<header className="pt-6">
				<h1 className="text-title font-semibold leading-tight">Now &amp; soon</h1>
				<p className="mt-1.5 max-w-[62ch] text-body text-ink-2">
					Which pools you can swim at right now, what starts soon, and when the rest open next. Times are Pacific.
				</p>
			</header>

			{all.length > 0 ? (
				// the controls live in the url, which a static page only has in the browser
				<Suspense fallback={<div className="mt-4 bg-tint px-3 py-2.5 text-body text-ink-2">Loading…</div>}>
					<NowSoon all={all} upcoming={upcoming} holidays={holidays} />
				</Suspense>
			) : (
				<div className="mt-6 bg-tint px-3 py-2.5">
					<p className="text-body text-ink">No schedule data found yet.</p>
					<p className="mt-1 font-mono text-label font-semibold tracking-[.08em] text-ink-2">
						RUN THE PIPELINE
					</p>
					<pre className="mt-1.5 whitespace-pre-wrap font-mono text-small leading-relaxed text-ink-2">
						{`npm run scrape\nnpm run download-pdfs\nnpm run process-all-pdfs`}
					</pre>
				</div>
			)}
		</main>
	);
}
