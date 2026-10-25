import { describe, it, expect } from "@jest/globals";
import { sunAltitudeDeg, sunlight } from "./sun";

describe("sunAltitudeDeg", () => {
	it("puts the June solstice noon sun 90 - latitude + tilt over SF", () => {
		// solar noon in SF is about 13:13 PDT (20:13 UTC) in late June
		const alt = sunAltitudeDeg(new Date("2026-06-21T20:13:00Z"));
		expect(alt).toBeGreaterThan(75);
		expect(alt).toBeLessThan(76.2);
	});

	it("is well below the horizon at local midnight", () => {
		expect(sunAltitudeDeg(new Date("2026-10-24T07:00:00Z"))).toBeLessThan(-30);
	});

	it("crosses the horizon near the published sunset", () => {
		// SF sunset on 2026-10-24 is about 18:17 PDT (01:17 UTC the next day)
		expect(sunAltitudeDeg(new Date("2026-10-25T01:00:00Z"))).toBeGreaterThan(0);
		expect(sunAltitudeDeg(new Date("2026-10-25T01:35:00Z"))).toBeLessThan(0);
	});
});

describe("sunlight", () => {
	it("is full day well above the horizon and dark after civil twilight", () => {
		expect(sunlight(40)).toEqual({ daylight: 1, color: [1, 1, 1], golden: 0 });
		expect(sunlight(-7).daylight).toBe(0);
	});

	it("warms the light near the horizon", () => {
		const { color } = sunlight(1);
		expect(color[2]).toBeLessThan(color[1]);
		expect(color[1]).toBeLessThan(1);
	});
});
