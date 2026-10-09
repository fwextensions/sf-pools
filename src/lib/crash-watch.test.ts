// tests for crash-watch.ts
import { describe, it, expect } from "@jest/globals";
import { findSuspects, suspectProperties, ORPHAN_AFTER_MS, type PageRecord } from "./crash-watch";

const NOW = 1_800_000_000_000;

function record(overrides: Partial<PageRecord>): PageRecord {
	return {
		id: "a",
		path: "/?pools=garfield",
		deploy: "abc1234",
		startedAt: NOW - 60_000,
		lastSeen: NOW - 30_000,
		beats: 1,
		visible: true,
		webglLost: 0,
		closed: false,
		...overrides,
	};
}

describe("findSuspects", () => {
	it("reports this tab's own record when it was never closed", () => {
		const suspects = findSuspects([record({ id: "tab" })], "tab", NOW);
		expect(suspects.map((s) => s.kind)).toEqual(["same_tab"]);
	});

	it("ignores closed records", () => {
		expect(findSuspects([record({ id: "tab", closed: true })], "tab", NOW)).toEqual([]);
	});

	it("leaves another tab's recent record alone, since that tab may still be open", () => {
		expect(findSuspects([record({ id: "other" })], "tab", NOW)).toEqual([]);
	});

	it("reports another tab's record once it has gone quiet for a day", () => {
		const stale = record({ id: "other", lastSeen: NOW - ORPHAN_AFTER_MS - 1 });
		expect(findSuspects([stale], "tab", NOW).map((s) => s.kind)).toEqual(["orphaned"]);
	});

	it("treats every record as another tab's when this tab has no id yet", () => {
		const stale = record({ id: "x", lastSeen: NOW - ORPHAN_AFTER_MS - 1 });
		expect(findSuspects([record({ id: "y" }), stale], null, NOW).map((s) => s.record.id)).toEqual(["x"]);
	});
});

describe("suspectProperties", () => {
	it("reports durations in seconds and whether the deploy changed", () => {
		const props = suspectProperties(
			{ kind: "same_tab", record: record({ visible: false, webglLost: 2 }) },
			NOW,
			"def5678"
		);
		expect(props).toEqual({
			kind: "same_tab",
			page: "/?pools=garfield",
			deploy: "abc1234",
			same_deploy: false,
			lived_s: 30,
			since_last_seen_s: 30,
			visible_at_end: false,
			webgl_lost: 2,
			beats: 1,
		});
	});
});
