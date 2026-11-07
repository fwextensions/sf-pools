import { describe, it, expect } from "@jest/globals";
import { spansOnOneScale } from "./session-span";

describe("spansOnOneScale", () => {
	it("widens the scale to take in a point no session reaches", () => {
		// now is 9:00; the only session runs 10:00-11:00, so the scale runs 9 to 11
		expect(spansOnOneScale([{ start: 600, end: 660, mark: null }], [540, 540])).toEqual([
			{ left: 50, width: 50, markLeft: 50, markWidth: 0 },
		]);
	});

	it("clips the mark to the session", () => {
		const [span] = spansOnOneScale([{ start: 600, end: 660, mark: [630, 720] }], [540, 540]);
		expect(span).toEqual({ left: 50, width: 50, markLeft: 75, markWidth: 25 });
	});
});
