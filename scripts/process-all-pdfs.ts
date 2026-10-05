import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { extractScheduleFromPdf, type PoolSchedule } from "@/lib/pdf-processor";
import type { Closure } from "@/lib/closures";
import {
	releaseSchedules,
	releaseVerdict,
	releaseWarnings,
	selectActiveClosures,
	type PoolExtract,
} from "@/lib/release-rules";
import { formatUsageSummary, sessionUsage, USAGE_LOG } from "@/lib/llm-usage";
import type { PoolEntry, DiscoveredPool } from "./downloadPdf";
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
const EXTRACTED_DIR = path.join(process.cwd(), "data", "extracted");
const ALERTS_FILE = path.join(process.cwd(), "public", "data", "alerts.json");

type ExtractedMeta = {
	pdfHash: string;
	extractedAt: string;
};

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

function todayISO(): string {
	return new Date().toISOString().slice(0, 10);
}

async function loadPools(): Promise<PoolEntry[]> {
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

/** active closures by pool id, read from the alerts scrape */
async function loadActiveClosures(today: string): Promise<Map<string, Closure>> {
	try {
		const raw = await readFile(ALERTS_FILE, "utf-8");
		const data = JSON.parse(raw) as {
			poolAlerts?: Array<{ poolId: string; closure?: Closure | null }>;
		};
		return selectActiveClosures(data.poolAlerts ?? [], today);
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
	/** pools whose programs were hidden because an announced closure is running */
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
	const poolsById = new Map<string, PoolEntry>();
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
	const activeClosures = await loadActiveClosures(today);

	const extracts: PoolExtract[] = [];
	for (const file of pdfFiles) {
		const base = file.replace(/\.pdf$/i, "");
		const pool = poolsById.get(base.toLowerCase());
		const disc = discoveredById.get(base.toLowerCase());
		const pdfPath = path.join(PDF_DIR, file);

		try {
			const buf = await readFile(pdfPath);
			const extractPath = path.join(EXTRACTED_DIR, `${base}.json`);
			const forceRefresh = process.env.REFRESH_EXTRACT === "1";

			// hash the actual PDF bytes so the skip decision is self-contained and
			// can't drift out of sync with a separately-maintained download manifest
			const currentHash = computeHash(buf);
			const extractedMeta = extractedManifest[base];
			const hashUnchanged = extractedMeta?.pdfHash === currentHash;

			let schedules: PoolSchedule[] | null = null;

			// try to use cached extraction if hash unchanged and not forcing refresh
			if (!forceRefresh && hashUnchanged) {
				try {
					const cached = await readFile(extractPath, "utf-8");
					schedules = JSON.parse(cached) as PoolSchedule[];
					console.log("skipped (unchanged):", file);
					skippedCount++;
				} catch {
					// cache file missing, need to extract
				}
			}

			if (!schedules) {
				console.log("extracting:", file);
				schedules = await extractScheduleFromPdf(buf, {
					pdfScheduleUrl: disc?.pdfUrl ?? undefined,
					sfRecParkUrl: pool?.pageUrl ?? undefined,
					expectedPoolName: pool?.name ?? undefined,
					poolId: pool?.id ?? base,
					pdfHash: currentHash,
				});
				const u = sessionUsage("pdf-extract").at(-1)!;
				console.log(
					`  tokens: ${u.inputTokens} in / ${u.outputTokens} out` +
						(u.costUsd !== null ? ` ($${u.costUsd.toFixed(4)})` : "")
				);
				// write raw extraction cache
				await writeFile(extractPath, JSON.stringify(schedules, null, "\t"), "utf-8");
				// update extracted manifest
				extractedManifest[base] = {
					pdfHash: currentHash,
					extractedAt: new Date().toISOString(),
				};
				console.log("wrote extract:", extractPath);
				extractedCount++;
			}

			extracts.push({ base, pool, pdfUrl: disc?.pdfUrl, schedules });
		} catch (err) {
			console.warn("failed to process", file, err);
		}
	}

	const release = releaseSchedules({
		extracts,
		previousSchedules,
		knownPoolIds: pools.map((p) => p.id),
		activeClosures,
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

	// the PDF hash isn't recorded for a quarantined pool, so the next run
	// re-extracts it
	for (const base of release.invalidatedExtracts) {
		delete extractedManifest[base];
	}

	await saveExtractedManifest(extractedManifest);

	// compute and save changelog before writing new data; fold extraction
	// anomalies into its warnings so they're persisted and surfaced by notify
	const changelog = computeChangelog(previousSchedules, aggregated);
	changelog.quarantinedPools = quarantinedPools;
	changelog.warnings.push(...releaseWarnings(release));
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
