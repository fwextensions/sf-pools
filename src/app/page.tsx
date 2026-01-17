import { Suspense } from "react";
import fs from "node:fs/promises";
import path from "node:path";
import type { PoolSchedule } from "@/lib/pdf-processor";
import HomeFilters from "@/components/HomeFilters";
import { AlertBanner } from "@/components/AlertBanner";
import type { AlertsData } from "../../scripts/scrape-alerts";

async function readAllSchedules(): Promise<PoolSchedule[] | null> {
	try {
		const file = path.join(process.cwd(), "public", "data", "all_schedules.json");
		const content = await fs.readFile(file, "utf-8");
		return JSON.parse(content) as PoolSchedule[];
	} catch {
		return null;
	}
}

async function readAlerts(): Promise<AlertsData | null> {
	try {
		const file = path.join(process.cwd(), "public", "data", "alerts.json");
		const content = await fs.readFile(file, "utf-8");
		return JSON.parse(content) as AlertsData;
	} catch {
		return null;
	}
}

export default async function HomePage() {
	const [all, alerts] = await Promise.all([readAllSchedules(), readAlerts()]);
	return (
		<main className="container py-8">
			<header>
				<h1 className="text-3xl font-semibold">SF Pools Schedule Viewer</h1>
				<p className="mt-2 text-slate-600">search programs across pools by day and type.</p>
			</header>

			{alerts && (alerts.siteWideAlerts.length > 0 || alerts.poolAlerts.length > 0) && (
				<div className="mt-4">
					<AlertBanner alerts={alerts} />
				</div>
			)}

			<div className="mt-6">
				{all && all.length > 0 ? (
					<Suspense fallback={<div className="rounded border border-slate-200 bg-white p-4">Loading filters…</div>}>
						<HomeFilters all={all} />
					</Suspense>
				) : (
					<div className="rounded border border-slate-200 bg-white p-4">
						<p className="text-slate-700">no schedule data found yet.</p>
						<p className="mt-2 text-sm text-slate-600">run the pipeline:</p>
						<pre className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm text-slate-800">{`npm run scrape\nnpm run download-pdfs\nnpm run process-all-pdfs`}</pre>
						<p className="mt-2 text-sm text-slate-600">
							or extract a single pool: <code className="rounded bg-slate-100 px-1">POST /api/extract-schedule</code>
						</p>
					</div>
				)}
			</div>
		</main>
	);
}
