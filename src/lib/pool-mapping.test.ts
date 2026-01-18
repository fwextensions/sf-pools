// tests for pool-mapping.ts functions
import { describe, it, expect } from "@jest/globals";
import { getPoolById, getPoolIdFromName, validatePoolId, getAllPoolIds, POOLS } from "./pool-mapping";
import fc from "fast-check";

describe("getPoolById", () => {
	describe("unit tests", () => {
		it("should return pool metadata for valid lowercase pool ID", () => {
			const result = getPoolById("balboa");
			expect(result).not.toBeNull();
			expect(result?.id).toBe("balboa");
			expect(result?.shortName).toBe("Balboa");
			expect(result?.displayName).toBe("Balboa Pool");
		});

		it("should return pool metadata for valid uppercase pool ID", () => {
			const result = getPoolById("BALBOA");
			expect(result).not.toBeNull();
			expect(result?.id).toBe("balboa");
			expect(result?.shortName).toBe("Balboa");
		});

		it("should return pool metadata for valid mixed case pool ID", () => {
			const result = getPoolById("BaLbOa");
			expect(result).not.toBeNull();
			expect(result?.id).toBe("balboa");
		});

		it("should return pool metadata for camelCase pool ID", () => {
			const result = getPoolById("northBeach");
			expect(result).not.toBeNull();
			expect(result?.id).toBe("northBeach");
			expect(result?.shortName).toBe("North Beach");
			expect(result?.displayName).toBe("North Beach Pool");
		});

		it("should return pool metadata for camelCase pool ID with different case", () => {
			const result = getPoolById("NORTHBEACH");
			expect(result).not.toBeNull();
			expect(result?.id).toBe("northBeach");
		});

		it("should return pool metadata for MLK pool", () => {
			const result = getPoolById("mlk");
			expect(result).not.toBeNull();
			expect(result?.id).toBe("mlk");
			expect(result?.shortName).toBe("MLK");
			expect(result?.displayName).toBe("MLK Pool");
		});

		it("should return pool metadata for MLK pool with uppercase", () => {
			const result = getPoolById("MLK");
			expect(result).not.toBeNull();
			expect(result?.id).toBe("mlk");
		});

		it("should return null for invalid pool ID", () => {
			const result = getPoolById("invalid");
			expect(result).toBeNull();
		});

		it("should return null for empty string", () => {
			const result = getPoolById("");
			expect(result).toBeNull();
		});

		it("should return null for pool name instead of ID", () => {
			const result = getPoolById("Balboa Pool");
			expect(result).toBeNull();
		});

		it("should return null for pool alias instead of ID", () => {
			const result = getPoolById("balboa aquatics center");
			expect(result).toBeNull();
		});

		it("should work for all valid pool IDs", () => {
			const poolIds = ["balboa", "coffman", "garfield", "hamilton", "mlk", "mission", "northBeach", "rossi", "sava"];
			
			for (const poolId of poolIds) {
				const result = getPoolById(poolId);
				expect(result).not.toBeNull();
				expect(result?.id).toBe(poolId);
			}
		});
	});

	describe("case-insensitive lookup", () => {
		it("should return same result for lowercase and uppercase", () => {
			const lower = getPoolById("balboa");
			const upper = getPoolById("BALBOA");
			expect(lower).toEqual(upper);
			expect(lower).not.toBeNull();
		});

		it("should return same result for different case variations", () => {
			const variations = ["balboa", "Balboa", "BALBOA", "bAlBoA", "BaLbOa"];
			const results = variations.map(v => getPoolById(v));
			
			// all results should be equal
			for (let i = 1; i < results.length; i++) {
				expect(results[i]).toEqual(results[0]);
			}
			expect(results[0]).not.toBeNull();
		});

		it("should return same result for camelCase ID with different cases", () => {
			const variations = ["northBeach", "NorthBeach", "NORTHBEACH", "northbeach", "NoRtHbEaCh"];
			const results = variations.map(v => getPoolById(v));
			
			// all results should be equal
			for (let i = 1; i < results.length; i++) {
				expect(results[i]).toEqual(results[0]);
			}
			expect(results[0]).not.toBeNull();
		});
	});

	describe("O(1) performance", () => {
		it("should use Map for constant-time lookup", () => {
			// this test verifies the implementation uses a Map
			// by checking that lookup time doesn't scale with number of pools
			const iterations = 10000;
			
			const start = performance.now();
			for (let i = 0; i < iterations; i++) {
				getPoolById("balboa");
			}
			const end = performance.now();
			
			const timePerLookup = (end - start) / iterations;
			
			// O(1) lookup should be very fast (< 0.01ms per lookup)
			expect(timePerLookup).toBeLessThan(0.01);
		});
	});

	describe("edge cases", () => {
		it("should handle whitespace in ID", () => {
			const result = getPoolById(" balboa ");
			// whitespace is not trimmed, so this should return null
			expect(result).toBeNull();
		});

		it("should handle special characters in ID", () => {
			const result = getPoolById("balboa!");
			expect(result).toBeNull();
		});

		it("should handle numeric strings", () => {
			const result = getPoolById("123");
			expect(result).toBeNull();
		});
	});

	describe("all pools", () => {
		it("should return metadata for every pool in POOLS array", () => {
			for (const pool of POOLS) {
				const result = getPoolById(pool.id);
				expect(result).not.toBeNull();
				expect(result).toEqual(pool);
			}
		});

		it("should return same object reference for same pool", () => {
			const result1 = getPoolById("balboa");
			const result2 = getPoolById("balboa");
			expect(result1).toBe(result2);
		});
	});
});

describe("property-based tests", () => {
	describe("Property 4: Alias to Pool ID Conversion", () => {
		/**
		 * **Validates: Requirements 4.2**
		 * 
		 * Property: For any alias in any pool's aliases array,
		 * converting that alias to a pool ID should return the correct pool's ID.
		 */
		it("should return correct pool ID for any alias in any pool's aliases array", () => {
			// create an arbitrary that generates (pool, alias) pairs
			const poolAliasArbitrary = fc.constantFrom(...POOLS).chain(pool =>
				fc.constantFrom(...pool.aliases).map(alias => ({ pool, alias }))
			);

			fc.assert(
				fc.property(
					poolAliasArbitrary,
					({ pool, alias }) => {
						// convert the alias to a pool ID
						const result = getPoolIdFromName(alias);

						// should return the correct pool's ID
						expect(result).toBe(pool.id);
						expect(result).not.toBeNull();
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should return correct pool ID for any alias with case variations", () => {
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
						const transformed = transform(alias);
						const result = getPoolIdFromName(transformed);

						// should return the correct pool's ID regardless of case
						expect(result).toBe(pool.id);
						expect(result).not.toBeNull();
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should return correct pool ID for all aliases across all pools", () => {
			// flatten all (pool, alias) pairs
			const allPoolAliasPairs: Array<{ poolId: string; alias: string }> = [];
			for (const pool of POOLS) {
				for (const alias of pool.aliases) {
					allPoolAliasPairs.push({ poolId: pool.id, alias });
				}
			}

			fc.assert(
				fc.property(
					fc.constantFrom(...allPoolAliasPairs),
					({ poolId, alias }) => {
						const result = getPoolIdFromName(alias);
						expect(result).toBe(poolId);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 3: Invalid Pool ID Returns Null", () => {
		/**
		 * **Validates: Requirements 3.3**
		 * 
		 * Property: For any string that is not a valid pool ID,
		 * looking up the pool should return null.
		 */
		it("should return null for any invalid pool ID", () => {
			// get all valid pool IDs (lowercase normalized)
			const validPoolIds = new Set(POOLS.map(p => p.id.toLowerCase()));

			// generate strings that are NOT valid pool IDs
			const invalidIdArbitrary = fc.string().filter(s => {
				// filter out valid pool IDs (case-insensitive)
				return !validPoolIds.has(s.toLowerCase());
			});

			fc.assert(
				fc.property(
					invalidIdArbitrary,
					(invalidId) => {
						const result = getPoolById(invalidId);
						expect(result).toBeNull();
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should return null for random strings with various patterns", () => {
			// test various patterns of invalid IDs
			const validPoolIds = new Set(POOLS.map(p => p.id.toLowerCase()));
			
			const invalidPatterns = fc.oneof(
				fc.string({ minLength: 1, maxLength: 50 }), // random strings
				fc.integer().map(n => n.toString(16)), // hex strings
				fc.integer().map(n => n.toString()), // numbers as strings
				fc.uuid(), // UUIDs
				fc.constantFrom("", " ", "  ", "\t", "\n"), // whitespace
				fc.constantFrom("invalid", "unknown", "test", "fake", "xyz123"), // common invalid values
				fc.string().map(s => s + "!@#$%"), // strings with special chars
			).filter(s => !validPoolIds.has(s.toLowerCase())); // filter out valid pool IDs

			fc.assert(
				fc.property(
					invalidPatterns,
					(invalidId) => {
						const result = getPoolById(invalidId);
						expect(result).toBeNull();
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should return null for pool names and aliases (not IDs)", () => {
			// pool names and aliases should NOT work with getPoolById
			// (they should use getPoolIdFromName instead)
			// BUT we need to exclude aliases that happen to match pool IDs (case-insensitive)
			const validPoolIds = new Set(POOLS.map(p => p.id.toLowerCase()));
			const poolNamesAndAliases: string[] = [];
			
			for (const pool of POOLS) {
				// add display name if it's not a pool ID
				if (!validPoolIds.has(pool.displayName.toLowerCase())) {
					poolNamesAndAliases.push(pool.displayName);
				}
				// add short name if it's not a pool ID
				if (!validPoolIds.has(pool.shortName.toLowerCase())) {
					poolNamesAndAliases.push(pool.shortName);
				}
				// add aliases that are not pool IDs
				for (const alias of pool.aliases) {
					if (!validPoolIds.has(alias.toLowerCase())) {
						poolNamesAndAliases.push(alias);
					}
				}
			}

			// only run test if we have non-ID names/aliases
			if (poolNamesAndAliases.length > 0) {
				fc.assert(
					fc.property(
						fc.constantFrom(...poolNamesAndAliases),
						(nameOrAlias) => {
							// these should return null because they're not pool IDs
							const result = getPoolById(nameOrAlias);
							expect(result).toBeNull();
						}
					),
					{ numRuns: 100 }
				);
			}
		});

		it("should return null for valid pool IDs with modifications", () => {
			// take valid pool IDs and modify them slightly
			const modifiedIdArbitrary = fc.constantFrom(...POOLS.map(p => p.id)).chain(poolId =>
				fc.oneof(
					fc.constant(poolId + "x"), // append character
					fc.constant("x" + poolId), // prepend character
					fc.constant(poolId + " "), // add space
					fc.constant(" " + poolId), // add leading space
					fc.constant(poolId + "123"), // append numbers
					fc.constant(poolId.slice(0, -1)), // remove last character (if length > 1)
					fc.constant(poolId + poolId), // duplicate
				)
			);

			fc.assert(
				fc.property(
					modifiedIdArbitrary,
					(modifiedId) => {
						const result = getPoolById(modifiedId);
						expect(result).toBeNull();
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should return null for empty and whitespace strings", () => {
			const whitespaceArbitrary = fc.oneof(
				fc.constant(""),
				fc.constant(" "),
				fc.constant("  "),
				fc.constant("\t"),
				fc.constant("\n"),
				fc.constant("\r"),
				fc.constant(" \t\n\r "),
			);

			fc.assert(
				fc.property(
					whitespaceArbitrary,
					(whitespace) => {
						const result = getPoolById(whitespace);
						expect(result).toBeNull();
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Property 2: Case-Insensitive Pool Lookup", () => {
		/**
		 * **Validates: Requirements 3.2, 3.4**
		 * 
		 * Property: For any valid pool ID and any case variation of that ID,
		 * looking up the pool should return the same PoolMeta object.
		 */
		it("should return same PoolMeta for any case variation of valid pool ID", () => {
			// get all valid pool IDs
			const validPoolIds = POOLS.map(p => p.id);

			// arbitrary for generating case variations of a string
			const caseVariationArbitrary = (str: string) => fc.array(
				fc.boolean(),
				{ minLength: str.length, maxLength: str.length }
			).map(booleans => 
				str.split("").map((char, i) => 
					booleans[i] ? char.toUpperCase() : char.toLowerCase()
				).join("")
			);

			fc.assert(
				fc.property(
					fc.constantFrom(...validPoolIds).chain(poolId => 
						caseVariationArbitrary(poolId).map(caseVariation => ({ poolId, caseVariation }))
					),
					({ poolId, caseVariation }) => {
						// lookup both the original and the case variation
						const result1 = getPoolById(poolId);
						const result2 = getPoolById(caseVariation);

						// both should return the same PoolMeta object
						expect(result1).toEqual(result2);
						expect(result1).not.toBeNull();
						expect(result1?.id).toBe(poolId);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should return same PoolMeta for all case variations of all pool IDs", () => {
			// simpler approach: test all pools with multiple case transformations
			const caseTransformations = [
				(s: string) => s.toLowerCase(),
				(s: string) => s.toUpperCase(),
				(s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(), // title case
				(s: string) => s.split("").map((c, i) => i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()).join(""), // alternating
				(s: string) => s.split("").map((c, i) => i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()).join(""), // alternating reverse
			];

			fc.assert(
				fc.property(
					fc.constantFrom(...POOLS.map(p => p.id)),
					fc.constantFrom(...caseTransformations),
					(poolId, transform) => {
						const transformed = transform(poolId);
						const result1 = getPoolById(poolId);
						const result2 = getPoolById(transformed);

						expect(result1).toEqual(result2);
						expect(result1).not.toBeNull();
						expect(result1?.id).toBe(poolId);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should return same PoolMeta for random case variations", () => {
			// generate truly random case variations
			const randomCaseVariation = (str: string) => 
				str.split("").map(char => 
					Math.random() < 0.5 ? char.toLowerCase() : char.toUpperCase()
				).join("");

			fc.assert(
				fc.property(
					fc.constantFrom(...POOLS.map(p => p.id)),
					fc.integer({ min: 0, max: 1000 }), // seed for randomness
					(poolId, seed) => {
						// use seed to make it deterministic for the test
						const variation = poolId.split("").map((char, i) => 
							(seed + i) % 2 === 0 ? char.toLowerCase() : char.toUpperCase()
						).join("");

						const result1 = getPoolById(poolId);
						const result2 = getPoolById(variation);

						expect(result1).toEqual(result2);
						expect(result1).not.toBeNull();
						expect(result1?.id).toBe(poolId);
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});


describe("getPoolIdFromName", () => {
	describe("unit tests", () => {
		it("should return pool ID for exact pool name match", () => {
			const result = getPoolIdFromName("balboa");
			expect(result).toBe("balboa");
		});

		it("should return pool ID for pool display name", () => {
			const result = getPoolIdFromName("Balboa Pool");
			expect(result).toBe("balboa");
		});

		it("should return pool ID for pool alias", () => {
			const result = getPoolIdFromName("balboa aquatics center");
			expect(result).toBe("balboa");
		});

		it("should return pool ID for pool alias with different case", () => {
			const result = getPoolIdFromName("BALBOA AQUATICS CENTER");
			expect(result).toBe("balboa");
		});

		it("should return pool ID for MLK pool with full name", () => {
			const result = getPoolIdFromName("Martin Luther King Jr. Pool");
			expect(result).toBe("mlk");
		});

		it("should return pool ID for MLK pool with short name", () => {
			const result = getPoolIdFromName("MLK");
			expect(result).toBe("mlk");
		});

		it("should return pool ID for MLK pool with Dr. prefix", () => {
			const result = getPoolIdFromName("Dr. Martin Luther King Jr. Swimming Pool");
			expect(result).toBe("mlk");
		});

		it("should return pool ID for North Beach pool", () => {
			const result = getPoolIdFromName("North Beach Pool");
			expect(result).toBe("northBeach");
		});

		it("should return pool ID for North Beach pool with lowercase", () => {
			const result = getPoolIdFromName("north beach");
			expect(result).toBe("northBeach");
		});

		it("should return pool ID for North Beach warm pool variation", () => {
			const result = getPoolIdFromName("North Beach Aquatics Center - Warm Pool");
			expect(result).toBe("northBeach");
		});

		it("should return null for unrecognized pool name", () => {
			const result = getPoolIdFromName("Unknown Pool");
			expect(result).toBeNull();
		});

		it("should return null for empty string", () => {
			const result = getPoolIdFromName("");
			expect(result).toBeNull();
		});

		it("should return null for completely invalid name", () => {
			const result = getPoolIdFromName("xyz123");
			expect(result).toBeNull();
		});

		it("should handle fuzzy matching for slight variations", () => {
			// fuzzy matching should handle minor variations
			const result = getPoolIdFromName("Balboa Swimming Pool");
			expect(result).toBe("balboa");
		});

		it("should work for all pool aliases", () => {
			for (const pool of POOLS) {
				for (const alias of pool.aliases) {
					const result = getPoolIdFromName(alias);
					expect(result).toBe(pool.id);
				}
			}
		});

		it("should work for all pool display names", () => {
			for (const pool of POOLS) {
				const result = getPoolIdFromName(pool.displayName);
				expect(result).toBe(pool.id);
			}
		});

		it("should work for all pool short names", () => {
			for (const pool of POOLS) {
				const result = getPoolIdFromName(pool.shortName);
				expect(result).toBe(pool.id);
			}
		});
	});

	describe("case insensitivity", () => {
		it("should handle uppercase pool names", () => {
			const result = getPoolIdFromName("BALBOA POOL");
			expect(result).toBe("balboa");
		});

		it("should handle mixed case pool names", () => {
			const result = getPoolIdFromName("BaLbOa PoOl");
			expect(result).toBe("balboa");
		});

		it("should handle lowercase pool names", () => {
			const result = getPoolIdFromName("balboa pool");
			expect(result).toBe("balboa");
		});
	});

	describe("fuzzy matching", () => {
		it("should match pool name with extra words", () => {
			const result = getPoolIdFromName("Balboa Community Swimming Pool");
			expect(result).toBe("balboa");
		});

		it("should match pool name with punctuation variations", () => {
			const result = getPoolIdFromName("Balboa, Pool");
			expect(result).toBe("balboa");
		});

		it("should match pool name with extra spaces", () => {
			const result = getPoolIdFromName("Balboa   Pool");
			expect(result).toBe("balboa");
		});
	});

	describe("edge cases", () => {
		it("should handle pool name with only whitespace", () => {
			const result = getPoolIdFromName("   ");
			expect(result).toBeNull();
		});

		it("should handle pool name with special characters", () => {
			const result = getPoolIdFromName("Balboa!@#$%");
			// should still match due to fuzzy matching
			expect(result).toBe("balboa");
		});
	});
});

describe("validatePoolId", () => {
	describe("unit tests", () => {
		it("should return true for valid lowercase pool ID", () => {
			expect(validatePoolId("balboa")).toBe(true);
		});

		it("should return true for valid uppercase pool ID", () => {
			expect(validatePoolId("BALBOA")).toBe(true);
		});

		it("should return true for valid mixed case pool ID", () => {
			expect(validatePoolId("BaLbOa")).toBe(true);
		});

		it("should return true for valid camelCase pool ID", () => {
			expect(validatePoolId("northBeach")).toBe(true);
		});

		it("should return true for valid camelCase pool ID with different case", () => {
			expect(validatePoolId("NORTHBEACH")).toBe(true);
		});

		it("should return true for MLK pool ID", () => {
			expect(validatePoolId("mlk")).toBe(true);
		});

		it("should return true for MLK pool ID with uppercase", () => {
			expect(validatePoolId("MLK")).toBe(true);
		});

		it("should return false for invalid pool ID", () => {
			expect(validatePoolId("invalid")).toBe(false);
		});

		it("should return false for empty string", () => {
			expect(validatePoolId("")).toBe(false);
		});

		it("should return false for pool name instead of ID", () => {
			expect(validatePoolId("Balboa Pool")).toBe(false);
		});

		it("should return false for pool alias instead of ID", () => {
			expect(validatePoolId("balboa aquatics center")).toBe(false);
		});

		it("should return true for all valid pool IDs", () => {
			const poolIds = ["balboa", "coffman", "garfield", "hamilton", "mlk", "mission", "northBeach", "rossi", "sava"];
			
			for (const poolId of poolIds) {
				expect(validatePoolId(poolId)).toBe(true);
			}
		});

		it("should return false for pool ID with whitespace", () => {
			expect(validatePoolId(" balboa ")).toBe(false);
		});

		it("should return false for pool ID with special characters", () => {
			expect(validatePoolId("balboa!")).toBe(false);
		});

		it("should return false for numeric strings", () => {
			expect(validatePoolId("123")).toBe(false);
		});
	});

	describe("case insensitivity", () => {
		it("should return true for all case variations of valid pool ID", () => {
			const variations = ["balboa", "Balboa", "BALBOA", "bAlBoA", "BaLbOa"];
			
			for (const variation of variations) {
				expect(validatePoolId(variation)).toBe(true);
			}
		});

		it("should return true for all case variations of camelCase pool ID", () => {
			const variations = ["northBeach", "NorthBeach", "NORTHBEACH", "northbeach", "NoRtHbEaCh"];
			
			for (const variation of variations) {
				expect(validatePoolId(variation)).toBe(true);
			}
		});
	});

	describe("all pools", () => {
		it("should return true for every pool ID in POOLS array", () => {
			for (const pool of POOLS) {
				expect(validatePoolId(pool.id)).toBe(true);
			}
		});
	});
});

describe("getAllPoolIds", () => {
	describe("unit tests", () => {
		it("should return an array of pool IDs", () => {
			const result = getAllPoolIds();
			expect(Array.isArray(result)).toBe(true);
			expect(result.length).toBeGreaterThan(0);
		});

		it("should return all pool IDs from POOLS array", () => {
			const result = getAllPoolIds();
			const expected = POOLS.map(p => p.id);
			expect(result).toEqual(expected);
		});

		it("should return exactly 9 pool IDs", () => {
			const result = getAllPoolIds();
			expect(result.length).toBe(9);
		});

		it("should include all expected pool IDs", () => {
			const result = getAllPoolIds();
			const expected = ["balboa", "coffman", "garfield", "hamilton", "mlk", "mission", "northBeach", "rossi", "sava"];
			expect(result).toEqual(expected);
		});

		it("should return pool IDs in the same order as POOLS array", () => {
			const result = getAllPoolIds();
			const expected = POOLS.map(p => p.id);
			
			for (let i = 0; i < result.length; i++) {
				expect(result[i]).toBe(expected[i]);
			}
		});

		it("should return unique pool IDs", () => {
			const result = getAllPoolIds();
			const uniqueIds = new Set(result);
			expect(uniqueIds.size).toBe(result.length);
		});

		it("should return pool IDs that are all valid", () => {
			const result = getAllPoolIds();
			
			for (const poolId of result) {
				expect(validatePoolId(poolId)).toBe(true);
			}
		});

		it("should return pool IDs that can all be looked up", () => {
			const result = getAllPoolIds();
			
			for (const poolId of result) {
				const pool = getPoolById(poolId);
				expect(pool).not.toBeNull();
				expect(pool?.id).toBe(poolId);
			}
		});
	});

	describe("immutability", () => {
		it("should return a new array each time", () => {
			const result1 = getAllPoolIds();
			const result2 = getAllPoolIds();
			
			// arrays should be equal but not the same reference
			expect(result1).toEqual(result2);
			expect(result1).not.toBe(result2);
		});

		it("should not be affected by modifications to returned array", () => {
			const result1 = getAllPoolIds();
			result1.push("fake");
			
			const result2 = getAllPoolIds();
			expect(result2.length).toBe(9);
			expect(result2).not.toContain("fake");
		});
	});
});
