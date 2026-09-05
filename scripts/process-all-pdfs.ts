import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { extractScheduleFromPdf, type PoolSchedule } from "@/lib/pdf-processor";
import { findCanonicalProgram, normalizeProgramName } from "@/lib/program-taxonomy";
import { getPoolIdFromName, getPoolById } from "@/lib/pool-mapping";
import { toTitleCase } from "@/lib/program-taxonomy";
import { detectScheduleAnomalies, detectRegressionAnomalies } from "@/lib/schedule-validation";
import { isClosureActive, type Closure } from "@/lib/closures";
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

/**
 * Active closures by pool id, read from the alerts scrape. A closure that has
 * already ended is ignored, so a pool comes back on its own the day after it
 * reopens even if nothing re-scrapes in between.
 */
async function loadActiveClosures(today: string): Promise<Map<string, Closure>> {
	const byPool = new Map<string, Closure>();
	try {
		const raw = await readFile(ALERTS_FILE, "utf-8");
		const data = JSON.parse(raw) as {
			poolAlerts?: Array<{ poolId: string; closure?: Closure | null }>;
		};
		for (const alert of data.poolAlerts ?? []) {
			const closure = alert.closure;
			if (!closure || !isClosureActive(closure, today)) continue;
			// when a pool has several notices, keep the one that runs longest
			const existing = byPool.get(alert.poolId);
			if (existing) {
				if (existing.indefinite) continue;
				if (!closure.indefinite && (existing.endDate ?? "") >= (closure.endDate ?? "")) continue;
			}
			byPool.set(alert.poolId, closure);
		}
	} catch {
		// no alerts file yet - nothing is known to be closed
	}
	return byPool;
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
	const previousByName = new Map<string, PoolSchedule>();
	for (const s of previousSchedules) {
		previousByName.set(s.name, s);
	}

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
	let preservedCount = 0;
	const anomalies: string[] = [];
	const quarantinedPools: string[] = [];
	const droppedPools: string[] = [];
	const closedPools: string[] = [];
	const activeClosures = await loadActiveClosures(todayISO());
	let healthCheckedCount = 0;
	// escape hatch for local dev: ship extracts even when they fail health checks
	const allowUnhealthy = process.env.ALLOW_UNHEALTHY === "1";

	// track which pool names we've processed (to preserve unprocessed ones)
	const processedPoolNames = new Set<string>();

	const aggregated: PoolSchedule[] = [];
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
				});
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

			const today = todayISO();
			for (const s of schedules) {
				if (!s.scheduleLastUpdated) s.scheduleLastUpdated = today;

				// Establish pool identity. When we know which pools.json entry
				// this PDF belongs to, trust that as the source of truth — the
				// PDF text alone can't disambiguate pools that share a name
				// (e.g. North Beach's warm and cool schedules both read "North
				// Beach"). Fall back to name-matching only when the source pool
				// is unknown.
				if (pool) {
					s.id = pool.id;
					s.name = pool.name;
					s.shortName = pool.shortName;
					s.nameTitle = pool.nameTitle;
				} else {
					const originalName = s.name || "";
					const poolId = getPoolIdFromName(originalName);
					s.id = poolId ?? "unknown";
					s.name = originalName;
					if (poolId) {
						const poolMeta = getPoolById(poolId);
						s.shortName = poolMeta?.shortName ?? toTitleCase(originalName);
						s.nameTitle = poolMeta?.displayName ?? toTitleCase(originalName);
					} else {
						// fallback to toTitleCase for unmatched pools
						s.shortName = toTitleCase(originalName);
						s.nameTitle = toTitleCase(originalName);
					}
				}

				// track this pool name as processed (after identity is settled so the
				// preserve step keys off the canonical name)
				processedPoolNames.add(s.name);

				// populate address and URLs from pools.json and discovered data
				if (pool) {
					s.address = pool.address;
					s.sfRecParkUrl = pool.pageUrl;
				}
				if (disc?.pdfUrl) {
					s.pdfScheduleUrl = disc.pdfUrl;
				}

				// rewrite programName to canonical label, preserve original
				for (const p of s.programs || []) {
					const original = p.programName;
					const canonical = findCanonicalProgram(original) ?? normalizeProgramName(original);
					p.programNameOriginal = original;
					p.programName = canonical;
					p.programNameCanonical = canonical;
				}

				// A pool with an announced closure publishes no programs: a maintenance
				// banner above a full schedule is too easy to read past. This also
				// resolves the empty-extract ambiguity - when a closure explains why a
				// PDF yielded nothing, the extract is not corrupt and must not be
				// quarantined behind stale programs.
				const closure = activeClosures.get(s.id);
				if (closure) {
					closedPools.push(s.shortName || s.name);
					console.log(
						`🚧 ${s.shortName || s.name} closed (${closure.startDate ?? "?"} -> ${closure.endDate ?? "indefinite"}) - hiding programs`
					);
					const { programs: _hidden, ...closedRest } = s;
					aggregated.push({ ...closedRest, closure, programs: [] });
					continue;
				}

				// health-check the extract: intrinsic problems that suggest a misread
				// PDF, plus regressions against the previous run. Volume of change is
				// deliberately not part of this — a season rollover churns most of the
				// corpus and is perfectly healthy.
				const label = s.shortName || s.name;
				const previous = previousByName.get(s.name);
				const poolAnomalies = [
					...detectScheduleAnomalies(s),
					...detectRegressionAnomalies(s, previous),
				];
				for (const a of poolAnomalies) {
					const msg = `${label}: ${a.message}`;
					anomalies.push(msg);
					console.warn(`⚠️  anomaly (${a.severity}):`, msg);
				}
				healthCheckedCount++;

				const { programs, ...rest } = s;
				const unhealthy = poolAnomalies.some((a) => a.severity === "error");

				if (unhealthy && !allowUnhealthy) {
					// hold this pool at its last known good data so the other pools can
					// still ship. Nothing is lost: the PDF hash isn't recorded for a
					// quarantined pool, so the next run re-extracts it.
					if (previous) {
						quarantinedPools.push(label);
						aggregated.push(previous);
						console.warn(`⛔ quarantined ${label} — keeping previous data`);
					} else {
						// no known-good data to fall back on, so publish nothing for it
						droppedPools.push(label);
						console.warn(`⛔ dropped ${label} — corrupt extract and no previous data`);
					}
					delete extractedManifest[base];
					continue;
				}

				// a pool that is no longer closed drops any closure it was carrying
				aggregated.push({ ...rest, closure: null, programs });
			}
		} catch (err) {
			console.warn("failed to process", file, err);
		}
	}

	// preserve schedules for pools that weren't processed (PDF unchanged or
	// missing), but drop entries whose pool no longer exists in pools.json —
	// otherwise a renamed or split pool (e.g. North Beach -> cool/warm) leaves
	// a stale entry behind, since the preserve check keys off the pool name.
	const knownPoolIds = new Set(pools.map((p) => p.id));
	for (const prev of previousSchedules) {
		if (processedPoolNames.has(prev.name)) continue;
		if (!prev.id || !knownPoolIds.has(prev.id)) {
			console.log("dropped (no longer a known pool):", prev.name);
			continue;
		}
		aggregated.push(prev);
		preservedCount++;
		console.log("preserved (no new pdf):", prev.name);
	}

	await saveExtractedManifest(extractedManifest);

	// compute and save changelog before writing new data; fold extraction
	// anomalies into its warnings so they're persisted and surfaced by notify
	const changelog = computeChangelog(previousSchedules, aggregated);
	changelog.quarantinedPools = quarantinedPools;
	if (anomalies.length > 0) {
		changelog.warnings.push(...anomalies.map((a) => `anomaly: ${a}`));
	}
	for (const name of quarantinedPools) {
		changelog.warnings.push(`quarantined: ${name} held at previous data`);
	}
	for (const name of droppedPools) {
		changelog.warnings.push(`dropped: ${name} had no usable data`);
	}
	const changelogPath = await saveChangelog(changelog);
	if (changelogPath) {
		console.log("wrote changelog:", changelogPath);
	}
	console.log(formatChangelogSummary(changelog));

	// Failure policy. The size of a change no longer fails anything: a seasonal
	// rollover legitimately churns most of the corpus, and blocking on volume
	// meant every changeover needed a manual override. Health is the gate
	// instead, and it acts per pool — an unhealthy pool is quarantined above so
	// the healthy ones still ship. The run as a whole only fails when nothing
	// usable came out of it, which is the systemic case (a site-wide PDF layout
	// change) rather than one bad document.
	const reviewRequired = quarantinedPools.length > 0 || droppedPools.length > 0;
	const nothingToShip = aggregated.length === 0;
	const everyExtractFailed =
		healthCheckedCount > 0 &&
		quarantinedPools.length + droppedPools.length === healthCheckedCount;
	const shouldFail = nothingToShip || everyExtractFailed;

	if (closedPools.length > 0) {
		console.log(`
🚧 ${closedPools.length} pool(s) closed: ${closedPools.join(", ")}`);
	}

	if (shouldFail) {
		if (nothingToShip) {
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

	// surface data-quality anomalies (non-fatal; the changelog gate handles
	// build-failing severity separately)
	if (anomalies.length > 0) {
		console.warn(`\n⚠️  ${anomalies.length} data anomaly(ies) detected:`);
		for (const a of anomalies) console.warn(`  - ${a}`);
	}

	return {
		success: !shouldFail,
		changelog,
		extractedCount,
		skippedCount,
		closedPools,
		preservedCount,
		anomalies,
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
