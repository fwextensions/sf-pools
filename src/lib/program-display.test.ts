import { describe, it, expect } from "@jest/globals";
import { describeProgram } from "./program-display";
import type { ProgramEntry } from "./pdf-processor";

// the fixtures are verbatim rows from public/data/all_schedules.json
function entry(p: Partial<ProgramEntry>): ProgramEntry {
	return {
		programName: "Lap Swim",
		dayOfWeek: "Monday",
		startTime: "9:00a",
		endTime: "10:00a",
		notes: "",
		lanes: null,
		programNameOriginal: null,
		programNameCanonical: null,
		title: null,
		tags: [],
		...p,
	} as ProgramEntry;
}

describe("describeProgram", () => {
	it("says the pool area once, not three times", () => {
		const d = describeProgram(entry({
			title: "Senior/Therapy Swim (Main Pool)",
			programNameOriginal: "Senior /Therapy Swim (Main Pool)",
			notes: "Main Pool",
		}));
		expect(d.title).toBe("Senior/Therapy Swim");
		expect(d.badges).toEqual(["Main Pool"]);
		expect(d.notes).toEqual([]);
	});

	it("does not print the lane count twice when the qualifier already counts them", () => {
		const d = describeProgram(entry({
			title: "Senior/Therapy Swim (Main Pool-2 Lanes)",
			programNameOriginal: "Senior /Therapy Swim (Main Pool-2 Lanes)",
			lanes: 2,
			notes: "Main Pool",
		}));
		expect(d.title).toBe("Senior/Therapy Swim");
		expect(d.badges).toEqual(["Main Pool-2 Lanes"]);
		// the note is the first half of the badge, so it says nothing new
		expect(d.notes).toEqual([]);
	});

	it("drops a bare lane count from the title, keeping the badge", () => {
		const d = describeProgram(entry({ title: "Lap Swim (6)", programNameOriginal: "Lap Swim (6)", lanes: 6 }));
		expect(d.title).toBe("Lap Swim");
		expect(d.badges).toEqual(["6 LN"]);
	});

	it("promotes a note that is only a location into the badges", () => {
		const d = describeProgram(entry({ title: "Family Swim", programNameOriginal: "Family Swim", notes: "2 lanes + Small Pool" }));
		expect(d.badges).toEqual(["2 LN", "Small Pool"]);
		expect(d.notes).toEqual([]);
	});

	it("keeps the part of a note that is not a location", () => {
		const d = describeProgram(entry({
			title: "Family Swim",
			programNameOriginal: "Family Swim",
			notes: "2 lanes + Small Pool; CLOSED - 8/27, 9/24, 10/22",
		}));
		expect(d.badges).toEqual(["2 LN", "Small Pool"]);
		expect(d.notes).toEqual(["CLOSED - 8/27, 9/24, 10/22"]);
	});

	it("does not mistake a comma-separated closure list for a location", () => {
		const d = describeProgram(entry({ title: "Lap Swim", notes: "CLOSED - 8/27, 9/24, 10/22" }));
		expect(d.badges).toEqual([]);
		expect(d.notes).toEqual(["CLOSED - 8/27, 9/24, 10/22"]);
	});

	it("takes a location off the front of a note and keeps the rest", () => {
		const d = describeProgram(entry({ title: "Family/Lap Swim", notes: "small/main, Lap swim until 4pm" }));
		expect(d.badges).toEqual(["Small Pool", "Main Pool"]);
		expect(d.notes).toEqual(["Lap swim until 4pm"]);
	});

	it("capitalizes a lower-case note rather than leaving it mid-sentence", () => {
		expect(describeProgram(entry({ title: "Water Exercise", notes: "instructor lead, deep end" })).notes)
			.toEqual(["Instructor lead, deep end"]);
	});

	it("keeps a title that is nothing but a qualifier", () => {
		const d = describeProgram(entry({ title: "Lap Swim (Main Pool)", programNameOriginal: "Lap Swim (Main Pool)" }));
		expect(d.title).toBe("Lap Swim");
	});
});
