import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { findCanonicalProgram, normalizeProgramName, toTitleCase } from "../src/lib/program-taxonomy";
import type { PoolSchedule } from "../src/lib/pdf-processor";

const SCHEDULES = path.join("public", "data", "all_schedules.json");

async function readAllSchedules(): Promise<PoolSchedule[] | null> {
	try {
		const content = await fs.readFile(path.join(process.cwd(), SCHEDULES), "utf-8");
		return JSON.parse(content) as PoolSchedule[];
	} catch {
		return null;
	}
}

// every committed revision of all_schedules.json, oldest first, so we can see
// which raw names the PDFs have used across seasons — not just today's snapshot
function readHistory(): Array<{ date: string; schedules: PoolSchedule[] }> {
	const log = execFileSync("git", ["log", "--format=%H %ad", "--date=short", "--follow", "--", SCHEDULES], {
		encoding: "utf-8",
	}).trim();
	if (!log) return [];

	const revisions: Array<{ date: string; schedules: PoolSchedule[] }> = [];
	for (const line of log.split("\n").reverse()) {
		const [sha, date] = line.split(" ");
		try {
			const raw = execFileSync("git", ["show", `${sha}:${SCHEDULES}`], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
			const parsed = JSON.parse(raw);
			const schedules = Array.isArray(parsed) ? parsed : parsed.schedules;
			if (Array.isArray(schedules)) revisions.push({ date, schedules });
		} catch {
			// a revision predating the current shape, or an unreadable blob — skip it
		}
	}
	return revisions;
}

type Stats = { count: number; revisions: Set<string>; pools: Set<string>; first: string; last: string };

function tally(revisions: Array<{ date: string; schedules: PoolSchedule[] }>): Map<string, Stats> {
	const raws = new Map<string, Stats>();
	for (const { date, schedules } of revisions) {
		for (const pool of schedules) {
			const poolId = (pool as any).id || (pool as any).poolId || "?";
			for (const p of pool.programs || []) {
				const raw = (p as any).programNameOriginal || p.programName || "";
				if (!raw) continue;
				const stats = raws.get(raw) ?? { count: 0, revisions: new Set(), pools: new Set(), first: date, last: date };
				stats.count++;
				stats.revisions.add(date);
				stats.pools.add(poolId);
				stats.last = date;
				raws.set(raw, stats);
			}
		}
	}
	return raws;
}

function report(raws: Map<string, Stats>, revisionCount: number, withDates: boolean) {
	const buckets = new Map<string, Array<[string, Stats]>>();
	for (const entry of raws) {
		const canonical = findCanonicalProgram(entry[0]);
		const key = canonical ?? `UNMAPPED -> ${normalizeProgramName(entry[0])}`;
		const bucket = buckets.get(key) ?? [];
		bucket.push(entry);
		buckets.set(key, bucket);
	}

	const ordered = [...buckets].sort((a, b) => {
		const unmappedA = a[0].startsWith("UNMAPPED"), unmappedB = b[0].startsWith("UNMAPPED");
		if (unmappedA !== unmappedB) return unmappedA ? -1 : 1;
		return a[0].localeCompare(b[0]);
	});

	let unmappedSessions = 0, totalSessions = 0;
	for (const [key, entries] of ordered) {
		const sessions = entries.reduce((sum, [, s]) => sum + s.count, 0);
		totalSessions += sessions;
		if (key.startsWith("UNMAPPED")) unmappedSessions += sessions;
		console.log(`\n${key}  (${entries.length} raw variants, ${sessions} sessions)`);
		for (const [raw, s] of entries.sort((a, b) => b[1].count - a[1].count)) {
			const seen = withDates ? `  revs ${String(s.revisions.size).padStart(2)}/${revisionCount}  ${s.first}->${s.last}` : "";
			console.log(`   ${String(s.count).padStart(4)}${seen}  ${s.pools.size}p  ${toTitleCase(raw)}`);
		}
	}

	console.log(`\nrevisions: ${revisionCount}  unique raw names: ${raws.size}  buckets: ${buckets.size}`);
	console.log(`sessions: ${totalSessions}  unmapped: ${unmappedSessions} (${((unmappedSessions / totalSessions) * 100).toFixed(1)}%)`);
}

async function main() {
	const history = process.argv.includes("--history");
	console.log(`=== Program Name Analysis${history ? " (all committed revisions)" : ""} ===`);

	if (history) {
		const revisions = readHistory();
		if (revisions.length === 0) {
			console.log("No committed revisions of all_schedules.json found.");
			return;
		}
		report(tally(revisions), revisions.length, true);
		return;
	}

	const all = await readAllSchedules();
	if (!all || all.length === 0) {
		console.log("No schedules found. Run the pipeline first: npm run build-schedules");
		return;
	}
	console.log(`Pools: ${all.length}`);
	report(tally([{ date: "current", schedules: all }]), 1, false);
}

if (import.meta.main) {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
