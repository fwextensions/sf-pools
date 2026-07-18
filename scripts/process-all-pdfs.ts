import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { extractScheduleFromPdf, type PoolSchedule } from "@/lib/pdf-processor";
import { findCanonicalProgram, normalizeProgramName } from "@/lib/program-taxonomy";
import { getPoolIdFromName, getPoolById } from "@/lib/pool-mapping";
import { toTitleCase } from "@/lib/program-taxonomy";
import { detectScheduleAnomalies } from "@/lib/schedule-validation";
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

export type ProcessResult = {
	success: boolean;
	changelog: ReturnType<typeof computeChangelog>;
	extractedCount: number;
	skippedCount: number;
	preservedCount: number;
	anomalies: string[];
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
	let anomalyErrorCount = 0;

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

				// flag intrinsic data-quality problems that suggest a misread PDF
				for (const a of detectScheduleAnomalies(s)) {
					const msg = `${s.shortName || s.name}: ${a.message}`;
					anomalies.push(msg);
					if (a.severity === "error") anomalyErrorCount++;
					console.warn(`⚠️  anomaly (${a.severity}):`, msg);
				}

				const { programs, ...rest } = s;
				aggregated.push({ ...rest, programs });
			}
		} catch (err) {
			console.warn("failed to process", file, err);
		}
	}

	// preserve schedules for pools that weren't processed (PDF unchanged or missing)
	for (const prev of previousSchedules) {
		if (!processedPoolNames.has(prev.name)) {
			aggregated.push(prev);
			preservedCount++;
			console.log("preserved (no new pdf):", prev.name);
		}
	}

	await saveExtractedManifest(extractedManifest);

	// compute and save changelog before writing new data; fold extraction
	// anomalies into its warnings so they're persisted and surfaced by notify
	const changelog = computeChangelog(previousSchedules, aggregated);
	if (anomalies.length > 0) {
		changelog.warnings.push(...anomalies.map((a) => `anomaly: ${a}`));
	}
	const changelogPath = await saveChangelog(changelog);
	if (changelogPath) {
		console.log("wrote changelog:", changelogPath);
	}
	console.log(formatChangelogSummary(changelog));

	// check for problems that should fail the build (overridable for local dev):
	// severe changes for manual review, and corrupt extractions that must not ship
	const failOnLargeChanges = process.env.FAIL_ON_LARGE_CHANGES !== "false";
	const severeChange =
		changelog.changeSeverity === "major" || changelog.changeSeverity === "wholesale";
	const shouldFail = failOnLargeChanges && (severeChange || anomalyErrorCount > 0);
	if (shouldFail) {
		if (severeChange) {
			console.error(`\n❌ Build failed: ${changelog.changeSeverity} change detected`);
		}
		if (anomalyErrorCount > 0) {
			console.error(`\n❌ Build failed: ${anomalyErrorCount} corrupt extraction(s) detected`);
		}
		console.error("Review the changelog and manually approve if this is expected.");
	} else if (!failOnLargeChanges && (severeChange || anomalyErrorCount > 0)) {
		console.warn(
			`\n⚠️  Build-blocking issue(s) detected (failure disabled via FAIL_ON_LARGE_CHANGES=false)`
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
		preservedCount,
		anomalies,
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
