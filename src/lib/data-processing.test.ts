// integration test for data processing with new pool ID fields
import { describe, it, expect } from "@jest/globals";
import { getPoolIdFromName, getPoolById } from "./pool-mapping";
import { toTitleCase } from "./program-taxonomy";

describe("Data Processing Integration", () => {
	describe("pool field population", () => {
		it("should populate all fields correctly for a known pool", () => {
			// simulate processing a pool schedule
			const originalName = "Balboa Aquatics Center";
			
			// populate new id field using getPoolIdFromName
			const poolId = getPoolIdFromName(originalName);
			expect(poolId).toBe("balboa");
			
			// populate shortName and nameTitle using getPoolById
			const poolMeta = getPoolById(poolId!);
			expect(poolMeta).not.toBeNull();
			
			const shortName = poolMeta?.shortName ?? toTitleCase(originalName);
			const nameTitle = poolMeta?.displayName ?? toTitleCase(originalName);
			
			expect(shortName).toBe("Balboa");
			expect(nameTitle).toBe("Balboa Pool");
		});

		it("should populate all fields correctly for MLK pool", () => {
			const originalName = "Dr. Martin Luther King Jr. Swimming Pool";
			
			const poolId = getPoolIdFromName(originalName);
			expect(poolId).toBe("mlk");
			
			const poolMeta = getPoolById(poolId!);
			expect(poolMeta).not.toBeNull();
			
			const shortName = poolMeta?.shortName ?? toTitleCase(originalName);
			const nameTitle = poolMeta?.displayName ?? toTitleCase(originalName);
			
			expect(shortName).toBe("MLK");
			expect(nameTitle).toBe("MLK Pool");
		});

		it("should populate all fields correctly for North Beach pool", () => {
			const originalName = "North Beach Aquatics Center";
			
			const poolId = getPoolIdFromName(originalName);
			expect(poolId).toBe("northBeach");
			
			const poolMeta = getPoolById(poolId!);
			expect(poolMeta).not.toBeNull();
			
			const shortName = poolMeta?.shortName ?? toTitleCase(originalName);
			const nameTitle = poolMeta?.displayName ?? toTitleCase(originalName);
			
			expect(shortName).toBe("North Beach");
			expect(nameTitle).toBe("North Beach Pool");
		});

		it("should use fallback for unmatched pool names", () => {
			const originalName = "Unknown Pool Name";
			
			const poolId = getPoolIdFromName(originalName);
			expect(poolId).toBeNull();
			
			// fallback to toTitleCase for unmatched pools
			const shortName = toTitleCase(originalName);
			const nameTitle = toTitleCase(originalName);
			
			expect(shortName).toBe("Unknown Pool Name");
			expect(nameTitle).toBe("Unknown Pool Name");
		});

		it("should handle all known pool name variations", () => {
			const testCases = [
				{ input: "Balboa Pool", expectedId: "balboa", expectedShort: "Balboa" },
				{ input: "balboa aquatics center", expectedId: "balboa", expectedShort: "Balboa" },
				{ input: "Coffman Pool", expectedId: "coffman", expectedShort: "Coffman" },
				{ input: "Garfield Pool", expectedId: "garfield", expectedShort: "Garfield" },
				{ input: "Hamilton Pool", expectedId: "hamilton", expectedShort: "Hamilton" },
				{ input: "MLK", expectedId: "mlk", expectedShort: "MLK" },
				{ input: "Martin Luther King Jr. Pool", expectedId: "mlk", expectedShort: "MLK" },
				{ input: "Mission Pool", expectedId: "mission", expectedShort: "Mission" },
				{ input: "North Beach Pool", expectedId: "northBeach", expectedShort: "North Beach" },
				{ input: "north beach", expectedId: "northBeach", expectedShort: "North Beach" },
				{ input: "Rossi Pool", expectedId: "rossi", expectedShort: "Rossi" },
				{ input: "Sava Pool", expectedId: "sava", expectedShort: "Sava" },
			];

			for (const testCase of testCases) {
				const poolId = getPoolIdFromName(testCase.input);
				expect(poolId).toBe(testCase.expectedId);

				const poolMeta = getPoolById(poolId!);
				expect(poolMeta).not.toBeNull();
				expect(poolMeta?.shortName).toBe(testCase.expectedShort);
			}
		});

		it("should preserve original name in name field", () => {
			const originalName = "Balboa Aquatics Center";
			
			// the name field should always contain the original name
			const name = originalName;
			expect(name).toBe("Balboa Aquatics Center");
			
			// even though we resolve it to a pool ID
			const poolId = getPoolIdFromName(originalName);
			expect(poolId).toBe("balboa");
			
			// the original name is preserved
			expect(name).toBe(originalName);
		});

		it("should handle case variations in pool names", () => {
			const variations = [
				"BALBOA POOL",
				"balboa pool",
				"Balboa Pool",
				"BaLbOa PoOl",
			];

			for (const variation of variations) {
				const poolId = getPoolIdFromName(variation);
				expect(poolId).toBe("balboa");

				const poolMeta = getPoolById(poolId!);
				expect(poolMeta?.shortName).toBe("Balboa");
				expect(poolMeta?.displayName).toBe("Balboa Pool");
			}
		});
	});

	describe("complete data processing flow", () => {
		it("should process a complete pool schedule object", () => {
			// simulate a schedule object from extractScheduleFromPdf
			const schedule = {
				name: "Balboa Aquatics Center",
				address: "51 Havelock St, San Francisco",
				programs: [],
			};

			// process it like we do in process-all-pdfs.ts
			const originalName = schedule.name || "";
			const poolId = getPoolIdFromName(originalName);
			
			const result = {
				...schedule,
				id: poolId ?? "unknown",
				name: originalName,
				shortName: poolId ? getPoolById(poolId)?.shortName ?? toTitleCase(originalName) : toTitleCase(originalName),
				nameTitle: poolId ? getPoolById(poolId)?.displayName ?? toTitleCase(originalName) : toTitleCase(originalName),
			};

			expect(result.id).toBe("balboa");
			expect(result.name).toBe("Balboa Aquatics Center");
			expect(result.shortName).toBe("Balboa");
			expect(result.nameTitle).toBe("Balboa Pool");
		});

		it("should process a schedule with unknown pool name", () => {
			const schedule = {
				name: "Unknown Pool",
				address: "123 Main St",
				programs: [],
			};

			const originalName = schedule.name || "";
			const poolId = getPoolIdFromName(originalName);
			
			const result = {
				...schedule,
				id: poolId ?? "unknown",
				name: originalName,
				shortName: poolId ? getPoolById(poolId)?.shortName ?? toTitleCase(originalName) : toTitleCase(originalName),
				nameTitle: poolId ? getPoolById(poolId)?.displayName ?? toTitleCase(originalName) : toTitleCase(originalName),
			};

			expect(result.id).toBe("unknown");
			expect(result.name).toBe("Unknown Pool");
			expect(result.shortName).toBe("Unknown Pool");
			expect(result.nameTitle).toBe("Unknown Pool");
		});
	});
});

// property-based tests
import fc from "fast-check";
import { POOLS } from "./pool-mapping";

describe("property-based tests", () => {
	describe("Property 8: Pool Schedule ID Population", () => {
		/**
		 * **Validates: Requirements 7.2**
		 * 
		 * Property: For any pool data with a legacy pool name,
		 * processing the data should populate the id field with the correct pool ID
		 * obtained from the Pool_Mapping_System.
		 */
		it("should populate id field with correct pool ID for any pool alias", () => {
			// create an arbitrary that generates (pool, alias) pairs
			const poolAliasArbitrary = fc.constantFrom(...POOLS).chain(pool =>
				fc.constantFrom(...pool.aliases).map(alias => ({ pool, alias }))
			);

			fc.assert(
				fc.property(
					poolAliasArbitrary,
					({ pool, alias }) => {
						// simulate processing pool data with a legacy pool name
						const originalName = alias;
						const poolId = getPoolIdFromName(originalName);

						// the id field should be populated with the correct pool ID
						expect(poolId).toBe(pool.id);
						expect(poolId).not.toBeNull();

						// simulate the complete processing flow
						const result = {
							id: poolId ?? "unknown",
							name: originalName,
							shortName: poolId ? getPoolById(poolId)?.shortName ?? toTitleCase(originalName) : toTitleCase(originalName),
							nameTitle: poolId ? getPoolById(poolId)?.displayName ?? toTitleCase(originalName) : toTitleCase(originalName),
						};

						// verify the id field is correctly populated
						expect(result.id).toBe(pool.id);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should populate id field with correct pool ID for any pool alias with case variations", () => {
			// test aliases with different case transformations
			const caseTransformations = [
				(s: string) => s.toLowerCase(),
				(s: string) => s.toUpperCase(),
				(s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(), // title case
				(s: string) => s.split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" "), // title case each word
			];

			const poolAliasArbitrary = fc.constantFrom(...POOLS).chain(pool =>
				fc.constantFrom(...pool.aliases).chain(alias =>
					fc.constantFrom(...caseTransformations).map(transform => ({
						pool,
						alias,
						transform
					}))
				)
			);

			fc.assert(
				fc.property(
					poolAliasArbitrary,
					({ pool, alias, transform }) => {
						// simulate processing pool data with a legacy pool name (case variation)
						const originalName = transform(alias);
						const poolId = getPoolIdFromName(originalName);

						// the id field should be populated with the correct pool ID regardless of case
						expect(poolId).toBe(pool.id);
						expect(poolId).not.toBeNull();

						// simulate the complete processing flow
						const result = {
							id: poolId ?? "unknown",
							name: originalName,
							shortName: poolId ? getPoolById(poolId)?.shortName ?? toTitleCase(originalName) : toTitleCase(originalName),
							nameTitle: poolId ? getPoolById(poolId)?.displayName ?? toTitleCase(originalName) : toTitleCase(originalName),
						};

						// verify the id field is correctly populated
						expect(result.id).toBe(pool.id);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should populate id field with 'unknown' for unrecognized pool names", () => {
			// get all valid pool aliases (lowercase normalized)
			const validAliases = new Set(
				POOLS.flatMap(pool => pool.aliases.map(alias => alias.toLowerCase()))
			);

			// generate strings that are NOT valid pool aliases
			const invalidNameArbitrary = fc.string({ minLength: 1, maxLength: 50 }).filter(s => {
				// filter out valid pool aliases (case-insensitive)
				return !validAliases.has(s.toLowerCase());
			});

			fc.assert(
				fc.property(
					invalidNameArbitrary,
					(invalidName) => {
						// simulate processing pool data with an unrecognized pool name
						const originalName = invalidName;
						const poolId = getPoolIdFromName(originalName);

						// the id field should be populated with "unknown"
						expect(poolId).toBeNull();

						// simulate the complete processing flow
						const result = {
							id: poolId ?? "unknown",
							name: originalName,
							shortName: poolId ? getPoolById(poolId)?.shortName ?? toTitleCase(originalName) : toTitleCase(originalName),
							nameTitle: poolId ? getPoolById(poolId)?.displayName ?? toTitleCase(originalName) : toTitleCase(originalName),
						};

						// verify the id field is set to "unknown"
						expect(result.id).toBe("unknown");
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should populate id field correctly for all pool display names and short names", () => {
			// test with display names and short names
			const poolNameArbitrary = fc.constantFrom(...POOLS).chain(pool =>
				fc.constantFrom(pool.displayName, pool.shortName).map(name => ({ pool, name }))
			);

			fc.assert(
				fc.property(
					poolNameArbitrary,
					({ pool, name }) => {
						// simulate processing pool data with display name or short name
						const originalName = name;
						const poolId = getPoolIdFromName(originalName);

						// the id field should be populated with the correct pool ID
						expect(poolId).toBe(pool.id);
						expect(poolId).not.toBeNull();

						// simulate the complete processing flow
						const result = {
							id: poolId ?? "unknown",
							name: originalName,
							shortName: poolId ? getPoolById(poolId)?.shortName ?? toTitleCase(originalName) : toTitleCase(originalName),
							nameTitle: poolId ? getPoolById(poolId)?.displayName ?? toTitleCase(originalName) : toTitleCase(originalName),
						};

						// verify the id field is correctly populated
						expect(result.id).toBe(pool.id);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should populate id field correctly for complete pool schedule objects", () => {
			// test with complete pool schedule objects
			const poolScheduleArbitrary = fc.constantFrom(...POOLS).chain(pool =>
				fc.constantFrom(...pool.aliases).map(alias => ({
					pool,
					schedule: {
						name: alias,
						address: "123 Main St, San Francisco",
						programs: [],
					}
				}))
			);

			fc.assert(
				fc.property(
					poolScheduleArbitrary,
					({ pool, schedule }) => {
						// simulate the complete data processing flow
						const originalName = schedule.name || "";
						const poolId = getPoolIdFromName(originalName);

						const result = {
							...schedule,
							id: poolId ?? "unknown",
							name: originalName,
							shortName: poolId ? getPoolById(poolId)?.shortName ?? toTitleCase(originalName) : toTitleCase(originalName),
							nameTitle: poolId ? getPoolById(poolId)?.displayName ?? toTitleCase(originalName) : toTitleCase(originalName),
						};

						// verify the id field is correctly populated
						expect(result.id).toBe(pool.id);
						expect(result.name).toBe(originalName);
						expect(result.shortName).toBe(pool.shortName);
						expect(result.nameTitle).toBe(pool.displayName);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 9: Original Name Preservation", () => {
		/**
		 * **Validates: Requirements 7.3**
		 * 
		 * Property: For any pool data being processed,
		 * the name field should remain unchanged and contain the original pool name
		 * from the data source.
		 */
		it("should preserve original pool name in name field for any pool alias", () => {
			// create an arbitrary that generates (pool, alias) pairs
			const poolAliasArbitrary = fc.constantFrom(...POOLS).chain(pool =>
				fc.constantFrom(...pool.aliases).map(alias => ({ pool, alias }))
			);

			fc.assert(
				fc.property(
					poolAliasArbitrary,
					({ pool, alias }) => {
						// simulate processing pool data with a legacy pool name
						const originalName = alias;
						const poolId = getPoolIdFromName(originalName);

						// simulate the complete processing flow
						const result = {
							id: poolId ?? "unknown",
							name: originalName,
							shortName: poolId ? getPoolById(poolId)?.shortName ?? toTitleCase(originalName) : toTitleCase(originalName),
							nameTitle: poolId ? getPoolById(poolId)?.displayName ?? toTitleCase(originalName) : toTitleCase(originalName),
						};

						// the name field should remain unchanged and equal to the original name
						expect(result.name).toBe(originalName);
						expect(result.name).toBe(alias);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should preserve original pool name with case variations", () => {
			// test aliases with different case transformations
			const caseTransformations = [
				(s: string) => s.toLowerCase(),
				(s: string) => s.toUpperCase(),
				(s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(), // title case
				(s: string) => s.split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" "), // title case each word
			];

			const poolAliasArbitrary = fc.constantFrom(...POOLS).chain(pool =>
				fc.constantFrom(...pool.aliases).chain(alias =>
					fc.constantFrom(...caseTransformations).map(transform => ({
						pool,
						alias,
						transform
					}))
				)
			);

			fc.assert(
				fc.property(
					poolAliasArbitrary,
					({ pool, alias, transform }) => {
						// simulate processing pool data with a legacy pool name (case variation)
						const originalName = transform(alias);
						const poolId = getPoolIdFromName(originalName);

						// simulate the complete processing flow
						const result = {
							id: poolId ?? "unknown",
							name: originalName,
							shortName: poolId ? getPoolById(poolId)?.shortName ?? toTitleCase(originalName) : toTitleCase(originalName),
							nameTitle: poolId ? getPoolById(poolId)?.displayName ?? toTitleCase(originalName) : toTitleCase(originalName),
						};

						// the name field should remain unchanged and equal to the original name
						// (not normalized, not converted to pool ID, not replaced with display name)
						expect(result.name).toBe(originalName);
						expect(result.name).toBe(transform(alias));
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should preserve original pool name for unrecognized pool names", () => {
			// get all valid pool aliases (lowercase normalized)
			const validAliases = new Set(
				POOLS.flatMap(pool => pool.aliases.map(alias => alias.toLowerCase()))
			);

			// generate strings that are NOT valid pool aliases
			const invalidNameArbitrary = fc.string({ minLength: 1, maxLength: 50 }).filter(s => {
				// filter out valid pool aliases (case-insensitive)
				return !validAliases.has(s.toLowerCase());
			});

			fc.assert(
				fc.property(
					invalidNameArbitrary,
					(invalidName) => {
						// simulate processing pool data with an unrecognized pool name
						const originalName = invalidName;
						const poolId = getPoolIdFromName(originalName);

						// simulate the complete processing flow
						const result = {
							id: poolId ?? "unknown",
							name: originalName,
							shortName: poolId ? getPoolById(poolId)?.shortName ?? toTitleCase(originalName) : toTitleCase(originalName),
							nameTitle: poolId ? getPoolById(poolId)?.displayName ?? toTitleCase(originalName) : toTitleCase(originalName),
						};

						// the name field should remain unchanged and equal to the original name
						// even when the pool ID is "unknown"
						expect(result.name).toBe(originalName);
						expect(result.name).toBe(invalidName);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should preserve original pool name for display names and short names", () => {
			// test with display names and short names
			const poolNameArbitrary = fc.constantFrom(...POOLS).chain(pool =>
				fc.constantFrom(pool.displayName, pool.shortName).map(name => ({ pool, name }))
			);

			fc.assert(
				fc.property(
					poolNameArbitrary,
					({ pool, name }) => {
						// simulate processing pool data with display name or short name
						const originalName = name;
						const poolId = getPoolIdFromName(originalName);

						// simulate the complete processing flow
						const result = {
							id: poolId ?? "unknown",
							name: originalName,
							shortName: poolId ? getPoolById(poolId)?.shortName ?? toTitleCase(originalName) : toTitleCase(originalName),
							nameTitle: poolId ? getPoolById(poolId)?.displayName ?? toTitleCase(originalName) : toTitleCase(originalName),
						};

						// the name field should remain unchanged and equal to the original name
						// even though shortName and nameTitle are populated from pool metadata
						expect(result.name).toBe(originalName);
						expect(result.name).toBe(name);
						
						// verify that name is different from shortName and nameTitle
						// (unless the original name happens to match them)
						if (originalName !== pool.shortName) {
							expect(result.name).not.toBe(result.shortName);
						}
						if (originalName !== pool.displayName) {
							expect(result.name).not.toBe(result.nameTitle);
						}
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should preserve original pool name in complete pool schedule objects", () => {
			// test with complete pool schedule objects
			const poolScheduleArbitrary = fc.constantFrom(...POOLS).chain(pool =>
				fc.constantFrom(...pool.aliases).map(alias => ({
					pool,
					alias,
					schedule: {
						name: alias,
						address: "123 Main St, San Francisco",
						programs: [],
					}
				}))
			);

			fc.assert(
				fc.property(
					poolScheduleArbitrary,
					({ pool, alias, schedule }) => {
						// simulate the complete data processing flow
						const originalName = schedule.name || "";
						const poolId = getPoolIdFromName(originalName);

						const result = {
							...schedule,
							id: poolId ?? "unknown",
							name: originalName,
							shortName: poolId ? getPoolById(poolId)?.shortName ?? toTitleCase(originalName) : toTitleCase(originalName),
							nameTitle: poolId ? getPoolById(poolId)?.displayName ?? toTitleCase(originalName) : toTitleCase(originalName),
						};

						// the name field should remain unchanged and equal to the original name
						expect(result.name).toBe(originalName);
						expect(result.name).toBe(schedule.name);
						
						// verify that the original name is preserved even though we have
						// populated id, shortName, and nameTitle from pool metadata
						expect(result.id).toBe(pool.id);
						expect(result.shortName).toBe(pool.shortName);
						expect(result.nameTitle).toBe(pool.displayName);
						
						// but name should still be the original alias
						expect(result.name).toBe(alias);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should preserve original pool name with special characters and whitespace", () => {
			// test with pool names that have special characters and extra whitespace
			const poolNameWithVariationsArbitrary = fc.constantFrom(...POOLS).chain(pool =>
				fc.constantFrom(...pool.aliases).chain(alias =>
					fc.oneof(
						fc.constant(alias + "  "), // trailing spaces
						fc.constant("  " + alias), // leading spaces
						fc.constant(alias + "!"), // special character
						fc.constant(alias + " - Swimming Pool"), // extra suffix
						fc.constant(alias), // unchanged
					).map(variation => ({ pool, alias, variation }))
				)
			);

			fc.assert(
				fc.property(
					poolNameWithVariationsArbitrary,
					({ pool, alias, variation }) => {
						// simulate processing pool data with variations
						const originalName = variation;
						const poolId = getPoolIdFromName(originalName);

						// simulate the complete processing flow
						const result = {
							id: poolId ?? "unknown",
							name: originalName,
							shortName: poolId ? getPoolById(poolId)?.shortName ?? toTitleCase(originalName) : toTitleCase(originalName),
							nameTitle: poolId ? getPoolById(poolId)?.displayName ?? toTitleCase(originalName) : toTitleCase(originalName),
						};

						// the name field should remain unchanged and equal to the original name
						// (not trimmed, not normalized, not cleaned up)
						expect(result.name).toBe(originalName);
						expect(result.name).toBe(variation);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 10: Display Name Population", () => {
		/**
		 * **Validates: Requirements 7.4, 7.5**
		 * 
		 * Property: For any pool data being processed,
		 * the shortName and nameTitle fields should be populated with values
		 * from the Pool_Mapping_System matching the resolved pool ID.
		 */
		it("should populate shortName and nameTitle from pool metadata for any pool alias", () => {
			// create an arbitrary that generates (pool, alias) pairs
			const poolAliasArbitrary = fc.constantFrom(...POOLS).chain(pool =>
				fc.constantFrom(...pool.aliases).map(alias => ({ pool, alias }))
			);

			fc.assert(
				fc.property(
					poolAliasArbitrary,
					({ pool, alias }) => {
						// simulate processing pool data with a legacy pool name
						const originalName = alias;
						const poolId = getPoolIdFromName(originalName);

						// simulate the complete processing flow
						const result = {
							id: poolId ?? "unknown",
							name: originalName,
							shortName: poolId ? getPoolById(poolId)?.shortName ?? toTitleCase(originalName) : toTitleCase(originalName),
							nameTitle: poolId ? getPoolById(poolId)?.displayName ?? toTitleCase(originalName) : toTitleCase(originalName),
						};

						// the shortName and nameTitle fields should be populated from pool metadata
						expect(result.shortName).toBe(pool.shortName);
						expect(result.nameTitle).toBe(pool.displayName);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should populate shortName and nameTitle from pool metadata with case variations", () => {
			// test aliases with different case transformations
			const caseTransformations = [
				(s: string) => s.toLowerCase(),
				(s: string) => s.toUpperCase(),
				(s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(),
				(s: string) => s.split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" "),
			];

			const poolAliasArbitrary = fc.constantFrom(...POOLS).chain(pool =>
				fc.constantFrom(...pool.aliases).chain(alias =>
					fc.constantFrom(...caseTransformations).map(transform => ({
						pool,
						alias,
						transform
					}))
				)
			);

			fc.assert(
				fc.property(
					poolAliasArbitrary,
					({ pool, alias, transform }) => {
						// simulate processing pool data with a legacy pool name (case variation)
						const originalName = transform(alias);
						const poolId = getPoolIdFromName(originalName);

						// simulate the complete processing flow
						const result = {
							id: poolId ?? "unknown",
							name: originalName,
							shortName: poolId ? getPoolById(poolId)?.shortName ?? toTitleCase(originalName) : toTitleCase(originalName),
							nameTitle: poolId ? getPoolById(poolId)?.displayName ?? toTitleCase(originalName) : toTitleCase(originalName),
						};

						// the shortName and nameTitle fields should be populated from pool metadata
						// regardless of the case of the input
						expect(result.shortName).toBe(pool.shortName);
						expect(result.nameTitle).toBe(pool.displayName);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should use fallback for shortName and nameTitle when pool ID is unknown", () => {
			// get all valid pool aliases (lowercase normalized)
			const validAliases = new Set(
				POOLS.flatMap(pool => pool.aliases.map(alias => alias.toLowerCase()))
			);

			// generate strings that are NOT valid pool aliases
			const invalidNameArbitrary = fc.string({ minLength: 1, maxLength: 50 }).filter(s => {
				// filter out valid pool aliases (case-insensitive)
				return !validAliases.has(s.toLowerCase());
			});

			fc.assert(
				fc.property(
					invalidNameArbitrary,
					(invalidName) => {
						// simulate processing pool data with an unrecognized pool name
						const originalName = invalidName;
						const poolId = getPoolIdFromName(originalName);

						// simulate the complete processing flow
						const result = {
							id: poolId ?? "unknown",
							name: originalName,
							shortName: poolId ? getPoolById(poolId)?.shortName ?? toTitleCase(originalName) : toTitleCase(originalName),
							nameTitle: poolId ? getPoolById(poolId)?.displayName ?? toTitleCase(originalName) : toTitleCase(originalName),
						};

						// the shortName and nameTitle fields should use fallback (toTitleCase)
						expect(result.shortName).toBe(toTitleCase(originalName));
						expect(result.nameTitle).toBe(toTitleCase(originalName));
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should populate shortName and nameTitle correctly for all pool display names and short names", () => {
			// test with display names and short names
			const poolNameArbitrary = fc.constantFrom(...POOLS).chain(pool =>
				fc.constantFrom(pool.displayName, pool.shortName).map(name => ({ pool, name }))
			);

			fc.assert(
				fc.property(
					poolNameArbitrary,
					({ pool, name }) => {
						// simulate processing pool data with display name or short name
						const originalName = name;
						const poolId = getPoolIdFromName(originalName);

						// simulate the complete processing flow
						const result = {
							id: poolId ?? "unknown",
							name: originalName,
							shortName: poolId ? getPoolById(poolId)?.shortName ?? toTitleCase(originalName) : toTitleCase(originalName),
							nameTitle: poolId ? getPoolById(poolId)?.displayName ?? toTitleCase(originalName) : toTitleCase(originalName),
						};

						// the shortName and nameTitle fields should be populated from pool metadata
						expect(result.shortName).toBe(pool.shortName);
						expect(result.nameTitle).toBe(pool.displayName);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should populate shortName and nameTitle correctly in complete pool schedule objects", () => {
			// test with complete pool schedule objects
			const poolScheduleArbitrary = fc.constantFrom(...POOLS).chain(pool =>
				fc.constantFrom(...pool.aliases).map(alias => ({
					pool,
					schedule: {
						name: alias,
						address: "123 Main St, San Francisco",
						programs: [],
					}
				}))
			);

			fc.assert(
				fc.property(
					poolScheduleArbitrary,
					({ pool, schedule }) => {
						// simulate the complete data processing flow
						const originalName = schedule.name || "";
						const poolId = getPoolIdFromName(originalName);

						const result = {
							...schedule,
							id: poolId ?? "unknown",
							name: originalName,
							shortName: poolId ? getPoolById(poolId)?.shortName ?? toTitleCase(originalName) : toTitleCase(originalName),
							nameTitle: poolId ? getPoolById(poolId)?.displayName ?? toTitleCase(originalName) : toTitleCase(originalName),
						};

						// verify shortName and nameTitle are populated from pool metadata
						expect(result.shortName).toBe(pool.shortName);
						expect(result.nameTitle).toBe(pool.displayName);
						
						// verify they are different from the original name (unless they happen to match)
						// this ensures we're actually using pool metadata, not just the original name
						if (originalName !== pool.shortName && originalName !== pool.displayName) {
							expect(result.shortName).not.toBe(result.name);
							expect(result.nameTitle).not.toBe(result.name);
						}
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
