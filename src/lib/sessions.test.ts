import { describe, it, expect } from "@jest/globals";
import { programMinutes } from "./sessions";

describe("programMinutes", () => {
	it("parses both ends, or gives null when either doesn't parse", () => {
		expect(programMinutes({ startTime: "9:30a", endTime: "11:00a" })).toEqual({ startMin: 570, endMin: 660 });
		expect(programMinutes({ startTime: "noon", endTime: "1:00p" })).toBeNull();
		expect(programMinutes({ startTime: "9:30a", endTime: "" })).toBeNull();
	});
});
