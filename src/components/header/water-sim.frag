precision highp float;

// ============================================================================
// WATER HEIGHTFIELD SIMULATION (ping-pong pass)
// Discrete 2D wave equation over a small float texture:
//   next = (2h - hPrev + c^2 * laplacian(h)) * damping
// r = current height, g = previous height. Texels are square in screen
// space (the JS side sizes the texture to the canvas aspect), so the
// Laplacian propagates waves isotropically.
// ============================================================================

uniform sampler2D u_state;     // r = height, g = previous height
uniform vec2 u_texel;          // 1.0 / simulation resolution
uniform vec2 u_impulsePos;     // pointer impulse position, texture UV
uniform vec2 u_impulsePrev;    // pointer position last frame, texture UV
uniform float u_impulseAmp;    // 0.0 when there is no impulse this step
uniform float u_impulseRadius; // impulse radius, in texels
// Line source. One mechanism serves both the scroll swell (a horizontal front
// off the top or bottom edge) and the timed ambient swells (a front off the
// left or right edge at an oblique heading) — they differ only in these
// uniforms, so there is one piece of code to get right.
uniform vec2 u_lineDir;        // unit normal of the front, texel space, pointing where it travels
uniform float u_lineOffset;    // signed distance from the pool centre to the front, in texels
uniform float u_lineAmp;       // 0.0 when nothing is firing this step
uniform float u_lineRadius;    // band half-width, in texels
uniform float u_time;          // seconds, for drifting the swell wobble

varying vec2 vTexCoord;

// c^2 in texel units: how far waves travel per sim step (ring speed ~=
// sqrt(WAVE_SPEED) texels/step, times SIM_SUBSTEPS per frame on the JS
// side). Must stay below 0.5 for numerical stability (CFL condition) —
// above that the simulation explodes into checkerboard noise.
//
// This is c SQUARED, so the ring speed is its square root and this reads as
// more extreme than it is: 0.0025 gives 0.05 texels/step, which at 3 substeps
// and 60fps is ~9 texels/s — about 27 CSS px/s. Deliberately slow. The pool
// reads as heavy, barely-moving water where a drip ring takes several seconds
// to reach a wall, rather than as a pond being pelted.
const float WAVE_SPEED = 0.0025;
// Amplitude retained per sim step. At 0.9985 and 3 substeps/frame at 60fps
// waves keep ~76% per second, e-folding in ~3.7s — so a ring travels ~100 CSS
// px before it fades, which is about half the header's height and enough to
// reach the long walls and reflect. Together with WAVE_SPEED this is what
// decides whether rings from successive drips ever overlap; drop it back toward
// 0.985 and each one dies where it lands.
const float DAMPING = 0.9985;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Value noise along a line: hash every JITTER_WAVELENGTH-th cell and smoothstep
// between. Plain per-texel hash() is white noise at the grid's Nyquist
// frequency, which the header shader's curvature term amplifies into hard
// stripes. Correlating the noise over several texels keeps the swell front
// irregular while staying well below Nyquist.
const float JITTER_WAVELENGTH = 6.0; // texels per noise cell

float smoothNoise(float texels, float seed) {
	float c = texels / JITTER_WAVELENGTH;
	float i = floor(c);
	float f = smoothstep(0.0, 1.0, fract(c));
	return mix(hash(vec2(i, seed)), hash(vec2(i + 1.0, seed)), f);
}

void main() {
	vec2 uv = vTexCoord;
	vec2 state = texture2D(u_state, uv).rg;

	// clamped edge sampling makes borders reflect like pool walls
	float hN = texture2D(u_state, uv + vec2(0.0, u_texel.y)).r;
	float hS = texture2D(u_state, uv - vec2(0.0, u_texel.y)).r;
	float hE = texture2D(u_state, uv + vec2(u_texel.x, 0.0)).r;
	float hW = texture2D(u_state, uv - vec2(u_texel.x, 0.0)).r;

	float laplacian = hN + hS + hE + hW - 4.0 * state.r;
	float next = (2.0 * state.r - state.g + WAVE_SPEED * laplacian) * DAMPING;
	// Height carried into the .g channel as next step's "previous". Injections
	// below displace it alongside `next` so they add no velocity — see the
	// note on the pointer dent.
	float prev = state.r;

	// press the pointer into the surface as a Gaussian dent; the wave
	// equation turns it into an expanding, interfering ring on its own.
	// Pulling toward a target depth (rather than subtracting) keeps
	// back-to-back frames from stacking the dent ever deeper. The dent is
	// swept along the segment the pointer traveled since last frame — a
	// fast swipe carves a continuous trough instead of stamping a dotted
	// line of separate circles.
	//
	// The dent is pressed into BOTH height channels by the same weight. This
	// scheme stores velocity implicitly as (height - prevHeight), so
	// displacing only the height would hand the dent a velocity of roughly
	// its own depth — every frame the pointer moves. Rapid back-and-forth
	// re-dents the same water before it can radiate away, compounding those
	// kicks until DAMPING can no longer drain them and the surface breaks up
	// into checkerboard noise. Displacing both channels injects the dent at
	// rest: it still radiates (its Laplacian is nonzero) but pumps no
	// momentum, so the pool can only get as deep as the dent itself.
	if (u_impulseAmp != 0.0) {
		vec2 pt = uv / u_texel; // work in texel space, square on screen
		vec2 a = u_impulsePrev / u_texel;
		vec2 ab = u_impulsePos / u_texel - a;
		float t = clamp(dot(pt - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
		vec2 rel = (pt - (a + ab * t)) / u_impulseRadius;
		float w = exp(-dot(rel, rel));
		next = mix(next, -u_impulseAmp, w);
		prev = mix(prev, -u_impulseAmp, w);
	}

	// A line source: water piled along a straight front, which the wave equation
	// then sends across the surface as a travelling linear wavefront. Scrolling
	// fires one off the leading edge (the pool's inertia piling water against
	// it); a timer fires oblique ones off the left and right edges, which is
	// what keeps the surface alive without a permanent analytic swell.
	//
	// Band-limited noise roughens the line so it doesn't read as a
	// ruler-straight artifact — unlike a smooth wobble, irregular noise diffuses
	// into an imperfect front instead of forming lobes that radiate circular
	// arcs.
	if (u_lineAmp != 0.0) {
		// Texel space relative to the pool centre. Texels are square on screen,
		// so a distance here is the distance the eye sees — which is what makes
		// one radius look the same at any heading.
		vec2 pt = (uv - 0.5) / u_texel;
		float dist = dot(pt, u_lineDir) - u_lineOffset;
		// Coordinate ALONG the front. The old code roughened by screen column,
		// which only coincides with "along the front" for a horizontal line; at
		// an oblique heading that smears the noise into diagonal banding.
		float along = dot(pt, vec2(-u_lineDir.y, u_lineDir.x));

		float seed = floor(u_time); // re-roll the roughness each second
		// The band shifts by up to ±0.8 texels (the 1.6 span) and its strength
		// varies 75%–125%. Both vary over JITTER_WAVELENGTH texels rather than
		// per texel — see smoothNoise. 43.0 decorrelates the two noise fields.
		float jitterTexels = (smoothNoise(along, seed) - 0.5) * 1.6;
		float amp = u_lineAmp * (0.75 + 0.5 * smoothNoise(along, seed + 43.0));
		float rel = (dist + jitterTexels) / u_lineRadius;
		float w = exp(-rel * rel);
		// injected at rest, for the same reason as the pointer dent above
		next = mix(next, amp, w);
		prev = mix(prev, amp, w);
	}

	// Backstop: the wave equation is stable at the shipped WAVE_SPEED (0.0025,
	// far below the 0.5 CFL limit), but nothing else bounds the state, so any
	// future injection bug can drive it to infinity rather than merely looking
	// wrong. Waves live well inside +/-1.5.
	next = clamp(next, -1.5, 1.5);
	prev = clamp(prev, -1.5, 1.5);

	gl_FragColor = vec4(next, prev, 0.0, 1.0);
}
