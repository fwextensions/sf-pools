// Each facility gets a page at /pools/<slug>. The slugs are public URLs, so
// they're spelled out here rather than derived from the pool ids, which can
// change without breaking links. North Beach's warm and cool pools are one
// building at one address, so they share a page.

import type { PoolSchedule } from "@/lib/schedule-schema";
import type { PoolRecord } from "@/lib/site-data";
import { POOL_TOKENS, getPoolToken, type PoolToken } from "./pool-tokens";

const SLUG_BY_POOL_ID: Record<string, string> = {
	balboa: "balboa",
	coffman: "coffman",
	garfield: "garfield",
	hamilton: "hamilton",
	mission: "mission",
	mlk: "mlk",
	northBeachCool: "north-beach",
	northBeachWarm: "north-beach",
	rossi: "rossi",
	sava: "sava",
};

// every pool with a token must have a page; throwing at module load fails the
// build rather than leaving a pool's links pointing nowhere
for (const token of POOL_TOKENS) {
	if (!SLUG_BY_POOL_ID[token.id]) {
		throw new Error(`pool-pages: pool id "${token.id}" has no page slug`);
	}
}

export type PoolPage = {
	slug: string;
	/** what people call it: "Balboa Pool", "North Beach Pool" */
	name: string;
	/** the city's name for the building: "Balboa Aquatics Center" */
	facilityName: string;
	/** street address without the city */
	address: string;
	/** the facility's page on sfrecpark.org */
	pageUrl: string;
	/** the pools on this page, in POOL_TOKENS order */
	pools: Array<{ schedule: PoolSchedule; token: PoolToken | null }>;
};

/** the page a pool's details live on, or null for an id without one */
export function poolPageSlug(poolId: string): string | null {
	return SLUG_BY_POOL_ID[poolId] ?? null;
}

/** a link to a pool's page, falling back to its section of the full schedules */
export function poolPageHref(poolId: string): string {
	const slug = poolPageSlug(poolId);
	return slug ? `/pools/${slug}` : `/schedules#pool-${poolId}`;
}

/** every slug, in the order the pages are listed */
export function poolPageSlugs(): string[] {
	return [...new Set(POOL_TOKENS.map((t) => SLUG_BY_POOL_ID[t.id]!))];
}

/**
 * One page per slug, in POOL_TOKENS order, from the scrapers' pool list and
 * the published schedules. A slug whose pools have no published schedule is
 * left out, so its page 404s rather than rendering empty.
 */
export function buildPoolPages(records: PoolRecord[], schedules: PoolSchedule[]): PoolPage[] {
	const recordById = new Map(records.map((r) => [r.id, r]));
	const scheduleById = new Map(schedules.map((s) => [s.id, s]));
	const pages = new Map<string, PoolPage>();

	for (const token of POOL_TOKENS) {
		const slug = SLUG_BY_POOL_ID[token.id]!;
		const schedule = scheduleById.get(token.id);
		if (!schedule) continue;
		const page = pages.get(slug);
		if (page) {
			page.pools.push({ schedule, token: getPoolToken(token.id) });
			continue;
		}
		const record = recordById.get(token.id);
		pages.set(slug, {
			slug,
			// the full name without the "(Warm)" that tells North Beach's two apart
			name: token.fullName.replace(/\s*\(.*\)$/, ""),
			facilityName: (record?.name ?? schedule.name).replace(/\s+-\s+\w+ Pool$/, ""),
			address: (record?.address ?? schedule.address ?? "").replace(/, San Francisco$/, ""),
			pageUrl: record?.pageUrl ?? schedule.sfRecParkUrl ?? "",
			pools: [{ schedule, token }],
		});
	}

	return [...pages.values()];
}
