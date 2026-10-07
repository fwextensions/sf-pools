import { Suspense } from "react";
import fs from "node:fs/promises";
import path from "node:path";
import type { PoolSchedule } from "@/lib/pdf-processor";
import AvailabilityGrid from "@/components/grid/AvailabilityGrid";
import type { AlertsData } from "../../../scripts/scrape-alerts";

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
		<main>
			<Suspense
				fallback={
					<div className="font-sans mt-4 bg-tint px-3 py-2.5 text-body text-ink-2">
						Loading…
					</div>
				}
			>
				<AvailabilityGrid all={all} alerts={alerts} />
			</Suspense>
		</main>
	);
}
