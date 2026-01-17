import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { PoolSchedule, ProgramEntry } from "../src/lib/pdf-processor";

const CHANGELOG_DIR = path.join(process.cwd(), "data", "changelog");

export type ProgramChange = {
	type: "added" | "removed" | "modified";
	program: string;
	day: string;
	oldTime?: string;
	newTime?: string;
	details?: string;
};

export type PoolChange = {
	poolName: string;
	programsAdded: number;
	programsRemoved: number;
	programsModified: number;
	changes: ProgramChange[];
};

export type ChangeSeverity = "none" | "minor" | "moderate" | "major" | "wholesale";

export type ChangelogEntry = {
	date: string;
	timestamp: string;
	poolsChanged: number;
	totalProgramsAdded: number;
	totalProgramsRemoved: number;
	totalProgramsModified: number;
	totalChanges: number;
	changeSeverity: ChangeSeverity;
	scheduleStartDate: string | null;
	scheduleEndDate: string | null;
	scheduleSeason: string | null;
	pools: PoolChange[];
	warnings: string[];
};

function programKey(p: ProgramEntry): string {
	return `${p.programName}|${p.dayOfWeek}|${p.startTime}|${p.endTime}`;
}

function programTimeKey(p: ProgramEntry): string {
	return `${p.programName}|${p.dayOfWeek}`;
}

function formatTime(start: string, end: string): string {
	return `${start}–${end}`;
}

export function computeChangelog(
	oldSchedules: PoolSchedule[],
	newSchedules: PoolSchedule[]
): ChangelogEntry {
	const oldByPool = new Map<string, PoolSchedule>();
	for (const s of oldSchedules) {
		oldByPool.set(s.poolName, s);
	}

	const newByPool = new Map<string, PoolSchedule>();
	for (const s of newSchedules) {
		newByPool.set(s.poolName, s);
	}

	const poolChanges: PoolChange[] = [];
	const warnings: string[] = [];

	// check for removed pools
	for (const poolName of oldByPool.keys()) {
		if (!newByPool.has(poolName)) {
			warnings.push(`Pool removed from data: ${poolName}`);
		}
	}

	// check for added pools
	for (const poolName of newByPool.keys()) {
		if (!oldByPool.has(poolName)) {
			const newPool = newByPool.get(poolName)!;
			poolChanges.push({
				poolName,
				programsAdded: newPool.programs?.length || 0,
				programsRemoved: 0,
				programsModified: 0,
				changes: (newPool.programs || []).map((p) => ({
					type: "added",
					program: p.programName,
					day: p.dayOfWeek,
					newTime: formatTime(p.startTime, p.endTime),
				})),
			});
			continue;
		}
	}

	// compare existing pools
	for (const [poolName, newPool] of newByPool) {
		const oldPool = oldByPool.get(poolName);
		if (!oldPool) continue; // handled above as new pool

		const oldPrograms = oldPool.programs || [];
		const newPrograms = newPool.programs || [];

		const oldByKey = new Map<string, ProgramEntry>();
		const oldByTimeKey = new Map<string, ProgramEntry[]>();
		for (const p of oldPrograms) {
			oldByKey.set(programKey(p), p);
			const tk = programTimeKey(p);
			if (!oldByTimeKey.has(tk)) oldByTimeKey.set(tk, []);
			oldByTimeKey.get(tk)!.push(p);
		}

		const newByKey = new Map<string, ProgramEntry>();
		const newByTimeKey = new Map<string, ProgramEntry[]>();
		for (const p of newPrograms) {
			newByKey.set(programKey(p), p);
			const tk = programTimeKey(p);
			if (!newByTimeKey.has(tk)) newByTimeKey.set(tk, []);
			newByTimeKey.get(tk)!.push(p);
		}

		const changes: ProgramChange[] = [];
		const processedOld = new Set<string>();

		// find added and modified programs
		for (const [key, newProg] of newByKey) {
			if (oldByKey.has(key)) {
				// exact match, no change
				processedOld.add(key);
				continue;
			}

			// check if it's a time modification (same program+day, different time)
			const tk = programTimeKey(newProg);
			const oldMatches = oldByTimeKey.get(tk) || [];
			if (oldMatches.length > 0) {
				// find the closest old match that hasn't been processed
				const unprocessed = oldMatches.filter((o) => !processedOld.has(programKey(o)));
				if (unprocessed.length > 0) {
					const oldProg = unprocessed[0]!;
					processedOld.add(programKey(oldProg));
					changes.push({
						type: "modified",
						program: newProg.programName,
						day: newProg.dayOfWeek,
						oldTime: formatTime(oldProg.startTime, oldProg.endTime),
						newTime: formatTime(newProg.startTime, newProg.endTime),
					});
					continue;
				}
			}

			// truly new program
			changes.push({
				type: "added",
				program: newProg.programName,
				day: newProg.dayOfWeek,
				newTime: formatTime(newProg.startTime, newProg.endTime),
			});
		}

		// find removed programs
		for (const [key, oldProg] of oldByKey) {
			if (!processedOld.has(key) && !newByKey.has(key)) {
				changes.push({
					type: "removed",
					program: oldProg.programName,
					day: oldProg.dayOfWeek,
					oldTime: formatTime(oldProg.startTime, oldProg.endTime),
				});
			}
		}

		if (changes.length > 0) {
			poolChanges.push({
				poolName,
				programsAdded: changes.filter((c) => c.type === "added").length,
				programsRemoved: changes.filter((c) => c.type === "removed").length,
				programsModified: changes.filter((c) => c.type === "modified").length,
				changes,
			});
		}
	}

	// check for large changes that might indicate extraction errors
	const totalOldPrograms = oldSchedules.reduce((sum, s) => sum + (s.programs?.length || 0), 0);
	const totalNewPrograms = newSchedules.reduce((sum, s) => sum + (s.programs?.length || 0), 0);
	const changePercent = totalOldPrograms > 0
		? Math.abs(totalNewPrograms - totalOldPrograms) / totalOldPrograms
		: 0;

	if (changePercent > 0.2 && totalOldPrograms > 10) {
		warnings.push(
			`Large change detected: ${totalOldPrograms} → ${totalNewPrograms} programs (${(changePercent * 100).toFixed(1)}% change)`
		);
	}

	// extract schedule date range from new schedules
	let scheduleStartDate: string | null = null;
	let scheduleEndDate: string | null = null;
	let scheduleSeason: string | null = null;
	for (const s of newSchedules) {
		if (s.scheduleStartDate && (!scheduleStartDate || s.scheduleStartDate < scheduleStartDate)) {
			scheduleStartDate = s.scheduleStartDate;
		}
		if (s.scheduleEndDate && (!scheduleEndDate || s.scheduleEndDate > scheduleEndDate)) {
			scheduleEndDate = s.scheduleEndDate;
		}
		if (s.scheduleSeason && !scheduleSeason) {
			scheduleSeason = s.scheduleSeason;
		}
	}

	// calculate total changes and severity
	const totalAdded = poolChanges.reduce((sum, p) => sum + p.programsAdded, 0);
	const totalRemoved = poolChanges.reduce((sum, p) => sum + p.programsRemoved, 0);
	const totalModified = poolChanges.reduce((sum, p) => sum + p.programsModified, 0);
	const totalChanges = totalAdded + totalRemoved + totalModified;

	// determine change severity
	let changeSeverity: ChangeSeverity = "none";
	if (totalChanges > 0) {
		if (changePercent > 0.5 || totalChanges > 100) {
			changeSeverity = "wholesale"; // likely a new season/schedule
		} else if (changePercent > 0.2 || totalChanges > 50) {
			changeSeverity = "major";
		} else if (totalChanges > 10) {
			changeSeverity = "moderate";
		} else {
			changeSeverity = "minor";
		}
	}

	const now = new Date();
	return {
		date: now.toISOString().slice(0, 10),
		timestamp: now.toISOString(),
		poolsChanged: poolChanges.length,
		totalProgramsAdded: totalAdded,
		totalProgramsRemoved: totalRemoved,
		totalProgramsModified: totalModified,
		totalChanges,
		changeSeverity,
		scheduleStartDate,
		scheduleEndDate,
		scheduleSeason,
		pools: poolChanges,
		warnings,
	};
}

export async function loadPreviousSchedules(): Promise<PoolSchedule[]> {
	const outFile = path.join(process.cwd(), "public", "data", "all_schedules.json");
	try {
		const raw = await readFile(outFile, "utf-8");
		return JSON.parse(raw) as PoolSchedule[];
	} catch {
		return [];
	}
}

export async function saveChangelog(entry: ChangelogEntry): Promise<string | null> {
	// only save if there are actual changes
	if (entry.poolsChanged === 0 && entry.warnings.length === 0) {
		return null;
	}

	await mkdir(CHANGELOG_DIR, { recursive: true });
	const filename = `${entry.date}.json`;
	const filepath = path.join(CHANGELOG_DIR, filename);

	// if file exists for today, append a timestamp suffix
	let finalPath = filepath;
	try {
		await readFile(filepath);
		// file exists, use timestamp
		const ts = entry.timestamp.replace(/[:.]/g, "-");
		finalPath = path.join(CHANGELOG_DIR, `${entry.date}_${ts}.json`);
	} catch {
		// file doesn't exist, use date-only filename
	}

	await writeFile(finalPath, JSON.stringify(entry, null, "\t"), "utf-8");
	return finalPath;
}

export function formatChangelogSummary(entry: ChangelogEntry): string {
	const lines: string[] = [];

	if (entry.poolsChanged === 0 && entry.warnings.length === 0) {
		lines.push("No changes detected.");
		return lines.join("\n");
	}

	lines.push(`Schedule changes for ${entry.date}:`);
	lines.push(`  Pools changed: ${entry.poolsChanged}`);
	lines.push(`  Programs added: ${entry.totalProgramsAdded}`);
	lines.push(`  Programs removed: ${entry.totalProgramsRemoved}`);
	lines.push(`  Programs modified: ${entry.totalProgramsModified}`);

	if (entry.warnings.length > 0) {
		lines.push("");
		lines.push("⚠️  Warnings:");
		for (const w of entry.warnings) {
			lines.push(`  - ${w}`);
		}
	}

	if (entry.pools.length > 0 && entry.pools.length <= 5) {
		lines.push("");
		lines.push("Details:");
		for (const pool of entry.pools) {
			lines.push(`  ${pool.poolName}:`);
			for (const c of pool.changes.slice(0, 10)) {
				if (c.type === "added") {
					lines.push(`    + ${c.program} (${c.day}) ${c.newTime}`);
				} else if (c.type === "removed") {
					lines.push(`    - ${c.program} (${c.day}) ${c.oldTime}`);
				} else {
					lines.push(`    ~ ${c.program} (${c.day}) ${c.oldTime} → ${c.newTime}`);
				}
			}
			if (pool.changes.length > 10) {
				lines.push(`    ... and ${pool.changes.length - 10} more changes`);
			}
		}
	}

	return lines.join("\n");
}
