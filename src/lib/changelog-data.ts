import fs from "node:fs/promises";
import path from "node:path";
import type { ChangelogEntry, ProgramChange } from "../../scripts/changelog";
import { findPool } from "./pool-mapping";
import { POOL_TOKENS, getPoolToken, type PoolToken } from "./pool-tokens";

const CHANGELOG_DIR = path.join(process.cwd(), "data", "changelog");

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export type ChangeKind = "moved" | "added" | "removed";

export type ChangeRow = {
	kind: ChangeKind;
	day: string;
	program: string;
	was: string | null;
	now: string | null;
};

export type PoolChanges = {
	name: string;
	token: PoolToken | null;
	moved: number;
	added: number;
	removed: number;
	rows: ChangeRow[];
};

export type ChangelogSummary = {
	date: string;
	totalChanges: number;
	poolsChanged: number;
	season: string | null;
	/** the first update of a new season, going by the season's name */
	newSeason: boolean;
};

export type ChangelogDetail = ChangelogSummary & {
	moved: number;
	added: number;
	removed: number;
	scheduleStartDate: string | null;
	scheduleEndDate: string | null;
	pools: PoolChanges[];
	/** dates of the neighboring updates, for stepping through them */
	older: string | null;
	newer: string | null;
};

// "7:30p" → minutes past midnight, for ordering rows within a day
function startMinutes(range: string | undefined): number {
	const m = range?.match(/^(\d{1,2}):(\d{2})([ap])/);
	if (!m) return 0;
	const hour = (Number(m[1]) % 12) + (m[3] === "p" ? 12 : 0);
	return hour * 60 + Number(m[2]);
}

function toRow(change: ProgramChange): ChangeRow {
	return {
		kind: change.type === "modified" ? "moved" : change.type,
		day: change.day,
		program: change.program,
		was: change.oldTime ?? null,
		now: change.newTime ?? null,
	};
}

function rowOrder(a: ChangeRow, b: ChangeRow): number {
	return (
		DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) ||
		startMinutes(a.was ?? a.now ?? undefined) - startMinutes(b.was ?? b.now ?? undefined)
	);
}

/**
 * Every changelog worth showing a visitor. The directory also holds files from
 * before the format settled (no severity or totals), timestamped re-runs of a
 * day that already has a file, and runs that only recorded warnings, none of
 * which describe a schedule change.
 */
async function readEntries(): Promise<ChangelogEntry[]> {
	let files: string[];
	try {
		files = await fs.readdir(CHANGELOG_DIR);
	} catch {
		return [];
	}

	const entries: ChangelogEntry[] = [];
	for (const file of files) {
		if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(file)) continue;
		try {
			const entry = JSON.parse(await fs.readFile(path.join(CHANGELOG_DIR, file), "utf-8")) as ChangelogEntry;
			if (typeof entry.totalChanges === "number" && entry.totalChanges > 0) {
				entries.push(entry);
			}
		} catch {
			// a malformed file just doesn't get a page
		}
	}

	return entries.sort((a, b) => b.date.localeCompare(a.date));
}

// "Spring 2026 pt.1", "SPRING" and "spring" are all the same season as far as
// a visitor cares; the PDFs aren't consistent about the rest of the name
function seasonKey(season: string | null): string | null {
	return season?.trim().split(/\s+/)[0]?.toLowerCase() || null;
}

// entries are newest first, so the one before an entry in time is at index + 1.
// The changelog's own seasonChanged flag also fires when a start date moves
// within a season, so it isn't used here
function summarize(entry: ChangelogEntry, index: number, entries: ChangelogEntry[]): ChangelogSummary {
	const season = seasonKey(entry.scheduleSeason);
	const previous = entries[index + 1];
	return {
		date: entry.date,
		totalChanges: entry.totalChanges,
		poolsChanged: entry.poolsChanged,
		season: entry.scheduleSeason,
		newSeason: !!season && !!previous && season !== seasonKey(previous.scheduleSeason),
	};
}

export async function listChangelogs(): Promise<ChangelogSummary[]> {
	return (await readEntries()).map(summarize);
}

export async function getChangelog(date?: string): Promise<ChangelogDetail | null> {
	const entries = await readEntries();
	const index = date ? entries.findIndex((e) => e.date === date) : 0;
	const entry = entries[index];
	if (!entry) return null;

	const pools = entry.pools
		.map((pool): PoolChanges => {
			const rows = pool.changes.map(toRow).sort(rowOrder);
			const poolMeta = findPool(pool.poolName);
			return {
				name: poolMeta?.displayName ?? pool.poolName,
				token: poolMeta ? getPoolToken(poolMeta.id) : null,
				moved: pool.programsModified,
				added: pool.programsAdded,
				removed: pool.programsRemoved,
				rows,
			};
		})
		// the grid's fixed pool order, so a pool is always in the same place
		.sort((a, b) => poolIndex(a) - poolIndex(b));

	return {
		...summarize(entry, index, entries),
		moved: entry.totalProgramsModified,
		added: entry.totalProgramsAdded,
		removed: entry.totalProgramsRemoved,
		scheduleStartDate: entry.scheduleStartDate,
		scheduleEndDate: entry.scheduleEndDate,
		pools,
		older: entries[index + 1]?.date ?? null,
		newer: entries[index - 1]?.date ?? null,
	};
}

function poolIndex(pool: PoolChanges): number {
	const index = pool.token ? POOL_TOKENS.indexOf(pool.token) : -1;
	return index === -1 ? POOL_TOKENS.length : index;
}

/**
 * "Sep 11" for a changelog date or an ISO timestamp, read in Pacific time. A
 * bare date is taken at noon UTC so no US time zone can shift it a day.
 */
export function formatShortDate(value: string, options: Intl.DateTimeFormatOptions = {}): string {
	const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		timeZone: "America/Los_Angeles",
		...options,
	});
}
