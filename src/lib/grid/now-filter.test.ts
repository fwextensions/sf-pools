import { describe, it, expect } from "@jest/globals";
import type { Session } from "@/lib/sessions";
import { countTags, createFilter } from "./filters";
import { nowSoonFilter } from "./now-filter";

const s = (...tags: string[]) => ({ tags }) as Session;

const lap = s("program:lap", "access:drop-in");
const lessons = s("program:kids-lessons", "access:registration");
const rental = s("program:rentals", "access:rental");
const school = s("program:school", "access:school-group");
const counts = countTags([lap, lessons, rental, school, s("program:family")]);

const counted = (tags: string[]) => nowSoonFilter(createFilter({ tags, pools: [] }, counts));

describe("nowSoonFilter", () => {
	it("counts every public program with nothing picked, leaving out rentals and school use", () => {
		const { matches, noun } = counted([]);
		expect([lap, lessons, rental, school].map(matches)).toEqual([true, true, false, false]);
		expect(noun).toBe("sessions");
	});

	it("counts just the picked programs, rentals included when picked", () => {
		expect([lap, lessons, rental].map(counted(["program:lap"]).matches)).toEqual([true, false, false]);
		expect([lap, rental].map(counted(["program:rentals"]).matches)).toEqual([false, true]);
	});

	it("names one picked program in its notes", () => {
		expect(counted(["program:lap"]).noun).toBe("lap swim");
		expect(counted(["program:lap", "program:family"]).noun).toBe("sessions");
	});
});
