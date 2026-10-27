import { describe, it, expect } from "@jest/globals";
import type { PoolSchedule } from "@/lib/schedule-schema";
import type { Closure } from "./closures";
import type { Moment } from "./now-soon";
import { SwimAnswerError, createSwimAnswers, pacificMoment, parseClock, parseMoment } from "./swim-answers";

type Row = [day: string, start: string, end: string, name: string, tags?: string[]];

const LAP = ["access:drop-in", "activity:lap", "program:lap"];
const FAMILY = ["access:drop-in", "activity:family", "program:family"];
const LESSONS = ["access:registration", "activity:lessons", "program:kids-lessons"];
const RENTAL = ["access:rental", "activity:rental", "program:rentals"];

const pool = (id: string, name: string, rows: Row[], extra: Partial<PoolSchedule> = {}) =>
	({
		id,
		name: `${name} Aquatics Center`,
		nameTitle: `${name} Pool`,
		shortName: name,
		scheduleLastUpdated: "2026-10-02",
		programs: rows.map(([dayOfWeek, startTime, endTime, programName, tags = LAP]) => ({
			programName,
			title: programName,
			dayOfWeek,
			startTime,
			endTime,
			tags,
		})),
		...extra,
	}) as unknown as PoolSchedule;

const closure = (startDate: string, endDate: string, reason: string): Closure => ({
	summary: "",
	rawText: "",
	startDate,
	endDate,
	indefinite: false,
	sourceUrl: null,
	reason,
	scope: "whole-pool",
	source: "pattern",
	suppressPrograms: true,
	confidence: null,
	disagreement: null,
});

// 2026-10-09 is a Friday
const FRIDAY = "2026-10-09";
const at = (hh: number, mm = 0, date = FRIDAY, day: Moment["day"] = "Friday"): Moment => ({ day, date, minutes: hh * 60 + mm });

const balboa = pool("balboa", "Balboa", [
	["Friday", "11:00a", "1:00p", "Lap Swim"],
	["Friday", "1:00p", "2:30p", "Family Swim", FAMILY],
	["Friday", "3:30p", "4:30p", "Lessons", LESSONS],
	["Friday", "5:00p", "7:00p", "Lap Swim"],
	["Saturday", "9:00a", "11:00a", "Lap Swim"],
	["Saturday", "1:00p", "3:00p", "Rental", RENTAL],
	["Sunday", "10:00a", "12:00p", "Family Swim", FAMILY],
], { scheduleSeason: "FALL 2026", scheduleStartDate: "2026-09-01", scheduleEndDate: "2026-12-12", pdfScheduleUrl: "https://example.org/balboa.pdf",
	scheduledClosures: [{ startDate: "2026-10-12", endDate: "2026-10-12", startTime: null, endTime: null, reason: "Indigenous Peoples Day" }] });
const rossi = pool("rossi", "Rossi", [
	["Friday", "2:00p", "3:00p", "Lap Swim"],
	["Monday", "6:00a", "8:00a", "Lap Swim"],
], { scheduledClosures: [{ startDate: "2026-10-12", endDate: "2026-10-12", startTime: null, endTime: null, reason: "Indigenous Peoples Day" }] });
const mlk = pool("mlk", "MLK", [["Friday", "12:00p", "1:30p", "Lap Swim"]], { name: "Martin Luther King Jr. Swimming Pool" } as Partial<PoolSchedule>);
const nbClosure = closure("2026-10-05", "2026-10-20", "annual maintenance");
const northBeachCool = pool("northBeachCool", "North Beach (Cool)", [["Friday", "12:00p", "2:00p", "Lap Swim"]], { closure: nbClosure });
const northBeachWarm = pool("northBeachWarm", "North Beach (Warm)", [["Friday", "12:00p", "2:00p", "Family Swim", FAMILY]], { closure: nbClosure });

const all = [balboa, rossi, mlk, northBeachCool, northBeachWarm];
const answers = createSwimAnswers({ schedules: all }, { siteUrl: "https://sfpools.test" });

describe("the clock", () => {
	it("reads an instant on San Francisco's clock", () => {
		expect(pacificMoment(new Date("2026-10-09T19:40:00Z"))).toEqual(at(12, 40));
		// after midnight UTC it's still the evening before in SF
		expect(pacificMoment(new Date("2026-10-10T03:05:00Z"))).toEqual(at(20, 5));
	});

	it("reads a time without a zone as Pacific, and one with a zone as an instant", () => {
		expect(parseMoment("2026-10-09T12:40")).toEqual(at(12, 40));
		expect(parseMoment("2026-10-09T19:40:00Z")).toEqual(at(12, 40));
		expect(parseMoment("2026-10-09T15:40:00-04:00")).toEqual(at(12, 40));
		expect(() => parseMoment("next friday")).toThrow(SwimAnswerError);
		expect(() => parseMoment("2026-02-30T10:00")).toThrow(SwimAnswerError);
	});

	it("reads times of day the ways people write them", () => {
		expect(parseClock("6:00a")).toBe(360);
		expect(parseClock("6pm")).toBe(18 * 60);
		expect(parseClock("6:30 PM")).toBe(18 * 60 + 30);
		expect(parseClock("6:30 p.m.")).toBe(18 * 60 + 30);
		expect(parseClock("18:00")).toBe(18 * 60);
		expect(parseClock("noon")).toBe(720);
		expect(() => parseClock("6")).toThrow(SwimAnswerError);
		expect(() => parseClock("25:00")).toThrow(SwimAnswerError);
	});
});

describe("resolvePools", () => {
	const ids = (names: string[]) => answers.resolvePools(names).map((p) => p.id);

	it("matches ids, slugs, short and full names in any case", () => {
		expect(ids(["mlk"])).toEqual(["mlk"]);
		expect(ids(["Rossi Pool", "BALBOA"])).toEqual(["balboa", "rossi"]);
		expect(ids(["north-beach"])).toEqual(["northBeachCool", "northBeachWarm"]);
	});

	it("falls back to a part of a name", () => {
		expect(ids(["king"])).toEqual(["mlk"]);
		expect(ids(["warm"])).toEqual(["northBeachWarm"]);
	});

	it("lists the pools when a name matches none", () => {
		expect(() => ids(["Sutro"])).toThrow(/no pool matches "Sutro"; the pools are balboa \(Balboa Pool\), rossi/);
	});
});

describe("findSessions now", () => {
	const view = answers.findSessions({ when: "now" }, at(12, 40));

	it("lists what's running with how long is left", () => {
		expect(view.sessions.map((s) => [s.pool, s.title, s.endsInMinutes])).toEqual([
			["Balboa Pool", "Lap Swim", 20],
			["MLK Pool", "Lap Swim", 50],
		]);
	});

	it("runs an open pool through back to back sessions, closing first leading", () => {
		expect(view.open!.map((o) => [o.poolId, o.since, o.until, o.endsInMinutes, o.then])).toEqual([
			["mlk", "12:00p", "1:30p", 50, null],
			["balboa", "11:00a", "2:30p", 110, { programs: ["Family Swim"], at: "1:00p" }],
		]);
	});

	it("says when the programs on now finish, apart from when the pool closes", () => {
		expect(view.open!.map((o) => [o.poolId, o.programs, o.programsUntil, o.until])).toEqual([
			["mlk", ["Lap Swim"], "1:30p", "1:30p"],
			["balboa", ["Lap Swim"], "1:00p", "2:30p"],
		]);
	});

	it("says why the other pools have nothing, and when they next do", () => {
		const quiet = Object.fromEntries(view.quiet!.map((q) => [q.poolId, q]));
		expect(Object.keys(quiet)).toEqual(["rossi", "northBeachCool", "northBeachWarm"]);
		expect(quiet.rossi!.next).toEqual({ date: FRIDAY, day: "Friday", startTime: "2:00p", programs: ["Lap Swim"] });
		expect(quiet.rossi!.reasons).toEqual([]);
		expect(quiet.northBeachCool!.reasons.map((r) => [r.kind, r.text, r.endDate])).toEqual([
			["alert", "Closed Oct 5 – Oct 20 for annual maintenance", "2026-10-20"],
		]);
		expect(quiet.northBeachCool!.next).toBeNull();
	});

	it("carries when the data is from and a grid link", () => {
		expect(view.asOf).toBe("2026-10-02");
		expect(view.window.label).toBe("now (Fri, Oct 9, 12:40p)");
		expect(view.gridUrl).toBe("https://sfpools.test/");
	});
});

describe("findSessions soon", () => {
	it("lists what starts in the next two hours, and doesn't call an open pool quiet", () => {
		const view = answers.findSessions({ when: "soon" }, at(12, 40));
		expect(view.sessions.map((s) => [s.poolId, s.startTime, s.startsInMinutes])).toEqual([
			["balboa", "1:00p", 20],
			["rossi", "2:00p", 80],
		]);
		expect(view.open).toBeUndefined();
		expect(view.quiet!.map((q) => q.poolId)).toEqual(["northBeachCool", "northBeachWarm"]);
	});
});

describe("findSessions filters", () => {
	const titles = (view: ReturnType<typeof answers.findSessions>) => view.sessions.map((s) => `${s.date} ${s.startTime} ${s.poolId} ${s.title}`);

	it("keeps to drop-in by default, and finds lessons and rentals when asked for", () => {
		const rest = answers.findSessions({ when: "today", pools: ["balboa"] }, at(15, 0));
		expect(titles(rest)).toEqual([`${FRIDAY} 5:00p balboa Lap Swim`]);
		const lessons = answers.findSessions({ when: "today", categories: ["kids-lessons"] }, at(15, 0));
		expect(titles(lessons)).toEqual([`${FRIDAY} 3:30p balboa Lessons`]);
		expect(lessons.sessions[0]!.restricted).toBe("Reg req'd");
		const tomorrow = answers.findSessions({ when: "tomorrow", pools: ["balboa"], dropInOnly: false }, at(15, 0));
		expect(titles(tomorrow)).toEqual(["2026-10-10 9:00a balboa Lap Swim"]);
		const rentals = answers.findSessions({ when: "tomorrow", categories: ["Rentals"] }, at(15, 0));
		expect(titles(rentals)).toEqual(["2026-10-10 1:00p balboa Rental"]);
	});

	it("filters explicit dates by weekday and start time, and leaves out closed days", () => {
		const view = answers.findSessions(
			{ from: "2026-10-09", to: "2026-10-19", days: ["mon", "Friday"], categories: ["lap"], startBefore: "noon" },
			at(9, 0)
		);
		// Monday the 12th is a holiday; the 19th isn't
		expect(titles(view)).toEqual([
			`${FRIDAY} 11:00a balboa Lap Swim`,
			"2026-10-16 11:00a balboa Lap Swim",
			"2026-10-19 6:00a rossi Lap Swim",
		]);
		expect(view.quiet).toBeUndefined();
		expect(view.gridUrl).toBe("https://sfpools.test/?program=lap");
	});

	it("says when the limit cut the list", () => {
		const view = answers.findSessions({ when: "this-week", limit: 2 }, at(9, 0));
		expect(view.sessions).toHaveLength(2);
		expect(view.truncated).toBe(true);
		expect(view.total).toBeGreaterThan(2);
	});

	it("puts this weekend on Saturday and Sunday, or what's left of it", () => {
		expect(answers.findSessions({ when: "weekend" }, at(9, 0)).window).toMatchObject({ from: "2026-10-10", to: "2026-10-11" });
		const sunday = answers.findSessions({ when: "weekend" }, at(11, 0, "2026-10-11", "Sunday"));
		expect(sunday.window).toMatchObject({ from: "2026-10-11", to: "2026-10-11" });
		expect(titles(sunday)).toEqual(["2026-10-11 10:00a balboa Family Swim"]);
	});

	it("starts tonight at 5p", () => {
		expect(titles(answers.findSessions({ when: "tonight" }, at(9, 0)))).toEqual([`${FRIDAY} 5:00p balboa Lap Swim`]);
	});

	it("explains what it can't answer", () => {
		expect(() => answers.findSessions({ when: "now", from: FRIDAY }, at(9, 0))).toThrow(/either when or from and to/);
		expect(() => answers.findSessions({ from: "2026-10-01", to: "2026-11-15" }, at(9, 0))).toThrow(/at most 31 days/);
		expect(() => answers.findSessions({ categories: ["laps"] }, at(9, 0))).toThrow(/categories are lap, family/);
		expect(() => answers.findSessions({ days: ["Funday"] }, at(9, 0))).toThrow(SwimAnswerError);
	});
});

describe("an upcoming schedule", () => {
	const winter = pool("rossi", "Rossi", [["Friday", "7:00a", "9:00a", "Early Lap"]], { scheduleStartDate: "2026-10-12", scheduleSeason: "WINTER 2026" });
	const withUpcoming = createSwimAnswers({ schedules: [balboa, rossi], upcoming: [winter] });

	it("takes over on its start date", () => {
		const view = withUpcoming.findSessions({ from: FRIDAY, to: "2026-10-16", pools: ["rossi"] }, at(6, 0));
		expect(view.sessions.map((s) => `${s.date} ${s.title}`)).toEqual([`${FRIDAY} Lap Swim`, "2026-10-16 Early Lap"]);
	});

	it("shows on the pool's details, with its programs only when asked", () => {
		const [detail] = withUpcoming.getPool("rossi", at(6, 0));
		expect(detail!.upcoming).toEqual({ season: "WINTER 2026", startDate: "2026-10-12", endDate: null, pdfUrl: null });
		const [full] = withUpcoming.getPool("rossi", at(6, 0), { includeUpcoming: true });
		expect(full!.upcoming!.programs!.map((p) => p.title)).toEqual(["Early Lap"]);
	});
});

describe("getPool", () => {
	it("gives the weekly programs Monday first, the links and the closures to come", () => {
		const [detail] = answers.getPool("Balboa", at(9, 0));
		expect(detail).toMatchObject({
			poolId: "balboa",
			slug: "balboa",
			name: "Balboa Pool",
			facilityName: "Balboa Aquatics Center",
			pageUrl: "https://sfpools.test/pools/balboa",
			schedule: { season: "FALL 2026", startDate: "2026-09-01", endDate: "2026-12-12", pdfUrl: "https://example.org/balboa.pdf" },
			upcoming: null,
			alert: null,
		});
		expect(detail!.schedule.programs!.map((p) => `${p.day.slice(0, 3)} ${p.startTime}`)).toEqual([
			"Fri 11:00a", "Fri 1:00p", "Fri 3:30p", "Fri 5:00p", "Sat 9:00a", "Sat 1:00p", "Sun 10:00a",
		]);
		expect(detail!.scheduledClosures.map((r) => r.text)).toEqual(["Closed Oct 12 for Indigenous Peoples Day"]);
	});

	it("gives both North Beach pools for the facility, with the notice", () => {
		const detail = answers.getPool("North Beach", at(9, 0));
		expect(detail.map((d) => d.poolId)).toEqual(["northBeachCool", "northBeachWarm"]);
		expect(detail[0]!.alert).toMatchObject({ text: "Closed Oct 5 – Oct 20 for annual maintenance", hidesSessions: true });
		expect(answers.getPool("North Beach", at(9, 0, "2026-10-21", "Wednesday"))[0]!.alert).toBeNull();
	});
});

describe("listClosures", () => {
	it("gathers the notices, the PDFs' closures shared across pools, and schedule ends", () => {
		const view = answers.listClosures("2026-10-09", "2026-12-31");
		expect(view.alerts.map((a) => a.poolId)).toEqual(["northBeachCool", "northBeachWarm"]);
		expect(view.scheduled).toEqual([
			{
				startDate: "2026-10-12",
				endDate: "2026-10-12",
				reason: "Indigenous Peoples Day",
				text: "Closed Oct 12 for Indigenous Peoples Day",
				windows: [{ startTime: null, endTime: null, poolIds: ["balboa", "rossi"], pools: ["Balboa Pool", "Rossi Pool"] }],
			},
		]);
		expect(view.scheduleChanges.map((c) => c.text)).toEqual(["Balboa Pool: schedule ends Dec 12, no newer one posted yet"]);
	});

	it("keeps to the pools asked about", () => {
		const view = answers.listClosures("2026-10-09", "2026-10-31", ["rossi"]);
		expect(view.alerts).toEqual([]);
		expect(view.scheduled[0]!.windows[0]!.pools).toEqual(["Rossi Pool"]);
	});
});

describe("listings", () => {
	it("lists the pools with their pages", () => {
		expect(answers.listPools().find((p) => p.poolId === "northBeachWarm")).toMatchObject({
			slug: "north-beach",
			pageUrl: "https://sfpools.test/pools/north-beach",
		});
	});

	it("marks the categories not open to the public", () => {
		const categories = answers.listCategories();
		expect(categories.find((c) => c.id === "lap")).toEqual({ id: "lap", label: "Lap swim", group: "Swim", public: true });
		expect(categories.filter((c) => !c.public).map((c) => c.id)).toEqual(["rentals", "school", "camps", "closed"]);
	});
});
