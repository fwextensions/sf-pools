// pool name mapping with fuzzy matching
// handles inconsistent naming across PDFs (caps, "pool" vs "aquatics center", etc.)

import { toTitleCase } from "./program-taxonomy";

export type PoolMeta = {
	id: string;
	shortName: string;
	displayName: string;
	aliases: string[];
};

// canonical pool data with all known aliases
export const POOLS: PoolMeta[] = [
	{
		id: "balboa",
		shortName: "Balboa",
		displayName: "Balboa Pool",
		aliases: [
			"balboa",
			"balboa pool",
			"balboa aquatics center",
			"balboa aquatic center",
		],
	},
	{
		id: "coffman",
		shortName: "Coffman",
		displayName: "Coffman Pool",
		aliases: [
			"coffman",
			"coffman pool",
			"coffman aquatics center",
			"coffman aquatic center",
		],
	},
	{
		id: "garfield",
		shortName: "Garfield",
		displayName: "Garfield Pool",
		aliases: [
			"garfield",
			"garfield pool",
			"garfield aquatics center",
			"garfield aquatic center",
		],
	},
	{
		id: "hamilton",
		shortName: "Hamilton",
		displayName: "Hamilton Pool",
		aliases: [
			"hamilton",
			"hamilton pool",
			"hamilton aquatics center",
			"hamilton aquatic center",
		],
	},
	{
		id: "mlk",
		shortName: "MLK",
		displayName: "MLK Pool",
		aliases: [
			"mlk",
			"mlk pool",
			"martin luther king",
			"martin luther king jr",
			"martin luther king jr.",
			"dr. martin luther king",
			"dr martin luther king",
			"dr. martin luther king jr",
			"dr martin luther king jr",
			"dr. martin luther king jr.",
			"dr martin luther king jr.",
			"dr. martin luther king jr- swimming pool",
			"dr. martin luther king jr.- swimming pool",
			"martin luther king jr pool",
			"martin luther king jr. pool",
			"martin luther king jr swimming pool",
			"martin luther king jr. swimming pool",
		],
	},
	{
		id: "mission",
		shortName: "Mission",
		displayName: "Mission Pool",
		aliases: [
			"mission",
			"mission pool",
			"mission community pool",
			"mission aquatics center",
			"mission aquatic center",
		],
	},
	{
		id: "northBeach",
		shortName: "North Beach",
		displayName: "North Beach Pool",
		aliases: [
			"north beach",
			"north beach pool",
			"north beach aquatics center",
			"north beach aquatic center",
			"north beach aquatics center - warm pool",
			"north beach aquatics center - cool pool",
		],
	},
	{
		id: "rossi",
		shortName: "Rossi",
		displayName: "Rossi Pool",
		aliases: [
			"rossi",
			"rossi pool",
			"rossi aquatics center",
			"rossi aquatic center",
		],
	},
	{
		id: "sava",
		shortName: "Sava",
		displayName: "Sava Pool",
		aliases: [
			"sava",
			"sava pool",
			"sava aquatics center",
			"sava aquatic center",
		],
	},
];

// build lookup maps for fast matching
const exactMatchMap = new Map<string, PoolMeta>();
const poolIdMap = new Map<string, PoolMeta>();

for (const pool of POOLS) {
	// map pool ID (lowercase) to pool metadata for O(1) lookup
	poolIdMap.set(pool.id.toLowerCase(), pool);
	
	// map aliases for fuzzy matching
	for (const alias of pool.aliases) {
		exactMatchMap.set(alias.toLowerCase(), pool);
	}
}

// normalize a pool name for matching: lowercase, remove extra spaces, strip punctuation
function normalizeForMatch(name: string): string {
	return name
		.toLowerCase()
		.replace(/[.,\-–—:;!?'"()[\]{}]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

// extract key tokens from a name (words that identify the pool)
function extractKeyTokens(name: string): string[] {
	const normalized = normalizeForMatch(name);
	// remove common suffixes that don't help identify the pool
	const stripped = normalized
		.replace(/\b(pool|aquatics?|center|swimming|community)\b/g, "")
		.replace(/\s+/g, " ")
		.trim();
	return stripped.split(" ").filter((t) => t.length > 1);
}

// compute similarity score between two strings (0-1)
function similarity(a: string, b: string): number {
	if (a === b) return 1;
	if (!a || !b) return 0;

	const aTokens = new Set(extractKeyTokens(a));
	const bTokens = new Set(extractKeyTokens(b));

	if (aTokens.size === 0 || bTokens.size === 0) return 0;

	let matches = 0;
	for (const t of aTokens) {
		if (bTokens.has(t)) matches++;
	}

	// Jaccard-like similarity
	const union = new Set([...aTokens, ...bTokens]).size;
	return matches / union;
}

// find the best matching pool for a given name
export function findPool(rawName: string): PoolMeta | null {
	if (!rawName) return null;

	const normalized = normalizeForMatch(rawName);

	// try exact match first
	const exact = exactMatchMap.get(normalized);
	if (exact) return exact;

	// try matching without common suffixes
	const stripped = normalized
		.replace(/\b(pool|aquatics?|center|swimming|community)\b/g, "")
		.replace(/\s+/g, " ")
		.trim();
	const strippedMatch = exactMatchMap.get(stripped);
	if (strippedMatch) return strippedMatch;

	// fuzzy match: find best similarity score
	let bestPool: PoolMeta | null = null;
	let bestScore = 0;

	for (const pool of POOLS) {
		for (const alias of pool.aliases) {
			const score = similarity(normalized, alias);
			if (score > bestScore) {
				bestScore = score;
				bestPool = pool;
			}
		}
	}

	// require a minimum similarity threshold
	if (bestScore >= 0.5) {
		return bestPool;
	}

	return null;
}

// get short name for a pool (for UI display)
export function getPoolShortName(rawName: string): string | null {
	const pool = findPool(rawName);
	return pool?.shortName ?? null;
}

// get display name for a pool (consistent naming for UI)
export function getPoolDisplayName(rawName: string): string {
	const pool = findPool(rawName);
	if (pool) return pool.displayName;
	// fallback to title case of raw name
	return toTitleCase(rawName);
}

// get all pool short names (for filters)
export function getAllPoolShortNames(): string[] {
	return POOLS.map((p) => p.shortName);
}

// get pool meta by short name
export function getPoolByShortName(shortName: string): PoolMeta | null {
	return POOLS.find((p) => p.shortName.toLowerCase() === shortName.toLowerCase()) ?? null;
}

/**
 * Get pool metadata by ID
 * @param id - Pool ID (case-insensitive)
 * @returns PoolMeta or null if not found
 */
export function getPoolById(id: string): PoolMeta | null {
	if (!id) return null;
	const normalized = id.toLowerCase();
	return poolIdMap.get(normalized) ?? null;
}

/**
 * Convert a legacy pool name to a pool ID
 * @param name - Any pool name format
 * @returns Pool ID or null if no match found
 */
export function getPoolIdFromName(name: string): string | null {
	const pool = findPool(name);
	if (!pool) {
		if (process.env.NODE_ENV !== "test") {
			console.warn(`Failed to match pool name: "${name}"`);
		}
		return null;
	}
	return pool.id;
}

/**
 * Check if a pool ID is valid
 * @param id - Pool ID to validate
 * @returns true if ID exists in POOLS array
 */
export function validatePoolId(id: string): boolean {
	if (!id) return false;
	const normalized = id.toLowerCase();
	return poolIdMap.has(normalized);
}

/**
 * Get all valid pool IDs
 * @returns Array of pool IDs
 */
export function getAllPoolIds(): string[] {
	return POOLS.map((p) => p.id);
}
