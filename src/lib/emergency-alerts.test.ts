import { describe, it, expect } from "@jest/globals";
import { parseAlertCenter, parseAlertDetail } from "./alert-center";
import { alertShowsFor, mergeAlerts, readAlertForPools, type EmergencyAlert } from "./emergency-alerts";

// the Alert Center as it read on 2026-11-25, cut down to the one alert
const LIST =
	`<div id="AlertCenterContent"><div class="listing listingCollapse divCat_6">` +
	`<div><h2 class="active">Park Closures &amp; Service Changes</h2><span class="numAlerts">1  Alert</span></div>` +
	`<div id="ctl00_lvwCategories_ctrl0_alertsList"><ol class="alerts-list no-bullets"><li id="alertItem" class="alerts-list">` +
	`<div class="alert on noBorder first">` +
	`<span id="alertDate_114" class="date">November 24, 2026 8:55 PM</span>` +
	`<h3 id="alertHeader_114"><a href="/AlertCenter.aspx?AID=Ocean-Beach-Parking-Lot-Closed-Ahead-of--114" id="alertTitle_114">Ocean Beach Parking Lot Closed Ahead of Storm & High Tides</a></h3>` +
	`<p>Ahead of tonight’s storm, Rec and Park is extending the Ocean Beach parking lot’s overnight closure beginning at 10PM into tomorrow afternoon due to high tides & surf.</p>` +
	`<p>If you’re using your parks, please be alert. Never walk, bike or...</p>` +
	`<a href="/AlertCenter.aspx?AID=Ocean-Beach-Parking-Lot-Closed-Ahead-of--114" class="readMore"><span aria-hidden="true">Read On...</span></a>` +
	`</div></li></ol></div></div></div>`;

const DETAIL =
	`<div id="ctl00_alertDetailControl_divSingleAlert" class="listing singleAlert">` +
	`<div><h2>Park Closures & Service Changes</h2></div>` +
	`<div id="ctl00_ctl00_MainContent_ModuleContent_ctl00_alertDetailControl_divAlert" class="alert on noPhotos noImages">` +
	`<span id="alertDate_114" class="date">November 24, 2026 8:55 PM</span>` +
	`<h3 id="alertTitle_114">Ocean Beach Parking Lot Closed Ahead of Storm & High Tides</h3>` +
	`<p>Ahead of tonight’s storm, the lot is closed.</p><p>Never walk, bike or drive through floodwater.</p>` +
	`<ul>\n</ul></div></div>`;

const read = (title: string, text = "") => readAlertForPools({ title, text });

describe("reading the Alert Center", () => {
	it("lists each alert with its category, date and link", () => {
		expect(parseAlertCenter(LIST)).toEqual([
			{
				id: "114",
				title: "Ocean Beach Parking Lot Closed Ahead of Storm & High Tides",
				text:
					"Ahead of tonight’s storm, Rec and Park is extending the Ocean Beach parking lot’s overnight closure beginning at 10PM into tomorrow afternoon due to high tides & surf." +
					"\n\nIf you’re using your parks, please be alert. Never walk, bike or...",
				category: "Park Closures & Service Changes",
				posted: "November 24, 2026 8:55 PM",
				url: "https://sfrecpark.org/AlertCenter.aspx?AID=Ocean-Beach-Parking-Lot-Closed-Ahead-of--114",
			},
		]);
	});

	it("finds no alerts on a page that has none", () => {
		expect(parseAlertCenter(`<div id="AlertCenterContent"><p>There are no alerts.</p></div>`)).toEqual([]);
	});

	it("reads an alert's full text from its own page", () => {
		expect(parseAlertDetail(DETAIL)).toBe("Ahead of tonight’s storm, the lot is closed.\n\nNever walk, bike or drive through floodwater.");
		expect(parseAlertDetail("<p>nothing here</p>")).toBeNull();
	});
});

describe("deciding whether an alert affects the pools", () => {
	it("leaves out alerts about parks, beaches and parking lots", () => {
		const [alert] = parseAlertCenter(LIST);
		expect(readAlertForPools(alert!)).toEqual({ affectsPools: false, poolIds: [], matched: null });
		expect(read("Golden Gate Park closed to cars", "Respect posted closures and stay out of flooded areas.").affectsPools).toBe(false);
	});

	it("counts a mention of pools for every pool", () => {
		expect(read("Storm update", "All pools will close at 3pm today.")).toEqual({ affectsPools: true, poolIds: [], matched: "pools" });
		expect(read("Aquatics programs cancelled").affectsPools).toBe(true);
		expect(read("Swim lessons cancelled due to smoke").affectsPools).toBe(true);
	});

	it("narrows to the pools named beside the word pool", () => {
		expect(read("Rossi Pool and Hamilton Recreation Center and Pool closed").poolIds.sort()).toEqual(["hamilton", "rossi"]);
		expect(read("North Beach Pool closed for a power outage").poolIds).toEqual(["northBeachCool", "northBeachWarm"]);
		expect(read("MLK Pool closed").poolIds).toEqual(["mlk"]);
	});

	it("doesn't take a park's name far from the word pool as that pool", () => {
		const r = read("Mission Dolores Park closed after the storm", "Downed trees across the lawns. Other facilities, including pools, stay open.");
		expect(r.poolIds).toEqual([]);
	});

	it("counts a closure of every facility, which takes the pools with it", () => {
		expect(read("All Rec and Park facilities closed today").affectsPools).toBe(true);
		expect(read("Smoke advisory", "All recreation centers will be closed through Saturday.").affectsPools).toBe(true);
		expect(read("Citywide closure", "Due to the heat, citywide programming is cancelled.").affectsPools).toBe(true);
		expect(read("Storm", "All indoor programs are cancelled.").affectsPools).toBe(true);
		// even when it names a pool, a closure of everything is all of them
		expect(read("All facilities closed", "Including Rossi Pool.").poolIds).toEqual([]);
	});
});

describe("keeping the alerts between runs", () => {
	const listed = { id: "120", title: "All pools closed for the storm", text: "", category: null, posted: null, url: "https://sfrecpark.org/AlertCenter.aspx?AID=120" };

	it("keeps the day an alert was first seen, and drops one that was taken down", () => {
		const previous = [{ ...listed, affectsPools: true, poolIds: [], matched: "pools", firstSeen: "2026-11-24" }, { ...listed, id: "114", firstSeen: "2026-11-20" }] as EmergencyAlert[];
		expect(mergeAlerts([listed], previous, "2026-11-25")).toEqual([{ ...listed, affectsPools: true, poolIds: [], matched: "pools", firstSeen: "2026-11-24" }]);
		expect(mergeAlerts([listed], [], "2026-11-25")[0]!.firstSeen).toBe("2026-11-25");
	});
});

describe("showing an alert for the pools in the filter", () => {
	const alert = (poolIds: string[], affectsPools = true) => ({ poolIds, affectsPools }) as EmergencyAlert;

	it("shows an alert for every pool whatever the filter, and a named one only with its pool", () => {
		expect(alertShowsFor(alert([]), ["rossi"])).toBe(true);
		expect(alertShowsFor(alert(["sava"]), [])).toBe(true);
		expect(alertShowsFor(alert(["sava"]), ["sava", "mlk"])).toBe(true);
		expect(alertShowsFor(alert(["sava"]), ["rossi"])).toBe(false);
		expect(alertShowsFor(alert([], false), [])).toBe(false);
	});
});
