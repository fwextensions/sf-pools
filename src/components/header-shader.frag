precision highp float;

// ============================================================================
// UNIFORMS
// ============================================================================

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_ripples[24]; // slots: [x0,y0,t0, x1,y1,t1, ...] for 8 ripples
uniform float u_rippleCount; // 0.0 when no ripple is live, MAX_RIPPLES otherwise

// ============================================================================
// CONSTANTS
// ============================================================================

#define TAU 6.28318530718
#define MAX_ITER 5
#define MAX_ITER_CHEAP 3
#define MAX_RIPPLES 8

const float EXPANDING_RIPPLE_SPEED = 0.25;
const float EXPANDING_RIPPLE_LIFETIME = 2.5;
const float EXPANDING_RIPPLE_WAVENUMBER = 50.0;
const float EXPANDING_DISTORTION_AMP = 2.5;

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

// Expanding ripple as a dispersive wave packet: a sharp leading edge with a
// trailing train of waves behind it, losing amplitude as the ring spreads.
vec3 expandingRipple(vec2 uv, vec3 ripple, float time, float aspect) {
	if (ripple.z < 0.0) return vec3(0.0);

	float age = time - ripple.z;
	if (age <= 0.0 || age > EXPANDING_RIPPLE_LIFETIME) return vec3(0.0);

	vec2 center = vec2(ripple.x * aspect, ripple.y);
	vec2 rel = uv - center;
	float d = length(rel);
	float waveRadius = age * EXPANDING_RIPPLE_SPEED;
	float s = d - waveRadius; // signed distance from the wave front

	// asymmetric envelope: narrow ahead of the front, wide behind it
	float widthAhead = 0.015 + age * 0.04;
	float width = s > 0.0 ? widthAhead : widthAhead * 2.8;
	float env = exp(-(s * s) / (width * width));

	// energy fades with time and spreads around the growing ring; the
	// smoothstep window over the last quarter of life takes the wave to
	// exactly zero so it can't pop out of view at the age cutoff
	float fade = exp(-age * 1.4) / (1.0 + waveRadius * 3.0);
	fade *= smoothstep(EXPANDING_RIPPLE_LIFETIME, EXPANDING_RIPPLE_LIFETIME * 0.75, age);

	float phase = s * EXPANDING_RIPPLE_WAVENUMBER;
	float h = sin(phase) * env * fade;
	// dominant gradient term; the envelope's slope is negligible next to
	// the wavenumber
	float dhdd = cos(phase) * EXPANDING_RIPPLE_WAVENUMBER * env * fade;
	vec2 dir = rel / max(d, 1e-4);

	return vec3(h, dir * dhdd);
}

vec3 sumExpandingRipples(vec2 uv, float time, float aspect) {
	vec3 acc = vec3(0.0);
	// indexing a uniform array by loop index is a constant-index-expression,
	// which GLSL ES 1.0 permits
	for (int i = 0; i < MAX_RIPPLES; i++) {
		if (float(i) >= u_rippleCount) break;
		vec3 ripple = vec3(u_ripples[i * 3], u_ripples[i * 3 + 1], u_ripples[i * 3 + 2]);
		acc += expandingRipple(uv, ripple, time, aspect);
	}
	return acc;
}

// ============================================================================
// MAIN
// ============================================================================

void main() {
	// --- Setup ---
	vec2 uv = gl_FragCoord.xy / u_resolution.xy;
	float aspect = u_resolution.x / u_resolution.y;
	uv.x *= aspect;

	float tSurface = u_time * 0.8;
	float tCaustic = u_time * 0.12;

	// --- Wave Field (height in .x, gradient in .yz, one tap per source) ---
	vec3 expanding = sumExpandingRipples(uv, u_time, aspect);
	vec3 wave = ambientWaves(uv, tSurface) * 0.8;
	wave.yz += expanding.yz * EXPANDING_DISTORTION_AMP;

	vec2 surfaceNormal = wave.yz * GRADIENT_SCALE;

	// --- Tile UV Distortion ---
	vec2 tileUV = uv + surfaceNormal * 0.035;
	tileUV.x += sin(uv.y * 6.0 + tCaustic * 10.0) * 0.005;
	tileUV.y += cos(uv.x * 3.0 + tCaustic * 11.0) * 0.005;

	// --- Caustics ---
	// The highlight is refracted through the live wave field, so ripples
	// visibly bend the light pattern; the shadow is a cheaper decorrelated
	// sample offset to suggest depth.
	float causticHighlight = calculateCaustics(uv + surfaceNormal * 0.6, tCaustic);
	float causticShadow = calculateCausticsCheap(uv + vec2(0.02, 0.015), tCaustic + 0.3);
	tileUV *= (1.0 - causticHighlight * 0.012);

	// --- Tile Grid Layout ---
	float preferredHeight = 9.0;
	float requiredWidth = 33.0;
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
	float dist = length(uv - vec2(aspect * 0.5, 0.5));
	color *= 1.0 - smoothstep(1.2, 0.0, dist) * 0.15;

	// --- Caustic Lighting ---
	vec3 shadowColor = vec3(0.2, 0.35, 0.45);
	color = mix(color, color * shadowColor, causticShadow * 0.25);
	// per-channel falloff exponents give chromatic fringes at highlight edges
	vec3 dispersedHighlight = vec3(
		pow(causticHighlight, 1.25),
		causticHighlight,
		pow(causticHighlight, 0.8)
	);
	color += vec3(0.85, 0.95, 0.98) * dispersedHighlight * 0.5;

	// --- Ripple Lighting (independent of caustics) ---
	vec3 rippleHighlight = vec3(0.9, 0.97, 1.0);
	vec3 rippleShadow = vec3(0.15, 0.3, 0.4);
	color += rippleHighlight * max(expanding.x, 0.0) * 0.4;
	color = mix(color, color * rippleShadow, max(-expanding.x, 0.0) * 0.25);

	// --- Specular Glint ---
	// Flat water reflects nothing (dot^64 vanishes); only wave slopes tilted
	// toward the light produce sparkles. The pow makes brightness stay
	// saturated until the slope drops below alignment, so also scale by the
	// local ripple strength to fade the glint with the wave height.
	vec3 surfN = normalize(vec3(-wave.yz * 0.25, 1.0));
	vec3 lightDir = normalize(vec3(0.35, 0.55, 0.75));
	float spec = pow(max(dot(surfN, lightDir), 0.0), 64.0);
	float rippleEnergy = min(length(expanding.yz) * EXPANDING_DISTORTION_AMP * 0.05, 1.0);
	color += vec3(1.0, 0.98, 0.92) * spec * rippleEnergy * 0.4;

	// --- Output ---
	gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
