import { describe, it, expect } from "@jest/globals";
import {
	MAX_FRAME_DT,
	SIM_TICK_DT,
	advanceSimClock,
	createSimClock,
	dueBucket,
	hash01,
} from "./wave-schedule";

/**
 * Drive a clock through `frames` frames spaced `frameGap` real seconds apart,
 * counting events. Both injection and damping must follow simulated time,
 * including when bounded catch-up drops excess elapsed time after a stall.
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
	it.each([30, 60, 90, 120, 144, 240])("runs exactly 600 physics ticks over ten seconds at %iHz", (hz) => {
		const clock = createSimClock();
		let total = 0;
		for (let frame = 0; frame <= hz * 10; frame++) {
			total += advanceSimClock(clock, frame / hz).ticks;
		}
		expect(total).toBe(600);
		expect(clock.simTime).toBeCloseTo(10, 9);
	});

	it("keeps fractional time and does not simulate every high-refresh frame", () => {
		const clock = createSimClock();
		expect(advanceSimClock(clock, 0).ticks).toBe(0);
		expect(advanceSimClock(clock, 1 / 120).ticks).toBe(0);
		expect(advanceSimClock(clock, 2 / 120).ticks).toBe(1);
		expect(clock.simTime).toBeCloseTo(SIM_TICK_DT);
	});

	it("bounds catch-up and drops stalled time rather than building debt", () => {
		const clock = createSimClock();
		advanceSimClock(clock, 0);
		expect(advanceSimClock(clock, 600).ticks).toBe(2);
		expect(advanceSimClock(clock, 600 + SIM_TICK_DT).ticks).toBe(1);
	});

	it("does not count a backward-clock interval twice", () => {
		const clock = createSimClock();
		advanceSimClock(clock, 10);
		advanceSimClock(clock, 5);
		expect(advanceSimClock(clock, 10).ticks).toBe(0);
	});
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
	it("injects on the same physics ticks at different display rates", () => {
		function events(hz: number) {
			const clock = createSimClock();
			let lastBucket = -1;
			const fired: number[] = [];
			for (let frame = 0; frame <= 30 * hz; frame++) {
				const { simTime, ticks } = advanceSimClock(clock, frame / hz);
				for (let tick = 0; tick < ticks; tick++) {
					const time = simTime - (ticks - tick - 1) * SIM_TICK_DT;
					const bucket = dueBucket(time, 5, lastBucket, 101);
					if (bucket !== null) {
						lastBucket = bucket;
						fired.push(Math.round(time / SIM_TICK_DT));
					}
				}
			}
			return fired;
		}
		expect(events(30)).toEqual(events(60));
		expect(events(144)).toEqual(events(60));
	});
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
		// A backgrounded tab at ~1fps processes at most two ticks per frame.
		// Scheduling on wall time would inject 60 drips without enough damping.
		const throttled = runSchedule(300, 1, 5);
		expect(throttled.realTime).toBeCloseTo(300, 5);

		// The throttled case processes up to twice as many ticks per frame,
		// still nowhere near five minutes of events.
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
