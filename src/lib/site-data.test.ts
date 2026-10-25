import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadAlerts, loadChangelogs, loadPools, loadSchedules, loadUpcomingSchedules } from "./site-data";

let root: string;

beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "site-data-"));
	// the loaders read from the project's root, which here is the fixtures
	jest.spyOn(process, "cwd").mockReturnValue(root);
});

afterEach(async () => {
	jest.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});

async function write(file: string, data: unknown) {
	const full = path.join(root, file);
	await fs.mkdir(path.dirname(full), { recursive: true });
	await fs.writeFile(full, typeof data === "string" ? data : JSON.stringify(data));
}

const schedule = {
	id: "rossi",
	name: "ROSSI POOL",
	nameTitle: "Rossi Pool",
	shortName: "Rossi",
	programs: [{ programName: "Lap Swim", dayOfWeek: "Monday", startTime: "9:00a", endTime: "10:00a" }],
};

describe("loadSchedules", () => {
	it("reads the schedules that match the schema", async () => {
		await write("public/data/all_schedules.json", [schedule]);
		expect((await loadSchedules()).map((p) => p.id)).toEqual(["rossi"]);
	});

	it("fails rather than ship an empty site when the file is missing or unreadable", async () => {
		await expect(loadSchedules()).rejects.toThrow(/can't read public\/data\/all_schedules.json/);
		await write("public/data/all_schedules.json", "[{");
		await expect(loadSchedules()).rejects.toThrow(/can't read/);
	});

	it("names where a schedule breaks the schema", async () => {
		await write("public/data/all_schedules.json", [{ ...schedule, programs: [{ ...schedule.programs[0], dayOfWeek: "Funday" }] }]);
		await expect(loadSchedules()).rejects.toThrow(/schema at 0\.programs\.0\.dayOfWeek/);
	});
});

describe("loadUpcomingSchedules", () => {
	it("is empty when there's no upcoming file", async () => {
		expect(await loadUpcomingSchedules()).toEqual([]);
	});

	it("reads them against the schema", async () => {
		await write("public/data/upcoming_schedules.json", [{ ...schedule, scheduleStartDate: "2026-12-14" }]);
		expect((await loadUpcomingSchedules()).map((p) => p.scheduleStartDate)).toEqual(["2026-12-14"]);
		await write("public/data/upcoming_schedules.json", [{ ...schedule, programs: "none" }]);
		await expect(loadUpcomingSchedules()).rejects.toThrow(/upcoming_schedules.json doesn't match the schedule schema/);
	});
});

describe("loadAlerts", () => {
	it("is null when there's no alerts file", async () => {
		expect(await loadAlerts()).toBeNull();
	});

	it("reads the alerts, and fails on a file that doesn't parse", async () => {
		await write("public/data/alerts.json", { siteWideAlerts: [], poolAlerts: [], lastUpdated: "2026-10-23T12:00:00Z" });
		expect((await loadAlerts())?.lastUpdated).toBe("2026-10-23T12:00:00Z");
		await write("public/data/alerts.json", "{");
		await expect(loadAlerts()).rejects.toThrow(/can't read public\/data\/alerts.json/);
	});
});

describe("loadPools", () => {
	it("reads the pool list and fails without one", async () => {
		await expect(loadPools()).rejects.toThrow(/can't read data\/pools.json/);
		await write("data/pools.json", [{ id: "rossi", nameTitle: "Rossi Pool" }]);
		expect((await loadPools())[0]?.nameTitle).toBe("Rossi Pool");
	});
});

describe("loadChangelogs", () => {
	it("is empty without a changelog folder", async () => {
		expect(await loadChangelogs()).toEqual([]);
	});

	it("reads each dated run newest first, leaving out other files and ones that don't parse", async () => {
		await write("data/changelog/2026-10-12.json", { date: "2026-10-12" });
		await write("data/changelog/2026-10-19.json", { date: "2026-10-19" });
		await write("data/changelog/2026-10-16.json", "{");
		await write("data/changelog/notes.json", { date: "notes" });
		expect((await loadChangelogs()).map((e) => e.date)).toEqual(["2026-10-19", "2026-10-12"]);
	});
});
