/**
 * Timing for the header's ambient wave events.
 *
 * The wave simulation advances a fixed amount of physics per DRAWN FRAME —
 * SIM_SUBSTEPS steps, with no delta-time normalisation anywhere. So the rate at
 * which the pool dissipates energy is measured in frames, not seconds. If the
 * events that inject energy are scheduled in wall-clock seconds instead, the
 * two come apart the moment the browser stops drawing at 60fps:
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
};

export function createSimClock(): SimClock {
	return { simTime: 0, lastRealTime: -1 };
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
	clock.simTime += Math.min(realDelta, MAX_FRAME_DT);

	return { simTime: clock.simTime, stalled };
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
