// The files the weekly pipeline publishes and the site reads at build time:
// their paths, their shapes, and what a missing one means. Every page is
// prerendered, so a schedule or pool list that can't be read fails the build
// rather than shipping an empty grid. Alerts are optional, since the site
// still works without the facility notices.
//
// The scripts that write these files import their types from here.
import fs from "node:fs/promises";
import path from "node:path";
import { AllSchedulesSchema, type PoolSchedule } from "@/lib/schedule-schema";
import type { Closure } from "@/lib/closures";

/** one pool in data/pools.json, the list the scrapers start from */
export type PoolRecord = {
	id: string;
	name: string;
	nameTitle: string;
	shortName: string;
	address: string;
	pageUrl: string;
	// optional keyword used to disambiguate when one facility page hosts multiple
	// schedule PDFs (e.g. North Beach has separate "warm" and "cool" pool schedules)
	scheduleMatch?: string;
};

export type PoolAlert = {
	poolId: string;
	poolName: string;
	pageUrl: string;
	alertText: string;
	scrapedAt: string;
	/** the notice PDF on sfrecpark.org, when the alert came from a document link */
	documentUrl: string | null;
	/** set when the text describes a whole-pool closure with a known duration */
	closure: Closure | null;
};

/** public/data/alerts.json */
export type AlertsData = {
	siteWideAlerts: string[];
	poolAlerts: PoolAlert[];
	lastUpdated: string;
};

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
	/** the schedule PDF this run read, so a reader can check the changes against it */
	pdfUrl?: string;
	programsAdded: number;
	programsRemoved: number;
	programsModified: number;
	changes: ProgramChange[];
};

export type ChangeSeverity = "none" | "minor" | "moderate" | "major" | "wholesale";

/** one run's data/changelog/YYYY-MM-DD.json */
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
	/**
	 * true when the source PDFs themselves declare a new season or a later start
	 * date than the previous run. High churn plus this is a rollover the city
	 * announced; high churn without it is unexplained and worth a closer look.
	 */
	seasonChanged: boolean;
	/** pools held back at their previous data because this run's extract failed health checks */
	quarantinedPools: string[];
	pools: PoolChange[];
	warnings: string[];
};

const SCHEDULES_FILE = ["public", "data", "all_schedules.json"];
const ALERTS_FILE = ["public", "data", "alerts.json"];
const POOLS_FILE = ["data", "pools.json"];
const CHANGELOG_DIR = ["data", "changelog"];

async function readJson(root: string, parts: string[]): Promise<unknown> {
	const file = path.join(root, ...parts);
	try {
		return JSON.parse(await fs.readFile(file, "utf-8"));
	} catch (error) {
		throw new Error(`can't read ${path.join(...parts)}: ${(error as Error).message}`);
	}
}

function isMissing(error: unknown): boolean {
	return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

/** every pool's schedule, checked against the extraction schema; throws when it can't be read */
export async function loadSchedules(root = process.cwd()): Promise<PoolSchedule[]> {
	const parsed = AllSchedulesSchema.safeParse(await readJson(root, SCHEDULES_FILE));
	if (!parsed.success) {
		const issue = parsed.error.issues[0]!;
		throw new Error(`${path.join(...SCHEDULES_FILE)} doesn't match the schedule schema at ${issue.path.join(".")}: ${issue.message}`);
	}
	return parsed.data;
}

/** the facility pages' notices, or null when the alerts file is missing */
export async function loadAlerts(root = process.cwd()): Promise<AlertsData | null> {
	try {
		await fs.access(path.join(root, ...ALERTS_FILE));
	} catch (error) {
		if (isMissing(error)) return null;
		throw error;
	}
	return (await readJson(root, ALERTS_FILE)) as AlertsData;
}

/** the pools the scrapers visit; throws when the list can't be read */
export async function loadPools(root = process.cwd()): Promise<PoolRecord[]> {
	return (await readJson(root, POOLS_FILE)) as PoolRecord[];
}

/**
 * Every run's changelog, newest first. A file that doesn't parse is left out
 * rather than failing the build, so one bad run only loses its own page.
 */
export async function loadChangelogs(root = process.cwd()): Promise<ChangelogEntry[]> {
	const dir = path.join(root, ...CHANGELOG_DIR);
	let files: string[];
	try {
		files = await fs.readdir(dir);
	} catch (error) {
		if (isMissing(error)) return [];
		throw error;
	}

	const entries: ChangelogEntry[] = [];
	for (const file of files) {
		if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(file)) continue;
		try {
			entries.push(JSON.parse(await fs.readFile(path.join(dir, file), "utf-8")) as ChangelogEntry);
		} catch {
			// a malformed file just doesn't get a page
		}
	}
	return entries.sort((a, b) => b.date.localeCompare(a.date));
}
