import { describe, it, expect } from "@jest/globals";
import { findDocLinks, groundFees, groundMaintenance, type FeesExtract, type MaintenanceExtract } from "./aquatics-docs";
import type { TextLine } from "./pdf-table";

const PAGE_URL = "https://sfrecpark.org/482/Swimming-Pools";

// the Other Resources links as the page had them on 2026-11-04
const HTML = `
	<a href="https://sfrecpark.org/DocumentCenter/View/25724/swimt-test" class="resource-link">Download Deep Water Test Form (PDF)</a>
	<h3>Other Resources</h3>
	<p><a href="/DocumentCenter/View/29560/waiver-updated-2026" style="font-weight: bold;">Waiver for Aquatic Classes &amp; Camps (PDF)</a></p>
	<p><a href="/DocumentCenter/View/29763/Annual-Maintenance-26-27" style="font-weight: bold;">Annual Maintenance Schedule 2026/27 (PDF)</a></p>
	<p><a href="/DocumentCenter/View/29318/Aquatic-Fee-Increases-Effective-July-1-2026" style="font-weight: bold;"><span>Aquatic Admission</span> Fees (PDF)</a></p>
	<a href="/DocumentCenter">Documents</a>`;

describe("finding the documents on the Swimming Pools page", () => {
	it("finds both links by their wording", () => {
		expect(findDocLinks(HTML, PAGE_URL)).toEqual({
			maintenance: {
				url: "https://sfrecpark.org/DocumentCenter/View/29763/Annual-Maintenance-26-27",
				text: "Annual Maintenance Schedule 2026/27 (PDF)",
			},
			fees: {
				url: "https://sfrecpark.org/DocumentCenter/View/29318/Aquatic-Fee-Increases-Effective-July-1-2026",
				text: "Aquatic Admission Fees (PDF)",
			},
		});
	});

	it("falls back to the file name when the wording changes", () => {
		const html = `<a href="/DocumentCenter/View/30001/Annual-Maintenance-27-28">Pool closures 2027/28</a>`;
		expect(findDocLinks(html, PAGE_URL).maintenance?.url).toBe(
			"https://sfrecpark.org/DocumentCenter/View/30001/Annual-Maintenance-27-28"
		);
	});

	it("gives null for a document the page no longer links", () => {
		expect(findDocLinks(`<a href="/DocumentCenter/View/1/waiver">Waiver</a>`, PAGE_URL)).toEqual({ maintenance: null, fees: null });
	});
});

let y = 600;
/** one printed row, its cells at the given x positions */
function row(...cells: [number, string][]): TextLine[] {
	y -= 15;
	return cells.map(([x, text]) => ({ page: 1, x, y, width: text.length * 5, text }));
}

// the maintenance PDF's text layer, as pdf-inspector read it on 2026-11-04
const MAINTENANCE_LINES: TextLine[] = [
	row([72, "2026- 2027 POOL MAINTENANCE SCHEDULE and TASK Draft"]),
	row([78, "POOL"], [240, "START DATE"], [401, "END DATE"], [563, "COMMENTS"]),
	row([563, "Sunday- Thursday Pool"]),
	row([78, "Garfield"], [240, "8/17/2026"], [401, "9/4/2026 "], [450, "Reopen Sept 8"], [563, "Labor Day"]),
	row([78, "North Beach"], [240, "10/13/2026"], [401, "10/31/2026 "], [463, "Reopen Nov 2"]),
	row([563, "Sunday- Thursday Pool"]),
	row([78, "Rossi"], [240, "11/2/2026"], [401, "11/21/2026 "], [463, "Reopen Nov 22"], [563, "Veterans Day"]),
	row([78, "Sava"], [240, "12/1/2026"], [401, "12/19/2026 "], [463, "Reopen Dec 22"]),
	row([78, "Mission "], [240, "TBD"], [401, "TBD"]),
	row([72, "Events Table"]),
	row([78, "Date"], [401, "Event Name"]),
	row([78, "8/22/2026, 12/12/2026"], [401, "In Service Trainings"]),
	row([78, "11/23/2026-11/29/2026"], [401, "Hamilton Pool & Rec Center Wet Scrub"]),
].flat();

const MAINTENANCE: MaintenanceExtract = {
	title: "2026-2027 Pool Maintenance Schedule",
	entries: [
		{ pools: ["garfield"], startDate: "2026-08-17", endDate: "2026-09-04", reason: "Annual maintenance" },
		{ pools: ["northBeach"], startDate: "2026-10-13", endDate: "2026-10-31", reason: "Annual maintenance" },
		{ pools: ["rossi"], startDate: "2026-11-02", endDate: "2026-11-21", reason: "Annual maintenance" },
		{ pools: ["sava"], startDate: "2026-12-01", endDate: "2026-12-19", reason: "Annual maintenance" },
		{ pools: ["mission"], startDate: null, endDate: null, reason: "Annual maintenance" },
		{ pools: [], startDate: "2026-08-22", endDate: "2026-08-22", reason: "In-service training" },
		{ pools: [], startDate: "2026-12-12", endDate: "2026-12-12", reason: "In-service training" },
		{ pools: ["hamilton"], startDate: "2026-11-23", endDate: "2026-11-29", reason: "Wet scrub" },
	],
};

describe("checking the maintenance schedule against its PDF", () => {
	it("keeps a faithful read, with North Beach's two pools and without the TBD row", () => {
		const { entries, problems } = groundMaintenance(MAINTENANCE, MAINTENANCE_LINES);
		expect(problems).toEqual([]);
		expect(entries).toHaveLength(7);
		expect(entries[1]).toEqual({
			poolIds: ["northBeachCool", "northBeachWarm"],
			startDate: "2026-10-13",
			endDate: "2026-10-31",
			reason: "Annual maintenance",
		});
		expect(entries.map((e) => e.poolIds.join("+"))).not.toContain("mission");
		expect(entries[4]!.poolIds).toEqual([]);
	});

	it("flags a date the PDF doesn't print", () => {
		const misread = structuredClone(MAINTENANCE);
		misread.entries[2]!.endDate = "2026-11-22";
		const { problems } = groundMaintenance(misread, MAINTENANCE_LINES);
		expect(problems).toEqual([
			"rossi 2026-11-02–2026-11-22 (Annual maintenance): 2026-11-22 isn't printed",
			"11/21/2026 is printed but no entry uses it",
		]);
	});

	it("flags a dropped row", () => {
		const dropped = structuredClone(MAINTENANCE);
		dropped.entries.splice(6, 1);
		expect(groundMaintenance(dropped, MAINTENANCE_LINES).problems).toEqual(["12/12/2026 is printed but no entry uses it"]);
	});

	it("flags a pool the PDF doesn't name", () => {
		const wrongPool = structuredClone(MAINTENANCE);
		wrongPool.entries[3]!.pools = ["balboa"];
		expect(groundMaintenance(wrongPool, MAINTENANCE_LINES).problems).toEqual([
			"balboa 2026-12-01–2026-12-19 (Annual maintenance): Balboa isn't named",
		]);
	});
});

// the fee notice's text layer, cut to two of its four groups
const FEE_LINES: TextLine[] = [
	row([233, "EFFECTIVE JULY 1, 2026"]),
	row([259, "Children - (0-17) "]),
	row([111, "Rec Swim and Lap Swim Drop-in "], [478, "$2 "]),
	row([111, "Yearly Swim Pass "], [466, "$285"]),
	row([266, "Seniors (65+) "]),
	row([111, "Rec Swim and Lap Swim Drop-in "], [478, "$7"]),
	row([111, "Recreation Swim Pass - 10 visits "], [472, "$35"]),
].flat();

const FEES: FeesExtract = {
	effectiveDate: "2026-07-01",
	groups: [
		{
			name: "Children",
			detail: "0-17",
			fees: [
				{ name: "Rec Swim and Lap Swim Drop-in", price: 2 },
				{ name: "Yearly Swim Pass", price: 285 },
			],
		},
		{
			name: "Seniors",
			detail: "65+",
			fees: [
				{ name: "Rec Swim and Lap Swim Drop-in", price: 7 },
				{ name: "Recreation Swim Pass - 10 visits", price: 35 },
			],
		},
	],
};

describe("checking the fees against their PDF", () => {
	it("keeps a faithful read", () => {
		const { groups, problems } = groundFees(FEES, FEE_LINES);
		expect(problems).toEqual([]);
		expect(groups).toEqual(FEES.groups);
	});

	it("flags a price from another row", () => {
		const shifted = structuredClone(FEES);
		shifted.groups[1]!.fees[0]!.price = 35;
		shifted.groups[1]!.fees[1]!.price = 7;
		expect(groundFees(shifted, FEE_LINES).problems).toEqual([
			"Seniors: Rec Swim and Lap Swim Drop-in $35 isn't printed on one row",
			"Seniors: Recreation Swim Pass - 10 visits $7 isn't printed on one row",
			"$7 is printed but no item uses it",
			"$35 is printed but no item uses it",
		]);
	});

	it("flags a dropped item", () => {
		const dropped = structuredClone(FEES);
		dropped.groups[0]!.fees.pop();
		expect(groundFees(dropped, FEE_LINES).problems).toEqual(["$285 is printed but no item uses it"]);
	});
});
