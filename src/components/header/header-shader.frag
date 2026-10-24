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
// How much sunlight reaches the pool: 1.0 by day, 0.0 at night, easing through
// twilight. Computed in JS from San Francisco's real sun altitude.
uniform float u_daylight;
// Sunlight tint, white at midday and warming toward gold near the horizon.
uniform vec3 u_sunColor;
// Floating objects (leaves, ducks), packed by floaters.ts. A: x, y in uv units,
// heading in radians, kind (0 none, 1 leaf, 2 duck). B: size in uv units, height
// above the water (0 once afloat, rising while it falls in), opacity, variant.
uniform vec4 u_floatA[4];
uniform vec4 u_floatB[4];

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
// before this gain.
//
// This was 0.08 when the analytic spectrum was the primary lens and the sim
// only added flares where you touched. Now the sim carries the field: waves are
// slow (WAVE_SPEED 0.0025 then) and long-lived, so drip rings are broad, gentle
// curvature rather than sharp dents, and they need ~7x the gain to fold light at
// all. The old "past ~0.3 dent centres go dark" caveat was measured against a
// fresh full-depth pointer dent, which is far sharper than anything the ambient
// drips make; it still applies to a hard click, which is why CLICK_AMP and the
// pointer dent depths are held low.
const float SIM_CURV_GAIN = 0.600;
// Ceiling on the curvature the SIMULATION alone may put into the caustic lens.
//
// A settled ripple sits in the tens; a drip in the frame it lands contributes
// ~580 after the gain above. That is far enough past the first fold that the
// core sweeps from peak highlight to peak shadow within a couple of texels, and
// the drip starts with a hard flash before relaxing into the ripple you
// actually want.
//
// 30 comes from A/B in /header-lab against an unlimited pane, watching the same
// drip land in both. It has to be this low to do anything: an analytic model of
// the injected Gaussian suggested the darkest point stopped improving by ~100,
// and that was simply wrong on screen — at 100 the flash is indistinguishable
// from unlimited, and it only visibly softens around 30. Trust the panes over
// the algebra here; the drip's real curvature is far past what the model said,
// and the stencil, the quintic warp and the ambient sum all sit between the
// injected dent and what the determinant finally sees.
//
// Also tempting and also wrong: 2/CAUSTIC_DEPTH (~42), where a radially
// symmetric feature's determinant (1 + c*h)^2 reaches zero. Aiming AT the fold
// maximises the area at peak brightness. The fold is a place to stay below.
//
// The settled field is unaffected at this value — an A/B of the whole header
// with and without the limit is indistinguishable away from a fresh drip, which
// is the property that matters: this should only bite where curvature is
// extreme, and a drip in the frame it lands is the only thing that gets there.
//
// Raise it toward 500 to effectively disable the limit and get the old flash.
const float SIM_CURV_MAX = 30.0;

// --- Ambient spectrum ---
// Weight of the analytic swell relative to the (SIM_*_GAIN-scaled) simulation.
// Dropped from 0.8 when the ambient drips took over as the main wave source:
// the analytic field is no longer what you are mostly looking at, it is the
// fine background texture the drips ride on. It still earns its place — it is
// the only thing carrying wave group C (|k| 29-43, ~10 sim texels per
// wavelength), which the simulation cannot resolve and which gives the caustic
// determinant its fine structure.
const float AMBIENT_WEIGHT = 0.30;
// Gusting: how far each of the twelve waves' amplitude swings around its
// nominal value. 0.0 is the stationary sea (every wave at a fixed amplitude
// forever); 1.0 lets a wave fade to nothing and come back at double. The
// envelope is centred on 1.0, so the mean amplitude — and therefore the balance
// against the simulation — is unchanged whatever this is set to.
//
// This is the cheap half of "impulses rather than a constant swell": because a
// caustic filament runs perpendicular to its wave's k, fading wave groups in
// and out swings the web's dominant ORIENTATION over time, which is most of
// what reads as weather. Costs one sin() per wave.
const float GUST_DEPTH = 0.60;
// Envelope frequency, in cycles per second, before the per-wave spread below.
// 0.05 is a 20s cycle — slow enough to read as drifting conditions rather than
// as a pulsing effect.
const float GUST_RATE = 0.05;

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

// --- Refraction ---
// How far the tiles are displaced by the surface slope, as a multiple of what
// the caustic lens implies. The caustics come from the map q = p + c*grad(h)
// with c = CAUSTIC_DEPTH: a downward ray through the surface at p lands on the
// floor at q. A viewing ray refracts by the same law, so the floor point SEEN at
// p is the same q — the tile refraction and the caustics are one map, and the
// bright filaments must land where the tiles look most compressed. At 1.0 they
// do. The old code used an unrelated constant that worked out to ~1/300 of the
// lens, so the ambient swell bent light hard and moved the tiles not at all.
//
// Shipped at 0.3, not 1.0. At 1.0 the grid turns to jelly and the logo warps
// enough to be distracting on a page whose point is the schedule below — the
// honest reading of which is that the ambient slopes are ~10x steeper than a
// real pool's, and the caustic web was tuned to those slopes. Reducing the
// swell instead would be the physically consistent fix, but it would also
// dismantle that web, so the departure is taken here, openly, on one dial.
const float REFRACT_SCALE = 0.3;
// --- Glint ---
// Converts the wave slope into the normal's tilt for the specular highlight.
// Physically this would be 1.0 (the normal of z = h(x,y) is (-grad, 1)), but
// the slopes in this shader are ~10x steeper than any real pool, so the glint
// would fire everywhere; this scales them back into a range where only the
// steeper flanks catch the light.
const float GLINT_SLOPE = 0.25;

// --- Sky and clouds ---
// One drifting cloud field does two jobs, which is what keeps them consistent:
// it shades the pool floor (cloud shadows switch the caustics off where they
// pass, the way an overcast moment does at a real outdoor pool), and it is what
// the surface reflects. 0.0 disables both and folds the noise away entirely.
const float CLOUD_AMOUNT = 1.0;
// Fraction of the sky the clouds cover, roughly. SF afternoons run high.
const float CLOUD_COVER = 0.42;
// How much a cloud's shadow takes out of the direct sunlight. 1.0 kills the
// caustics completely under a cloud; the floor also dims a little.
const float CLOUD_SHADOW = 0.85;
// Drift speed in header heights per second. The fog comes in off the ocean, so
// it drifts west to east, which is left to right with north up.
const float CLOUD_SPEED = 0.045;
// Strength of the surface reflection, as a multiple of the physical Fresnel
// term. Physically a pool seen from straight above reflects only 2%, which is
// invisible; the viewer here is taken to stand at the bottom edge looking
// across, so the far (top) side of the pool reflects more of the sky.
const float SKY_REFLECT = 1.0;
// Converts the refraction slope into the reflecting normal's tilt; see the note
// on the sky reflection in main().
const float REFLECT_SLOPE = 0.12;

// --- The water itself ---
// Absorption: water takes out red first, so a white tile a metre down reads as
// pale aqua and the blue tiles get a touch deeper. 0.0 disables it.
const float WATER_TINT = 1.0;

// --- Floating objects ---
// How far below the surface the floor sits, in header heights, for placing a
// floater's shadow. Real pools are about a header deep at this tile size, but
// the shadow is pulled in so it stays next to the thing casting it.
const float FLOATER_DEPTH = 0.28;
// Shadow darkness on the floor.
const float FLOATER_SHADOW = 0.6;

// --- Night ---
// Brightness of the underwater pool lights after dark.
const float POOL_LIGHTS = 1.0;
// Caustics from the pool lights. Lamp light bounces off the underside of the
// surface back onto the floor, and the ripples focus it the same way they focus
// sunlight, so the web stays alive around each lamp after dark. Without it the
// night water only bends the tiles and loses its depth.
const float NIGHT_CAUSTICS = 1.4;
// Glint off the ripples at night, from the streetlights around the pool.
const float NIGHT_GLINT = 1.0;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}


// Cheap hash without sin(), so precision does not depend on the GPU's sin().
float hash2(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float valueNoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = hash2(i);
	float b = hash2(i + vec2(1.0, 0.0));
	float c = hash2(i + vec2(0.0, 1.0));
	float d = hash2(i + vec2(1.0, 1.0));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// ============================================================================
// CLOUDS
//
// Cloud density at a point on the cloud layer, 0 for clear sky. Two octaves are
// plenty: the shadow is soft by nature (the sun is not a point), and the
// reflection is seen at a few percent strength through a moving surface.
// ============================================================================

float clouds(vec2 p, float t) {
	vec2 q = p * 0.55 + vec2(t * CLOUD_SPEED * 0.55, t * 0.004);
	float n = valueNoise(q) * 0.65 + valueNoise(q * 2.3 + 7.1) * 0.35;
	// summed value noise bunches up around 0.5; stretch it back out to 0..1 so
	// CLOUD_COVER means roughly what it says
	n = clamp((n - 0.5) * 1.9 + 0.5, 0.0, 1.0);
	return smoothstep(1.0 - CLOUD_COVER, 1.0 - CLOUD_COVER + 0.22, n);
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

// Slow amplitude envelope for wave `idx`, centred on 1.0.
//
// Golden-angle phases and an irrational rate spread, for the same reason the
// headings use the golden angle: any rational relationship between the twelve
// envelopes lets whole groups fade in and out together, and the caustic web
// visibly breathes as one. The RATE spread does most of that work — equal rates
// with staggered phases still re-align on a fixed period.
//
// The early-out is on a compile-time const, so setting GUST_DEPTH back to 0.0
// costs nothing at all: the branch folds and this whole function inlines to
// 1.0. At the shipped 0.60 it is live and production pays one sin() per wave.
// Under the tuning harness GUST_DEPTH is a uniform, so it becomes a
// fully-coherent branch instead.
float gustEnvelope(float t, float idx) {
	if (GUST_DEPTH == 0.0) return 1.0;
	float rate = GUST_RATE * (0.6 + 0.8 * fract(idx * 0.6180339887));
	return 1.0 + GUST_DEPTH * sin(TAU * rate * t + idx * 2.39996);
}

void addWave(vec2 p, float t, vec2 k, float amp, float omega, float phase,
             float idx, inout float h, inout vec2 grad, inout vec3 hess) {
	amp *= gustEnvelope(t, idx);
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
	addWave(p, t, vec2(  3.500,  0.000), 0.400,  0.9, 0.0,  0.0, h, grad, hess);
	addWave(p, t, vec2( -3.687,  3.377), 0.300, -1.1, 0.0,  1.0, h, grad, hess);
	addWave(p, t, vec2( -0.495,  5.635), 0.250,  0.7, 0.0,  2.0, h, grad, hess);
	addWave(p, t, vec2(  5.163,  6.734), 0.150, -0.8, 0.0,  3.0, h, grad, hess);

	// --- Group B: chop, |k| 11-17 (~3x the swell). Drift speeds follow the
	// deep-water relation w = 0.42*sqrt(|k|), so short waves outrun long ones
	// and the twelve components stay permanently out of step. The per-wave
	// phase offsets keep them from all aligning at the origin.
	addWave(p, t, vec2( 12.787,  2.262), 0.0475 * fadeB,  1.51, 1.7,  4.0, h, grad, hess);
	addWave(p, t, vec2(-12.661,  8.054), 0.0355 * fadeB, -1.63, 3.9,  5.0, h, grad, hess);
	addWave(p, t, vec2( -4.412, 16.411), 0.0277 * fadeB,  1.73, 5.2,  6.0, h, grad, hess);
	addWave(p, t, vec2(  5.070,  9.763), 0.0661 * fadeB, -1.39, 2.4,  7.0, h, grad, hess);

	// The glint raises surface slope to the 64th power, so feeding it the
	// finest ripples turns the header into crawling white speckle. Snapshot the
	// gradient here: groups A+B light the glint, all twelve refract the tiles.
	coarseGrad = grad;

	// --- Group C: ripple, |k| 29-43 (~2.5x again). Amplitudes are 0.4%-2% of
	// the swell, so these are invisible in the height field and barely present
	// in the slope — they exist purely to give the determinant fine structure.
	addWave(p, t, vec2( 29.137, 10.641), 0.00832 * fadeC,  2.34, 0.8,  8.0, h, grad, hess);
	addWave(p, t, vec2(-34.167, 14.103), 0.00586 * fadeC, -2.55, 4.6,  9.0, h, grad, hess);
	addWave(p, t, vec2(-12.309, 26.303), 0.00949 * fadeC,  2.26, 3.1, 10.0, h, grad, hess);
	addWave(p, t, vec2( 12.853, 40.978), 0.00434 * fadeC, -2.75, 1.2, 11.0, h, grad, hess);
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
	// The slope is returned UNSCALED — the same units as the Hessian below before
	// its gain — because it feeds two things that want different gains: the
	// tile refraction, which must use SIM_CURV_GAIN so that it is the gradient of
	// the very field whose curvature drives the caustics, and the glint, which
	// keeps its own SIM_SLOPE_GAIN. main() applies each.
	grad   = vec2(hE - hW, hN - hS) * inv2s;
	hess   = vec3(
		(hE + hW - 2.0 * hC) * invss,
		(hN + hS - 2.0 * hC) * invss,
		(hNE + hSW - hNW - hSE) * (0.25 * invss)
	) * (SIM_CURV_GAIN * u_simLens);

	// Soft-limit the curvature to SIM_CURV_MAX (see the note there). Three
	// properties matter and all three come from applying ONE scalar to the whole
	// Hessian rather than clamping its components:
	//   - it is rotationally invariant, so the lens keeps its shape and
	//     orientation and only loses strength;
	//   - x/sqrt(1 + x^2) is flat near the origin (0.5% down at a fifth of the
	//     ceiling), so settled ripples and their filaments are untouched — this
	//     only bites in the few texels where a drip has just landed;
	//   - it is smooth everywhere. A hard clamp would put a kink in the second
	//     derivative, and this shader goes to some trouble upstream (the quintic
	//     texel warp) to keep that field C2, because a kink in curvature shows
	//     up as a visible crease running through every filament that crosses it.
	// inversesqrt is a single GPU instruction, so this costs almost nothing.
	//
	// Only the lens is limited. The gradient above is left alone, so a fresh
	// drip still refracts the tiles and drives the glint at full strength — the
	// flash being fixed here is specific to the caustic determinant. (This is
	// the one place the tile refraction and the caustic lens part company: in
	// the few texels where a drip has just landed, the lens is softened and the
	// refraction is not.)
	float lapMag = abs(hess.x + hess.y);
	hess *= inversesqrt(1.0 + (lapMag * lapMag) / (SIM_CURV_MAX * SIM_CURV_MAX));
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
// FLOATING OBJECTS
//
// Each shape is a signed distance in the floater's own frame, where the object
// is about one unit across and points along +x: negative inside, positive
// outside. One function per shape serves both the object on the surface and
// its shadow on the floor, which is the same outline seen from below, softened
// by the floor's distance.
// ============================================================================

// A five-lobed autumn leaf (a London plane, the street tree that sheds into SF's
// outdoor pools), tip along +x, stem toward -x.
float leafDist(vec2 q) {
	float r = length(q);
	float a = atan(q.y, q.x);
	float lobes = pow(abs(cos(2.5 * a)), 1.6);
	// lower lobes, beside the stem, are smaller than the tip
	float radius = 0.5 * (0.42 + 0.58 * lobes) * (0.78 + 0.22 * cos(a));
	float blade = (r - radius) * 0.8;
	// the stem, out the back
	vec2 s = q - vec2(clamp(q.x, -0.62, -0.1), 0.0);
	float stem = length(s) - 0.022;
	return min(blade, stem);
}

float ellipseDist(vec2 q, vec2 c, vec2 r) {
	// not exact, but exact enough near the edge for antialiasing and shadows
	return (length((q - c) / r) - 1.0) * min(r.x, r.y);
}

// A rubber duck seen from above, beak along +x.
float duckDist(vec2 q) {
	float body = ellipseDist(q, vec2(-0.06, 0.0), vec2(0.42, 0.30));
	float tail = ellipseDist(q, vec2(-0.40, 0.0), vec2(0.13, 0.07));
	float head = length(q - vec2(0.24, 0.0)) - 0.19;
	float beak = ellipseDist(q, vec2(0.46, 0.0), vec2(0.10, 0.065));
	return min(min(body, tail), min(head, beak));
}

float floaterDist(vec2 q, float kind) {
	return kind < 1.5 ? leafDist(q) : duckDist(q);
}

// Rotate p into floater i's frame, scaled so the object spans one unit.
vec2 floaterFrame(vec2 p, vec4 a, vec4 b) {
	vec2 d = (p - a.xy) / b.x;
	float c = cos(a.z);
	float s = sin(a.z);
	return vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
}

vec3 leafColor(vec2 q, float variant) {
	vec3 yellow = vec3(0.86, 0.66, 0.18);
	vec3 orange = vec3(0.80, 0.40, 0.12);
	vec3 brown = vec3(0.50, 0.32, 0.15);
	vec3 col = variant < 0.5
		? mix(yellow, orange, variant * 2.0)
		: mix(orange, brown, variant * 2.0 - 1.0);
	// veins: thin darker lines down the middle of each lobe
	float a = atan(q.y, q.x);
	float vein = abs(sin(2.5 * a)) * length(q);
	col *= 1.0 - 0.18 * (1.0 - smoothstep(0.008, 0.022, vein));
	// wet and lying flat, lit a little from the sun's side
	col *= 0.92 + 0.16 * clamp(dot(q, vec2(0.54, 0.84)) * 2.0, -1.0, 1.0);
	return col;
}

vec3 duckColor(vec2 q) {
	vec3 col = vec3(1.0, 0.82, 0.10);
	// wings
	float wing = min(
		ellipseDist(q, vec2(-0.12, 0.16), vec2(0.22, 0.08)),
		ellipseDist(q, vec2(-0.12, -0.16), vec2(0.22, 0.08)));
	col = mix(col, vec3(0.93, 0.68, 0.05), 1.0 - smoothstep(-0.01, 0.01, wing));
	// beak
	float beak = ellipseDist(q, vec2(0.46, 0.0), vec2(0.10, 0.065));
	col = mix(col, vec3(1.0, 0.45, 0.08), 1.0 - smoothstep(-0.01, 0.01, beak));
	// round body and head, lit from the upper right
	float head = length(q - vec2(0.24, 0.0));
	vec2 local = head < 0.19 ? (q - vec2(0.24, 0.0)) / 0.19 : (q - vec2(-0.06, 0.0)) / vec2(0.42, 0.30);
	float dome = sqrt(max(1.0 - dot(local, local), 0.0));
	vec3 n = normalize(vec3(local, dome + 0.2));
	float lit = dot(n, normalize(vec3(0.35, 0.55, 0.75)));
	col *= 0.55 + 0.6 * lit;
	col += vec3(0.5) * pow(max(dot(n, normalize(vec3(0.35, 0.55, 1.75))), 0.0), 40.0);
	// eyes
	float eyes = min(length(q - vec2(0.30, 0.10)), length(q - vec2(0.30, -0.10))) - 0.03;
	col = mix(col, vec3(0.06), 1.0 - smoothstep(-0.01, 0.01, eyes));
	return col;
}

// ============================================================================
// NIGHT: underwater pool lights in the two long walls
// ============================================================================

float poolLights(vec2 p, float aspect) {
	float sum = 0.0;
	float n = max(1.0, floor(aspect / 2.4 + 0.5));
	for (int i = 0; i < 8; i++) {
		if (float(i) >= n) break;
		float x = (float(i) + 0.5) / n * aspect;
		vec2 dNear = p - vec2(x, -0.06);
		// the far wall's lights sit between the near wall's
		vec2 dFar = p - vec2(x + 0.5 * aspect / n, 1.06);
		float a = 1.0 / (1.0 + dot(dNear, dNear) * 2.2);
		float b = 1.0 / (1.0 + dot(dFar, dFar) * 2.2);
		sum += a * a + b * b;
	}
	return sum;
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

	// Two slope fields from the same taps. `grad` is the gradient of exactly the
	// field whose Hessian goes into the caustic determinant below (same weights,
	// same gains), so the refraction it drives is the caustics' own map. The
	// glint keeps a separately tuned slope, since it is a lighting effect, not a
	// geometric one.
	vec2 grad      = ambGrad * AMBIENT_WEIGHT + simGrad * SIM_CURV_GAIN;
	vec3 hess      = ambHess * AMBIENT_WEIGHT + simHess;
	vec2 glintGrad = coarseGrad * AMBIENT_WEIGHT + simGrad * SIM_SLOPE_GAIN;

	// --- Tile UV Distortion ---
	// The floor point seen through the surface at p is q = p + c*grad(h), the
	// same map the caustics are the Jacobian of (see REFRACT_SCALE). uv is in
	// aspect-corrected units where one unit is the header's height on both
	// axes, which is what the gradient is taken in, so no per-axis correction
	// is needed. The two tiny sin/cos terms are the old independent shimmer,
	// kept so dead-calm water isn't static.
	vec2 tileUV = uv + grad * (CAUSTIC_DEPTH * REFRACT_SCALE);
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
	vec3 textTile = vec3(0.95, 0.95, 1.0);
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

	// --- Sunlight on the floor ---
	// Everything that blocks the sun on its way down: clouds, then anything
	// floating on the surface. Both are looked up along the light direction from
	// the floor point actually seen (tileUV), so a shadow sits where the light
	// would really be cut off, offset from the thing casting it.
	vec3 lightDir = normalize(vec3(0.35, 0.55, 0.75));
	vec2 sunSlant = lightDir.xy / lightDir.z;
	float sun = u_daylight;
	if (CLOUD_AMOUNT > 0.0) {
		// the cloud layer is high, so its shadow is offset a long way
		sun *= 1.0 - CLOUD_SHADOW * CLOUD_AMOUNT * clouds(tileUV + sunSlant * 0.8, u_time);
	}
	float floaterShade = 1.0;
	for (int i = 0; i < 4; i++) {
		vec4 fa = u_floatA[i];
		vec4 fb = u_floatB[i];
		if (fa.w < 0.5) continue;
		// a floater still falling in is higher up, so its shadow lands further
		// away and softer
		float lift = FLOATER_DEPTH + fb.y;
		vec2 shadowAt = tileUV + sunSlant * lift;
		vec2 q = floaterFrame(shadowAt, fa, fb);
		if (dot(q, q) > 1.2) continue;
		float blur = 0.04 + 0.25 * lift;
		float cover = 1.0 - smoothstep(-blur, blur, floaterDist(q, fa.w));
		floaterShade *= 1.0 - FLOATER_SHADOW * cover * fb.z;
	}
	sun *= floaterShade;

	// --- Pool lights ---
	// After dark the sunlit palette gives way to the underwater lights: the
	// floor falls to a dim blue and brightens in pools around each lamp.
	float lamps = 0.0;
	if (u_daylight < 1.0) {
		lamps = poolLights(tileUV, aspect) * POOL_LIGHTS;
		vec3 night = vec3(0.17, 0.25, 0.38) + vec3(0.72, 0.95, 1.0) * lamps * 1.1;
		color *= mix(night, vec3(1.0), u_daylight);
		// light scattering off the water itself, so the lamps glow
		color += vec3(0.04, 0.22, 0.30) * lamps * (1.0 - u_daylight) * 0.35;
	}

	// --- Caustic Lighting ---
	// Caustics are focused direct sunlight, so they go wherever the sun does:
	// they fade under a cloud, are absent in a floater's shadow, and are gone
	// at night. The floor also dims where the direct light is cut off.
	color *= mix(0.86, 1.0, sun / max(u_daylight, 0.001));
	// A floater's shadow is crisper and closer than a cloud's, and takes out
	// more: the sun is most of the light on a bright day.
	color *= mix(1.0, mix(0.55, 1.0, floaterShade), u_daylight);
	// low sun: the whole floor warms a little and dims, not just the caustics
	color *= mix(vec3(1.0), u_sunColor * 0.92, 0.5 * u_daylight * (1.0 - u_sunColor.b));
	vec3 shadowColor = vec3(0.2, 0.35, 0.45);
	color = mix(color, color * shadowColor, causticShadow * CAUSTIC_SHADOW * sun);
	// causticRGB already carries physical dispersion, so the old per-channel
	// pow() fringing is gone; only the tint survives.
	color += vec3(0.85, 0.95, 0.98) * u_sunColor * causticRGB * CAUSTIC_STRENGTH * sun * sun;
	// the lamps' own caustics, aqua, strongest near the lamps; the 0.35 floor
	// is light bounced around the whole pool, so the web never dies out
	float lampLight = (0.35 + min(lamps, 1.2)) * (1.0 - u_daylight) * NIGHT_CAUSTICS;
	color += vec3(0.55, 0.95, 1.0) * causticRGB * CAUSTIC_STRENGTH * lampLight;
	color = mix(color, color * shadowColor, causticShadow * CAUSTIC_SHADOW * 0.5 * min(lampLight, 1.0));

	// --- Water ---
	// Absorption: red goes first, so white tiles read pale aqua through the
	// water. Applied to everything below the surface, caustics included.
	color *= mix(vec3(1.0), vec3(0.86, 0.97, 1.0), WATER_TINT);

	// --- Ripple Lighting (height, independent of the caustic lens) ---
	// The x/(1+x) curves respond linearly to small waves but level off for deep
	// troughs and tall crests, so a fast-moving pointer can't drive the water to
	// black (the old factor could exceed 1 and extrapolate the mix past the
	// shadow color).
	vec3 rippleHighlight = vec3(0.9, 0.97, 1.0);
	vec3 rippleShadow = vec3(0.15, 0.3, 0.4);
	float crest = max(simH, 0.0);
	float trough = max(-simH, 0.0);
	float rippleLight = mix(0.35 + 0.5 * min(lamps, 1.0), 1.0, u_daylight);
	// 0.4 / 0.3 = max crest brightening / max trough darkening
	color += rippleHighlight * 0.4 * rippleLight * crest / (1.0 + crest);
	color = mix(color, color * rippleShadow, 0.3 * trough / (1.0 + trough));

	// --- Sky Reflection ---
	// The viewer stands off the bottom edge looking across the pool, so the view
	// ray tilts further from vertical toward the top of the header and the
	// Fresnel reflection grows there, as it does in any photo of a pool. The
	// reflected ray picks up the same clouds that are shading the floor, offset
	// and bent by the surface, so they wobble with the ripples.
	//
	// It reads the refraction slope `grad`, scaled down by REFLECT_SLOPE for the
	// same reason GLINT_SLOPE exists: these slopes are ~10x a real pool's, and at
	// full strength every fresh drip tilts far enough to turn into a white disc
	// of mirror.
	vec3 surfN = normalize(vec3(-glintGrad * GLINT_SLOPE, 1.0));
	if (SKY_REFLECT > 0.0) {
		vec3 reflN = normalize(vec3(-grad * REFLECT_SLOPE, 1.0));
		float tilt = mix(0.3, 0.95, screenUV.y);
		vec3 viewDir = vec3(0.0, -sin(tilt), cos(tilt)); // surface toward the eye
		vec3 refl = reflect(-viewDir, reflN);
		float cosI = max(dot(reflN, viewDir), 0.0);
		float fresnel = 0.02 + 0.98 * pow(1.0 - cosI, 5.0);
		vec3 sky = mix(vec3(0.62, 0.80, 0.95), vec3(0.95, 0.97, 1.0), clamp(1.0 - refl.z, 0.0, 1.0));
		vec3 nightSky = vec3(0.03, 0.05, 0.11);
		vec3 cloudCol = vec3(1.0);
		// SF fog glows orange at night from the streetlights under it
		vec3 nightCloud = vec3(0.30, 0.20, 0.16);
		if (CLOUD_AMOUNT > 0.0) {
			vec2 skyAt = uv + refl.xy / max(refl.z, 0.25) * 0.8;
			float c = clouds(skyAt, u_time) * CLOUD_AMOUNT;
			sky = mix(sky, cloudCol, c);
			nightSky = mix(nightSky, nightCloud, c);
		}
		sky = mix(nightSky, sky, u_daylight);
		color = mix(color, sky, clamp(fresnel * SKY_REFLECT, 0.0, 1.0));
	}

	// --- Specular Glint ---
	// Blinn-Phong: a facet reflects the light into the eye when its normal lies
	// along the HALF-VECTOR between the light and view directions, not along the
	// light itself. The viewer looks straight down, so with the light at ~41
	// degrees off vertical the half-vector sits at ~20 — and the old dot(N, L)
	// form peaked at a 41-degree tilt, which no ripple here reaches, so the
	// glint only ever saw the shoulder of its own lobe. Flat water still
	// reflects nothing: dot(up, H)^64 is ~0.01. Reads glintGrad (wave groups
	// A+B only) so the finest ripples cannot turn pow 64 into crawling speckle,
	// and fades with the local ripple strength so the ambient swell alone does
	// not sparkle. 64 is the glint tightness (higher = smaller, sharper
	// sparkles); 0.05 sets how much sim slope counts as "full-strength" ripple;
	// 0.4 is the brightness. A cloud over the sun dims it; at night it is a
	// streetlight's warm glint instead.
	vec3 halfVec = normalize(lightDir + vec3(0.0, 0.0, 1.0));
	float spec = pow(max(dot(surfN, halfVec), 0.0), 64.0);
	float rippleEnergy = min(length(simGrad * SIM_SLOPE_GAIN) * 0.05, 1.0);
	vec3 glintCol = mix(vec3(1.0, 0.82, 0.55) * NIGHT_GLINT, vec3(1.0, 0.98, 0.92) * u_sunColor, u_daylight);
	float glintSun = u_daylight > 0.0 ? mix(0.3, 1.0, sun / u_daylight) : 1.0;
	color += glintCol * spec * rippleEnergy * 0.4 * glintSun;

	// --- Floaters ---
	// Drawn last: they sit on top of the water, so nothing refracts or tints
	// them. A thin dark meniscus where the water meets the edge seats them.
	float px = 1.0 / u_resolution.y; // one device pixel in uv units
	for (int i = 0; i < 4; i++) {
		vec4 fa = u_floatA[i];
		vec4 fb = u_floatB[i];
		if (fa.w < 0.5) continue;
		// still falling: drawn a little larger, as it is closer to the eye
		vec4 fbScaled = vec4(fb.x * (1.0 + fb.y * 1.5), fb.yzw);
		vec2 q = floaterFrame(uv, fa, fbScaled);
		if (dot(q, q) > 0.6) continue;
		float d = floaterDist(q, fa.w);
		float aa = 1.2 * px / fbScaled.x;
		float cover = 1.0 - smoothstep(-aa, aa, d);
		float rim = (1.0 - smoothstep(0.0, 0.05, abs(d))) * step(0.0, d);
		color = mix(color, color * 0.75, rim * fb.z * (1.0 - fb.y));
		vec3 fc = fa.w < 1.5 ? leafColor(q, fb.w) : duckColor(q);
		fc *= mix(vec3(0.25, 0.3, 0.45), vec3(1.0), u_daylight);
		color = mix(color, fc, cover * fb.z);
	}

	// --- Output ---
	gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
