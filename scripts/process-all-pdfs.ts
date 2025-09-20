import "dotenv/config";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { extractScheduleFromPdf, type PoolSchedule } from "../src/lib/pdf-processor";
import { findCanonicalProgram, normalizeProgramName } from "../src/lib/program-taxonomy";

const PDF_DIR = path.join(process.cwd(), "data", "pdfs");
const DISCOVERED_FILE = path.join(process.cwd(), "public", "data", "discovered_pool_schedules.json");
const OUT_DIR = path.join(process.cwd(), "public", "data");
const OUT_FILE = path.join(OUT_DIR, "all_schedules.json");

function sanitizeFilename(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9\s-_]+/g, "")
		.trim()
		.replace(/\s+/g, "-");
}

function stripTrailingIndex(base: string): string {
	// turns "martin-luther-king-jr-pool-2" -> "martin-luther-king-jr-pool"
	return base.replace(/-(\d+)$/i, "");
}

function todayISO(): string {
	return new Date().toISOString().slice(0, 10);
}

async function loadDiscovered(): Promise<Array<{ poolName: string; pageUrl: string; pdfUrl: string | null }>> {
	try {
		const raw = await readFile(DISCOVERED_FILE, "utf-8");
		return JSON.parse(raw);
	} catch {
		return [];
	}
}

export async function main() {
	await mkdir(OUT_DIR, { recursive: true });
	const entries = await readdir(PDF_DIR, { withFileTypes: true });
	const pdfFiles = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".pdf")).map((e) => e.name);
	console.log(`found ${pdfFiles.length} pdf(s) to process`);

	const discovered = await loadDiscovered();
	const mapBySanitized: Record<string, { poolName: string; pageUrl: string; pdfUrl: string | null }> = {};
	for (const d of discovered) {
		mapBySanitized[sanitizeFilename(d.poolName || "")] = d;
	}

	const aggregated: PoolSchedule[] = [];
	for (const file of pdfFiles) {
		const base = file.replace(/\.pdf$/i, "");
		let hint = mapBySanitized[base];
		if (!hint) {
			const alt = stripTrailingIndex(base);
			hint = mapBySanitized[alt];
		}
		const pdfPath = path.join(PDF_DIR, file);
		try {
			console.log("processing:", file);
			const buf = await readFile(pdfPath);
			const schedules = await extractScheduleFromPdf(buf, {
				pdfScheduleUrl: hint?.pdfUrl ?? undefined,
				sfRecParkUrl: hint?.pageUrl ?? undefined,
			});
			const today = todayISO();
			for (const s of schedules) {
				if (!s.scheduleLastUpdated) s.scheduleLastUpdated = today;
				// m7: rewrite programName to canonical label, preserve original
				for (const p of s.programs || []) {
					const original = p.programName;
					const canonical = findCanonicalProgram(original) ?? normalizeProgramName(original);
					p.programNameOriginal = original;
					p.programName = canonical;
					p.programNameCanonical = canonical;
				}
				aggregated.push(s);
			}
		} catch (err) {
			console.warn("failed to process", file, err);
		}
	}

	await writeFile(OUT_FILE, JSON.stringify(aggregated, null, "\t"), "utf-8");
	console.log("wrote:", OUT_FILE, `(${aggregated.length} pools)`);
}

if (import.meta.main) {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
