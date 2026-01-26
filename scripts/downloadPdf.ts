import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const POOLS_FILE = path.join(process.cwd(), "data", "pools.json");
const DISCOVERED_FILE = path.join(process.cwd(), "public", "data", "discovered_pool_schedules.json");
const OUT_DIR = path.join(process.cwd(), "data", "pdfs");
const MANIFEST_FILE = path.join(process.cwd(), "data", "pdf-manifest.json");

export type PoolEntry = {
	id: string;
	name: string;
	nameTitle: string;
	shortName: string;
	address: string;
	pageUrl: string;
};

export type DiscoveredPool = {
	poolId: string;
	pdfUrl: string | null;
};

export type PdfManifestEntry = {
	pdfUrl: string;
	pdfHash: string;
	filename: string;
	lastDownloaded: string;
};

export type PdfManifest = Record<string, PdfManifestEntry>;

function computeHash(buf: Buffer): string {
	return createHash("sha256").update(buf).digest("hex");
}

async function loadManifest(): Promise<PdfManifest> {
	try {
		const raw = await readFile(MANIFEST_FILE, "utf-8");
		return JSON.parse(raw) as PdfManifest;
	} catch {
		return {};
	}
}

async function saveManifest(manifest: PdfManifest): Promise<void> {
	await writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, "\t"), "utf-8");
}

function sleep(ms: number) {
	return new Promise((res) => setTimeout(res, ms));
}

function sanitizeFilename(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9\s-_]+/g, "")
		.trim()
		.replace(/\s+/g, "-");
}

async function fetchBuffer(url: string): Promise<Buffer> {
	const res = await fetch(url, {
		headers: {
			"user-agent": "Mozilla/5.0 (compatible; sf-pools-schedule-viewer/0.1)",
		},
	});
	if (!res.ok) throw new Error(`download failed ${res.status} ${res.statusText} for ${url}`);
	const ab = await res.arrayBuffer();
	return Buffer.from(ab);
}

async function loadDiscoveredPools(): Promise<DiscoveredPool[]> {
	try {
		const raw = await readFile(DISCOVERED_FILE, "utf-8");
		return JSON.parse(raw);
	} catch {
		return [];
	}
}

async function loadPools(): Promise<PoolEntry[]> {
	try {
		const raw = await readFile(POOLS_FILE, "utf-8");
		return JSON.parse(raw);
	} catch {
		return [];
	}
}

export async function main() {
	// load discovered PDF URLs from scrape step
	const discovered = await loadDiscoveredPools();
	if (discovered.length === 0) {
		console.error("No discovered pools found. Run scrape first.");
		process.exit(1);
	}

	// load pools.json for metadata (shortName)
	const pools = await loadPools();
	const poolsById = new Map(pools.map((p) => [p.id, p]));

	await mkdir(OUT_DIR, { recursive: true });
	const manifest = await loadManifest();
	let downloadCount = 0;
	let skippedCount = 0;

	for (const disc of discovered) {
		if (!disc.pdfUrl) {
			const pool = poolsById.get(disc.poolId);
			console.warn("skip (no pdf):", pool?.shortName ?? disc.poolId);
			continue;
		}

		const pool = poolsById.get(disc.poolId);
		const displayName = pool?.shortName ?? disc.poolId;

		// use pool id as the base filename for consistency
		const base = sanitizeFilename(disc.poolId);
		const fname = base + ".pdf";
		const poolKey = base;

		try {
			await sleep(400);
			const buf = await fetchBuffer(disc.pdfUrl);
			const hash = computeHash(buf);

			// check if PDF has changed (by URL or hash)
			const existing = manifest[poolKey];
			if (existing && existing.pdfHash === hash) {
				// same content, just update URL if it changed
				if (existing.pdfUrl !== disc.pdfUrl) {
					manifest[poolKey] = { ...existing, pdfUrl: disc.pdfUrl };
					console.log("unchanged (url updated):", displayName);
				} else {
					console.log("unchanged:", displayName);
				}
				skippedCount++;
				continue;
			}

			const outPath = path.join(OUT_DIR, fname);
			await writeFile(outPath, buf);

			// update manifest
			manifest[poolKey] = {
				pdfUrl: disc.pdfUrl,
				pdfHash: hash,
				filename: fname,
				lastDownloaded: new Date().toISOString(),
			};

			console.log("saved:", outPath, existing ? "(updated)" : "(new)");
			downloadCount++;
		} catch (err) {
			console.warn("failed to download:", displayName, disc.pdfUrl, err);
		}
	}

	await saveManifest(manifest);
	console.log(`downloaded ${downloadCount} pdf(s), ${skippedCount} unchanged`);
}

if (import.meta.main) {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
