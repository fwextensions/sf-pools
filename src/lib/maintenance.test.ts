import { describe, it, expect } from "@jest/globals";
import { maintenanceClosures, type MaintenanceEntry } from "./maintenance";
import type { PoolSchedule } from "./schedule-schema";

const entry = (poolIds: string[], startDate: string, endDate: string, reason: string): MaintenanceEntry => ({
	poolIds,
	startDate,
	endDate,
	reason,
});
const allDay = (startDate: string, endDate: string, reason: string) => ({ startDate, endDate, startTime: null, endTime: null, reason });

type Pool = Parameters<typeof maintenanceClosures>[0];

function pool(id: string, overrides: Partial<PoolSchedule> = {}): Pool {
	return {
		id,
		scheduleStartDate: "2026-09-01",
		scheduleEndDate: "2026-12-12",
		// Tuesday through Saturday
		programs: (["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const).map((dayOfWeek) => ({
			programName: "Lap Swim",
			dayOfWeek,
			startTime: "9:00a",
			endTime: "10:00a",
			notes: null,
			lanes: null,
		})) as PoolSchedule["programs"],
		scheduledClosures: [],
		...overrides,
	};
}

const ENTRIES = [
	entry(["rossi"], "2026-11-02", "2026-11-21", "Annual maintenance"),
	entry(["sava"], "2026-12-01", "2026-12-19", "Annual maintenance"),
	entry([], "2026-12-12", "2026-12-12", "In-service training"),
	entry(["hamilton"], "2026-11-23", "2026-11-29", "Wet scrub"),
];

const TODAY = "2026-11-04";

describe("maintenance closures for a pool", () => {
	it("fills in the pool's own entries and the ones every pool shares", () => {
		expect(maintenanceClosures(pool("sava"), ENTRIES, TODAY)).toEqual([
			allDay("2026-12-01", "2026-12-19", "Annual maintenance"),
			allDay("2026-12-12", "2026-12-12", "In-service training"),
		]);
	});

	it("leaves a closure to the pool's PDF when the PDF covers any of its dates", () => {
		const own = [
			// the PDF gives the training day's hours
			{ startDate: "2026-12-12", endDate: "2026-12-12", startTime: "9:00a", endTime: "12:00p", reason: "In-service" },
			// and maintenance a few days off the schedule's dates
			{ ...allDay("2026-11-24", "2026-11-30", "maintenance") },
		];
		expect(maintenanceClosures(pool("hamilton", { scheduledClosures: own }), ENTRIES, TODAY)).toEqual([]);
	});

	it("leaves out an entry that has ended", () => {
		expect(maintenanceClosures(pool("rossi"), ENTRIES, "2026-11-22")).toEqual([
			allDay("2026-12-12", "2026-12-12", "In-service training"),
		]);
	});

	it("leaves out an entry on days the pool doesn't run, or outside its season", () => {
		const sundays = entry([], "2026-11-29", "2026-11-30", "Training");
		expect(maintenanceClosures(pool("balboa"), [sundays], TODAY)).toEqual([]);
		expect(maintenanceClosures(pool("balboa", { scheduleEndDate: "2026-12-10" }), ENTRIES, TODAY)).toEqual([]);
	});

	it("leaves out an entry that doesn't read as a closure", () => {
		const backwards = entry(["balboa"], "2026-11-21", "2026-11-02", "Annual maintenance");
		const tooLong = entry(["balboa"], "2026-09-01", "2026-12-31", "Annual maintenance");
		expect(maintenanceClosures(pool("balboa"), [backwards, tooLong], TODAY)).toEqual([]);
	});

	it("gives nothing without a maintenance schedule", () => {
		expect(maintenanceClosures(pool("rossi"), undefined, TODAY)).toEqual([]);
	});
});
