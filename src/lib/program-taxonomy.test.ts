// the raw names in these cases are verbatim from pool PDFs; see
// docs/program-taxonomy-review.md for where each one showed up
import { describe, it, expect } from "@jest/globals";
import { CANONICAL_CATEGORIES, findCanonicalProgram } from "./program-taxonomy";

describe("findCanonicalProgram", () => {
	it("only ever returns a declared category", () => {
		const samples = [
			"Lap Swim", "Summer LTS", "SFRPD Camps", "Rentals (Club)", "Special Olympics",
			"DEEP WATER H2O AEROBICS", "Piranha PC Swim*", "Adult Swim Lessons", "Parent & Tot",
		];
		for (const s of samples) {
			const canonical = findCanonicalProgram(s);
			expect(canonical).not.toBeNull();
			expect(CANONICAL_CATEGORIES).toContain(canonical);
		}
	});

	it("reads LTS as learn to swim", () => {
		expect(findCanonicalProgram("Summer LTS")).toBe("Swim Lessons (General/Youth/Community)");
		expect(findCanonicalProgram("Summer LTS^")).toBe("Swim Lessons (General/Youth/Community)");
		expect(findCanonicalProgram("Summer LTS (Small Pool)")).toBe("Swim Lessons (General/Youth/Community)");
	});

	it("recognizes camps", () => {
		expect(findCanonicalProgram("SFRPD Camps")).toBe("Camps");
	});

	it("recognizes aerobics without the word exercise", () => {
		expect(findCanonicalProgram("DEEP WATER H2O AEROBICS")).toBe("Water Exercise");
		expect(findCanonicalProgram("Water Exercise")).toBe("Water Exercise");
	});

	it("recognizes the swim club in both singular and plural", () => {
		expect(findCanonicalProgram("Piranha PC Swim*")).toBe("Youth Swim Teams / Club Teams");
		expect(findCanonicalProgram("PIRANHAS SWIM*")).toBe("Youth Swim Teams / Club Teams");
		expect(findCanonicalProgram("Junior Piranha PC Swim *")).toBe("Youth Swim Teams / Club Teams");
	});

	describe("rentals", () => {
		it("files every rental under one category, whoever rented the water", () => {
			for (const raw of [
				"RENTALS",
				"Rentals (Club)",
				"Rentals (Synchro)",
				"Rentals (Masters)",
				"Rental (Masters)",
				"Rental (Youth Teams)",
				"RENTALS (7) MASTERS/SYNCHRO",
				"RENTALS (10) SYNCHRO/HOCKEY",
				"RENTALS (10) YOUTH HOCKEY",
			]) {
				expect(findCanonicalProgram(raw)).toBe("Rentals / Private Use");
			}
		});

		it("keeps private and permitted use out of the closure bucket", () => {
			expect(findCanonicalProgram("Private Party")).toBe("Rentals / Private Use");
			expect(findCanonicalProgram("Permit Group")).toBe("Rentals / Private Use");
		});

		it("still treats an actual closure as a closure", () => {
			expect(findCanonicalProgram("CLOSED FOR STAFF TRAINING")).toBe("Pool Closure / Staff & Departmental Use");
			expect(findCanonicalProgram("POOL CLOSED DEPARTMENT TRAINING")).toBe("Pool Closure / Staff & Departmental Use");
		});

		it("leaves masters sessions that are not rentals alone", () => {
			expect(findCanonicalProgram("**MASTERS SWIM TEAM**")).toBe("Masters Swim Program");
			expect(findCanonicalProgram("ADULT MASTERS**")).toBe("Masters Swim Program");
		});
	});
});
