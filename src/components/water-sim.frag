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
uniform vec2 u_impulsePos;     // pointer impulse center, texture UV
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
	// back-to-back frames from stacking the dent ever deeper.
	if (u_impulseAmp != 0.0) {
		vec2 rel = (uv - u_impulsePos) / (u_texel * u_impulseRadius);
		next = mix(next, -u_impulseAmp, exp(-dot(rel, rel)));
	}

	// scrolling shoves the whole pool; the water's inertia piles it up
	// against the leading edge as a line swell, which the wave equation
	// then sends across the surface as a linear wavefront. The band's
	// centerline and strength undulate along its length (incommensurate
	// sine frequencies, drifting over time) so the front reads as water
	// rather than a ruler-straight artifact.
	if (u_scrollAmp != 0.0) {
		float wobbleTexels =
			sin(uv.x * 43.0 + u_time * 2.3) * 1.6 +
			sin(uv.x * 111.0 - u_time * 3.1) * 0.7;
		float amp = u_scrollAmp * (0.7 + 0.3 * sin(uv.x * 29.0 + u_time * 1.9));
		float rel = (uv.y - u_scrollEdge) / (u_texel.y * u_scrollRadius) + wobbleTexels / u_scrollRadius;
		next = mix(next, amp, exp(-rel * rel));
	}

	gl_FragColor = vec4(next, state.r, 0.0, 1.0);
}
