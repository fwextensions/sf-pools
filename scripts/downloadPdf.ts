import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const IN_FILE = path.join(process.cwd(), "public", "data", "discovered_pool_schedules.json");
const OUT_DIR = path.join(process.cwd(), "data", "pdfs");
const MANIFEST_FILE = path.join(process.cwd(), "data", "pdf-manifest.json");

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

function ensureUniqueBase(base: string, used: Map<string, number>): string {
	const count = (used.get(base) || 0) + 1;
	used.set(base, count);
	if (count === 1) return base;
	return `${base}-${count}`;
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

export async function main() {
	const raw = await readFile(IN_FILE, "utf-8");
	const entries: Array<{ poolName: string; pageUrl: string; pdfUrl: string | null }> = JSON.parse(raw);

	await mkdir(OUT_DIR, { recursive: true });
	const manifest = await loadManifest();
	let downloadCount = 0;
	let skippedCount = 0;
	const used = new Map<string, number>();

	for (const e of entries) {
		if (!e.pdfUrl) {
			console.warn("skip (no pdf):", e.poolName);
			continue;
		}

		const base = ensureUniqueBase(sanitizeFilename(e.poolName || "pool"), used);
		const fname = base + ".pdf";
		const poolKey = base;

		try {
			await sleep(400);
			const buf = await fetchBuffer(e.pdfUrl);
			const hash = computeHash(buf);

			// check if PDF has changed
			const existing = manifest[poolKey];
			if (existing && existing.pdfHash === hash && existing.pdfUrl === e.pdfUrl) {
				console.log("unchanged:", e.poolName);
				skippedCount++;
				continue;
			}

			const outPath = path.join(OUT_DIR, fname);
			await writeFile(outPath, buf);

			// update manifest
			manifest[poolKey] = {
				pdfUrl: e.pdfUrl,
				pdfHash: hash,
				filename: fname,
				lastDownloaded: new Date().toISOString(),
			};

			console.log("saved:", outPath, existing ? "(updated)" : "(new)");
			downloadCount++;
		} catch (err) {
			console.warn("failed to download:", e.poolName, e.pdfUrl, err);
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
