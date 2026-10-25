import { describe, it, expect } from "@jest/globals";
import { daylight, sunAltitudeDeg } from "./sun";

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

describe("daylight", () => {
	it("is full day well above the horizon and dark after civil twilight", () => {
		expect(daylight(40)).toBe(1);
		expect(daylight(-7)).toBe(0);
	});

	it("is partway through twilight at sunset", () => {
		expect(daylight(0)).toBeGreaterThan(0);
		expect(daylight(0)).toBeLessThan(1);
	});
});
