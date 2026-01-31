import fs from "node:fs/promises";
import path from "node:path";
import type { PoolSchedule } from "@/lib/pdf-processor";
import { toTitleCase } from "@/lib/program-taxonomy";
import { CalendarIcon, ClockIcon, MapPinIcon } from "@/components/icons";
import { parseTimeToMinutes } from "@/lib/utils";

function getProgramTypeClass(programName: string): string {
	const lower = programName.toLowerCase();
	if (lower.includes("lap") || lower.includes("adult swim")) return "program-lap";
	if (lower.includes("lesson") || lower.includes("learn")) return "program-lessons";
	if (lower.includes("aerobic") || lower.includes("exercise") || lower.includes("fitness")) return "program-aerobics";
	if (lower.includes("recreation") || lower.includes("open") || lower.includes("family") || lower.includes("free")) return "program-recreation";
	return "program-default";
}

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
						No schedule data found
					</p>
				</div>
			) : (
				<div className="mt-8 space-y-8">
					{schedules.map((pool) => (
						<section key={pool.name} className="rounded-xl border accent-border bg-white p-5 shadow-sm">
							<header className="mb-5">
								<h2 className="text-2xl font-semibold text-slate-800 mb-3">{toTitleCase(pool.name)}</h2>
								<div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
									{(pool.scheduleSeason || pool.scheduleStartDate || pool.scheduleEndDate) ? (
										<span className="inline-flex items-center gap-1.5">
											<CalendarIcon className="h-4 w-4 icon-water" />
											{pool.scheduleSeason ? `${pool.scheduleSeason} ` : ""}
											{pool.scheduleStartDate ? formatDate(pool.scheduleStartDate) : ""}
											{pool.scheduleEndDate ? ` – ${formatDate(pool.scheduleEndDate)}` : ""}
										</span>
									) : null}
									{pool.address ? (
										<span className="inline-flex items-center gap-1.5"><MapPinIcon className="h-4 w-4 icon-water" />{pool.address}</span>
									) : null}
									{pool.lanes ? (
										<span className="lane-badge inline-flex items-center rounded-full px-2.5 py-0.5 text-xs">{pool.lanes} lanes</span>
									) : null}
								</div>
								{pool.pdfScheduleUrl ? (
									<a
										href={pool.pdfScheduleUrl}
										target="_blank"
										rel="noreferrer"
										className="mt-3 inline-block text-sm link-accent font-medium py-1"
									>
										View source PDF
									</a>
								) : null}
							</header>

							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								{DAYS.map((day) => {
									const items = (pool.programs || []).filter((p) => p.dayOfWeek === day);
									if (items.length === 0) return null;
									const sorted = [...items].sort((a, b) => byStartTime(a.startTime, b.startTime));
									return (
										<div key={day} className="rounded-lg border accent-border overflow-hidden">
											<div className={`day-header day-${day.toLowerCase()} accent-muted-bg px-3 py-2.5 font-medium`}>{day}</div>
											<ul className="divide-y divide-slate-100">
												{sorted.map((p, idx) => (
													<li key={idx} className={`session-card px-3 py-2.5 text-sm ${getProgramTypeClass(p.programName)}`}>
														<div className="flex items-center justify-between gap-2">
															<span className="font-medium text-slate-800">{p.programName}</span>
															<span className="flex shrink-0 items-center gap-2">
																{(p as any).lanes ? (
																	<span className="lane-badge whitespace-nowrap rounded-full px-2 py-0.5 text-xs text-slate-600">{(p as any).lanes} lanes</span>
																) : null}
																<span className="text-slate-500 inline-flex items-center gap-1 font-medium"><ClockIcon className="h-4 w-4 icon-water" />{p.startTime} – {p.endTime}</span>
															</span>
														</div>
														{p.notes ? (
															<div className="mt-1.5 text-slate-500 text-xs italic">{p.notes}</div>
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
