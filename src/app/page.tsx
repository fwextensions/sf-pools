import { Suspense } from "react";
import fs from "node:fs/promises";
import path from "node:path";
import type { PoolSchedule } from "@/lib/pdf-processor";
import HomeFilters from "@/components/HomeFilters";
import SFPoolsAnimation from "@/components/SFPoolsAnimation";
import { HEADER_HEIGHT } from "@/components/SFPPlaceholder";
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
			<header style={{ height: HEADER_HEIGHT }}>
				<SFPoolsAnimation />
			</header>
			<Suspense fallback={<div className="container py-8"><div className="rounded border border-slate-200 bg-white p-4">Loading…</div></div>}>
				<HomeFilters all={all} alerts={alerts} />
			</Suspense>
		</main>
	);
}
