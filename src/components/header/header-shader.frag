precision highp float;

// ============================================================================
// UNIFORMS
// ============================================================================

uniform vec2 u_resolution;
uniform float u_time;
uniform sampler2D u_water;  // simulated heightfield, r = height
uniform vec2 u_waterTexel;  // 1.0 / simulation resolution
uniform float u_tilePx;     // tile edge in device px (integer CSS px * density)
uniform vec2 u_bandFade;    // antialias fade for ambient wave groups B and C
// 1.0 normally; 0.0 where the GPU cannot linearly filter a float texture, in
// which case the sim's second derivative is garbage (see createSimBuffers) and
// only the analytic ambient field drives the caustic lens. Ripples still
// refract tiles, glint, and light their own crests — they just stop lensing.
uniform float u_simLens;

// ============================================================================
// CONSTANTS
// Every `const float` on its own line is rewritten to a `uniform float` by the
// tuning harness (see shader-params.ts), so keep them one-per-line and keep
// the initialiser a plain numeric literal.
// ============================================================================

#define TAU 6.28318530718

// --- Simulated heightfield ---
// Scales raw simulation heights (roughly -1..1 at a fresh dent) before the
// crest/trough ripple lighting. Raise it and ripples brighten/darken more.
const float SIM_HEIGHT_SCALE = 1.5;
// Half-width of the derivative stencil, in texels. MUST be a whole number: the
// sub-texel smoothing in sampleWater rewrites only the fractional part of the
// texel coordinate, which is valid for every tap at once only if all taps sit
// an integer number of texels away. 2.0 also nulls the grid's Nyquist
// checkerboard mode exactly (a tap at +/-2 samples it identically on both
// sides), which 1.0 does not — the sim injects sharp impulses and a tight
// stencil turns them into stripes. Raise it and sim ripples read as broader,
// softer lenses.
const float CURV_STENCIL = 2.0;
// Sim gradient gain. The gradient is divided by the real stencil width in uv
// units, so unlike the old SIM_GRAD_SCALE (400.0) this does not silently
// change meaning when the header is resized. ~12 reproduces the previous
// visual strength. Raise it and sim ripples refract the tiles and glint harder.
const float SIM_SLOPE_GAIN = 12.0;
// Sim curvature gain — the only knob balancing simulated against ambient
// curvature inside the caustic determinant. Measured reference: the ambient
// spectrum peaks at |laplacian| ~48, and a fresh pointer dent contributes ~968
// before this gain, so 0.08 makes a dent about 1.6x the ambient peak — clearly
// the dominant lens where you touch, without swamping the whole header. Raise
// it for more dramatic flares; past ~0.3 dents fold far enough that their
// centres go dark (see the caveat in focusGain).
const float SIM_CURV_GAIN = 0.08;

// --- Ambient spectrum ---
// Weight of the analytic swell relative to the (SIM_*_GAIN-scaled) simulation.
const float AMBIENT_WEIGHT = 0.8;

// --- Caustics ---
// THE master dial: how far below the surface the floor sits, times the
// refractive bend. Measured against the 12-wave spectrum, this trades "are
// there caustic folds at all" against "how much of the frame is past the first
// fold", where this single-branch model wrongly renders a dark core:
//   0.020 -> no folds anywhere, just smooth shimmer
//   0.030 -> 0.07% folded, almost no filaments
//   0.048 -> ~3% folded, ~6% bright filaments   <- here
//   0.065 -> 12% folded
//   0.090 -> 25% folded, dark cores everywhere
// Raise it for a denser, hotter caustic web; lower it for soft dapple.
const float CAUSTIC_DEPTH = 0.048;
// Width of the Lorentzian core that keeps 1/|det| finite. NOT a safety clamp —
// it sets both the peak brightness (~1/CAUSTIC_SOFT, measured 8.14 at this
// value) and the on-screen width of a filament. Lower for thinner, hotter
// lines; RAISE THIS FIRST if the caustics crawl or sparkle as they move,
// because a sub-pixel-wide bright line aliases.
const float CAUSTIC_SOFT = 0.14;
// Where the highlight reaches half brightness, in units of focus excess.
// Lower = more of the frame lights up; higher = only the hottest cores.
const float CAUSTIC_KNEE = 1.2;
// Fractional spread of CAUSTIC_DEPTH across R/G/B. Blue refracts more than
// red, so each channel focuses at a slightly different depth. Water's real
// dispersion is ~3%; 7% exaggerates it to stay visible at 8-bit. This replaces
// the old per-channel pow() fake and puts the fringe on the correct side.
const float CAUSTIC_DISPERSION = 0.07;
// Overall highlight brightness and shadow depth. The shadow is larger than the
// old 0.25 because the physical shadow is gentler than the independently
// generated one it replaces.
const float CAUSTIC_STRENGTH = 0.6;
const float CAUSTIC_SHADOW = 0.45;

// Converts wave gradients to the range the old finite-difference normals
// produced (their sample spacing was eps = 0.004).
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
// AMBIENT WAVE SPECTRUM
//
// Twelve travelling sine waves. Each contributes height, an exact gradient,
// and — the reason there are twelve now instead of four — an exact Hessian,
// which is what the caustic pass reads. For h = A*sin(a) with a = k.p + w*t:
//     dh/dx    =  A*k.x*cos(a)        dh/dy    =  A*k.y*cos(a)
//     d2h/dx2  = -A*k.x*k.x*sin(a)    d2h/dy2  = -A*k.y*k.y*sin(a)
//     d2h/dxdy = -A*k.x*k.y*sin(a)
// sin(a) and cos(a) are needed for the height and gradient regardless, so all
// three second derivatives cost three multiply-adds and no extra sin/cos.
//
// Above the first group, amplitudes follow A = 8.0 / |k|^2, giving every wave
// the SAME curvature contribution (A*|k|^2) while giving it steeply less
// height. That is what a real wind sea does, and it keeps the caustic detailed
// at small scales without the finest ripples swamping the broad structure.
// Under the more usual A ~ 1/|k| the top octave would dominate the Hessian by
// ~12x and the caustic would collapse into uniform fizz.
// ============================================================================

void addWave(vec2 p, float t, vec2 k, float amp, float omega, float phase,
             inout float h, inout vec2 grad, inout vec3 hess) {
	float a = dot(k, p) + omega * t + phase;
	float s = sin(a);
	float c = cos(a);
	h    += amp * s;
	grad += (amp * c) * k;
	hess -= (amp * s) * vec3(k.x * k.x, k.y * k.y, k.x * k.y); // (xx, yy, xy)
}

void ambientSpectrum(vec2 p, float t, out float h, out vec2 grad,
                     out vec2 coarseGrad, out vec3 hess) {
	h = 0.0;
	grad = vec2(0.0);
	hess = vec3(0.0);

	float fadeB = u_bandFade.x;
	float fadeC = u_bandFade.y;

	// Headings follow the golden angle: wave i points at (i * 137.508) mod 180
	// degrees. This is not decoration — the caustic filaments of a wave train
	// run perpendicular to its wave vector, so the direction set IS the
	// filament direction set, and clustering shows up as visible grain.
	//
	// Measured filament-orientation anisotropy (peak histogram bin over a flat
	// one, so 1.00 is perfectly directionless):
	//   headings on 0/45/90/135 + the old chop set    2.46x, 46% diagonal
	//   twelve headings spaced evenly over 180 deg    2.86x  <- WORSE
	//   golden angle                                  1.25x, 38% diagonal
	// Even spacing is the trap: equal steps put many pairs at the same relative
	// angle, and their interference lines reinforce. The golden angle is the
	// least-resonant rotation there is, which is exactly what is wanted here.
	//
	// Every |k|, amplitude, drift speed and phase below is unchanged from the
	// previous spectrum — only the headings moved. Height RMS and slope RMS are
	// invariant under rotation, so the swell, the tile refraction and the glint
	// keep their exact character; only the curvature field becomes isotropic.

	// --- Group A: swell, |k| 3.5-8.5.
	addWave(p, t, vec2(  3.500,  0.000), 0.400,  0.9, 0.0, h, grad, hess);
	addWave(p, t, vec2( -3.687,  3.377), 0.300, -1.1, 0.0, h, grad, hess);
	addWave(p, t, vec2( -0.495,  5.635), 0.250,  0.7, 0.0, h, grad, hess);
	addWave(p, t, vec2(  5.163,  6.734), 0.150, -0.8, 0.0, h, grad, hess);

	// --- Group B: chop, |k| 11-17 (~3x the swell). Drift speeds follow the
	// deep-water relation w = 0.42*sqrt(|k|), so short waves outrun long ones
	// and the twelve components stay permanently out of step. The per-wave
	// phase offsets keep them from all aligning at the origin.
	addWave(p, t, vec2( 12.787,  2.262), 0.0475 * fadeB,  1.51, 1.7, h, grad, hess);
	addWave(p, t, vec2(-12.661,  8.054), 0.0355 * fadeB, -1.63, 3.9, h, grad, hess);
	addWave(p, t, vec2( -4.412, 16.411), 0.0277 * fadeB,  1.73, 5.2, h, grad, hess);
	addWave(p, t, vec2(  5.070,  9.763), 0.0661 * fadeB, -1.39, 2.4, h, grad, hess);

	// The glint raises surface slope to the 64th power, so feeding it the
	// finest ripples turns the header into crawling white speckle. Snapshot the
	// gradient here: groups A+B light the glint, all twelve refract the tiles.
	coarseGrad = grad;

	// --- Group C: ripple, |k| 29-43 (~2.5x again). Amplitudes are 0.4%-2% of
	// the swell, so these are invisible in the height field and barely present
	// in the slope — they exist purely to give the determinant fine structure.
	addWave(p, t, vec2( 29.137, 10.641), 0.00832 * fadeC,  2.34, 0.8, h, grad, hess);
	addWave(p, t, vec2(-34.167, 14.103), 0.00586 * fadeC, -2.55, 4.6, h, grad, hess);
	addWave(p, t, vec2(-12.309, 26.303), 0.00949 * fadeC,  2.26, 3.1, h, grad, hess);
	addWave(p, t, vec2( 12.853, 40.978), 0.00434 * fadeC, -2.75, 1.2, h, grad, hess);
}

// ============================================================================
// SIMULATED HEIGHTFIELD
//
// A 3x3 stencil at CURV_STENCIL spacing yields the gradient AND all three
// second derivatives — nine taps, the same count the old gradient plus
// wide-Laplacian pair used, because the diagonal corners the mixed partial
// needs also serve the two pure second derivatives.
// ============================================================================

void sampleWater(vec2 screenUV, out float height, out vec2 grad, out vec3 hess) {
	// Bilinear texture filtering is only C0: its second derivative is zero
	// inside a texel and a spike on the boundary. The old code got away with
	// that because curvature merely SCALED a rich procedural texture, but the
	// determinant below turns any kink into a visible crease running along
	// texel edges through every caustic filament. Replacing the fractional
	// texel coordinate with a quintic smootherstep makes the reconstructed
	// field C2 for ~14 ALU and no extra taps. Because every tap below sits a
	// whole number of texels away, this one warp is correct for all nine.
	vec2 tc = screenUV / u_waterTexel - 0.5;
	vec2 ti = floor(tc);
	vec2 f  = tc - ti;
	f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
	vec2 uv = (ti + 0.5 + f) * u_waterTexel;

	vec2 d = u_waterTexel * CURV_STENCIL;

	float hC  = texture2D(u_water, uv).r;
	float hE  = texture2D(u_water, uv + vec2( d.x, 0.0)).r;
	float hW  = texture2D(u_water, uv + vec2(-d.x, 0.0)).r;
	float hN  = texture2D(u_water, uv + vec2( 0.0, d.y)).r;
	float hS  = texture2D(u_water, uv + vec2( 0.0,-d.y)).r;
	float hNE = texture2D(u_water, uv + vec2( d.x, d.y)).r;
	float hNW = texture2D(u_water, uv + vec2(-d.x, d.y)).r;
	float hSE = texture2D(u_water, uv + vec2( d.x,-d.y)).r;
	float hSW = texture2D(u_water, uv + vec2(-d.x,-d.y)).r;

	// The sim texture is sized to the canvas aspect, so its texels are square
	// on screen and one texel spans u_waterTexel.y in uv units on BOTH axes.
	// Dividing by the true stencil width is what makes SIM_SLOPE_GAIN and
	// SIM_CURV_GAIN resolution-independent — without it the balance between
	// simulated and analytic curvature inside the determinant would shift every
	// time the header resized. Using u_waterTexel.x here instead would be the
	// easiest thing in this file to get wrong: it is in screen-U, which the
	// aspect stretch squashes by ~7x on a wide header.
	float s     = u_waterTexel.y * CURV_STENCIL;
	float inv2s = 1.0 / (2.0 * s);
	float invss = 1.0 / (s * s);

	height = hC * SIM_HEIGHT_SCALE;
	grad   = vec2(hE - hW, hN - hS) * (inv2s * SIM_SLOPE_GAIN);
	hess   = vec3(
		(hE + hW - 2.0 * hC) * invss,
		(hN + hS - 2.0 * hC) * invss,
		(hNE + hSW - hNW - hSE) * (0.25 * invss)
	) * (SIM_CURV_GAIN * u_simLens);
}

// ============================================================================
// CAUSTICS — the refraction Jacobian
//
// Light entering the surface vertically lands on the floor at
// q(p) = p + c*grad(h). The area a small patch covers when it arrives is
// |det(dq/dp)| = |det(I + c*H)|, and irradiance is the reciprocal:
//     det = 1 + c*(hxx + hyy) + c*c*(hxx*hyy - hxy*hxy)
// The shader's previous "focus" term was exactly the first-order piece of
// this. The c*c determinant term is what turns broad brightening into thin
// braided lines, because det actually REACHES zero — a caustic fold — instead
// of merely getting small. Verified numerically: this two-term form tracks
// directly measured area compression to within 0.3%, where the first-order
// term alone drifts up to 25%.
// ============================================================================

float focusGain(float lap, float detH, float c) {
	// det = 0 is a genuine singularity — that IS the caustic — so CAUSTIC_SOFT
	// is doing real work here, not guarding against a bug.
	//
	// CAVEAT: past the first fold det goes NEGATIVE and this single-branch
	// model is wrong. A real caustic there is the sum of 1/|det| over three
	// overlapping ray branches, so it is bright; this returns one branch, so it
	// is dark. CAUSTIC_DEPTH is chosen to keep the folded area to a few percent
	// — push it much higher and bright loops grow dark centres, which no real
	// pool has.
	float d = abs(1.0 + c * lap + c * c * detH);
	return (1.0 + CAUSTIC_SOFT) / (d + CAUSTIC_SOFT); // exactly 1.0 on flat water
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
	float tCaustic = u_time * 0.12; // slow drift for the tile shimmer

	// --- Wave Field ---
	// Ambient swell stays analytic; interactive ripples come from the simulated
	// heightfield, where they expand, interfere, and reflect off the edges on
	// their own. Both now contribute a Hessian as well as a gradient, and the
	// caustics are derived from their sum — so a user-made ripple bends light
	// through the same lens equation the ambient swell does.
	float ambH; vec2 ambGrad, coarseGrad; vec3 ambHess;
	ambientSpectrum(uv, tSurface, ambH, ambGrad, coarseGrad, ambHess);

	float simH; vec2 simGrad; vec3 simHess;
	sampleWater(screenUV, simH, simGrad, simHess);

	vec2 grad      = ambGrad * AMBIENT_WEIGHT + simGrad;
	vec3 hess      = ambHess * AMBIENT_WEIGHT + simHess;
	vec2 glintGrad = coarseGrad * AMBIENT_WEIGHT + simGrad;

	vec2 surfaceNormal = grad * GRADIENT_SCALE;

	// --- Tile UV Distortion ---
	// 0.035 = how far wave slopes refract the tile pattern (the main "looking
	// through water" effect). The two tiny sin/cos terms add a slow independent
	// shimmer so even dead-calm water isn't static.
	vec2 tileUV = uv + surfaceNormal * 0.035;
	tileUV.x += sin(uv.y * 6.0 + tCaustic * 10.0) * 0.005;
	tileUV.y += cos(uv.x * 3.0 + tCaustic * 11.0) * 0.005;

	// --- Caustics ---
	float lap  = hess.x + hess.y;
	float detH = hess.x * hess.y - hess.z * hess.z;

	// Blue refracts more than red, so each channel focuses at a slightly
	// different depth. Three determinants are cheaper than the three pow()
	// calls the old fake dispersion used, and the fringes land on the right
	// side of the filament.
	vec3 gain = vec3(
		focusGain(lap, detH, CAUSTIC_DEPTH * (1.0 - CAUSTIC_DISPERSION)),
		focusGain(lap, detH, CAUSTIC_DEPTH),
		focusGain(lap, detH, CAUSTIC_DEPTH * (1.0 + CAUSTIC_DISPERSION))
	);

	// Above 1.0 the surface converges light, below it spreads light.
	// x/(x+knee) maps the unbounded excess into 0..1; squaring thins it into
	// filaments rather than a general glow.
	vec3 hi = max(gain - 1.0, 0.0);
	vec3 causticRGB = hi / (hi + CAUSTIC_KNEE);
	causticRGB *= causticRGB;

	// The same determinant gives the shadow for free: where the light left, it
	// is darker. No second pattern and no decorrelation offsets — highlight and
	// shadow are two halves of one conserved quantity.
	float causticShadow = max(1.0 - gain.g, 0.0);
	causticShadow *= causticShadow;

	// bright caustics shrink the tile UV a hair, faking light focusing
	tileUV *= (1.0 - causticRGB.g * 0.012);

	// --- Tile Grid Layout ---
	// The tile edge length arrives as a uniform so JS, this shader, and the
	// CSS placeholder all share one integer-CSS-pixel tile size:
	// min(22px, floor(width / 33)) — 9 rows on a wide 198px-tall canvas, at
	// least 33 columns (29 for the text + margin) on narrow ones. Integer tiles
	// keep the grid lines on pixel boundaries in both renderers, so the
	// placeholder and canvas can't drift apart, and make the tile counts
	// genuinely fractional, keeping the text snapping off float knife edges.
	float tileCountV = u_resolution.y / u_tilePx;

	vec2 gridID = floor(tileUV * tileCountV);
	vec2 stableGrid = floor(uv * tileCountV);
	float colorVar = mix(0.96, 1.04, hash(stableGrid));

	// --- Text Positioning ---
	float totalTilesH = tileCountV * aspect;
	float textWidth = 29.0;
	float textHeight = 5.0;
	// The 0.01 nudges keep the floor/ceil off float knife edges: on narrow
	// canvases (totalTilesH - 29)/2 is exactly 2, and on wide ones
	// (tileCountV - 5)/2 is exactly 2, so GPU rounding decides which tile the
	// text lands on — and different GPUs decide differently. Biasing floor up
	// and ceil down makes the result deterministic (and match the CSS
	// placeholder, which snaps the same way).
	vec2 textStart = vec2(floor((totalTilesH - textWidth) / 2.0 + 0.01), ceil((tileCountV - textHeight) / 2.0 - 0.01));
	float isText = getText(gridID - textStart);

	// --- Base Color ---
	float tileMask = tiles(tileUV, tileCountV);
	vec3 grout = vec3(0.28, 0.48, 0.58);
	vec3 tileBase = vec3(0.459, 0.776, 0.894) * colorVar;
	vec3 textTile = vec3(0.89, 0.89, 1.0);
	vec3 color = mix(grout, mix(tileBase, textTile, isText), tileMask);

	// --- Tile Bevel ---
	// Fake a pillowed edge: near each tile border, tilt the surface outward
	// (sign(bg) picks the direction, the smoothstep ramps the tilt in over the
	// outer band of the tile) and light it from the same off-screen upper-right
	// light as the glint. Multiplying by the current color keeps the shading
	// tint-consistent, and by tileMask keeps grout flat. Pure ALU — no extra
	// texture reads. 0.30..0.43 = where the bevel starts and ends (tile face
	// spans |bg| < ~0.45); 0.14 = bevel contrast.
	vec2 bg = fract(tileUV * tileCountV) - 0.5;
	vec2 bevelSlope = sign(bg) * smoothstep(0.30, 0.43, abs(bg));
	float bevelLight = dot(bevelSlope, normalize(vec2(0.35, 0.55)));
	color += color * bevelLight * 0.14 * tileMask;

	// --- Depth Vignette ---
	// darken up to 15% toward the corners, fading in over a 1.2-radius
	float dist = length(uv - vec2(aspect * 0.5, 0.5));
	color *= 1.0 - smoothstep(1.2, 0.0, dist) * 0.15;

	// --- Caustic Lighting ---
	vec3 shadowColor = vec3(0.2, 0.35, 0.45);
	color = mix(color, color * shadowColor, causticShadow * CAUSTIC_SHADOW);
	// causticRGB already carries physical dispersion, so the old per-channel
	// pow() fringing is gone; only the tint survives.
	color += vec3(0.85, 0.95, 0.98) * causticRGB * CAUSTIC_STRENGTH;

	// --- Ripple Lighting (height, independent of the caustic lens) ---
	// The x/(1+x) curves respond linearly to small waves but level off for deep
	// troughs and tall crests, so a fast-moving pointer can't drive the water to
	// black (the old factor could exceed 1 and extrapolate the mix past the
	// shadow color).
	vec3 rippleHighlight = vec3(0.9, 0.97, 1.0);
	vec3 rippleShadow = vec3(0.15, 0.3, 0.4);
	float crest = max(simH, 0.0);
	float trough = max(-simH, 0.0);
	// 0.4 / 0.3 = max crest brightening / max trough darkening
	color += rippleHighlight * 0.4 * crest / (1.0 + crest);
	color = mix(color, color * rippleShadow, 0.3 * trough / (1.0 + trough));

	// --- Specular Glint ---
	// Flat water reflects nothing (dot^64 vanishes); only wave slopes tilted
	// toward the light produce sparkles. The pow makes brightness stay saturated
	// until the slope drops below alignment, so also scale by the local ripple
	// strength to fade the glint with the wave height. Reads glintGrad (wave
	// groups A+B only) so the finest ripples cannot turn dot^64 into crawling
	// speckle. 0.25 converts wave gradient to normal tilt: higher = milder
	// slopes already glint. lightDir points toward the (off-screen upper-right)
	// light; 64 is the glint tightness (higher = smaller, sharper sparkles);
	// 0.05 sets how much sim gradient counts as "full-strength" ripple; 0.4 is
	// the overall glint brightness.
	vec3 surfN = normalize(vec3(-glintGrad * 0.25, 1.0));
	vec3 lightDir = normalize(vec3(0.35, 0.55, 0.75));
	float spec = pow(max(dot(surfN, lightDir), 0.0), 64.0);
	float rippleEnergy = min(length(simGrad) * 0.05, 1.0);
	color += vec3(1.0, 0.98, 0.92) * spec * rippleEnergy * 0.4;

	// --- Output ---
	gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
