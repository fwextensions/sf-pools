// tests for schedule-validation.ts
import { describe, it, expect } from "@jest/globals";
import { parseTimeToMinutes, detectScheduleAnomalies } from "./schedule-validation";
import type { PoolSchedule, ProgramEntry } from "./pdf-processor";

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

function schedule(programs: ProgramEntry[]): PoolSchedule {
	return {
		id: "balboa",
		name: "Balboa Aquatics Center",
		nameTitle: "Balboa Pool",
		shortName: "Balboa",
		address: null,
		sfRecParkUrl: null,
		pdfScheduleUrl: null,
		scheduleLastUpdated: null,
		scheduleSeason: null,
		scheduleStartDate: null,
		scheduleEndDate: null,
		lanes: null,
		programs,
	};
}

// a multi-day set of programs so the "single day" check doesn't fire
const multiDay: ProgramEntry[] = [
	program({ dayOfWeek: "Monday" }),
	program({ dayOfWeek: "Tuesday" }),
	program({ dayOfWeek: "Wednesday" }),
];

describe("parseTimeToMinutes", () => {
	it("parses morning times", () => {
		expect(parseTimeToMinutes("9:00a")).toBe(9 * 60);
		expect(parseTimeToMinutes("6:30a")).toBe(6 * 60 + 30);
	});

	it("parses afternoon times", () => {
		expect(parseTimeToMinutes("2:15p")).toBe(14 * 60 + 15);
	});

	it("handles noon and midnight", () => {
		expect(parseTimeToMinutes("12:00p")).toBe(12 * 60); // noon
		expect(parseTimeToMinutes("12:00a")).toBe(0); // midnight
	});

	it("returns null for malformed input", () => {
		expect(parseTimeToMinutes("25:00a")).toBeNull();
		expect(parseTimeToMinutes("9:60a")).toBeNull();
		expect(parseTimeToMinutes("9:00")).toBeNull();
		expect(parseTimeToMinutes("noon")).toBeNull();
	});
});

describe("detectScheduleAnomalies", () => {
	it("returns no anomalies for a healthy multi-day schedule", () => {
		expect(detectScheduleAnomalies(schedule(multiDay))).toEqual([]);
	});

	it("flags an empty schedule as a warning", () => {
		const anomalies = detectScheduleAnomalies(schedule([]));
		expect(anomalies).toHaveLength(1);
		expect(anomalies[0]!.message).toMatch(/no programs/i);
		expect(anomalies[0]!.severity).toBe("warning");
	});

	it("flags end time at or before start time as an error", () => {
		const anomalies = detectScheduleAnomalies(
			schedule([
				program({ dayOfWeek: "Monday", startTime: "2:00p", endTime: "1:00p" }),
				program({ dayOfWeek: "Tuesday" }),
				program({ dayOfWeek: "Wednesday" }),
			])
		);
		const hit = anomalies.find((a) => /end at or before start/i.test(a.message));
		expect(hit).toBeDefined();
		expect(hit!.severity).toBe("error");
	});

	it("flags equal start and end times as an error", () => {
		const anomalies = detectScheduleAnomalies(
			schedule([
				program({ dayOfWeek: "Monday", startTime: "9:00a", endTime: "9:00a" }),
				program({ dayOfWeek: "Tuesday" }),
				program({ dayOfWeek: "Wednesday" }),
			])
		);
		expect(anomalies.some((a) => a.severity === "error")).toBe(true);
	});

	it("flags a schedule that collapses to a single day as a warning", () => {
		const anomalies = detectScheduleAnomalies(
			schedule([
				program({ dayOfWeek: "Monday", startTime: "9:00a", endTime: "10:00a" }),
				program({ dayOfWeek: "Monday", startTime: "11:00a", endTime: "12:00p" }),
			])
		);
		const hit = anomalies.find((a) => /covers only 1 day/i.test(a.message));
		expect(hit).toBeDefined();
		expect(hit!.severity).toBe("warning");
	});

	it("does not flag a normal closed-one-day schedule", () => {
		// six days of programs, closed Sunday — should be clean
		const days: ProgramEntry["dayOfWeek"][] = [
			"Monday",
			"Tuesday",
			"Wednesday",
			"Thursday",
			"Friday",
			"Saturday",
		];
		const programs = days.map((d) => program({ dayOfWeek: d }));
		expect(detectScheduleAnomalies(schedule(programs))).toEqual([]);
	});
});
