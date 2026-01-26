import "dotenv/config";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { extractScheduleFromPdf, type PoolSchedule } from "../src/lib/pdf-processor";
import { findCanonicalProgram, normalizeProgramName } from "../src/lib/program-taxonomy";
import { getPoolIdFromName, getPoolById } from "../src/lib/pool-mapping";
import { toTitleCase } from "../src/lib/program-taxonomy";
import type { PdfManifest, PoolEntry, DiscoveredPool } from "./downloadPdf";
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
const MANIFEST_FILE = path.join(process.cwd(), "data", "pdf-manifest.json");

type ExtractedMeta = {
	pdfHash: string;
	extractedAt: string;
};

type ExtractedManifest = Record<string, ExtractedMeta>;

async function loadPdfManifest(): Promise<PdfManifest> {
	try {
		const raw = await readFile(MANIFEST_FILE, "utf-8");
		return JSON.parse(raw) as PdfManifest;
	} catch {
		return {};
	}
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

	const pdfManifest = await loadPdfManifest();
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

			// check if we can skip extraction based on hash
			const currentPdfMeta = pdfManifest[base];
			const currentHash = currentPdfMeta?.pdfHash;
			const extractedMeta = extractedManifest[base];
			const hashUnchanged = currentHash && extractedMeta?.pdfHash === currentHash;

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
				});
				// write raw extraction cache
				await writeFile(extractPath, JSON.stringify(schedules, null, "\t"), "utf-8");
				// update extracted manifest
				extractedManifest[base] = {
					pdfHash: currentHash || "",
					extractedAt: new Date().toISOString(),
				};
				console.log("wrote extract:", extractPath);
				extractedCount++;
			}

			const today = todayISO();
			for (const s of schedules) {
				if (!s.scheduleLastUpdated) s.scheduleLastUpdated = today;

				// track this pool name as processed
				processedPoolNames.add(s.name);

				// get the original pool name from the data source
				const originalName = s.name || "";

				// populate id field using getPoolIdFromName
				const poolId = getPoolIdFromName(originalName);
				s.id = poolId ?? "unknown";

				// populate name field with original name
				s.name = originalName;

				// populate shortName and nameTitle using getPoolById
				if (poolId) {
					const poolMeta = getPoolById(poolId);
					s.shortName = poolMeta?.shortName ?? toTitleCase(originalName);
					s.nameTitle = poolMeta?.displayName ?? toTitleCase(originalName);
				} else {
					// fallback to toTitleCase for unmatched pools
					s.shortName = toTitleCase(originalName);
					s.nameTitle = toTitleCase(originalName);
				}

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

	// compute and save changelog before writing new data
	const changelog = computeChangelog(previousSchedules, aggregated);
	const changelogPath = await saveChangelog(changelog);
	if (changelogPath) {
		console.log("wrote changelog:", changelogPath);
	}
	console.log(formatChangelogSummary(changelog));

	// check for severe changes that should fail the build
	// allow override via env var for local development
	const failOnLargeChanges = process.env.FAIL_ON_LARGE_CHANGES !== "false";
	const shouldFail = failOnLargeChanges && (changelog.changeSeverity === "major" || changelog.changeSeverity === "wholesale");
	if (shouldFail) {
		console.error(`\n❌ Build failed: ${changelog.changeSeverity} change detected`);
		console.error("Review the changelog and manually approve if this is expected.");
	} else if (!failOnLargeChanges && (changelog.changeSeverity === "major" || changelog.changeSeverity === "wholesale")) {
		console.warn(`\n⚠️  Large ${changelog.changeSeverity} change detected (build failure disabled via FAIL_ON_LARGE_CHANGES=false)`);
	}

	await writeFile(OUT_FILE, JSON.stringify(aggregated, null, "\t"), "utf-8");
	console.log("wrote:", OUT_FILE, `(${aggregated.length} pools)`);
	console.log(`extracted: ${extractedCount}, skipped: ${skippedCount}, preserved: ${preservedCount}`);

	return {
		success: !shouldFail,
		changelog,
		extractedCount,
		skippedCount,
		preservedCount,
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
