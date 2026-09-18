export type GustParams = { GUST_DEPTH: number; GUST_RATE: number };

/** Keep the shader declarations as the single source for production/lab defaults. */
export function readGustParams(source: string): GustParams {
	function read(name: string) {
		const match = source.match(new RegExp(`const\\s+float\\s+${name}\\s*=\\s*([0-9.]+)\\s*;`));
		if (!match) throw new Error(`Missing water parameter: ${name}`);
		return Number(match[1]);
	}
	return { GUST_DEPTH: read("GUST_DEPTH"), GUST_RATE: read("GUST_RATE") };
}

/** Twelve time-only envelopes, packed into three vec4 uniforms. Reuse the buffer. */
export function updateGusts(out: Float32Array, time: number, params: GustParams) {
	for (let i = 0; i < 12; i++) {
		const spread = i * 0.6180339887;
		const rate = params.GUST_RATE * (0.6 + 0.8 * (spread - Math.floor(spread)));
		out[i] = 1 + params.GUST_DEPTH * Math.sin(2 * Math.PI * rate * time + i * 2.39996);
	}
}
