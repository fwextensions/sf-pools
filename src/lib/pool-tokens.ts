// permanent pool identity tokens for the availability grid
// programs churn; pools don't. each pool gets a stable color + 3-letter code,
// and lane order in every grid cell is fixed to this array's order (BAL→SAV).

import { getAllPoolIds } from "./pool-mapping";

export type PoolToken = {
	id: string;
	code: string;
	color: string;
	name: string;
};

export const POOL_TOKENS: PoolToken[] = [
	{ id: "balboa", code: "BAL", color: "#4f7ddb", name: "Balboa" },
	{ id: "coffman", code: "COF", color: "#00a7a0", name: "Coffman" },
	{ id: "garfield", code: "GAR", color: "#58a854", name: "Garfield" },
	{ id: "hamilton", code: "HAM", color: "#e0813c", name: "Hamilton" },
	{ id: "mission", code: "MIS", color: "#d65a78", name: "Mission" },
	{ id: "mlk", code: "MLK", color: "#8a5cd6", name: "MLK" },
	// North Beach Cool/Warm share a facility: same hue family, two shades
	{ id: "northBeachCool", code: "NBC", color: "#2596be", name: "North Beach (Cool)" },
	{ id: "northBeachWarm", code: "NBW", color: "#85c8e0", name: "North Beach (Warm)" },
	{ id: "rossi", code: "ROS", color: "#b5533c", name: "Rossi" },
	{ id: "sava", code: "SAV", color: "#a3993c", name: "Sava" },
];

const tokenById = new Map(POOL_TOKENS.map((t) => [t.id, t]));

// every known pool id must have a token; throwing at module load fails the
// build (during prerender) rather than silently dropping a pool's lane
for (const id of getAllPoolIds()) {
	if (!tokenById.has(id)) {
		throw new Error(`pool-tokens: pool id "${id}" has no color/code token`);
	}
}

export function getPoolToken(id: string): PoolToken | null {
	return tokenById.get(id) ?? null;
}
