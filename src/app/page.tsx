import { Suspense } from "react";
import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import type { PoolSchedule } from "@/lib/pdf-processor";
import AvailabilityGrid from "@/components/AvailabilityGrid";
import HeaderAnimation from "@/components/header/HeaderAnimation";
import { HEADER_HEIGHT } from "@/components/header/HeaderPlaceholder";
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
				<HeaderAnimation />
			</header>
			<nav className="flex flex-wrap justify-end gap-3 border-b border-[#e2e8ec] pb-2">
				<Link
					href="/now"
					className="plex-mono text-caption font-medium text-[#5a707c] underline underline-offset-2"
				>
					NOW &amp; SOON
				</Link>
				<Link
					href="/schedules"
					className="plex-mono text-caption font-medium text-[#5a707c] underline underline-offset-2"
				>
					FULL SCHEDULES →
				</Link>
			</nav>
			<Suspense
				fallback={
					<div className="plex-sans mt-4 border-l-[3px] border-[#c4d2d9] bg-[#f7fafb] px-3 py-2.5 text-body text-[#5a707c]">
						Loading…
					</div>
				}
			>
				<AvailabilityGrid all={all} alerts={alerts} />
			</Suspense>
		</main>
	);
}
