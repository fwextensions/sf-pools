import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import type { PoolSchedule, ProgramEntry } from "../src/lib/pdf-processor";
import type { ChangelogEntry, ChangeSeverity, PoolChange, ProgramChange } from "../src/lib/site-data";

const CHANGELOG_DIR = path.join(process.cwd(), "data", "changelog");

function programKey(p: ProgramEntry): string {
	return `${p.programName}|${p.dayOfWeek}|${p.startTime}|${p.endTime}`;
}

function programTimeKey(p: ProgramEntry): string {
	return `${p.programName}|${p.dayOfWeek}`;
}

function pdfUrlOf(pool: PoolSchedule): Pick<PoolChange, "pdfUrl"> {
	return pool.pdfScheduleUrl ? { pdfUrl: pool.pdfScheduleUrl } : {};
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
		oldByPool.set(s.name, s);
	}

	const newByPool = new Map<string, PoolSchedule>();
	for (const s of newSchedules) {
		newByPool.set(s.name, s);
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
				...pdfUrlOf(newPool),
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
				...pdfUrlOf(newPool),
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

	// compare against the previous run's season metadata: the source documents
	// announcing a new season is positive evidence that a big diff is a rollover
	let prevStartDate: string | null = null;
	let prevSeason: string | null = null;
	for (const s of oldSchedules) {
		if (s.scheduleStartDate && (!prevStartDate || s.scheduleStartDate < prevStartDate)) {
			prevStartDate = s.scheduleStartDate;
		}
		if (s.scheduleSeason && !prevSeason) {
			prevSeason = s.scheduleSeason;
		}
	}
	const seasonChanged =
		(!!scheduleSeason && !!prevSeason && scheduleSeason !== prevSeason) ||
		(!!scheduleStartDate && !!prevStartDate && scheduleStartDate > prevStartDate);

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
		seasonChanged,
		// filled in by the caller, which is what decides to hold a pool back
		quarantinedPools: [],
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

const SEVERITY_ORDER: ChangeSeverity[] = ["none", "minor", "moderate", "major", "wholesale"];

function severityFromTotal(totalChanges: number): ChangeSeverity {
	if (totalChanges > 100) return "wholesale";
	if (totalChanges > 50) return "major";
	if (totalChanges > 10) return "moderate";
	return totalChanges > 0 ? "minor" : "none";
}

/** a change as a move from one time to another; null is "not on the schedule" */
type Step = { program: string; day: string; before: string | null; after: string | null };

function toStep(c: ProgramChange): Step {
	return {
		program: c.program,
		day: c.day,
		before: c.type === "added" ? null : (c.oldTime ?? null),
		after: c.type === "removed" ? null : (c.newTime ?? null),
	};
}

function fromStep(s: Step): ProgramChange {
	if (s.before === null) return { type: "added", program: s.program, day: s.day, newTime: s.after! };
	if (s.after === null) return { type: "removed", program: s.program, day: s.day, oldTime: s.before };
	return { type: "modified", program: s.program, day: s.day, oldTime: s.before, newTime: s.after };
}

/**
 * Fold a later run's changes into the same day's earlier entry, so the day
 * reads as one diff from its first run's starting point. A later step that
 * continues an earlier one (same program and day, starting where the earlier
 * one ended) is joined to it, which cancels a removal the later run undid.
 */
export function mergeChangelogs(earlier: ChangelogEntry, later: ChangelogEntry): ChangelogEntry {
	const stepsByPool = new Map<string, Step[]>();
	// the later run read the PDF the merged changes end at
	const pdfUrls = new Map<string, string>();
	for (const pool of earlier.pools) {
		stepsByPool.set(pool.poolName, pool.changes.map(toStep));
		if (pool.pdfUrl) pdfUrls.set(pool.poolName, pool.pdfUrl);
	}
	for (const pool of later.pools) {
		if (pool.pdfUrl) pdfUrls.set(pool.poolName, pool.pdfUrl);
		const steps = stepsByPool.get(pool.poolName) ?? [];
		for (const next of pool.changes.map(toStep)) {
			const i = steps.findIndex(
				(s) => s.program === next.program && s.day === next.day && s.after === next.before
			);
			if (i >= 0) steps[i] = { ...steps[i]!, after: next.after };
			else steps.push(next);
		}
		stepsByPool.set(pool.poolName, steps);
	}

	const pools: PoolChange[] = [];
	for (const [poolName, steps] of stepsByPool) {
		const changes = steps.filter((s) => s.before !== s.after).map(fromStep);
		if (changes.length === 0) continue;
		const pdfUrl = pdfUrls.get(poolName);
		pools.push({
			poolName,
			...(pdfUrl ? { pdfUrl } : {}),
			programsAdded: changes.filter((c) => c.type === "added").length,
			programsRemoved: changes.filter((c) => c.type === "removed").length,
			programsModified: changes.filter((c) => c.type === "modified").length,
			changes,
		});
	}

	const totalAdded = pools.reduce((sum, p) => sum + p.programsAdded, 0);
	const totalRemoved = pools.reduce((sum, p) => sum + p.programsRemoved, 0);
	const totalModified = pools.reduce((sum, p) => sum + p.programsModified, 0);
	const totalChanges = totalAdded + totalRemoved + totalModified;
	// the later run's own severity can come from a percentage the merged
	// totals can't recompute, so keep it when it's the worse of the two
	const severity = [severityFromTotal(totalChanges), later.changeSeverity].reduce((a, b) =>
		SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b
	);

	return {
		...later,
		poolsChanged: pools.length,
		totalProgramsAdded: totalAdded,
		totalProgramsRemoved: totalRemoved,
		totalProgramsModified: totalModified,
		totalChanges,
		changeSeverity: totalChanges > 0 ? severity : "none",
		seasonChanged: earlier.seasonChanged || later.seasonChanged,
		pools,
		warnings: [...new Set([...earlier.warnings, ...later.warnings])],
	};
}

async function readChangelog(filepath: string): Promise<ChangelogEntry | null> {
	try {
		return JSON.parse(await readFile(filepath, "utf-8")) as ChangelogEntry;
	} catch {
		return null;
	}
}

export async function saveChangelog(entry: ChangelogEntry): Promise<string | null> {
	// one changelog per day: a second run on the same date adds to the first
	// run's entry rather than replacing it
	const filepath = path.join(CHANGELOG_DIR, `${entry.date}.json`);
	const existing = await readChangelog(filepath);
	const merged = existing ? mergeChangelogs(existing, entry) : entry;

	// only save if there are actual changes
	if (merged.poolsChanged === 0 && merged.warnings.length === 0) {
		// a later run that undid everything the day's first run changed
		if (existing) await unlink(filepath);
		return null;
	}

	await mkdir(CHANGELOG_DIR, { recursive: true });
	await writeFile(filepath, JSON.stringify(merged, null, "\t"), "utf-8");
	return filepath;
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
