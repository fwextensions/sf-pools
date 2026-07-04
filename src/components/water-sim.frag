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

	gl_FragColor = vec4(next, state.r, 0.0, 1.0);
}
