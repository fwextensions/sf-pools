/**
 * Timing for the header's wave simulation and its ambient wave events.
 *
 * The wave simulation runs a fixed number of steps per SIMULATED SECOND
 * (SIM_SUBSTEPS per 1/60s; see takeSimSteps), so waves travel and fade at the
 * same speed on a 60Hz laptop and a 165Hz gaming monitor. It used to run
 * SIM_SUBSTEPS per drawn frame, which made the water 2.75x faster at 165Hz.
 *
 * Simulated time itself still advances with the frames rather than the wall
 * clock. If the events that inject energy were scheduled in wall-clock
 * seconds, they and the physics would come apart the moment the browser stops
 * drawing:
 *
 *   - Backgrounded tab, throttled to ~1fps: drips keep arriving every 5
 *     wall-clock seconds while the water advances 3 steps per frame instead of
 *     180 per second. A minute in the background injects a minute of drips and
 *     applies a second of damping, and the surface comes back saturated and
 *     chaotic.
 *   - Backgrounded tab, fully frozen: no frames, so nothing injects — but the
 *     first frame back sees a huge time jump.
 *   - A slow or loaded device: the same accumulation, permanently.
 *
 * The fix is to schedule against a clock that advances with the frames, which
 * is what these functions provide. Under normal conditions it tracks wall time
 * exactly, so drips really are DRIP_PERIOD_S apart; when frames stop arriving
 * it stops with them.
 */

/**
 * Ceiling on how much simulated time one drawn frame may represent. At 60fps a
 * frame is 1/60s and this never binds. It binds precisely when frames are being
 * dropped — capping a 60-second gap at a single 1/30s step, so a stalled tab
 * resumes where it left off instead of trying to catch up on injections it
 * never had the frames to dissipate.
 *
 * 1/30 rather than 1/60 so that a genuine 30fps device still runs in real time.
 */
export const MAX_FRAME_DT = 1 / 30;

/** A gap longer than this means frames were not being drawn at all. */
const STALL_THRESHOLD = MAX_FRAME_DT * 2;

export type SimClock = {
	/** simulated seconds elapsed, advanced once per drawn frame */
	simTime: number;
	/** real time at the previous frame, or -1 before the first */
	lastRealTime: number;
	/** simulated seconds the previous frame advanced */
	frameDt: number;
	/** fractional sim steps owed, carried between frames (can dip below 0) */
	stepDebt: number;
};

export function createSimClock(): SimClock {
	return { simTime: 0, lastRealTime: -1, frameDt: 0, stepDebt: 0 };
}

/**
 * Advance the clock by one drawn frame.
 *
 * `stalled` reports that the gap since the previous frame was too long to be an
 * ordinary frame — the caller should treat any per-frame difference it tracks
 * against wall clock (scroll position, most obviously) as stale rather than as
 * a real change, since it accumulated while nothing was being drawn.
 */
export function advanceSimClock(clock: SimClock, realTime: number): {
	simTime: number;
	stalled: boolean;
} {
	const first = clock.lastRealTime < 0;
	// Clamped below at 0 as well: performance.now() is monotonic, but the
	// harness feeds a shared origin and a clock that ran backwards would rewind
	// the schedule and re-fire buckets that had already gone.
	const realDelta = first ? 0 : Math.max(realTime - clock.lastRealTime, 0);
	const stalled = !first && realDelta > STALL_THRESHOLD;

	clock.lastRealTime = realTime;
	clock.frameDt = Math.min(realDelta, MAX_FRAME_DT);
	clock.simTime += clock.frameDt;

	return { simTime: clock.simTime, stalled };
}

/**
 * How many simulation steps the current frame should run, at a fixed
 * `stepsPerSecond` of simulated time whatever the frame rate: 3 a frame at
 * 60fps, 1 or 2 alternating at 144fps, 6 at 30fps. The fraction left over
 * carries to the next frame, so the long-run rate is exact.
 *
 * `mustStep` forces at least one step, for a frame with an impulse to inject:
 * above stepsPerSecond fps a frame can owe no steps at all, and the impulse
 * would otherwise be dropped. The forced step is borrowed from the next frame's
 * share, so it does not speed the water up.
 */
export function takeSimSteps(
	clock: SimClock,
	stepsPerSecond: number,
	mustStep = false
): number {
	clock.stepDebt += clock.frameDt * stepsPerSecond;
	// a hair of slack so 60fps lands on exactly 3 despite float error
	let steps = Math.floor(clock.stepDebt + 1e-6);
	if (steps < 1 && mustStep) steps = 1;
	clock.stepDebt -= steps;
	return steps;
}

/**
 * Deterministic 0..1 hash of an integer. Used to scatter event schedules,
 * headings and strengths: the two /header-lab panes must draw the SAME numbers
 * for a comparison between them to mean anything, and Math.random() cannot give
 * them that.
 */
export function hash01(n: number): number {
	const s = Math.sin(n * 12.9898) * 43758.5453;
	return s - Math.floor(s);
}

/**
 * At most one event per `period`-long window, at a hashed moment inside it.
 * Returns the window's index when it fires this frame, or null.
 *
 * Deliberately an identity test against the last window rather than a running
 * deadline: a deadline that falls behind wants to be caught up, and catching up
 * is exactly the burst this module exists to prevent. However long the gap,
 * this fires once and resumes.
 */
export function dueBucket(
	simTime: number,
	period: number,
	lastBucket: number,
	/** offsets the hash, so two schedules do not pick the same moment in a window */
	salt = 0
): number | null {
	if (!(period > 0)) return null;
	const bucket = Math.floor(simTime / period);
	if (bucket === lastBucket) return null;
	// 0.9 keeps the firing moment inside its own window, so a bucket cannot be
	// due before the previous one has been retired.
	const fireAt = (bucket + hash01(bucket + salt) * 0.9) * period;
	return simTime >= fireAt ? bucket : null;
}
