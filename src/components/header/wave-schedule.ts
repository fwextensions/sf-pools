/** Physics and event scheduling share a fixed 60Hz clock, independent of RAF. */
export const SIM_TICK_DT = 1 / 60;

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
	/** simulated seconds elapsed, advanced only by complete physics ticks */
	simTime: number;
	accumulator: number;
	/** real time at the previous frame, or -1 before the first */
	lastRealTime: number;
};

export function createSimClock(): SimClock {
	return { simTime: 0, accumulator: 0, lastRealTime: -1 };
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
	ticks: number;
} {
	const first = clock.lastRealTime < 0;
	// Clamped below at 0 as well: performance.now() is monotonic, but the
	// harness feeds a shared origin and a clock that ran backwards would rewind
	// the schedule and re-fire buckets that had already gone.
	const realDelta = first ? 0 : Math.max(realTime - clock.lastRealTime, 0);
	const stalled = !first && realDelta > STALL_THRESHOLD;

	clock.lastRealTime = Math.max(clock.lastRealTime, realTime);
	clock.accumulator += Math.min(realDelta, MAX_FRAME_DT);
	// Epsilon prevents floating-point subtraction from losing a tick at 30/60Hz.
	const ticks = Math.floor((clock.accumulator + 1e-9) / SIM_TICK_DT);
	clock.accumulator = Math.max(0, clock.accumulator - ticks * SIM_TICK_DT);
	clock.simTime += ticks * SIM_TICK_DT;

	return { simTime: clock.simTime, stalled, ticks };
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
