import fs from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import type { PoolSchedule } from "@/lib/pdf-processor";
import NowSoon from "@/components/NowSoon";

export const metadata: Metadata = {
	title: "Now & soon — SF Pools",
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
		<main className="plex-sans container py-8 text-[#0e2733]">
			<header className="border-b-2 border-[#0e2733] pb-3">
				<div className="plex-mono text-[11px] font-semibold tracking-[.14em] text-[#8a9aa4]">
					SF PUBLIC POOLS
				</div>
				<div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
					<h1 className="text-[26px] font-semibold leading-tight">Now &amp; soon</h1>
					<nav className="flex gap-3">
						<Link
							href="/"
							className="plex-mono text-[12px] font-medium text-[#5a707c] underline underline-offset-2"
						>
							← WEEK GRID
						</Link>
						<Link
							href="/schedules"
							className="plex-mono text-[12px] font-medium text-[#5a707c] underline underline-offset-2"
						>
							FULL SCHEDULES
						</Link>
					</nav>
				</div>
				<p className="mt-1.5 max-w-[62ch] text-[14px] text-[#5a707c]">
					What is running right now across the pools, and what starts soon. Times are Pacific.
				</p>
			</header>

			{all && all.length > 0 ? (
				<NowSoon all={all} />
			) : (
				<div className="mt-6 border-l-[3px] border-[#c4d2d9] bg-[#f7fafb] px-3 py-2.5">
					<p className="text-[14px] text-[#0e2733]">No schedule data found yet.</p>
					<p className="mt-1 plex-mono text-[11px] font-semibold tracking-[.14em] text-[#8a9aa4]">
						RUN THE PIPELINE
					</p>
					<pre className="mt-1.5 whitespace-pre-wrap plex-mono text-[12px] leading-relaxed text-[#37474f]">
						{`npm run scrape\nnpm run download-pdfs\nnpm run process-all-pdfs`}
					</pre>
				</div>
			)}
		</main>
	);
}
