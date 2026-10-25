import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { extractScheduleFromPdf, repairScheduleFromPdf, type ExtractHints } from "@/lib/pdf-processor";
import type { PoolSchedule } from "@/lib/schedule-schema";
import { buildDayCells, formatDayCells, type DayCell } from "@/lib/pdf-table";
import { applyGrounding, groundSessions } from "@/lib/grounding";
import type { Closure } from "@/lib/closures";
import {
	releaseSchedules,
	releaseVerdict,
	releaseWarnings,
	selectClosures,
	type PoolExtract,
} from "@/lib/release-rules";
import { formatUsageSummary, sessionUsage, USAGE_LOG } from "@/lib/llm-usage";
import { upcomingBase, type DiscoveredPool } from "./downloadPdf";
import type { PoolRecord } from "@/lib/site-data";
import { readPdfLines } from "./read-pdf-lines";
import {
	computeChangelog,
	loadPreviousSchedules,
	saveChangelog,
	formatChangelogSummary,
} from "./changelog";

const PDF_DIR = path.join(process.cwd(), "data", "pdfs");
const POOLS_FILE = path.join(process.cwd(), "data", "pools.json");
const DISCOVERED_FILE = path.join(process.cwd(), "public", "data", "discovered_pool_schedules.json");
const OUT_DIR = path.join(process.cwd(), "public", "data");
const OUT_FILE = path.join(OUT_DIR, "all_schedules.json");
const UPCOMING_FILE = path.join(OUT_DIR, "upcoming_schedules.json");
const EXTRACTED_DIR = path.join(process.cwd(), "data", "extracted");
const ALERTS_FILE = path.join(process.cwd(), "public", "data", "alerts.json");

type ExtractedMeta = {
	pdfHash: string;
	extractedAt: string;
	/** GROUNDING_VERSION the extract was made under; older extracts are redone */
	grounding?: number;
};

/** bump when the extraction prompt or repair pass changes enough to redo cached extracts */
const GROUNDING_VERSION = 2;

type ExtractedManifest = Record<string, ExtractedMeta>;

function computeHash(buf: Buffer): string {
	return createHash("sha256").update(buf).digest("hex");
}

async function loadExtractedManifest(): Promise<ExtractedManifest> {
	const manifestPath = path.join(EXTRACTED_DIR, "_manifest.json");
	try {
		const raw = await readFile(manifestPath, "utf-8");
		return JSON.parse(raw) as ExtractedManifest;
	} catch {
		return {};
	}
}

async function saveExtractedManifest(manifest: ExtractedManifest): Promise<void> {
	const manifestPath = path.join(EXTRACTED_DIR, "_manifest.json");
	await writeFile(manifestPath, JSON.stringify(manifest, null, "\t"), "utf-8");
}

function sanitizeFilename(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9\s-_]+/g, "")
		.trim()
		.replace(/\s+/g, "-");
}

/** the PDF's table cells, or null when its text layer has no readable table */
function readCells(buf: Buffer, file: string): DayCell[] | null {
	try {
		return buildDayCells(readPdfLines(buf));
	} catch (err) {
		console.warn(`  couldn't read the text of ${file}:`, err);
		return null;
	}
}

function countIssues(schedules: PoolSchedule[], cells: DayCell[]): string[] {
	return schedules.flatMap((s) => groundSessions(s.programs, cells).map((i) => i.message));
}

/**
 * Extract with the PDF's cells in the prompt, then check the result against
 * them. If anything disagrees, give the model one chance to fix it, and keep
 * whichever version disagrees less.
 */
async function extractGrounded(buf: Buffer, cells: DayCell[] | null, hints: ExtractHints): Promise<PoolSchedule[]> {
	const withCells = { ...hints, cells: cells ? formatDayCells(cells) : undefined };
	const schedules = await extractScheduleFromPdf(buf, withCells);
	if (!cells) return schedules;
	const issues = countIssues(schedules, cells);
	if (issues.length === 0) return schedules;
	console.log(`  ${issues.length} grounding issue(s), asking for a repair`);
	try {
		const repaired = await repairScheduleFromPdf(buf, schedules, issues, withCells);
		const remaining = countIssues(repaired, cells).length;
		console.log(`  ${remaining} issue(s) after repair`);
		return remaining <= issues.length ? repaired : schedules;
	} catch (err) {
		console.warn("  repair failed, keeping the first extraction:", err);
		return schedules;
	}
}

function todayISO(): string {
	return new Date().toISOString().slice(0, 10);
}

async function loadPools(): Promise<PoolRecord[]> {
	try {
		const raw = await readFile(POOLS_FILE, "utf-8");
		return JSON.parse(raw);
	} catch {
		return [];
	}
}

async function loadDiscoveredPools(): Promise<DiscoveredPool[]> {
	try {
		const raw = await readFile(DISCOVERED_FILE, "utf-8");
		return JSON.parse(raw);
	} catch {
		return [];
	}
}

/** what the last run published as upcoming, or nothing before the first run that wrote it */
async function loadPreviousUpcoming(): Promise<PoolSchedule[]> {
	try {
		return JSON.parse(await readFile(UPCOMING_FILE, "utf-8")) as PoolSchedule[];
	} catch {
		return [];
	}
}

/**
 * The cached read of a PDF with these bytes, under its own key or another's:
 * an upcoming schedule's PDF becomes the current one when its season starts,
 * and was already read under its upcoming key.
 */
async function findCachedExtract(
	manifest: ExtractedManifest,
	base: string,
	hash: string
): Promise<PoolSchedule[] | null> {
	const keys = [base, ...Object.keys(manifest).filter((k) => k !== base)];
	for (const key of keys) {
		const meta = manifest[key];
		if (meta?.pdfHash !== hash || meta.grounding !== GROUNDING_VERSION) continue;
		try {
			const schedules = JSON.parse(await readFile(path.join(EXTRACTED_DIR, `${key}.json`), "utf-8")) as PoolSchedule[];
			if (key !== base) console.log(`  reusing the extract made for ${key}`);
			return schedules;
		} catch {
			// cache file missing, try the next
		}
	}
	return null;
}

/** current and upcoming closures by pool id, read from the alerts scrape */
async function loadClosures(today: string): Promise<Map<string, Closure>> {
	try {
		const raw = await readFile(ALERTS_FILE, "utf-8");
		const data = JSON.parse(raw) as {
			poolAlerts?: Array<{ poolId: string; closure?: Closure | null }>;
		};
		return selectClosures(data.poolAlerts ?? [], today);
	} catch {
		// no alerts file yet - nothing is known to be closed
		return new Map();
	}
}

export type ProcessResult = {
	success: boolean;
	changelog: ReturnType<typeof computeChangelog>;
	extractedCount: number;
	skippedCount: number;
	/** pools with an announced closure running today */
	closedPools: string[];
	preservedCount: number;
	anomalies: string[];
	/** session times corrected for an am/pm typo in the source PDF */
	repairs: string[];
	/** pools held back at their previous data because this run's extract looked corrupt */
	quarantinedPools: string[];
	/** pools dropped entirely — extract looked corrupt and there was no previous data */
	droppedPools: string[];
	/** true when a human should look, even though healthy pools still shipped */
	reviewRequired: boolean;
};

export async function main(): Promise<ProcessResult> {
	await mkdir(OUT_DIR, { recursive: true });
	await mkdir(EXTRACTED_DIR, { recursive: true });

	// load previous schedules for changelog comparison and preservation
	const previousSchedules = await loadPreviousSchedules();

	// load pools.json for static metadata
	const pools = await loadPools();
	const poolsById = new Map<string, PoolRecord>();
	for (const p of pools) {
		poolsById.set(p.id.toLowerCase(), p);
	}

	// load discovered pools for PDF URLs
	const discovered = await loadDiscoveredPools();
	const discoveredById = new Map<string, DiscoveredPool>();
	for (const d of discovered) {
		discoveredById.set(d.poolId.toLowerCase(), d);
	}

	const extractedManifest = await loadExtractedManifest();

	// determine which PDFs need processing based on pools.json
	const pdfFiles: string[] = [];
	for (const pool of pools) {
		const base = sanitizeFilename(pool.id);
		const fname = `${base}.pdf`;
		const pdfPath = path.join(PDF_DIR, fname);
		try {
			await readFile(pdfPath);
			pdfFiles.push(fname);
		} catch {
			console.warn(`pdf not found for ${pool.shortName}: ${fname}`);
		}
	}
	console.log(`found ${pdfFiles.length} pdf(s) to process`);

	let extractedCount = 0;
	let skippedCount = 0;
	const today = todayISO();
	const closures = await loadClosures(today);

	const extracts: PoolExtract[] = [];
	const upcomingExtracts: PoolExtract[] = [];
	const groundingWarnings: string[] = [];

	/** read one PDF, from the extract cache when its bytes were read before */
	async function processPdf(base: string, pool: PoolRecord | undefined, pdfUrl: string | null | undefined): Promise<PoolExtract | null> {
		const file = `${base}.pdf`;
		const pdfPath = path.join(PDF_DIR, file);

		try {
			const buf = await readFile(pdfPath);
			const extractPath = path.join(EXTRACTED_DIR, `${base}.json`);
			const forceRefresh = process.env.REFRESH_EXTRACT === "1";

			// hash the actual PDF bytes so the skip decision is self-contained and
			// can't drift out of sync with a separately-maintained download manifest
			const currentHash = computeHash(buf);
			const cells = readCells(buf, file);

			let schedules: PoolSchedule[] | null = null;

			// try to use cached extraction if hash unchanged and not forcing refresh
			if (!forceRefresh) {
				schedules = await findCachedExtract(extractedManifest, base, currentHash);
				if (schedules) {
					console.log("skipped (unchanged):", file);
					skippedCount++;
					if (extractedManifest[base]?.pdfHash !== currentHash) {
						await writeFile(extractPath, JSON.stringify(schedules, null, "\t"), "utf-8");
						extractedManifest[base] = {
							pdfHash: currentHash,
							extractedAt: new Date().toISOString(),
							grounding: GROUNDING_VERSION,
						};
					}
				}
			}

			if (!schedules) {
				console.log("extracting:", file);
				schedules = await extractGrounded(buf, cells, {
					pdfScheduleUrl: pdfUrl ?? undefined,
					sfRecParkUrl: pool?.pageUrl ?? undefined,
					expectedPoolName: pool?.name ?? undefined,
					poolId: pool?.id ?? base,
					pdfHash: currentHash,
				});
				for (const u of sessionUsage("pdf-extract").filter((r) => r.pdfHash === currentHash)) {
					console.log(
						`  tokens: ${u.inputTokens} in / ${u.outputTokens} out` +
							(u.costUsd !== null ? ` ($${u.costUsd.toFixed(4)})` : "")
					);
				}
				// write raw extraction cache
				await writeFile(extractPath, JSON.stringify(schedules, null, "\t"), "utf-8");
				// update extracted manifest
				extractedManifest[base] = {
					pdfHash: currentHash,
					extractedAt: new Date().toISOString(),
					grounding: GROUNDING_VERSION,
				};
				console.log("wrote extract:", extractPath);
				extractedCount++;
			}

			// checked on every run, cached or not, so a cached extract made before
			// grounding still has its invented sessions dropped
			const grounded = applyGrounding(schedules, cells, pool?.shortName ?? base);
			groundingWarnings.push(...grounded.warnings);
			for (const w of grounded.warnings) console.warn(" ", w);
			return { base, pool, pdfUrl, schedules: grounded.schedules };
		} catch (err) {
			console.warn("failed to process", file, err);
			return null;
		}
	}

	for (const file of pdfFiles) {
		const base = file.replace(/\.pdf$/i, "");
		const pool = poolsById.get(base.toLowerCase());
		const disc = discoveredById.get(base.toLowerCase());
		const extract = await processPdf(base, pool, disc?.pdfUrl);
		if (extract) extracts.push(extract);

		// the schedule posted to take over later, which the download step saved
		// only while the facility page still lists it
		if (!disc?.upcomingPdfUrl) continue;
		const upcoming = await processPdf(upcomingBase(base), pool, disc.upcomingPdfUrl);
		if (upcoming) upcomingExtracts.push(upcoming);
	}

	const release = releaseSchedules({
		extracts,
		previousSchedules,
		knownPoolIds: pools.map((p) => p.id),
		closures,
		today,
		// escape hatch for local dev: ship extracts even when they fail health checks
		allowUnhealthy: process.env.ALLOW_UNHEALTHY === "1",
		log: console,
	});
	const {
		schedules: aggregated,
		closedPools,
		anomalies,
		repairs,
		quarantinedPools,
		droppedPools,
		preservedCount,
		healthCheckedCount,
	} = release;

	// upcoming schedules go through the same rules, against what was published
	// as upcoming last time. One the facility page no longer lists, or whose
	// season has started, isn't carried over
	const upcomingPdfIds = new Set(discovered.filter((d) => d.upcomingPdfUrl).map((d) => d.poolId));
	const upcomingRelease = releaseSchedules({
		extracts: upcomingExtracts,
		previousSchedules: (await loadPreviousUpcoming()).filter(
			(s) => upcomingPdfIds.has(s.id) && !!s.scheduleStartDate && s.scheduleStartDate > today
		),
		knownPoolIds: [...upcomingPdfIds],
		closures,
		today,
		allowUnhealthy: process.env.ALLOW_UNHEALTHY === "1",
		log: console,
	});
	// the calendar switches to an upcoming schedule on its start date, so one
	// whose PDF doesn't print it takes the date from the link's text
	const upcomingStarts = new Map(discovered.map((d) => [d.poolId, d.upcomingStartDate ?? null]));
	const upcoming = upcomingRelease.schedules.map((s) =>
		s.scheduleStartDate ? s : { ...s, scheduleStartDate: upcomingStarts.get(s.id) ?? null }
	);
	for (const s of upcoming) console.log(`upcoming: ${s.shortName ?? s.name} from ${s.scheduleStartDate ?? "?"}`);

	// the PDF hash isn't recorded for a quarantined pool, so the next run
	// re-extracts it
	for (const base of [...release.invalidatedExtracts, ...upcomingRelease.invalidatedExtracts]) {
		delete extractedManifest[base];
	}

	await saveExtractedManifest(extractedManifest);

	// compute and save changelog before writing new data; fold extraction
	// anomalies into its warnings so they're persisted and surfaced by notify
	const changelog = computeChangelog(previousSchedules, aggregated);
	changelog.quarantinedPools = quarantinedPools;
	changelog.warnings.push(
		...releaseWarnings(release),
		...releaseWarnings(upcomingRelease).map((w) => `upcoming ${w}`),
		...groundingWarnings
	);
	const changelogPath = await saveChangelog(changelog);
	if (changelogPath) {
		console.log("wrote changelog:", changelogPath);
	}
	console.log(formatChangelogSummary(changelog));

	const { success, failure, reviewRequired } = releaseVerdict(release);

	if (closedPools.length > 0) {
		console.log(`
🚧 ${closedPools.length} pool(s) closed: ${closedPools.join(", ")}`);
	}

	if (failure) {
		if (failure === "nothing-to-ship") {
			console.error("\n❌ Build failed: no usable schedules to publish");
		} else {
			console.error(
				`\n❌ Build failed: every extracted pool (${healthCheckedCount}) failed health checks — ` +
					`the PDF format has probably changed`
			);
		}
	} else if (reviewRequired) {
		console.warn(
			`\n⚠️  Review required: ${quarantinedPools.length} quarantined, ` +
				`${droppedPools.length} dropped (healthy pools still published)`
		);
	}

	// volume of change is reported, never enforced — the season metadata says
	// whether a big diff is the rollover the source documents announced
	if (changelog.changeSeverity === "wholesale" || changelog.changeSeverity === "major") {
		console.log(
			`\nℹ️  ${changelog.changeSeverity} change: ${changelog.totalChanges} programs touched` +
				(changelog.seasonChanged
					? " — source PDFs declare a new season, consistent with a rollover"
					: " — no new season declared by the source PDFs")
		);
	}

	await writeFile(OUT_FILE, JSON.stringify(aggregated, null, "\t"), "utf-8");
	console.log("wrote:", OUT_FILE, `(${aggregated.length} pools)`);
	await writeFile(UPCOMING_FILE, JSON.stringify(upcoming, null, "\t"), "utf-8");
	console.log("wrote:", UPCOMING_FILE, `(${upcoming.length} pools)`);
	console.log(`extracted: ${extractedCount}, skipped: ${skippedCount}, preserved: ${preservedCount}`);
	const usageSummary = formatUsageSummary(sessionUsage("pdf-extract"));
	if (usageSummary) console.log(`${usageSummary} (logged to ${USAGE_LOG})`);

	// surface data-quality anomalies (non-fatal; the changelog gate handles
	// build-failing severity separately)
	if (anomalies.length > 0) {
		console.warn(`\n⚠️  ${anomalies.length} data anomaly(ies) detected:`);
		for (const a of anomalies) console.warn(`  - ${a}`);
	}

	return {
		success,
		changelog,
		extractedCount,
		skippedCount,
		closedPools,
		preservedCount,
		anomalies,
		repairs,
		quarantinedPools,
		droppedPools,
		reviewRequired,
	};
}

if (import.meta.main) {
	main()
		.then((result) => {
			if (!result.success) {
				process.exit(1);
			}
		})
		.catch((err) => {
			console.error(err);
			process.exit(1);
		});
}
