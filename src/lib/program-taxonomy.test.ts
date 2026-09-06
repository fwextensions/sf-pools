// the raw names in these cases are verbatim from pool PDFs; see
// docs/program-taxonomy-review.md for where each one showed up
import { describe, it, expect } from "@jest/globals";
import {
	ACCESS_TAGS, ACTIVITY_TAGS, AUDIENCE_TAGS, CANONICAL_CATEGORIES,
	cleanProgramTitle, deriveTags, findCanonicalProgram,
} from "./program-taxonomy";

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

describe("deriveTags", () => {
	it("only emits tags from the closed vocabulary", () => {
		const known = new Set([
			...ACTIVITY_TAGS.map((t) => `activity:${t}`),
			...AUDIENCE_TAGS.map((t) => `audience:${t}`),
			...ACCESS_TAGS.map((t) => `access:${t}`),
		]);
		for (const raw of ["REC/FAMILY/LAP SWIM", "Summer LTS^", "Rentals (Masters)", "◆MASTER'S SWIM TEAM", "*SMALL POOL- NVPS CLASS"]) {
			for (const tag of deriveTags(raw)) expect(known).toContain(tag);
		}
	});

	it("keeps every activity a combined slot names", () => {
		expect(deriveTags("REC/FAMILY/LAP SWIM")).toEqual(
			expect.arrayContaining(["activity:rec", "activity:family", "activity:lap"])
		);
		expect(deriveTags("SENIOR SWIM (LAP/THERAPY)")).toEqual(
			expect.arrayContaining(["activity:senior", "activity:lap", "activity:therapy"])
		);
		expect(deriveTags("*YOUTH LESSONS/SWIM TEAM")).toEqual(
			expect.arrayContaining(["activity:lessons", "activity:swim-team", "audience:youth"])
		);
	});

	it("keeps a rental's program and its rented-ness at once", () => {
		const tags = deriveTags("Rentals (Masters)");
		expect(tags).toContain("activity:masters");
		expect(tags).toContain("access:rental");
		expect(tags).not.toContain("access:drop-in");
	});

	it("reads the footnote markers as access", () => {
		expect(deriveTags("**MASTERS SWIM TEAM**")).toContain("access:shared-pool");
		expect(deriveTags("◆MASTER'S SWIM TEAM")).toContain("access:contact-coach");
		expect(deriveTags("SWIM LESSONS*")).toContain("access:registration");
	});

	it("marks an unrestricted session as drop-in", () => {
		expect(deriveTags("Lap Swim")).toEqual(["access:drop-in", "activity:lap"]);
		expect(deriveTags("CLOSED FOR STAFF TRAINING")).not.toContain("access:drop-in");
		expect(deriveTags("*SMALL POOL-SFUSD CLASS")).not.toContain("access:drop-in");
	});

	it("returns nothing for an empty name", () => {
		expect(deriveTags("")).toEqual([]);
	});
});

describe("cleanProgramTitle", () => {
	it("keeps what the PDF said and drops only the markers", () => {
		expect(cleanProgramTitle("Summer LTS^")).toBe("Summer LTS");
		expect(cleanProgramTitle("**MASTERS SWIM TEAM**")).toBe("Masters Swim Team");
		expect(cleanProgramTitle("SWIM LESSONS籠")).toBe("Swim Lessons");
		expect(cleanProgramTitle("Piranha PC Swim*")).toBe("Piranha PC Swim");
	});

	it("title-cases without mangling punctuation or acronyms", () => {
		expect(cleanProgramTitle("Rentals (Club)")).toBe("Rentals (Club)");
		expect(cleanProgramTitle("*SMALL POOL- NVPS CLASS")).toBe("Small Pool - NVPS Class");
		expect(cleanProgramTitle("SENIOR / THERAPY / SFUSD SWIM")).toBe("Senior/Therapy/SFUSD Swim");
		expect(cleanProgramTitle("Lap Swim (Main Pool-2 Lanes)")).toBe("Lap Swim (Main Pool-2 Lanes)");
	});
});
