import fs from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import type { PoolSchedule } from "@/lib/pdf-processor";
import NowSoon from "@/components/NowSoon";

export const metadata: Metadata = {
	title: "Now & soon",
	description: "What is running right now across San Francisco public pools, and what starts soon.",
};

async function readAllSchedules(): Promise<PoolSchedule[] | null> {
	try {
		const file = path.join(process.cwd(), "public", "data", "all_schedules.json");
		const content = await fs.readFile(file, "utf-8");
		return JSON.parse(content) as PoolSchedule[];
	} catch {
		return null;
	}
}

export default async function NowPage() {
	const all = await readAllSchedules();

	return (
		<main>
			<header className="pt-6">
				<h1 className="text-title font-semibold leading-tight">Now &amp; soon</h1>
				<p className="mt-1.5 max-w-[62ch] text-body text-ink-2">
					What is running right now across the pools, and what starts soon. Times are Pacific.
				</p>
			</header>

			{all && all.length > 0 ? (
				<NowSoon all={all} />
			) : (
				<div className="mt-6 border-l-[3px] border-line-strong bg-tint px-3 py-2.5">
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
