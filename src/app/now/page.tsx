import fs from "node:fs/promises";
import path from "node:path";
import type { PoolSchedule } from "@/lib/pdf-processor";
import NowSoon from "@/components/NowSoon";

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
		<main className="container py-8">
			<header className="mb-4">
				<h1 className="text-3xl font-semibold accent-left pl-3">Happening now & soon</h1>
				<p className="mt-2 text-slate-600">
					see what is running right now across pools, and what starts soon. times are shown in pacific time.
				</p>
				<nav className="mt-3 flex gap-4 text-sm">
					<a href="/" className="text-blue-700 hover:underline">Home</a>
					<a href="/schedules" className="text-blue-700 hover:underline">Full schedules</a>
				</nav>
			</header>

			{all && all.length > 0 ? (
				<NowSoon all={all} />
			) : (
				<div className="rounded border accent-border bg-white p-4">
					<p className="text-slate-700">no schedule data found yet.</p>
					<p className="mt-2 text-sm text-slate-600">run the pipeline:</p>
					<pre className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm text-slate-800">{`npm run scrape\nnpm run download-pdfs\nnpm run process-all-pdfs`}</pre>
				</div>
			)}
		</main>
	);
}
