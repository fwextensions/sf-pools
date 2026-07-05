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
uniform float u_scrollAmp;     // scroll swell height; 0.0 when not scrolling
uniform float u_scrollEdge;    // edge the water piles against: 0 bottom, 1 top
uniform float u_scrollRadius;  // swell band half-width, in texels
uniform float u_time;          // seconds, for drifting the swell wobble

varying vec2 vTexCoord;

// c^2 in texel units; must stay below 0.5 for numerical stability (CFL)
const float WAVE_SPEED = 0.1;
const float DAMPING = 0.985;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
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

	// press the pointer into the surface as a Gaussian dent; the wave
	// equation turns it into an expanding, interfering ring on its own.
	// Pulling toward a target depth (rather than subtracting) keeps
	// back-to-back frames from stacking the dent ever deeper. The dent is
	// swept along the segment the pointer traveled since last frame — a
	// fast swipe carves a continuous trough instead of stamping a dotted
	// line of separate circles.
	if (u_impulseAmp != 0.0) {
		vec2 pt = uv / u_texel; // work in texel space, square on screen
		vec2 a = u_impulsePrev / u_texel;
		vec2 ab = u_impulsePos / u_texel - a;
		float t = clamp(dot(pt - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
		vec2 rel = (pt - (a + ab * t)) / u_impulseRadius;
		next = mix(next, -u_impulseAmp, exp(-dot(rel, rel)));
	}

	// scrolling shoves the whole pool; the water's inertia piles it up
	// against the leading edge as a line swell, which the wave equation
	// then sends across the surface as a linear wavefront. Per-column hash
	// jitter roughens the line so it doesn't read as a ruler-straight
	// artifact — unlike a smooth wobble, incoherent noise diffuses into an
	// imperfect front instead of forming lobes that radiate circular arcs.
	if (u_scrollAmp != 0.0) {
		float seed = floor(u_time); // re-roll the roughness each second
		float jitterTexels = (hash(vec2(uv.x * 511.0, seed)) - 0.5) * 1.6;
		float amp = u_scrollAmp * (0.75 + 0.5 * hash(vec2(uv.x * 257.0, seed + 43.0)));
		float rel = (uv.y - u_scrollEdge) / (u_texel.y * u_scrollRadius) + jitterTexels / u_scrollRadius;
		next = mix(next, amp, exp(-rel * rel));
	}

	gl_FragColor = vec4(next, state.r, 0.0, 1.0);
}
