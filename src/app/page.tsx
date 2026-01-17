import { Suspense } from "react";
import fs from "node:fs/promises";
import path from "node:path";
import type { PoolSchedule } from "@/lib/pdf-processor";
import HomeFilters from "@/components/HomeFilters";
import type { AlertsData } from "../../scripts/scrape-alerts";

async function readAllSchedules(): Promise<PoolSchedule[]> {
	try {
		const file = path.join(process.cwd(), "public", "data", "all_schedules.json");
		const content = await fs.readFile(file, "utf-8");
		return JSON.parse(content) as PoolSchedule[];
	} catch {
		return [];
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
			<Suspense fallback={<div className="container py-8"><div className="rounded border border-slate-200 bg-white p-4">Loading…</div></div>}>
				<HomeFilters all={all} alerts={alerts} />
			</Suspense>
		</main>
	);
}
