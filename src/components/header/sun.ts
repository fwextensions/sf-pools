// ============================================================================
// SAN FRANCISCO SUNLIGHT
//
// The water is lit by the real sun over the city: caustics by day, and the
// underwater pool lights after dark. A low
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

/**
 * How much sun reaches the pool, 0..1. Eases from 0 at the end of civil
 * twilight (-6 degrees) to 1 a little after sunrise, so the pool lights come
 * on as it gets properly dark rather than at the moment of sunset.
 */
export function daylight(altitudeDeg: number) {
	return smoothstep(-6, 3, altitudeDeg);
}

/** Fixed times of day for previews (?water=day or night). */
export const PRESET_ALTITUDES: Record<string, number> = {
	day: 55,
	night: -20,
};
