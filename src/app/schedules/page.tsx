import fs from "node:fs/promises";
import path from "node:path";
import type { PoolSchedule } from "@/lib/pdf-processor";
import { toTitleCase } from "@/lib/program-taxonomy";
import { CalendarIcon, MapPinIcon, ClockIcon } from "@/components/icons";

const DAYS: Array<PoolSchedule["programs"][number]["dayOfWeek"]> = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
];

async function readSchedules(): Promise<PoolSchedule[] | null> {
	try {
		const file = path.join(process.cwd(), "public", "data", "all_schedules.json");
		const content = await fs.readFile(file, "utf-8");
		return JSON.parse(content) as PoolSchedule[];
	} catch {
		return null;
	}
}

function formatDate(d?: string | null): string {
	if (!d) return "";
	return new Date(d).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "2-digit",
		timeZone: "America/Los_Angeles",
	});
}

function parseTimeToMinutes(t: string): number {
	// expects format: h:mm[a|p], e.g., 9:00a, 12:15p (no spaces)
	const m = /^(\d{1,2}):(\d{2})([ap])$/.exec(t);
	if (m) {
		let h = parseInt(m[1]!, 10);
		const min = parseInt(m[2]!, 10);
		const suffix = m[3]!;
		if (h === 12) h = 0; // 12am -> 0, 12pm handled by +12 below
		let total = h * 60 + min;
		if (suffix === "p") total += 12 * 60;
		return total;
	}
	// fallback: support 24-hour format HH:mm for older files
	const m24 = /^(\d{2}):(\d{2})$/.exec(t);
	if (m24) {
		const h = parseInt(m24[1]!, 10);
		const min = parseInt(m24[2]!, 10);
		return h * 60 + min;
	}
	return Number.MAX_SAFE_INTEGER;
}

function byStartTime(a: string, b: string): number {
	return parseTimeToMinutes(a) - parseTimeToMinutes(b);
}

export default async function SchedulesPage() {
	const schedules = await readSchedules();

	return (
		<main className="container py-8">
			<h1 className="text-3xl font-semibold accent-left pl-3">SF Pools — Schedules</h1>

			{!schedules || schedules.length === 0 ? (
				<div className="mt-8 rounded border accent-border bg-white p-4">
					<p className="text-slate-700">
						no schedule data found. run the extractor:
					</p>
					<pre className="mt-3 whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm text-slate-800">
						{`curl -X POST http://localhost:3000/api/extract-schedule`}
					</pre>
					<p className="mt-2 text-sm text-slate-600">
						set MLK_PDF_URL in .env.local to override autodiscovery if needed.
					</p>
				</div>
			) : (
				<div className="mt-8 space-y-8">
					{schedules.map((pool) => (
						<section key={pool.name} className="rounded border accent-border bg-white p-4">
							<header className="mb-4">
								<h2 className="text-2xl font-medium">{toTitleCase(pool.name)}</h2>
								<div className="mt-1 text-sm text-slate-600">
									{pool.address ? (
										<span className="inline-flex items-center gap-1"><MapPinIcon className="h-3.5 w-3.5" />{pool.address}</span>
									) : null}
									{pool.lanes ? <span className="ml-2">• {pool.lanes} lanes</span> : null}
									{(pool.scheduleSeason || pool.scheduleStartDate || pool.scheduleEndDate) ? (
										<span className="ml-2 inline-flex items-center gap-1">
											<CalendarIcon className="h-3.5 w-3.5" />
											{pool.scheduleSeason ? `${pool.scheduleSeason} ` : ""}
											{pool.scheduleStartDate ? formatDate(pool.scheduleStartDate) : ""}
											{pool.scheduleEndDate ? ` – ${formatDate(pool.scheduleEndDate)}` : ""}
										</span>
									) : null}
								</div>
								{pool.pdfScheduleUrl ? (
									<a
										href={pool.pdfScheduleUrl}
										target="_blank"
										rel="noreferrer"
										className="mt-1 inline-block text-sm link-accent"
									>
										view source PDF
									</a>
								) : null}
							</header>

							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								{DAYS.map((day) => {
									const items = (pool.programs || []).filter((p) => p.dayOfWeek === day);
									if (items.length === 0) return null;
									const sorted = [...items].sort((a, b) => byStartTime(a.startTime, b.startTime));
									return (
										<div key={day} className="rounded border accent-border">
											<div className="accent-muted-bg px-3 py-2 font-medium">{day}</div>
											<ul className="divide-y divide-slate-200">
												{sorted.map((p, idx) => (
													<li key={idx} className="px-3 py-2 text-sm">
														<div className="flex items-center justify-between">
															<span className="font-medium">{p.programName}</span>
															{(p as any).lanes ? (
																<span className="ml-2 rounded accent-muted-bg px-2 py-0.5 text-xs text-slate-700">{(p as any).lanes} lanes</span>
															) : null}
															<span className="text-slate-600 inline-flex items-center gap-1"><ClockIcon className="h-3.5 w-3.5" />{p.startTime} – {p.endTime}</span>
														</div>
														{p.notes ? (
															<div className="mt-1 text-slate-600">{p.notes}</div>
														) : null}
													</li>
												))}
											</ul>
										</div>
									);
								})}
							</div>
						</section>
					))}
				</div>
			)}
		</main>
	);
}
