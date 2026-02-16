precision highp float;

// ============================================================================
// UNIFORMS
// ============================================================================

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_pointer;
uniform float u_pointerStrength;
uniform float u_ripples[24]; // ring buffer: [x0,y0,t0, x1,y1,t1, ...] for 8 ripples

// ============================================================================
// CONSTANTS
// ============================================================================

#define TAU 6.28318530718
#define MAX_ITER 5

const float RIPPLE_FREQUENCY = 50.0;
const float RIPPLE_SPEED = 6.0;
const float RIPPLE_AMPLITUDE = 5.0;
const float RIPPLE_FALLOFF = 4.0;

const float EXPANDING_RIPPLE_SPEED = 0.25;
const float EXPANDING_RIPPLE_LIFETIME = 2.5;
const float EXPANDING_DISTORTION_AMP = 2.5;

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

// ============================================================================
// WAVE FUNCTIONS
// ============================================================================

float ambientWaves(vec2 p, float t) {
	float h = 0.0;
	h += sin(p.x * 3.5 + t * 0.9) * 0.4;
	h += sin(p.y * 5.0 - t * 1.1) * 0.3;
	h += sin((p.x + p.y) * 4.0 + t * 0.7) * 0.25;
	h += sin((p.x - p.y) * 6.0 - t * 0.8) * 0.15;
	return h;
}

float pointerRipple(vec2 uv, vec2 center, float t) {
	float d = distance(uv, center);
	float r = sin(d * RIPPLE_FREQUENCY - t * RIPPLE_SPEED) * RIPPLE_AMPLITUDE;
	r *= exp(-d * RIPPLE_FALLOFF);
	return r;
}

float expandingRippleSingle(vec2 uv, float rx, float ry, float rt, float time, float aspect) {
	if (rt < 0.0) return 0.0;

	float age = time - rt;
	if (age < 0.0 || age > EXPANDING_RIPPLE_LIFETIME) return 0.0;

	vec2 center = vec2(rx * aspect, ry);
	float d = distance(uv, center);
	float waveRadius = age * EXPANDING_RIPPLE_SPEED;
	float ringDist = abs(d - waveRadius);

	float fade = exp(-age * 1.5);
	float ringWidth = 0.01 + age * 0.06;
	float ring = smoothstep(ringWidth, 0.0, ringDist);

	return sin((d - waveRadius) * 50.0) * ring * fade;
}

// ============================================================================
// EXPANDING RIPPLE ACCUMULATION
// Unrolled because GLSL ES doesn't allow computed array indices
// ============================================================================

float sumExpandingRipples(vec2 uv, float time, float aspect) {
	float h = 0.0;
	h += expandingRippleSingle(uv, u_ripples[0], u_ripples[1], u_ripples[2], time, aspect);
	h += expandingRippleSingle(uv, u_ripples[3], u_ripples[4], u_ripples[5], time, aspect);
	h += expandingRippleSingle(uv, u_ripples[6], u_ripples[7], u_ripples[8], time, aspect);
	h += expandingRippleSingle(uv, u_ripples[9], u_ripples[10], u_ripples[11], time, aspect);
	h += expandingRippleSingle(uv, u_ripples[12], u_ripples[13], u_ripples[14], time, aspect);
	h += expandingRippleSingle(uv, u_ripples[15], u_ripples[16], u_ripples[17], time, aspect);
	h += expandingRippleSingle(uv, u_ripples[18], u_ripples[19], u_ripples[20], time, aspect);
	h += expandingRippleSingle(uv, u_ripples[21], u_ripples[22], u_ripples[23], time, aspect);
	return h;
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
	float eps = 0.004;
	vec2 pointerUV = vec2(u_pointer.x * aspect, u_pointer.y);

	// --- Wave Heights ---
	float expandingH = sumExpandingRipples(uv, u_time, aspect);
	float h = ambientWaves(uv, tSurface) * 0.8 + expandingH * 0.4;
	if (u_pointerStrength > 0.0) {
		h += pointerRipple(uv, pointerUV, tSurface) * u_pointerStrength * 0.5;
	}

	// --- Surface Normal (finite differences) ---
	float hPosX = ambientWaves(uv + vec2(eps, 0.0), tSurface) * 0.8;
	float hNegX = ambientWaves(uv - vec2(eps, 0.0), tSurface) * 0.8;
	float hPosY = ambientWaves(uv + vec2(0.0, eps), tSurface) * 0.8;
	float hNegY = ambientWaves(uv - vec2(0.0, eps), tSurface) * 0.8;

	if (u_pointerStrength > 0.0) {
		float pStr = u_pointerStrength * 0.5;
		hPosX += pointerRipple(uv + vec2(eps, 0.0), pointerUV, tSurface) * pStr;
		hNegX += pointerRipple(uv - vec2(eps, 0.0), pointerUV, tSurface) * pStr;
		hPosY += pointerRipple(uv + vec2(0.0, eps), pointerUV, tSurface) * pStr;
		hNegY += pointerRipple(uv - vec2(0.0, eps), pointerUV, tSurface) * pStr;
	}

	hPosX += sumExpandingRipples(uv + vec2(eps, 0.0), u_time, aspect) * EXPANDING_DISTORTION_AMP;
	hNegX += sumExpandingRipples(uv - vec2(eps, 0.0), u_time, aspect) * EXPANDING_DISTORTION_AMP;
	hPosY += sumExpandingRipples(uv + vec2(0.0, eps), u_time, aspect) * EXPANDING_DISTORTION_AMP;
	hNegY += sumExpandingRipples(uv - vec2(0.0, eps), u_time, aspect) * EXPANDING_DISTORTION_AMP;

	vec2 surfaceNormal = vec2(hPosX - hNegX, hPosY - hNegY) * 0.5;

	// --- Tile UV Distortion ---
	vec2 tileUV = uv + surfaceNormal * 0.035;
	tileUV.x += sin(uv.y * 6.0 + tCaustic * 10.0) * 0.005;
	tileUV.y += cos(uv.x * 3.0 + tCaustic * 11.0) * 0.005;

	// --- Caustics ---
	float causticHighlight = calculateCaustics(uv + surfaceNormal * 0.3, tCaustic);
	float causticShadow = calculateCaustics(uv + vec2(0.02, 0.015), tCaustic + 0.3);
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
	color += vec3(0.85, 0.95, 0.98) * causticHighlight * 0.5;

	// --- Ripple Lighting (independent of caustics) ---
	vec3 rippleHighlight = vec3(0.9, 0.97, 1.0);
	vec3 rippleShadow = vec3(0.15, 0.3, 0.4);
	color += rippleHighlight * max(expandingH, 0.0) * 0.4;
	color = mix(color, color * rippleShadow, max(-expandingH, 0.0) * 0.25);

	// --- Output ---
	gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
