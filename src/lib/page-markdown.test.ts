import { describe, it, expect, beforeAll } from "@jest/globals";
import type { PoolSchedule, ProgramEntry } from "./schedule-schema";
import { describeProgram } from "./program-display";
import { buildPoolPages, type PoolPage } from "./pool-pages";
import { escapeMarkdown, markdownPath, poolPageMarkdown, poolsIndexMarkdown } from "./page-markdown";
import { loadAlerts, loadPools, loadSchedules } from "./site-data";
import type { PoolRecord, PoolAlert } from "./site-data";

const SITE = "https://sfpools.example";

function program(dayOfWeek: ProgramEntry["dayOfWeek"], startTime: string, endTime: string, title: string, extra: Partial<ProgramEntry> = {}): ProgramEntry {
	return { dayOfWeek, startTime, endTime, title, programName: title, programNameOriginal: title, notes: "", tags: [], ...extra } as unknown as ProgramEntry;
}

function schedule(id: string, programs: ProgramEntry[], extra: Partial<PoolSchedule> = {}): PoolSchedule {
	return { id, name: id, nameTitle: null, shortName: id, programs, ...extra } as PoolSchedule;
}

function record(id: string, name: string, address: string, pageUrl: string): PoolRecord {
	return { id, name, nameTitle: name, shortName: name, address, pageUrl };
}

function balboaPage(extra: Partial<PoolSchedule> = {}, programs?: ProgramEntry[]): PoolPage {
	return buildPoolPages(
		[record("balboa", "Balboa Aquatics Center", "1000 Ocean Ave, San Francisco", "https://sfrecpark.org/balboa")],
		[schedule("balboa", programs ?? [
			program("Monday", "9:00a", "10:00a", "Senior Swim"),
			program("Monday", "6:00a", "8:00a", "Lap Swim", { lanes: 4 }),
		], { pdfScheduleUrl: "https://sfrecpark.org/balboa.pdf", ...extra })]
	)[0]!;
}

describe("markdownPath", () => {
	it("adds .md, or index.html.md for the root", () => {
		expect(markdownPath("/pools/balboa")).toBe("/pools/balboa.md");
		expect(markdownPath("https://x.test/pools")).toBe("https://x.test/pools.md");
		expect(markdownPath("/")).toBe("/index.html.md");
	});
});

describe("escapeMarkdown", () => {
	it("escapes text markdown would read as markup", () => {
		expect(escapeMarkdown("Swim *[members]*")).toBe("Swim \\*\\[members\\]\\*");
	});
});

describe("a pool page's markdown", () => {
	it("lists each day's sessions in start order, with absolute links", () => {
		const md = poolPageMarkdown(balboaPage(), { siteUrl: SITE, alerts: [], today: "2026-10-30" });
		expect(md).toMatch(/^# Balboa Aquatics Center\n/);
		expect(md).toContain("- Schedule PDF: https://sfrecpark.org/balboa.pdf");
		expect(md).toContain(`- Week grid for this pool: ${SITE}/?pools=balboa`);
		expect(md).toContain("### Monday\n\n- 6:00a–8:00a Lap Swim (4 lanes)\n- 9:00a–10:00a Senior Swim\n");
		expect(md).toContain("### Tuesday\n\nNo sessions.");
		expect(md).not.toMatch(/\]\(\//);
	});

	it("gives the printed dates and the closures that haven't ended", () => {
		const md = poolPageMarkdown(
			balboaPage({
				scheduleSeason: "FALL",
				scheduleStartDate: "2026-09-02",
				scheduleEndDate: "2026-12-19",
				scheduledClosures: [
					{ startDate: "2026-10-12", endDate: "2026-10-12", startTime: null, endTime: null, reason: "Indigenous Peoples' Day" },
					{ startDate: "2026-11-26", endDate: "2026-11-27", startTime: null, endTime: null, reason: "Thanksgiving" },
				],
			}),
			{ siteUrl: SITE, alerts: [], today: "2026-10-30" }
		);
		expect(md).toContain("Schedule: Fall Sep 2, 2026 – Dec 19, 2026");
		expect(md).toContain("- Nov 26 – 27 Thanksgiving");
		expect(md).not.toContain("Indigenous");
	});

	it("shows only the alerts not already shown as a closure", () => {
		const alert = (alertText: string, closure: PoolAlert["closure"]): PoolAlert =>
			({ poolId: "balboa", poolName: "Balboa", pageUrl: "", alertText, scrapedAt: "", documentUrl: null, closure });
		const md = poolPageMarkdown(balboaPage(), {
			siteUrl: SITE,
			alerts: [alert("Parking lot repaving", null), alert("Closed for maintenance", {} as PoolAlert["closure"])],
			today: "2026-10-30",
		});
		expect(md).toContain("## Alerts\n\n- Parking lot repaving\n");
		expect(md).not.toContain("Closed for maintenance");
	});

	it("splits North Beach into its two pools", () => {
		const pageUrl = "https://sfrecpark.org/north-beach";
		const page = buildPoolPages(
			[
				record("northBeachCool", "North Beach Aquatics Center - Cool Pool", "661 Lombard St, San Francisco", pageUrl),
				record("northBeachWarm", "North Beach Aquatics Center - Warm Pool", "661 Lombard St, San Francisco", pageUrl),
			],
			[schedule("northBeachCool", []), schedule("northBeachWarm", [])]
		)[0]!;
		const md = poolPageMarkdown(page, { siteUrl: SITE, alerts: [], today: "2026-10-30" });
		expect(md).toContain("## Cool pool weekly schedule");
		expect(md).toContain("## Warm pool weekly schedule");
	});
});

describe("the markdown copies of the published schedules", () => {
	let pages: PoolPage[];
	let alerts: PoolAlert[];

	beforeAll(async () => {
		const [records, schedules, published] = await Promise.all([loadPools(), loadSchedules(), loadAlerts()]);
		pages = buildPoolPages(records, schedules);
		alerts = published?.poolAlerts ?? [];
	});

	it("list every session the pool pages show", () => {
		const missing: string[] = [];
		for (const page of pages) {
			const md = poolPageMarkdown(page, { siteUrl: SITE, alerts, today: "2026-10-30" });
			for (const { schedule: pool } of page.pools) {
				for (const p of pool.programs) {
					const line = `- ${p.startTime}–${p.endTime} ${escapeMarkdown(describeProgram(p).title)}`;
					if (!md.includes(line)) missing.push(`${page.slug}: ${p.dayOfWeek} ${line}`);
				}
			}
		}
		expect(missing).toEqual([]);
	});

	it("link every pool page's copy from the pool list", () => {
		const md = poolsIndexMarkdown(pages, SITE);
		for (const page of pages) expect(md).toContain(`](${SITE}/pools/${page.slug}.md)`);
	});
});
