precision highp float;

// ============================================================================
// UNIFORMS
// ============================================================================

uniform vec2 u_resolution;
uniform float u_time;
uniform sampler2D u_water;  // simulated heightfield, r = height
uniform vec2 u_waterTexel;  // 1.0 / simulation resolution

// ============================================================================
// CONSTANTS
// ============================================================================

#define TAU 6.28318530718
#define MAX_ITER 5
#define MAX_ITER_CHEAP 3

// Per-texel height differences are tiny (~0.01 for a fresh ripple); this
// lifts them into the same range as the analytic ambient-wave gradients so
// the two fields can be summed. Raise it and simulated ripples refract the
// tiles, bend the caustics, and glint harder.
const float SIM_GRAD_SCALE = 400.0;
// Scales raw simulation heights (roughly -1..1 at a fresh dent) before the
// crest/trough lighting. Raise it and ripples brighten/darken more.
const float SIM_HEIGHT_SCALE = 1.5;

// Converts analytic wave gradients to the range the old finite-difference
// normals produced (their sample spacing was eps = 0.004).
const float GRADIENT_SCALE = 0.004;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// ============================================================================
// TEXT RENDERING (bitmap font for "SF POOLS")
// ============================================================================

float checkChar(vec2 p, int map) {
	if (p.x < 0.0 || p.x > 2.0 || p.y < 0.0 || p.y > 4.0) return 0.0;
	int bitIndex = int(p.x) + int(p.y) * 3;
	float bit = mod(floor(float(map) / pow(2.0, float(bitIndex))), 2.0);
	return bit;
}

float getText(vec2 gridID) {
	float spacer = 4.0;
	float charX = 0.0;

	if (checkChar(gridID, 29671) > 0.5) return 1.0;
	charX += spacer;
	if (checkChar(gridID - vec2(charX, 0.0), 29641) > 0.5) return 1.0;
	// put a half-space between "SF" and "POOLS"
	charX += spacer * 1.5;
	if (checkChar(gridID - vec2(charX, 0.0), 31689) > 0.5) return 1.0;
	charX += spacer;
	if (checkChar(gridID - vec2(charX, 0.0), 31599) > 0.5) return 1.0;
	charX += spacer;
	if (checkChar(gridID - vec2(charX, 0.0), 31599) > 0.5) return 1.0;
	charX += spacer;
	if (checkChar(gridID - vec2(charX, 0.0), 4687) > 0.5) return 1.0;
	charX += spacer;
	if (checkChar(gridID - vec2(charX, 0.0), 29671) > 0.5) return 1.0;

	return 0.0;
}

// ============================================================================
// TILE GRID
// ============================================================================

float tiles(vec2 st, float gridScale) {
	st *= gridScale;
	vec2 g = fract(st);
	float t = 0.05;
	float b = 0.02;
	float x = smoothstep(t, t + b, g.x) * smoothstep(1.0 - t, 1.0 - t - b, g.x);
	float y = smoothstep(t, t + b, g.y) * smoothstep(1.0 - t, 1.0 - t - b, g.y);
	return x * y;
}

// ============================================================================
// CAUSTICS (underwater light patterns)
// Scale UVs so one caustic cell spans the longest canvas dimension
// to avoid visible tiling.
// ============================================================================

float calculateCaustics(vec2 uv, float time) {
	float coverage = max(u_resolution.x, u_resolution.y) / min(u_resolution.x, u_resolution.y);
	vec2 causticUV = uv / coverage;

	vec2 p = mod(causticUV * TAU, TAU) - 250.0;
	vec2 i = p;
	float c = 1.0;
	float inten = 0.005;

	for (int n = 0; n < MAX_ITER; n++) {
		float t = time * (1.0 - (3.5 / float(n + 1)));
		i = p + vec2(
			cos(t - i.x) + sin(t + i.y),
			sin(t - i.y) + cos(t + i.x)
		);
		c += 1.0 / length(vec2(
			p.x / (sin(i.x + t) / inten),
			p.y / (cos(i.y + t) / inten)
		));
	}

	c /= float(MAX_ITER);
	c = 1.15 - pow(c, 1.4);
	return pow(abs(c), 7.0);
}

// Lower-iteration variant for the soft caustic shadow, where the missing
// detail is invisible. (Loop bounds must be compile-time constant in
// GLSL ES 1.0, hence the near-duplicate function.)
float calculateCausticsCheap(vec2 uv, float time) {
	float coverage = max(u_resolution.x, u_resolution.y) / min(u_resolution.x, u_resolution.y);
	vec2 causticUV = uv / coverage;

	vec2 p = mod(causticUV * TAU, TAU) - 250.0;
	vec2 i = p;
	float c = 1.0;
	float inten = 0.005;

	for (int n = 0; n < MAX_ITER_CHEAP; n++) {
		float t = time * (1.0 - (3.5 / float(n + 1)));
		i = p + vec2(
			cos(t - i.x) + sin(t + i.y),
			sin(t - i.y) + cos(t + i.x)
		);
		c += 1.0 / length(vec2(
			p.x / (sin(i.x + t) / inten),
			p.y / (cos(i.y + t) / inten)
		));
	}

	c /= float(MAX_ITER_CHEAP);
	c = 1.15 - pow(c, 1.4);
	return pow(abs(c), 7.0);
}

// ============================================================================
// WAVE FUNCTIONS
// All return vec3(height, dHeight/dx, dHeight/dy) — the gradient is exact,
// so no finite-difference resampling is needed for surface normals.
// ============================================================================

// Four sine waves at mismatched frequencies, directions, and speeds, so
// their sum never visibly repeats. Per wave: spatial frequency (3.5, 5.0,
// ...), drift speed (0.9, 1.1, ...), and amplitude (0.4, 0.3, ... in h).
vec3 ambientWaves(vec2 p, float t) {
	float a1 = p.x * 3.5 + t * 0.9;
	float a2 = p.y * 5.0 - t * 1.1;
	float a3 = (p.x + p.y) * 4.0 + t * 0.7;
	float a4 = (p.x - p.y) * 6.0 - t * 0.8;

	float h = sin(a1) * 0.4 + sin(a2) * 0.3 + sin(a3) * 0.25 + sin(a4) * 0.15;

	float c1 = cos(a1) * 1.4;  // 0.4 * 3.5
	float c2 = cos(a2) * 1.5;  // 0.3 * 5.0
	float c3 = cos(a3) * 1.0;  // 0.25 * 4.0
	float c4 = cos(a4) * 0.9;  // 0.15 * 6.0

	return vec3(h, c1 + c3 + c4, c2 + c3 - c4);
}

// Samples the simulated heightfield and derives its gradient by central
// differences over neighboring texels. The texels are square in screen
// space, so the per-texel differences are already isotropic.
vec3 sampleWater(vec2 screenUV) {
	float hC = texture2D(u_water, screenUV).r;
	float hE = texture2D(u_water, screenUV + vec2(u_waterTexel.x, 0.0)).r;
	float hW = texture2D(u_water, screenUV - vec2(u_waterTexel.x, 0.0)).r;
	float hN = texture2D(u_water, screenUV + vec2(0.0, u_waterTexel.y)).r;
	float hS = texture2D(u_water, screenUV - vec2(0.0, u_waterTexel.y)).r;

	return vec3(
		hC * SIM_HEIGHT_SCALE,
		vec2(hE - hW, hN - hS) * SIM_GRAD_SCALE
	);
}

// ============================================================================
// MAIN
// ============================================================================

void main() {
	// --- Setup ---
	vec2 screenUV = gl_FragCoord.xy / u_resolution.xy;
	vec2 uv = screenUV;
	float aspect = u_resolution.x / u_resolution.y;
	uv.x *= aspect;

	float tSurface = u_time * 0.8;  // ambient wave animation speed
	float tCaustic = u_time * 0.12; // caustics drift much slower than waves

	// --- Wave Field (height in .x, gradient in .yz) ---
	// Ambient swell stays analytic; interactive ripples come from the
	// simulated heightfield, where they expand, interfere, and reflect
	// off the edges on their own. 0.8 is the ambient contribution's weight
	// relative to the (SIM_GRAD_SCALE-scaled) simulation.
	vec3 water = sampleWater(screenUV);
	vec3 wave = ambientWaves(uv, tSurface) * 0.8;
	wave.yz += water.yz;

	vec2 surfaceNormal = wave.yz * GRADIENT_SCALE;

	// --- Tile UV Distortion ---
	// 0.035 = how far wave slopes refract the tile pattern (the main
	// "looking through water" effect). The two tiny sin/cos terms add a
	// slow independent shimmer so even dead-calm water isn't static.
	vec2 tileUV = uv + surfaceNormal * 0.035;
	tileUV.x += sin(uv.y * 6.0 + tCaustic * 10.0) * 0.005;
	tileUV.y += cos(uv.x * 3.0 + tCaustic * 11.0) * 0.005;

	// --- Caustics ---
	// The highlight is refracted through the live wave field (0.6 = how
	// hard ripples bend the light pattern), so waves visibly warp the
	// caustics. The shadow is a cheaper sample, offset in space (0.02,
	// 0.015) and time (+0.3) so it decorrelates from the highlight and
	// suggests depth.
	float causticHighlight = calculateCaustics(uv + surfaceNormal * 0.6, tCaustic);
	float causticShadow = calculateCausticsCheap(uv + vec2(0.02, 0.015), tCaustic + 0.3);
	// bright caustics shrink the tile UV a hair, faking light focusing
	tileUV *= (1.0 - causticHighlight * 0.012);

	// --- Tile Grid Layout ---
	float preferredHeight = 9.0; // target tile rows on a wide canvas
	float requiredWidth = 33.0;  // min tile columns: 29 for the text + margin
	float tileCountV = max(preferredHeight, requiredWidth / aspect);

	vec2 gridID = floor(tileUV * tileCountV);
	vec2 stableGrid = floor(uv * tileCountV);
	float colorVar = mix(0.96, 1.04, hash(stableGrid));

	// --- Text Positioning ---
	float totalTilesH = tileCountV * aspect;
	float textWidth = 29.0;
	float textHeight = 5.0;
	vec2 textStart = vec2(floor((totalTilesH - textWidth) / 2.0), ceil((tileCountV - textHeight) / 2.0));
	float isText = getText(gridID - textStart);

	// --- Base Color ---
	float tileMask = tiles(tileUV, tileCountV);
	vec3 grout = vec3(0.28, 0.48, 0.58);
	vec3 tileBase = vec3(0.459, 0.776, 0.894) * colorVar;
	vec3 textTile = vec3(0.89, 0.89, 1.0);
	vec3 color = mix(grout, mix(tileBase, textTile, isText), tileMask);

	// --- Depth Vignette ---
	// darken up to 15% toward the corners, fading in over a 1.2-radius
	float dist = length(uv - vec2(aspect * 0.5, 0.5));
	color *= 1.0 - smoothstep(1.2, 0.0, dist) * 0.15;

	// --- Caustic Lighting ---
	vec3 shadowColor = vec3(0.2, 0.35, 0.45);
	color = mix(color, color * shadowColor, causticShadow * 0.25); // 0.25 = shadow strength
	// Per-channel falloff exponents fake chromatic dispersion: red decays
	// fastest (1.25) and blue slowest (0.8), leaving bluish fringes around
	// the white-hot cores. Push the exponents apart for stronger fringing.
	vec3 dispersedHighlight = vec3(
		pow(causticHighlight, 1.25),
		causticHighlight,
		pow(causticHighlight, 0.8)
	);
	color += vec3(0.85, 0.95, 0.98) * dispersedHighlight * 0.5; // 0.5 = highlight strength

	// --- Ripple Lighting (independent of caustics) ---
	// The x/(1+x) curves respond linearly to small waves but level off for
	// deep troughs and tall crests, so a fast-moving pointer can't drive
	// the water to black (the old factor could exceed 1 and extrapolate
	// the mix past the shadow color).
	vec3 rippleHighlight = vec3(0.9, 0.97, 1.0);
	vec3 rippleShadow = vec3(0.15, 0.3, 0.4);
	float crest = max(water.x, 0.0);
	float trough = max(-water.x, 0.0);
	// 0.4 / 0.3 = max crest brightening / max trough darkening
	color += rippleHighlight * 0.4 * crest / (1.0 + crest);
	color = mix(color, color * rippleShadow, 0.3 * trough / (1.0 + trough));

	// --- Specular Glint ---
	// Flat water reflects nothing (dot^64 vanishes); only wave slopes tilted
	// toward the light produce sparkles. The pow makes brightness stay
	// saturated until the slope drops below alignment, so also scale by the
	// local ripple strength to fade the glint with the wave height.
	// 0.25 converts wave gradient to normal tilt: higher = milder slopes
	// already glint. lightDir points toward the (off-screen upper-right)
	// light; 64 is the glint tightness (higher = smaller, sharper sparkles);
	// 0.05 sets how much sim gradient counts as "full-strength" ripple;
	// 0.4 is the overall glint brightness.
	vec3 surfN = normalize(vec3(-wave.yz * 0.25, 1.0));
	vec3 lightDir = normalize(vec3(0.35, 0.55, 0.75));
	float spec = pow(max(dot(surfN, lightDir), 0.0), 64.0);
	float rippleEnergy = min(length(water.yz) * 0.05, 1.0);
	color += vec3(1.0, 0.98, 0.92) * spec * rippleEnergy * 0.4;

	// --- Output ---
	gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
