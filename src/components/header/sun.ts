// ============================================================================
// SAN FRANCISCO SUNLIGHT
//
// The water is lit by the real sun over the city: caustics by day, warming
// toward gold as it sets, and the underwater pool lights after dark. A low
// precision solar position (good to a fraction of a degree, far better than
// twilight needs) keeps this free of any network request.
// ============================================================================

const SF_LAT = 37.7749;
const SF_LON = -122.4194;
const RAD = Math.PI / 180;

/** Sun altitude above the horizon in degrees, at `date`, over SF. */
export function sunAltitudeDeg(date: Date, lat = SF_LAT, lon = SF_LON) {
	// days since J2000.0 (2000-01-01 12:00 UTC)
	const d = date.getTime() / 86_400_000 - 10_957.5;
	const g = (357.529 + 0.98560028 * d) * RAD; // mean anomaly
	const q = 280.459 + 0.98564736 * d; // mean longitude, degrees
	const lambda = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
	const e = (23.439 - 0.00000036 * d) * RAD; // obliquity
	const ra = Math.atan2(Math.cos(e) * Math.sin(lambda), Math.cos(lambda));
	const dec = Math.asin(Math.sin(e) * Math.sin(lambda));
	const gmstHours = 18.697374558 + 24.06570982441908 * d;
	const hourAngle = (gmstHours * 15 + lon) * RAD - ra;
	const sinAlt = Math.sin(lat * RAD) * Math.sin(dec) +
		Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(hourAngle);
	return Math.asin(sinAlt) / RAD;
}

function smoothstep(a: number, b: number, x: number) {
	const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
	return t * t * (3 - 2 * t);
}

export type Sunlight = { daylight: number; color: [number, number, number] };

/**
 * How much sun reaches the pool, and its color. Daylight eases from 0 at the
 * end of civil twilight (-6 degrees) to 1 a little after sunrise, so the pool
 * lights come on as it gets properly dark rather than at the moment of sunset.
 */
export function sunlight(altitudeDeg: number): Sunlight {
	const daylight = smoothstep(-6, 3, altitudeDeg);
	// golden hour: warm when the sun is low, white by ~15 degrees up
	const warm = 1 - smoothstep(0, 15, altitudeDeg);
	return {
		daylight,
		color: [1, 1 - 0.18 * warm, 1 - 0.42 * warm],
	};
}

/** Fixed times of day for previews (?water=night and friends). */
export const PRESET_ALTITUDES: Record<string, number> = {
	day: 55,
	dusk: 2,
	night: -20,
};
