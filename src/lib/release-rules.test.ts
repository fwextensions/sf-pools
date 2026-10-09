// tests for release-rules.ts: the publishing rules process-all-pdfs runs
import { describe, it, expect, jest } from "@jest/globals";
import fc from "fast-check";
import {
	resolvePoolIdentity,
	canonicalizePrograms,
	selectClosures,
	releaseSchedules,
	releaseWarnings,
	releaseVerdict,
	type PoolExtract,
	type ReleaseInput,
	type SourcePool,
} from "./release-rules";
import { POOLS } from "./pool-mapping";
import { toTitleCase } from "./program-taxonomy";
import type { Closure } from "./closures";
import type { PoolSchedule, ProgramEntry } from "./pdf-processor";

const TODAY = "2026-10-05";

const NORTH_BEACH_WARM: SourcePool = {
	id: "northBeachWarm",
	name: "North Beach Aquatics Center - Warm Pool",
	nameTitle: "North Beach Pool (Warm)",
	shortName: "North Beach (Warm)",
	address: "661 Lombard St, San Francisco",
	pageUrl: "https://sfrecpark.org/Facilities/Facility/Details/North-Beach-Pool-218",
};

const BALBOA: SourcePool = {
	id: "balboa",
	name: "Balboa Aquatics Center",
	nameTitle: "Balboa Pool",
	shortName: "Balboa",
	address: "1000 Ocean Ave, San Francisco",
	pageUrl: "https://sfrecpark.org/Facilities/Facility/Details/Balboa-Pool-212",
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function program(overrides: Partial<ProgramEntry> = {}): ProgramEntry {
	return {
		programName: "Lap Swim",
		dayOfWeek: "Monday",
		startTime: "9:00a",
		endTime: "10:00a",
		lanes: null,
		notes: "",
		programNameOriginal: null,
		programNameCanonical: null,
		...overrides,
	};
}

/** a healthy week: one lap swim a day */
function week(): ProgramEntry[] {
	return DAYS.map((dayOfWeek) => program({ dayOfWeek }));
}

function schedule(overrides: Partial<PoolSchedule> = {}): PoolSchedule {
	return {
		id: "",
		name: "Balboa Aquatics Center",
		nameTitle: null,
		shortName: null,
		programs: week(),
		...overrides,
	};
}

function closure(overrides: Partial<Closure> = {}): Closure {
	return {
		summary: "Closed for maintenance",
		rawText: "Closed for maintenance",
		startDate: "2026-10-01",
		endDate: "2026-10-20",
		indefinite: false,
		sourceUrl: null,
		reason: "maintenance",
		scope: "whole-pool",
		source: "pattern",
		suppressPrograms: true,
		confidence: null,
		disagreement: null,
		...overrides,
	};
}

function release(overrides: Partial<ReleaseInput> = {}) {
	return releaseSchedules({
		extracts: [],
		previousSchedules: [],
		knownPoolIds: POOLS.map((p) => p.id),
		closures: new Map(),
		today: TODAY,
		...overrides,
	});
}

function balboaExtract(overrides: Partial<PoolSchedule> = {}): PoolExtract {
	return { base: "balboa", pool: BALBOA, schedules: [schedule(overrides)] };
}

/** what a previous run published for Balboa */
function publishedBalboa(overrides: Partial<PoolSchedule> = {}): PoolSchedule {
	return {
		...schedule(),
		id: "balboa",
		name: BALBOA.name,
		shortName: BALBOA.shortName,
		nameTitle: BALBOA.nameTitle,
		closure: null,
		...overrides,
	};
}

describe("resolvePoolIdentity", () => {
	it("trusts the source pool over the name in the PDF", () => {
		// both North Beach PDFs read "North Beach", which name-matching would
		// resolve to the cool pool
		expect(resolvePoolIdentity("North Beach Aquatics Center", NORTH_BEACH_WARM)).toEqual({
			id: "northBeachWarm",
			name: "North Beach Aquatics Center - Warm Pool",
			shortName: "North Beach (Warm)",
			nameTitle: "North Beach Pool (Warm)",
		});
	});

	it("falls back to matching the extracted name when the source pool is unknown", () => {
		expect(resolvePoolIdentity("Balboa Aquatics Center")).toEqual({
			id: "balboa",
			name: "Balboa Aquatics Center",
			shortName: "Balboa",
			nameTitle: "Balboa Pool",
		});
		expect(resolvePoolIdentity("Dr. Martin Luther King Jr. Swimming Pool")).toMatchObject({
			id: "mlk",
			shortName: "MLK",
			nameTitle: "MLK Pool",
		});
		expect(resolvePoolIdentity("North Beach Aquatics Center")).toMatchObject({ id: "northBeachCool" });
	});

	it("title-cases an unrecognized name and marks it unknown", () => {
		expect(resolvePoolIdentity("UNKNOWN POOL")).toEqual({
			id: "unknown",
			name: "UNKNOWN POOL",
			shortName: "Unknown Pool",
			nameTitle: "Unknown Pool",
		});
	});

	it("treats a missing name as an empty unknown pool", () => {
		expect(resolvePoolIdentity(undefined)).toMatchObject({ id: "unknown", name: "" });
	});

	describe("name-matching properties", () => {
		const caseTransformations = [
			(s: string) => s,
			(s: string) => s.toLowerCase(),
			(s: string) => s.toUpperCase(),
			(s: string) => s.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" "),
		];

		it("maps any alias, in any case, to its pool's metadata and keeps the extracted name", () => {
			const arbitrary = fc.constantFrom(...POOLS).chain((pool) =>
				fc.tuple(fc.constant(pool), fc.constantFrom(...pool.aliases), fc.constantFrom(...caseTransformations))
			);
			fc.assert(
				fc.property(arbitrary, ([pool, alias, transform]) => {
					const name = transform(alias);
					expect(resolvePoolIdentity(name)).toEqual({
						id: pool.id,
						name,
						shortName: pool.shortName,
						nameTitle: pool.displayName,
					});
				}),
				{ numRuns: 200 }
			);
		});

		it("maps display names and short names to their pool", () => {
			const arbitrary = fc.constantFrom(...POOLS).chain((pool) =>
				fc.tuple(fc.constant(pool), fc.constantFrom(pool.displayName, pool.shortName))
			);
			fc.assert(
				fc.property(arbitrary, ([pool, name]) => {
					expect(resolvePoolIdentity(name)).toMatchObject({ id: pool.id, name, nameTitle: pool.displayName });
				}),
				{ numRuns: 100 }
			);
		});

		it("marks any unrecognized name unknown and title-cases it", () => {
			const aliases = new Set(POOLS.flatMap((pool) => pool.aliases.map((a) => a.toLowerCase())));
			const unrecognized = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !aliases.has(s.toLowerCase()));
			fc.assert(
				fc.property(unrecognized, (name) => {
					expect(resolvePoolIdentity(name)).toEqual({
						id: "unknown",
						name,
						shortName: toTitleCase(name),
						nameTitle: toTitleCase(name),
					});
				}),
				{ numRuns: 100 }
			);
		});
	});
});

describe("canonicalizePrograms", () => {
	it("keeps the PDF's wording and derives the canonical name, title and tags", () => {
		const [p] = canonicalizePrograms([program({ programName: "LAP SWIM" })]);
		expect(p.programNameOriginal).toBe("LAP SWIM");
		expect(p.programName).toBe(p.programNameCanonical);
		expect(p.title).toBeTruthy();
		expect(Array.isArray(p.tags)).toBe(true);
	});

	it("leaves its input untouched", () => {
		const input = [program({ programName: "LAP SWIM" })];
		canonicalizePrograms(input);
		expect(input[0].programName).toBe("LAP SWIM");
		expect(input[0].programNameOriginal).toBeNull();
	});
});

describe("selectClosures", () => {
	it("keeps closures that suppress programs and haven't ended", () => {
		const active = selectClosures(
			[
				{ poolId: "balboa", closure: closure() },
				{ poolId: "rossi", closure: closure({ suppressPrograms: false }) },
				{ poolId: "sava", closure: closure({ endDate: "2026-10-04" }) },
				{ poolId: "mlk", closure: closure({ startDate: "2026-10-06" }) },
				{ poolId: "garfield", closure: null },
				{ poolId: "coffman" },
			],
			TODAY
		);
		expect([...active.keys()]).toEqual(["balboa", "mlk"]);
	});

	it("keeps the longest-running notice when a pool has several", () => {
		const longer = closure({ endDate: "2026-11-01" });
		const active = selectClosures(
			[
				{ poolId: "balboa", closure: closure() },
				{ poolId: "balboa", closure: longer },
				{ poolId: "balboa", closure: closure({ endDate: "2026-10-10" }) },
			],
			TODAY
		);
		expect(active.get("balboa")).toBe(longer);
	});

	it("prefers an indefinite closure over any dated one", () => {
		const indefinite = closure({ endDate: null, indefinite: true });
		const active = selectClosures(
			[
				{ poolId: "balboa", closure: indefinite },
				{ poolId: "balboa", closure: closure({ endDate: "2027-01-01" }) },
			],
			TODAY
		);
		expect(active.get("balboa")).toBe(indefinite);
	});
});

describe("releaseSchedules", () => {
	it("publishes a healthy extract with source identity and metadata", () => {
		const extract: PoolExtract = {
			base: "northbeachwarm",
			pool: NORTH_BEACH_WARM,
			pdfUrl: "https://sfrecpark.org/DocumentCenter/View/1",
			schedules: [schedule({ name: "North Beach" })],
		};
		const result = release({ extracts: [extract] });
		expect(result.schedules).toHaveLength(1);
		expect(result.schedules[0]).toMatchObject({
			id: "northBeachWarm",
			name: NORTH_BEACH_WARM.name,
			shortName: NORTH_BEACH_WARM.shortName,
			nameTitle: NORTH_BEACH_WARM.nameTitle,
			address: NORTH_BEACH_WARM.address,
			sfRecParkUrl: NORTH_BEACH_WARM.pageUrl,
			pdfScheduleUrl: "https://sfrecpark.org/DocumentCenter/View/1",
			scheduleLastUpdated: TODAY,
			closure: null,
		});
		expect(result.schedules[0].programs.every((p) => p.programNameOriginal === "Lap Swim")).toBe(true);
		expect(result.healthCheckedCount).toBe(1);
		expect(releaseVerdict(result)).toEqual({ success: true, failure: null, reviewRequired: false });
	});

	it("keeps a schedule date the PDF supplied", () => {
		const result = release({ extracts: [balboaExtract({ scheduleLastUpdated: "2026-09-01" })] });
		expect(result.schedules[0].scheduleLastUpdated).toBe("2026-09-01");
	});

	it("doesn't mutate the extracts it is given", () => {
		const extract = balboaExtract({ programs: [program({ startTime: "10:15a", endTime: "11:15p" }), ...week()] });
		const before = JSON.stringify(extract);
		release({ extracts: [extract] });
		expect(JSON.stringify(extract)).toBe(before);
	});

	it("keeps a closed pool's programs and attaches the closure", () => {
		const active = closure();
		const result = release({
			extracts: [balboaExtract()],
			closures: new Map([["balboa", active]]),
		});
		expect(result.schedules[0]).toMatchObject({ id: "balboa", closure: active });
		expect(result.schedules[0].programs).toHaveLength(week().length);
		expect(result.closedPools).toEqual(["Balboa"]);
	});

	it("attaches an upcoming closure without counting the pool as closed", () => {
		const upcoming = closure({ startDate: "2026-10-13", endDate: "2026-11-01" });
		const result = release({
			extracts: [balboaExtract()],
			closures: new Map([["balboa", upcoming]]),
		});
		expect(result.schedules[0].closure).toBe(upcoming);
		expect(result.schedules[0].programs).toHaveLength(week().length);
		expect(result.closedPools).toEqual([]);
	});

	it("keeps the last published week when a closed pool's PDF yields nothing", () => {
		const active = closure();
		const result = release({
			extracts: [balboaExtract({ programs: [] })],
			previousSchedules: [publishedBalboa()],
			closures: new Map([["balboa", active]]),
		});
		expect(result.schedules).toEqual([expect.objectContaining({ id: "balboa", closure: active, programs: week() })]);
		expect(result.healthCheckedCount).toBe(0);
		expect(result.quarantinedPools).toEqual([]);
	});

	it("updates the closure on a pool whose PDF wasn't re-extracted", () => {
		const active = closure();
		const result = release({
			previousSchedules: [publishedBalboa()],
			closures: new Map([["balboa", active]]),
		});
		expect(result.schedules[0]).toMatchObject({ closure: active, programs: week() });
		const reopened = release({ previousSchedules: [publishedBalboa({ closure: active })] });
		expect(reopened.schedules[0].closure).toBeNull();
	});

	it("clears the closure from a pool that has reopened", () => {
		const result = release({
			extracts: [balboaExtract({ closure: closure() })],
		});
		expect(result.schedules[0].closure).toBeNull();
	});

	describe("am/pm repairs", () => {
		const typo = () => program({ programName: "Lap Swim", dayOfWeek: "Sunday", startTime: "10:15a", endTime: "11:15p" });

		it("repairs a flipped am/pm and records it for the changelog", () => {
			const result = release({ extracts: [balboaExtract({ programs: [typo(), ...week()] })] });
			const sunday = result.schedules[0].programs.find((p) => p.dayOfWeek === "Sunday");
			expect(sunday).toMatchObject({ startTime: "10:15a", endTime: "11:15a" });
			expect(result.repairs).toEqual(["Balboa: Lap Swim on Sunday 10:15a-11:15p → 10:15a-11:15a"]);
			expect(result.anomalies).toEqual([]);
		});

		it("doesn't record a repair the published data already reflects", () => {
			const fixed = program({ dayOfWeek: "Sunday", startTime: "10:15a", endTime: "11:15a" });
			const result = release({
				extracts: [balboaExtract({ programs: [typo(), ...week()] })],
				previousSchedules: [publishedBalboa({ programs: [fixed, ...week()] })],
			});
			expect(result.repairs).toEqual([]);
		});
	});

	describe("health gate", () => {
		// a session that runs backwards and no am/pm flip explains
		const corrupt = () => [program({ startTime: "3:00p", endTime: "1:00a" }), ...week()];

		it("quarantines an unhealthy extract behind the previous data", () => {
			const previous = publishedBalboa();
			const result = release({
				extracts: [balboaExtract({ programs: corrupt() })],
				previousSchedules: [previous],
			});
			expect(result.schedules).toEqual([previous]);
			expect(result.quarantinedPools).toEqual(["Balboa"]);
			expect(result.invalidatedExtracts).toEqual(["balboa"]);
			expect(result.anomalies).toEqual([expect.stringMatching(/^Balboa: /)]);
			// the pool was processed, so it isn't preserved a second time
			expect(result.preservedCount).toBe(0);
		});

		it("quarantines a schedule that collapsed against the previous run", () => {
			const result = release({
				extracts: [balboaExtract({ programs: [program()] })],
				previousSchedules: [publishedBalboa()],
			});
			expect(result.quarantinedPools).toEqual(["Balboa"]);
		});

		it("drops an unhealthy extract with nothing to fall back on", () => {
			const result = release({ extracts: [balboaExtract({ programs: corrupt() })] });
			expect(result.schedules).toEqual([]);
			expect(result.droppedPools).toEqual(["Balboa"]);
			expect(result.invalidatedExtracts).toEqual(["balboa"]);
			expect(releaseVerdict(result)).toEqual({ success: false, failure: "nothing-to-ship", reviewRequired: true });
		});

		it("ships an unhealthy extract when told to", () => {
			const result = release({ extracts: [balboaExtract({ programs: corrupt() })], allowUnhealthy: true });
			expect(result.schedules).toHaveLength(1);
			expect(result.anomalies).toHaveLength(1);
			expect(result.quarantinedPools).toEqual([]);
			expect(result.invalidatedExtracts).toEqual([]);
		});

		it("lets healthy pools ship when one is quarantined", () => {
			const result = release({
				extracts: [
					balboaExtract({ programs: corrupt() }),
					{ base: "northbeachwarm", pool: NORTH_BEACH_WARM, schedules: [schedule()] },
				],
				previousSchedules: [publishedBalboa()],
			});
			expect(result.schedules.map((s) => s.id)).toEqual(["balboa", "northBeachWarm"]);
			expect(releaseVerdict(result)).toEqual({ success: true, failure: null, reviewRequired: true });
		});

		it("fails the run when every extract fails its health check", () => {
			const result = release({
				extracts: [balboaExtract({ programs: corrupt() })],
				previousSchedules: [publishedBalboa()],
			});
			expect(releaseVerdict(result)).toEqual({
				success: false,
				failure: "every-extract-failed",
				reviewRequired: true,
			});
		});
	});

	describe("pools with no extract this run", () => {
		it("preserves the previous schedule of a known pool", () => {
			const rossi = publishedBalboa({ id: "rossi", name: "Rossi Pool" });
			const result = release({
				extracts: [balboaExtract()],
				previousSchedules: [publishedBalboa(), rossi],
			});
			expect(result.schedules.map((s) => s.id)).toEqual(["balboa", "rossi"]);
			expect(result.schedules[1]).toEqual(rossi);
			expect(result.preservedCount).toBe(1);
		});

		it("drops a previous schedule whose pool is gone from pools.json", () => {
			const result = release({
				previousSchedules: [publishedBalboa({ id: "northBeach", name: "North Beach Aquatics Center" })],
			});
			expect(result.schedules).toEqual([]);
			expect(result.preservedCount).toBe(0);
		});

		it("keys preservation off the canonical name, not the PDF's", () => {
			// the PDF says "Balboa Pool", but the pool it came from is named
			// "Balboa Aquatics Center", so the previous entry isn't kept alongside
			const result = release({
				extracts: [{ base: "balboa", pool: BALBOA, schedules: [schedule({ name: "Balboa Pool" })] }],
				previousSchedules: [publishedBalboa()],
			});
			expect(result.schedules).toHaveLength(1);
			expect(result.preservedCount).toBe(0);
		});
	});

	it("skips the rest of an extract that throws and carries on", () => {
		const broken = { base: "broken", schedules: [schedule({ programs: 42 as unknown as ProgramEntry[] })] };
		const warn = jest.fn();
		const result = release({
			extracts: [broken, balboaExtract()],
			log: { log: () => {}, warn },
		});
		expect(result.schedules.map((s) => s.id)).toEqual(["balboa"]);
		expect(warn).toHaveBeenCalledWith("failed to process", "broken.pdf", expect.any(TypeError));
	});
});

describe("releaseWarnings", () => {
	it("words each rule firing for the changelog", () => {
		const result = {
			...release(),
			anomalies: ["Balboa: no programs extracted"],
			repairs: ["Rossi: Lap Swim on Monday 9:00a-10:00p → 9:00a-10:00a"],
			quarantinedPools: ["Garfield"],
			droppedPools: ["Sava"],
		};
		expect(releaseWarnings(result)).toEqual([
			"anomaly: Balboa: no programs extracted",
			"repaired: Rossi: Lap Swim on Monday 9:00a-10:00p → 9:00a-10:00a",
			"quarantined: Garfield held at previous data",
			"dropped: Sava had no usable data",
		]);
	});
});
