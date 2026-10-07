// permanent pool identity tokens for the availability grid
// programs churn; pools don't. each pool gets a stable color + 3-letter code,
// and lane order in every grid cell is fixed to this array's order (BAL→SAV).
// `color` fills grid lanes and pool rules; `chip`/`chipText` paint the code
// chip, a step darker where white text needs it to stay legible.

import { getAllPoolIds } from "./pool-mapping";

export type PoolToken = {
	id: string;
	code: string;
	color: string;
	chip: string;
	chipText: string;
	name: string;
	// what a chip's hover title spells out, since the code alone can be cryptic
	fullName: string;
};

export const POOL_TOKENS: PoolToken[] = [
	{ id: "balboa", code: "BAL", color: "#4f7ddb", chip: "#3f6cc9", chipText: "#fff", name: "Balboa", fullName: "Balboa Pool" },
	{ id: "coffman", code: "COF", color: "#00a7a0", chip: "#00807a", chipText: "#fff", name: "Coffman", fullName: "Coffman Pool" },
	{ id: "garfield", code: "GAR", color: "#58a854", chip: "#3b8438", chipText: "#fff", name: "Garfield", fullName: "Garfield Pool" },
	// HAM keeps its lane orange with ink text: darkened enough for white it
	// turned the same rust as ROS.
	{ id: "hamilton", code: "HAM", color: "#e0813c", chip: "#e0813c", chipText: "#0e2733", name: "Hamilton", fullName: "Hamilton Pool" },
	{ id: "mission", code: "MIS", color: "#d65a78", chip: "#c44a69", chipText: "#fff", name: "Mission", fullName: "Mission Pool" },
	{ id: "mlk", code: "MLK", color: "#8a5cd6", chip: "#7a4cc6", chipText: "#fff", name: "MLK", fullName: "Martin Luther King Jr. Pool" },
	// North Beach Cool/Warm share a facility: same hue family, two shades.
	// NBW's chip keeps ink text: a fill dark enough for white would match NBC.
	{ id: "northBeachCool", code: "NBC", color: "#2596be", chip: "#1f7fa3", chipText: "#fff", name: "North Beach (Cool)", fullName: "North Beach Pool (Cool)" },
	{ id: "northBeachWarm", code: "NBW", color: "#85c8e0", chip: "#85c8e0", chipText: "#0e2733", name: "North Beach (Warm)", fullName: "North Beach Pool (Warm)" },
	{ id: "rossi", code: "ROS", color: "#b5533c", chip: "#b5533c", chipText: "#fff", name: "Rossi", fullName: "Rossi Pool" },
	{ id: "sava", code: "SAV", color: "#a3993c", chip: "#7d752a", chipText: "#fff", name: "Sava", fullName: "Sava Pool" },
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
