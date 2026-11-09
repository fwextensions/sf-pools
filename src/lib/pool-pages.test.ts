import { describe, it, expect } from "@jest/globals";
import type { PoolSchedule } from "./schedule-schema";
import type { PoolRecord } from "./site-data";
import { buildPoolPages, poolPageHref, poolPageSlugs, poolSessionHref, sessionParam } from "./pool-pages";
import { POOL_TOKENS } from "./pool-tokens";

function schedule(id: string, name: string): PoolSchedule {
	return { id, name, nameTitle: null, shortName: null, programs: [] } as unknown as PoolSchedule;
}

function record(id: string, name: string, address: string, pageUrl: string): PoolRecord {
	return { id, name, nameTitle: name, shortName: name, address, pageUrl };
}

describe("pool pages", () => {
	it("gives every pool a page", () => {
		for (const token of POOL_TOKENS) {
			expect(poolPageHref(token.id)).toMatch(/^\/pools\/[a-z-]+$/);
		}
	});

	it("lists each slug once, in lane order", () => {
		expect(poolPageSlugs()).toEqual([
			"balboa", "coffman", "garfield", "hamilton", "mission", "mlk", "north-beach", "rossi", "sava",
		]);
	});

	it("names a session by its day, start time and title", () => {
		const session = { dayOfWeek: "Tuesday", startTime: "12:30p", title: "Rec/Family Swim" };
		expect(sessionParam("mlk", session)).toBe("tue-1230p-rec-family-swim");
		expect(poolSessionHref("mlk", session)).toBe("/pools/mlk?session=tue-1230p-rec-family-swim");
	});

	it("joins several sessions' keys with commas", () => {
		const lap = { dayOfWeek: "Tuesday", startTime: "12:30p", title: "Lap Swim" };
		const rec = { dayOfWeek: "Tuesday", startTime: "12:30p", title: "Rec/Family Swim" };
		expect(poolSessionHref("mlk", [lap, rec, lap])).toBe("/pools/mlk?session=tue-1230p-lap-swim,tue-1230p-rec-family-swim");
		expect(poolSessionHref("mlk", [])).toBe("/pools/mlk");
	});

	it("adds the pool's code on a page two pools share", () => {
		const session = { dayOfWeek: "Friday", startTime: "9:00a", title: "Lap Swim (Lap/Therapy)" };
		expect(sessionParam("northBeachWarm", session)).toBe("nbw-fri-900a-lap-swim-lap-therapy");
	});

	it("falls back to the list of pools for a pool without a page", () => {
		expect(poolPageHref("atlantis")).toBe("/pools");
	});

	it("puts North Beach's two pools on one page", () => {
		const pageUrl = "https://sfrecpark.org/Facilities/Facility/Details/North-Beach-Pool-218";
		const pages = buildPoolPages(
			[
				record("northBeachCool", "North Beach Aquatics Center - Cool Pool", "661 Lombard St, San Francisco", pageUrl),
				record("northBeachWarm", "North Beach Aquatics Center - Warm Pool", "661 Lombard St, San Francisco", pageUrl),
			],
			[schedule("northBeachWarm", "Warm"), schedule("northBeachCool", "Cool")]
		);
		expect(pages).toHaveLength(1);
		expect(pages[0]).toMatchObject({
			slug: "north-beach",
			name: "North Beach Pool",
			facilityName: "North Beach Aquatics Center",
			address: "661 Lombard St",
			pageUrl,
		});
		expect(pages[0]!.pools.map(({ schedule }) => schedule.id)).toEqual(["northBeachCool", "northBeachWarm"]);
	});

	it("names a page from the pool's full name", () => {
		const pages = buildPoolPages(
			[record("mlk", "Martin Luther King Jr. Swimming Pool", "5701 3rd St, San Francisco", "https://example.org")],
			[schedule("mlk", "Martin Luther King Jr. Swimming Pool")]
		);
		expect(pages[0]).toMatchObject({ slug: "mlk", name: "Martin Luther King Jr. Pool" });
	});

	it("leaves out a pool with no published schedule", () => {
		expect(buildPoolPages([record("sava", "Sava Pool", "x", "y")], [])).toEqual([]);
	});
});
