import fs from "node:fs/promises";
import path from "node:path";
import { findCanonicalProgram, toTitleCase } from "../src/lib/program-taxonomy";
import type { PoolSchedule } from "../src/lib/pdf-processor";

async function readAllSchedules(): Promise<PoolSchedule[] | null> {
	try {
		const file = path.join(process.cwd(), "public", "data", "all_schedules.json");
		const content = await fs.readFile(file, "utf-8");
		return JSON.parse(content) as PoolSchedule[];
	} catch {
		return null;
	}
}

function sortByCountDescending<T extends { count: number }>(arr: T[]): T[] {
	return arr.sort((a, b) => b.count - a.count);
}

async function main() {
	const all = await readAllSchedules();
	if (!all || all.length === 0) {
		console.log("No schedules found. Run the pipeline first: npm run build-schedules");
		return;
	}

	const counts: Record<string, number> = {};
	for (const pool of all) {
		for (const p of pool.programs || []) {
			const name = (p as any).programNameOriginal || p.programName || "";
			counts[name] = (counts[name] || 0) + 1;
		}
	}

	const entries = Object.entries(counts).map(([raw, count]) => {
		const canonical = findCanonicalProgram(raw);
		const display = toTitleCase(raw);
		return { raw, display, canonical, count };
	});

	const mapped = sortByCountDescending(entries.filter((e) => !!e.canonical));
	const unmapped = sortByCountDescending(entries.filter((e) => !e.canonical));

	console.log("=== Program Name Analysis ===");
	console.log(`Pools: ${all.length}`);
	console.log(`Unique raw program names: ${entries.length}`);
	console.log("");

	console.log("-- Canonically mapped --");
	for (const e of mapped) {
		console.log(`(${e.count}) ${e.display} -> ${e.canonical}`);
	}
	console.log("");

	console.log("-- Unmapped / Novel --");
	for (const e of unmapped) {
		console.log(`(${e.count}) ${e.display}`);
	}
}

if (import.meta.main) {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
