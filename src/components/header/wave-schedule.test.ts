import { describe, it, expect } from "@jest/globals";
import {
	MAX_FRAME_DT,
	advanceSimClock,
	createSimClock,
	dueBucket,
	hash01,
} from "./wave-schedule";

/**
 * Drive a clock through `frames` frames spaced `frameGap` real seconds apart,
 * counting how many events a `period` schedule fires. This is the shape of the
 * bug being guarded against: the injection count has to follow the number of
 * frames drawn (which is what dissipates energy), not the wall time elapsed.
 */
function runSchedule(frames: number, frameGap: number, period: number) {
	const clock = createSimClock();
	let realTime = 0;
	let lastBucket = -1;
	let fired = 0;
	let stalls = 0;

	for (let i = 0; i < frames; i++) {
		const { simTime, stalled } = advanceSimClock(clock, realTime);
		if (stalled) stalls++;
		const bucket = dueBucket(simTime, period, lastBucket);
		if (bucket !== null) {
			lastBucket = bucket;
			fired++;
		}
		realTime += frameGap;
	}
	return { fired, stalls, simTime: clock.simTime, realTime };
}

describe("sim clock", () => {
	// The first frame has no predecessor to measure against, so N frames span
	// N-1 gaps. That single missing frame is the whole discrepancy below.
	it("tracks wall time while frames arrive at 60fps", () => {
		// ~10 real seconds of 60fps frames; 1/60 is under the cap, nothing clamps
		const { simTime, stalls } = runSchedule(600, 1 / 60, 5);
		expect(simTime).toBeCloseTo(599 / 60, 9);
		expect(stalls).toBe(0);
	});

	it("still tracks real time at a steady 30fps", () => {
		// exactly at the cap, so a genuine 30fps device is not slowed down
		const { simTime } = runSchedule(300, 1 / 30, 5);
		expect(simTime).toBeCloseTo(299 / 30, 9);
	});

	it("charges a long stall a single frame, not the whole gap", () => {
		const clock = createSimClock();
		advanceSimClock(clock, 0);
		advanceSimClock(clock, 1 / 60);
		// tab backgrounded for five minutes, then one frame
		const { simTime, stalled } = advanceSimClock(clock, 300);
		expect(stalled).toBe(true);
		expect(simTime).toBeLessThanOrEqual(1 / 60 + MAX_FRAME_DT + 1e-9);
	});

	it("never runs backwards if the clock does", () => {
		const clock = createSimClock();
		advanceSimClock(clock, 10);
		const before = clock.simTime;
		const { simTime } = advanceSimClock(clock, 5);
		expect(simTime).toBe(before);
	});
});

describe("event scheduling", () => {
	it("fires about once per period at 60fps", () => {
		// 60 real seconds, period 5 => 12 windows
		const { fired } = runSchedule(3600, 1 / 60, 5);
		expect(fired).toBe(12);
	});

	it("fires at most once across an arbitrarily long gap", () => {
		const clock = createSimClock();
		let lastBucket = -1;
		let fired = 0;
		// one frame, then a ten-minute gap, then one frame
		for (const t of [0, 600]) {
			const { simTime } = advanceSimClock(clock, t);
			const bucket = dueBucket(simTime, 5, lastBucket);
			if (bucket !== null) {
				lastBucket = bucket;
				fired++;
			}
		}
		expect(fired).toBeLessThanOrEqual(1);
	});

	it("scales injections with frames drawn, not wall time, when throttled", () => {
		// A backgrounded tab throttled to ~1fps for five minutes. The water only
		// advances 3 sim steps per frame, so it dissipates 300 frames' worth --
		// if the schedule ran on wall time it would inject 60 drips against that,
		// which is the saturated mess this guards against.
		const throttled = runSchedule(300, 1, 5);
		expect(throttled.realTime).toBeCloseTo(300, 5);

		// Same number of frames at 60fps, for reference: the injection count must
		// be of the same order, because the same number of frames dissipated.
		const normal = runSchedule(300, 1 / 60, 5);

		expect(throttled.fired).toBeLessThanOrEqual(normal.fired + 2);
		// and nowhere near the 60 that wall-clock scheduling would have produced
		expect(throttled.fired).toBeLessThan(10);
	});
});

describe("hash01", () => {
	it("is deterministic and in range, so both lab panes agree", () => {
		for (let n = 0; n < 200; n++) {
			const v = hash01(n);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
			expect(hash01(n)).toBe(v);
		}
	});
});
