// Markdown copies of the pool pages and the pool list, served at the page's
// URL plus ".md" as the llms.txt proposal suggests, and linked from each page
// with rel="alternate". They say what the HTML pages say, from the same data
// and the same wording helpers, so an agent reading one isn't told something
// the page doesn't show.
//
// Each copy is written once per build and served until the next one, so
// nothing here may say "today" or "this week": dates are absolute, and only
// closures that have already ended are dropped, as on the page.

import type { PoolPage } from "./pool-pages";
import type { PoolAlert } from "./site-data";
import type { PoolSchedule, ProgramEntry } from "./schedule-schema";
import { formatClosurePeriod, formatScheduledClosure } from "./closures";
import { formatGridQuery } from "./grid/url";
import { describeProgram } from "./program-display";
import { toTitleCase } from "./program-taxonomy";
import { DAYS } from "./sessions";
import { parseTimeToMinutes } from "./time";
import { formatScheduleDate } from "./utils";

export const CHECK_BEFORE_GOING =
	"SF Pools is an independent project, not a city site. Schedules are read from SF Rec & Park's PDFs by a model and can be wrong, so confirm with the pool's PDF or SF Rec & Park page before going.";

/** the markdown copy of a page at `path` */
export function markdownPath(path: string): string {
	return path === "/" ? "/index.html.md" : `${path.replace(/\/$/, "")}.md`;
}

/** "Lap Swim *", "[Rentals]": text that markdown would otherwise read as markup */
export function escapeMarkdown(text: string): string {
	return text.replace(/([\\`*_[\]<>#|])/g, "\\$1");
}

// a time that doesn't parse sorts last, as on the page
function startOrLast(p: ProgramEntry): number {
	return parseTimeToMinutes(p.startTime) ?? Number.MAX_SAFE_INTEGER;
}

// "2 LN" is a badge's shorthand; in a sentence it's lanes
function badgeText(badge: string): string {
	const lanes = /^(\d+) LN$/.exec(badge);
	return lanes ? `${lanes[1]} lane${lanes[1] === "1" ? "" : "s"}` : badge;
}

function sessionLines(program: ProgramEntry): string[] {
	const { title, badges, notes } = describeProgram(program);
	const details = badges.map(badgeText);
	const line = `- ${program.startTime}–${program.endTime} ${escapeMarkdown(title)}` +
		(details.length ? ` (${escapeMarkdown(details.join(", "))})` : "");
	return [line, ...notes.map((note) => `  - ${escapeMarkdown(note)}`)];
}

function poolLabel(page: PoolPage, schedule: PoolSchedule, token: PoolPage["pools"][number]["token"]): string {
	// North Beach's two pools say which is which
	return page.pools.length === 1
		? "Weekly schedule"
		: `${token?.name.match(/\((\w+)\)/)?.[1] ?? schedule.shortName} pool weekly schedule`;
}

function scheduleSection(page: PoolPage, entry: PoolPage["pools"][number], today: string): string[] {
	const { schedule, token } = entry;
	const programs = schedule.programs || [];
	const out = [`## ${poolLabel(page, schedule, token)}`, ""];

	const dates = [schedule.scheduleStartDate, schedule.scheduleEndDate]
		.filter(Boolean)
		.map((d) => formatScheduleDate(d, { year: "numeric", month: "short", day: "numeric" }))
		.join(" – ");
	const period = [schedule.scheduleSeason ? toTitleCase(schedule.scheduleSeason) : null, dates]
		.filter(Boolean)
		.join(" ");
	if (period) out.push(`Schedule: ${period}`, "");

	out.push(`${programs.length} session${programs.length === 1 ? "" : "s"} a week` +
		(schedule.lanes ? `, ${schedule.lanes} lanes` : "") + ".", "");

	if (schedule.closure) {
		const { closure } = schedule;
		const span = formatClosurePeriod(closure);
		out.push(
			`**Closed${span ? ` ${span}` : ""}${closure.reason ? ` for ${escapeMarkdown(closure.reason)}` : ""}.** ` +
				(closure.endDate
					? `Schedules resume after ${formatScheduleDate(closure.endDate, { month: "long", day: "numeric" })}.`
					: "No reopening date has been announced.") +
				(closure.sourceUrl ? ` [Read the notice](${closure.sourceUrl})` : ""),
			""
		);
	}

	const closed = (schedule.scheduledClosures ?? [])
		.filter((c) => c.endDate >= today)
		.sort((a, b) => a.startDate.localeCompare(b.startDate));
	if (closed.length) {
		out.push("Closed on these dates, which the schedule below doesn't show:", "");
		for (const c of closed) out.push(`- ${formatScheduledClosure(c)}${c.reason ? ` ${escapeMarkdown(c.reason)}` : ""}`);
		out.push("");
	}

	for (const day of DAYS) {
		const dayPrograms = programs.filter((p) => p.dayOfWeek === day).sort((a, b) => startOrLast(a) - startOrLast(b));
		out.push(`### ${day}`, "");
		out.push(...(dayPrograms.length ? dayPrograms.flatMap(sessionLines) : ["No sessions."]), "");
	}
	return out;
}

export type PoolMarkdownOptions = {
	siteUrl: string;
	/** the pool's alerts; those already parsed into a closure show with the schedule */
	alerts: PoolAlert[];
	/** YYYY-MM-DD in Pacific time; closures that ended before it are left out */
	today: string;
};

/** /pools/<slug>.md: what the pool's page shows */
export function poolPageMarkdown(page: PoolPage, { siteUrl, alerts, today }: PoolMarkdownOptions): string {
	const site = siteUrl.replace(/\/$/, "");
	const poolIds = page.pools.map(({ schedule }) => schedule.id);
	const grid = formatGridQuery({ tags: [], pools: poolIds, cell: null });
	const single = page.pools.length === 1;
	const notices = alerts.filter((a) => poolIds.includes(a.poolId) && !a.closure);
	const mapsQuery = encodeURIComponent(`${page.facilityName}, ${page.address}, San Francisco, CA`);

	const out = [
		`# ${escapeMarkdown(page.facilityName)}`,
		"",
		`> ${CHECK_BEFORE_GOING} Times are Pacific.`,
		"",
		`- Address: [${escapeMarkdown(page.address)}, San Francisco](https://www.google.com/maps/search/?api=1&query=${mapsQuery})`,
	];
	for (const { schedule, token } of page.pools) {
		if (!schedule.pdfScheduleUrl) continue;
		out.push(`- ${single ? "Schedule PDF" : `${token?.name ?? schedule.shortName} schedule PDF`}: ${schedule.pdfScheduleUrl}`);
	}
	if (page.pageUrl) out.push(`- SF Rec & Parks page: ${page.pageUrl}`);
	out.push(`- Web page: ${site}/pools/${page.slug}`);
	out.push(`- Week grid for this pool: ${site}/${grid ? `?${grid}` : ""}`);
	out.push("");

	if (notices.length) {
		out.push("## Alerts", "");
		for (const alert of notices) {
			const text = escapeMarkdown(alert.alertText);
			out.push(`- ${alert.documentUrl ? `[${text}](${alert.documentUrl})` : text}`);
		}
		out.push("");
	}

	for (const entry of page.pools) out.push(...scheduleSection(page, entry, today));

	out.push("## Other pools", "", `- [All pools](${site}${markdownPath("/pools")})`, "");
	return out.join("\n").replace(/\n+$/, "\n");
}

/** /pools.md: the pool list */
export function poolsIndexMarkdown(pages: PoolPage[], siteUrl: string): string {
	const site = siteUrl.replace(/\/$/, "");
	const out = [
		"# Pools",
		"",
		"> San Francisco's public pools, run by SF Rec & Parks. Each pool's page has its address and its full weekly schedule.",
		"",
	];
	for (const page of pages) {
		const sessions = page.pools.reduce((n, { schedule }) => n + schedule.programs.length, 0);
		out.push(
			`- [${escapeMarkdown(page.facilityName)}](${site}${markdownPath(`/pools/${page.slug}`)}): ` +
				`${escapeMarkdown(page.address)}, ${sessions} session${sessions === 1 ? "" : "s"} a week`
		);
	}
	return out.join("\n") + "\n";
}

/** the headers every markdown copy is served with */
export function markdownHeaders(canonicalUrl: string): HeadersInit {
	return {
		"Content-Type": "text/markdown; charset=utf-8",
		// the HTML page is the one search engines should list
		Link: `<${canonicalUrl}>; rel="canonical"`,
	};
}
