// The rules that decide what a pipeline run publishes. process-all-pdfs owns
// the I/O (reading PDFs, the extract cache, Gemini, writing files); this module
// takes the extracted schedules plus what was published last time and returns
// the schedules to ship, with the record of every rule that fired. It does no
// I/O, so the tests exercise exactly the code the pipeline runs.
import type { PoolSchedule } from "./pdf-processor";
import { cleanProgramTitle, deriveTags, findCanonicalProgram, normalizeProgramName, toTitleCase } from "./program-taxonomy";
import { getPoolIdFromName, getPoolById } from "./pool-mapping";
import { detectScheduleAnomalies, detectRegressionAnomalies, repairMeridiemTypos } from "./schedule-validation";
import { hasClosureEnded, isClosureActive, type Closure } from "./closures";

/** the pools.json entry a PDF was downloaded for */
export type SourcePool = {
	id: string;
	name: string;
	shortName: string;
	nameTitle: string;
	address: string;
	pageUrl: string;
};

/** everything one PDF yielded, plus what is known about where it came from */
export type PoolExtract = {
	/** the PDF's file name without extension; keys the extract cache */
	base: string;
	pool?: SourcePool;
	pdfUrl?: string | null;
	schedules: PoolSchedule[];
};

export type PoolIdentity = Pick<PoolSchedule, "id" | "name" | "shortName" | "nameTitle">;

export type ReleaseLog = {
	log: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
};

const silentLog: ReleaseLog = { log: () => {}, warn: () => {} };

export type ReleaseInput = {
	extracts: PoolExtract[];
	/** what the last run published */
	previousSchedules: PoolSchedule[];
	/** ids of every pool in pools.json */
	knownPoolIds: Iterable<string>;
	/** announced closures that haven't ended, by pool id */
	closures: Map<string, Closure>;
	/** YYYY-MM-DD */
	today: string;
	/** ship extracts even when they fail health checks (local dev escape hatch) */
	allowUnhealthy?: boolean;
	log?: ReleaseLog;
};

export type ReleaseResult = {
	schedules: PoolSchedule[];
	/** pools with an announced closure running today */
	closedPools: string[];
	anomalies: string[];
	/** session times corrected for an am/pm typo the published data doesn't already reflect */
	repairs: string[];
	/** pools held back at their previous data because this run's extract looked corrupt */
	quarantinedPools: string[];
	/** pools dropped entirely: extract looked corrupt and there was no previous data */
	droppedPools: string[];
	/** pools carried over from the previous run because no PDF was processed for them */
	preservedCount: number;
	/** schedules that went through the health check */
	healthCheckedCount: number;
	/** extract bases whose cached read must not be trusted next run */
	invalidatedExtracts: string[];
};

/**
 * Establish pool identity. When we know which pools.json entry this PDF
 * belongs to, trust that as the source of truth: the PDF text alone can't
 * disambiguate pools that share a name (e.g. North Beach's warm and cool
 * schedules both read "North Beach"). Fall back to name-matching only when the
 * source pool is unknown.
 */
export function resolvePoolIdentity(extractedName: string | undefined, pool?: SourcePool): PoolIdentity {
	if (pool) {
		return { id: pool.id, name: pool.name, shortName: pool.shortName, nameTitle: pool.nameTitle };
	}
	const originalName = extractedName || "";
	const poolId = getPoolIdFromName(originalName);
	if (poolId) {
		const poolMeta = getPoolById(poolId);
		return {
			id: poolId,
			name: originalName,
			shortName: poolMeta?.shortName ?? toTitleCase(originalName),
			nameTitle: poolMeta?.displayName ?? toTitleCase(originalName),
		};
	}
	// fallback to toTitleCase for unmatched pools
	return {
		id: "unknown",
		name: originalName,
		shortName: toTitleCase(originalName),
		nameTitle: toTitleCase(originalName),
	};
}

/**
 * Rewrite programName to the canonical label, preserve the original, and
 * derive the display title and tags from what the PDF actually said.
 */
export function canonicalizePrograms(programs: PoolSchedule["programs"]): PoolSchedule["programs"] {
	return programs.map((p) => {
		const original = p.programName;
		const canonical = findCanonicalProgram(original) ?? normalizeProgramName(original);
		return {
			...p,
			programNameOriginal: original,
			programName: canonical,
			programNameCanonical: canonical,
			title: cleanProgramTitle(original),
			tags: deriveTags(original),
		};
	});
}

type PoolAlert = { poolId: string; closure?: Closure | null };

/**
 * Closures by pool id, from the alerts scrape: those running today and those
 * announced for later. A closure that has already ended is ignored. The site
 * hides a pool's sessions on the dates a closure covers, so the published
 * schedule never has to change for one.
 */
export function selectClosures(poolAlerts: PoolAlert[], today: string): Map<string, Closure> {
	const byPool = new Map<string, Closure>();
	for (const alert of poolAlerts) {
		const closure = alert.closure;
		// suppressPrograms is the single gate on hiding a schedule: a partial
		// closure, or one the model flagged as unsafe to act on, stays an alert
		if (!closure || !closure.suppressPrograms) continue;
		if (hasClosureEnded(closure, today)) continue;
		// when a pool has several notices, keep the one that runs longest
		const existing = byPool.get(alert.poolId);
		if (existing) {
			if (existing.indefinite) continue;
			if (!closure.indefinite && (existing.endDate ?? "") >= (closure.endDate ?? "")) continue;
		}
		byPool.set(alert.poolId, closure);
	}
	return byPool;
}

/**
 * Turn this run's extracts into the schedules to publish. Per schedule:
 * settle identity, fill in source metadata, canonicalize programs, attach any
 * announced closure, repair am/pm typos, then health-check and quarantine a
 * corrupt extract behind the previous data. Pools nothing was extracted for
 * keep their previous schedule, unless they're no longer in pools.json.
 */
export function releaseSchedules(input: ReleaseInput): ReleaseResult {
	const {
		extracts,
		previousSchedules,
		closures,
		today,
		allowUnhealthy = false,
		log = silentLog,
	} = input;
	const previousByName = new Map<string, PoolSchedule>();
	for (const s of previousSchedules) {
		previousByName.set(s.name, s);
	}

	const result: ReleaseResult = {
		schedules: [],
		closedPools: [],
		anomalies: [],
		repairs: [],
		quarantinedPools: [],
		droppedPools: [],
		preservedCount: 0,
		healthCheckedCount: 0,
		invalidatedExtracts: [],
	};
	const aggregated = result.schedules;

	// track which pool names we've processed (to preserve unprocessed ones)
	const processedPoolNames = new Set<string>();

	for (const { base, pool, pdfUrl, schedules } of extracts) {
		try {
			for (const extracted of schedules) {
				const s: PoolSchedule = { ...extracted };
				if (!s.scheduleLastUpdated) s.scheduleLastUpdated = today;

				Object.assign(s, resolvePoolIdentity(s.name, pool));

				// track this pool name as processed (after identity is settled so the
				// preserve step keys off the canonical name)
				processedPoolNames.add(s.name);

				// populate address and URLs from pools.json and discovered data
				if (pool) {
					s.address = pool.address;
					s.sfRecParkUrl = pool.pageUrl;
				}
				if (pdfUrl) {
					s.pdfScheduleUrl = pdfUrl;
				}

				if (s.programs) s.programs = canonicalizePrograms(s.programs);

				const label = s.shortName || s.name;
				const previous = previousByName.get(s.name);

				// A closure rides along with the regular schedule rather than
				// replacing it: the site hides the sessions on the dates it covers,
				// and the changelog doesn't report a closed pool's whole week as
				// removed and then added back
				const closure = closures.get(s.id) ?? null;
				if (closure && isClosureActive(closure, today)) {
					result.closedPools.push(label);
					log.log(
						`🚧 ${label} closed (${closure.startDate ?? "?"} -> ${closure.endDate ?? "indefinite"})`
					);
					// the city sometimes replaces the schedule PDF with a closure
					// notice, which has no programs; keep last week's schedule instead
					// of treating the empty read as a bad PDF
					if (!s.programs?.length) {
						aggregated.push({ ...s, closure, programs: previous?.programs ?? [] });
						continue;
					}
				}

				// the city's PDFs occasionally flip an am/pm ("10:15am-11:15pm"), and
				// the extractor copies it faithfully. Fix the ones a flip explains
				// before the health check, which would otherwise quarantine the pool.
				// The cache holds the unrepaired read, so the same typo is repaired
				// every week the PDF stays up; only a repair the published data
				// doesn't already reflect goes in the changelog
				for (const r of repairMeridiemTypos(s)) {
					const msg = `${label}: ${r.programName} on ${r.dayOfWeek} ${r.from} → ${r.to}`;
					const [startTime, endTime] = r.to.split("-");
					const alreadyPublished = previous?.programs?.some(
						(p) =>
							p.programName === r.programName &&
							p.dayOfWeek === r.dayOfWeek &&
							p.startTime === startTime &&
							p.endTime === endTime
					);
					if (!alreadyPublished) result.repairs.push(msg);
					log.warn("🔧 repaired am/pm typo:", msg);
				}

				// health-check the extract: intrinsic problems that suggest a misread
				// PDF, plus regressions against the previous run. Volume of change is
				// deliberately not part of this — a season rollover churns most of the
				// corpus and is perfectly healthy.
				const poolAnomalies = [
					...detectScheduleAnomalies(s),
					...detectRegressionAnomalies(s, previous),
				];
				for (const a of poolAnomalies) {
					const msg = `${label}: ${a.message}`;
					result.anomalies.push(msg);
					log.warn(`⚠️  anomaly (${a.severity}):`, msg);
				}
				result.healthCheckedCount++;

				const { programs, ...rest } = s;
				const unhealthy = poolAnomalies.some((a) => a.severity === "error");

				if (unhealthy && !allowUnhealthy) {
					// hold this pool at its last known good data so the other pools can
					// still ship. Nothing is lost: the caller drops the cached extract
					// for a quarantined pool, so the next run re-extracts it.
					if (previous) {
						result.quarantinedPools.push(label);
						aggregated.push({ ...previous, closure });
						log.warn(`⛔ quarantined ${label} — keeping previous data`);
					} else {
						// no known-good data to fall back on, so publish nothing for it
						result.droppedPools.push(label);
						log.warn(`⛔ dropped ${label} — corrupt extract and no previous data`);
					}
					result.invalidatedExtracts.push(base);
					continue;
				}

				// a pool that is no longer closed drops any closure it was carrying
				aggregated.push({ ...rest, closure, programs });
			}
		} catch (err) {
			log.warn("failed to process", `${base}.pdf`, err);
		}
	}

	// preserve schedules for pools that weren't processed (PDF unchanged or
	// missing), but drop entries whose pool no longer exists in pools.json —
	// otherwise a renamed or split pool (e.g. North Beach -> cool/warm) leaves
	// a stale entry behind, since the preserve check keys off the pool name.
	const knownPoolIds = new Set(input.knownPoolIds);
	for (const prev of previousSchedules) {
		if (processedPoolNames.has(prev.name)) continue;
		if (!prev.id || !knownPoolIds.has(prev.id)) {
			log.log("dropped (no longer a known pool):", prev.name);
			continue;
		}
		aggregated.push({ ...prev, closure: closures.get(prev.id) ?? null });
		result.preservedCount++;
		log.log("preserved (no new pdf):", prev.name);
	}

	return result;
}

/** the release's rule firings, worded for the changelog's warnings */
export function releaseWarnings(release: ReleaseResult): string[] {
	return [
		...release.anomalies.map((a) => `anomaly: ${a}`),
		...release.repairs.map((r) => `repaired: ${r}`),
		...release.quarantinedPools.map((name) => `quarantined: ${name} held at previous data`),
		...release.droppedPools.map((name) => `dropped: ${name} had no usable data`),
	];
}

export type ReleaseVerdict = {
	success: boolean;
	/** why the run failed, when it did */
	failure: "nothing-to-ship" | "every-extract-failed" | null;
	/** true when a human should look, even though healthy pools still shipped */
	reviewRequired: boolean;
};

/**
 * Failure policy. The size of a change never fails anything: a seasonal
 * rollover legitimately churns most of the corpus, and blocking on volume
 * meant every changeover needed a manual override. Health is the gate
 * instead, and it acts per pool — an unhealthy pool is quarantined so the
 * healthy ones still ship. The run as a whole only fails when nothing usable
 * came out of it, which is the systemic case (a site-wide PDF layout change)
 * rather than one bad document.
 */
export function releaseVerdict(release: ReleaseResult): ReleaseVerdict {
	const { quarantinedPools, droppedPools, healthCheckedCount } = release;
	const reviewRequired = quarantinedPools.length > 0 || droppedPools.length > 0;
	const nothingToShip = release.schedules.length === 0;
	const everyExtractFailed =
		healthCheckedCount > 0 &&
		quarantinedPools.length + droppedPools.length === healthCheckedCount;
	const failure = nothingToShip ? "nothing-to-ship" : everyExtractFailed ? "every-extract-failed" : null;
	return { success: !failure, failure, reviewRequired };
}
