import { expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readGustParams, updateGusts } from "./wave-gust";

const source = readFileSync(join(process.cwd(), "src/components/header/header-shader.frag"), "utf8");

it("reads gust defaults from the production shader", () => {
	expect(readGustParams(source)).toEqual({ GUST_DEPTH: 0.6, GUST_RATE: 0.05 });
});

it("matches the former shader envelopes within float precision", () => {
	const params = readGustParams(source);
	const out = new Float32Array(12);
	for (const time of [0, 1, 20, 123.456]) {
		updateGusts(out, time, params);
		for (let i = 0; i < 12; i++) {
			const rate = params.GUST_RATE * (0.6 + 0.8 * ((i * 0.6180339887) % 1));
			const expected = 1 + params.GUST_DEPTH * Math.sin(6.28318530718 * rate * time + i * 2.39996);
			expect(out[i]).toBeCloseTo(expected, 6);
		}
	}
});

it("supports live lab changes including disabling gusts", () => {
	const out = new Float32Array(12);
	updateGusts(out, 10, { GUST_DEPTH: 0, GUST_RATE: 0.2 });
	expect([...out]).toEqual(Array(12).fill(1));
	updateGusts(out, 10, { GUST_DEPTH: 1, GUST_RATE: 0.2 });
	expect([...out].some(v => Math.abs(v - 1) > 0.1)).toBe(true);
});
