import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const IN_FILE = path.join(process.cwd(), "public", "data", "discovered_pool_schedules.json");
const OUT_DIR = path.join(process.cwd(), "data", "pdfs");

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
	const raw = await (await import("node:fs/promises")).readFile(IN_FILE, "utf-8");
	const entries: Array<{ poolName: string; pageUrl: string; pdfUrl: string | null }> = JSON.parse(raw);

	await mkdir(OUT_DIR, { recursive: true });
	let count = 0;
	const used = new Map<string, number>();
	for (const e of entries) {
		if (!e.pdfUrl) {
			console.warn("skip (no pdf):", e.poolName);
			continue;
		}
		try {
			await sleep(400);
			const buf = await fetchBuffer(e.pdfUrl);
			const base = ensureUniqueBase(sanitizeFilename(e.poolName || "pool"), used);
			const fname = base + ".pdf";
			const outPath = path.join(OUT_DIR, fname);
			await writeFile(outPath, buf);
			console.log("saved:", outPath);
			count++;
		} catch (err) {
			console.warn("failed to download:", e.poolName, e.pdfUrl, err);
		}
	}
	console.log(`downloaded ${count} pdf(s)`);
}

if (import.meta.main) {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
