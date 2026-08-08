import displayFragShader from "./header-shader.frag";
import simFragShader from "./water-sim.frag";
import { JS_PARAM_DEFAULTS } from "./HeaderAnimation";

// ============================================================================
// TUNABLE SHADER PARAMETERS
//
// The shaders declare their knobs as `const float NAME = value;`, one per line.
// Production compiles them exactly as written, so the GLSL compiler folds them
// into the instructions that use them and they cost nothing.
//
// The tuning harness rewrites those same declarations into `uniform float NAME;`
// and drives them from sliders. That means:
//   - production pays nothing for tunability,
//   - the harness cannot drift out of sync with production, because the slider
//     DEFAULTS are parsed out of the shader source rather than duplicated here,
//   - a tuned value is pasted back by editing the one line the parser read.
//
// A `#define` preamble would be the obvious alternative and is wrong here: a
// `#define SIM_CURV_GAIN 0.2` textually rewrites the declaration itself into
// `const float 0.2 = 0.08;`, which does not compile. #define is still the only
// option for anything that must be a compile-time constant (loop bounds, #if
// switches); there are none left in these shaders.
// ============================================================================

export type ParamDomain = "display" | "sim" | "js";

export type ParamSpec = {
	name: string;
	domain: ParamDomain;
	group: string;
	label: string;
	min: number;
	max: number;
	step: number;
	/** what the number does, and which way to turn it */
	hint: string;
};

// Ranges are chosen to bracket the interesting region, not the legal one — a
// slider that spends most of its travel in a range nobody wants is useless.
export const PARAM_SPECS: ParamSpec[] = [
	// --- Caustics -----------------------------------------------------------
	{
		name: "CAUSTIC_DEPTH", domain: "display", group: "Caustics",
		label: "Refraction depth", min: 0.01, max: 0.12, step: 0.001,
		hint: "The master dial. How far below the surface the floor sits. Too low and the determinant never reaches zero, so there are no filaments at all — just soft shimmer. Too high and much of the frame is past the first fold, where this single-branch model renders a dark core but a real pool is bright. ~3% folded is the sweet spot.",
	},
	{
		name: "CAUSTIC_SOFT", domain: "display", group: "Caustics",
		label: "Filament softness", min: 0.03, max: 0.5, step: 0.005,
		hint: "Width of the Lorentzian core keeping 1/|det| finite. Sets both peak brightness (~1/this) and on-screen filament width. Raise it first if the caustics crawl or sparkle — a sub-pixel bright line aliases.",
	},
	{
		name: "CAUSTIC_KNEE", domain: "display", group: "Caustics",
		label: "Highlight knee", min: 0.2, max: 4.0, step: 0.05,
		hint: "Where the highlight reaches half brightness. Lower = more of the frame lights up; higher = only the hottest cores.",
	},
	{
		name: "CAUSTIC_DISPERSION", domain: "display", group: "Caustics",
		label: "Chromatic dispersion", min: 0.0, max: 0.25, step: 0.005,
		hint: "Spread of the refraction depth across R/G/B. Water's real value is ~3%; more exaggerates the colour fringe to stay visible at 8-bit.",
	},
	{
		name: "CAUSTIC_STRENGTH", domain: "display", group: "Caustics",
		label: "Highlight strength", min: 0.0, max: 1.5, step: 0.02,
		hint: "Overall brightness of the caustic highlight.",
	},
	{
		name: "CAUSTIC_SHADOW", domain: "display", group: "Caustics",
		label: "Shadow strength", min: 0.0, max: 1.0, step: 0.02,
		hint: "Depth of the defocused regions. Free from the same determinant — where light left, it is darker.",
	},

	// --- Wave field ---------------------------------------------------------
	{
		name: "SIM_CURV_GAIN", domain: "display", group: "Wave field",
		label: "Ripple lens gain", min: 0.0, max: 1.5, step: 0.005,
		hint: "How hard simulated ripples bend light, against the ambient swell. Reference: ambient peaks near |laplacian| 48 and a fresh pointer dent contributes ~968 before this gain. Raise it for dramatic flares where you touch; past ~0.3 dent centres fold far enough to go dark.",
	},
	{
		name: "SIM_SLOPE_GAIN", domain: "display", group: "Wave field",
		label: "Ripple slope gain", min: 0.0, max: 40.0, step: 0.5,
		hint: "How hard simulated ripples refract the tiles and drive the glint. Independent of the lens gain above.",
	},
	{
		name: "SIM_HEIGHT_SCALE", domain: "display", group: "Wave field",
		label: "Ripple height lighting", min: 0.0, max: 4.0, step: 0.05,
		hint: "Scales raw sim height into the crest/trough brightening. Purely a lighting term — does not affect the caustic lens.",
	},
	{
		name: "SIM_CURV_MAX", domain: "display", group: "Wave field",
		label: "Ripple lens ceiling", min: 5.0, max: 500.0, step: 5.0,
		hint: "Ceiling on the curvature the simulation alone may put into the caustic lens — softens the bright-then-black flash in the frame a drip lands, without touching the settled field. It has to go LOW to do anything: at 100 the flash is indistinguishable from unlimited, and it only visibly softens around 30. Judge it by landing a drip in an A/B, not by the number. Raise toward 500 to disable.",
	},
	{
		name: "AMBIENT_WEIGHT", domain: "display", group: "Wave field",
		label: "Ambient swell weight", min: 0.0, max: 2.0, step: 0.02,
		hint: "Weight of the 12-wave analytic swell relative to the simulation. Drop it to zero to see what user ripples alone do to the light.",
	},
	{
		name: "GUST_DEPTH", domain: "display", group: "Wave field",
		label: "Swell gusting depth", min: 0.0, max: 1.0, step: 0.02,
		hint: "How far each of the 12 analytic waves' amplitude swings around its nominal value. 0 = today's stationary sea; 1 = a wave can fade to nothing and return at double. Centred on 1.0, so the mean amplitude and the balance against the sim are unchanged. Filaments run perpendicular to their wave's k, so this swings the caustic web's dominant ORIENTATION over time — most of what reads as changing weather, for one sin() per wave.",
	},
	{
		name: "GUST_RATE", domain: "display", group: "Wave field",
		label: "Gust rate (cycles/s)", min: 0.005, max: 0.2, step: 0.005,
		hint: "Envelope frequency before the per-wave spread. 0.05 is a 20s cycle. Push it past ~0.12 and the field reads as pulsing rather than as drifting conditions. Does nothing at gusting depth 0.",
	},
	{
		name: "CURV_STENCIL", domain: "display", group: "Wave field",
		label: "Derivative stencil (texels)", min: 1.0, max: 4.0, step: 1.0,
		hint: "MUST stay a whole number — the sub-texel smoothing is only valid when every tap sits an integer number of texels away. 2 also nulls the grid's Nyquist mode exactly; at 1 the sim's sharp impulses stripe.",
	},
	{
		name: "GRADIENT_SCALE", domain: "display", group: "Wave field",
		label: "Gradient scale", min: 0.0, max: 0.02, step: 0.0005,
		hint: "Converts wave gradients into the range the tile refraction and glint are tuned against.",
	},

	// --- Simulation ---------------------------------------------------------
	{
		name: "WAVE_SPEED", domain: "sim", group: "Simulation",
		label: "Wave speed (c²)", min: 0.0005, max: 0.30, step: 0.0005,
		hint: "How far waves travel per sim step. This is c SQUARED, so the ring speed is its square root — 0.001 is a seventh of 0.05, not a fiftieth, and the bottom of this slider is far less extreme than it looks. MUST stay below 0.5 (CFL) or the sim explodes into checkerboard noise; the top is cut to 0.30 because the useful range turned out to be the bottom. Slow waves also travel less far before damping takes them, since decay distance is speed times decay time.",
	},
	{
		name: "DAMPING", domain: "sim", group: "Simulation",
		label: "Damping", min: 0.95, max: 1.0, step: 0.0005,
		hint: "Energy retained per step, and the parameter that decides whether a travelling front can cross the header at all. At 0.985 with 2 substeps a wave e-folds in ~0.55s while moving ~114 CSS px/s, so it dies ~60px from where it was made — a line swell never gets across. ~0.995 with speed 0.4 and 3 substeps gives ~375px. Finer steps than the other sliders because the decay time is 1/(1-this): 0.995 vs 0.996 is a 20% difference.",
	},
	{
		name: "JITTER_WAVELENGTH", domain: "sim", group: "Simulation",
		label: "Swell front roughness (texels)", min: 1.0, max: 24.0, step: 1.0,
		hint: "Texels per noise cell along the scroll swell's leading edge. At 1 this is white noise at the grid's Nyquist frequency, which the caustic lens amplifies into hard vertical stripes; higher keeps the front irregular but band-limited.",
	},

	// --- Pointer input (JS side — these shape the impulse before it reaches
	// the shader, so they cannot be uniforms) --------------------------------
	{
		name: "IMPULSE_BASE", domain: "js", group: "Pointer input",
		label: "Dent depth, slow drag", min: 0.0, max: 0.6, step: 0.01,
		hint: "How deep the dent is when the pointer is barely moving.",
	},
	{
		name: "IMPULSE_PER_PX", domain: "js", group: "Pointer input",
		label: "Depth per px/frame of speed", min: 0.0, max: 0.03, step: 0.001,
		hint: "How much faster pointer movement deepens the dent. The caustic lens reads curvature directly, so a deep dent throws a much brighter flare than the wake it leaves — lower this if the moment of contact overpowers the ripples that follow.",
	},
	{
		name: "IMPULSE_MAX", domain: "js", group: "Pointer input",
		label: "Dent depth cap", min: 0.05, max: 1.5, step: 0.05,
		hint: "Ceiling on dent depth however fast the pointer moves.",
	},
	{
		name: "CLICK_AMP", domain: "js", group: "Pointer input",
		label: "Click splash depth", min: 0.0, max: 2.0, step: 0.05,
		hint: "A click stamps a point dent this deep, with no sweep.",
	},
	{
		name: "SIM_IMPULSE_RADIUS", domain: "js", group: "Pointer input",
		label: "Dent radius (texels)", min: 1.0, max: 12.0, step: 0.5,
		hint: "Width of the Gaussian dent. Wider dents have gentler curvature for the same depth, so they lens more softly.",
	},
	{
		name: "SIM_SUBSTEPS", domain: "js", group: "Pointer input",
		label: "Sim steps per frame", min: 1, max: 4, step: 1,
		hint: "Wave-equation steps per rendered frame. More makes ripples travel and decay faster, at proportional GPU cost.",
	},
	{
		name: "SCROLL_AMP_MAX", domain: "js", group: "Pointer input",
		label: "Scroll swell cap", min: 0.0, max: 1.0, step: 0.02,
		hint: "Ceiling on the swell height a scroll jerk can inject.",
	},

	// --- Timed ambient swells (JS side: these choose WHEN and from WHICH
	// direction a line source fires, which no uniform can decide) -------------
	{
		name: "SWELL_AMP", domain: "js", group: "Ambient swell impulses",
		label: "Swell height", min: 0.0, max: 0.8, step: 0.02,
		hint: "Height of each timed line swell. 0 disables them entirely (the committed default). These only earn their keep alongside a much lower damping and a higher wave speed — at the shipped 0.985/0.1 the front dies a fifth of the way across the header.",
	},
	{
		name: "SWELL_PERIOD_S", domain: "js", group: "Ambient swell impulses",
		label: "Seconds between swells", min: 1.0, max: 15.0, step: 0.5,
		hint: "Mean gap between swells; each fires at a hashed moment inside its window, so the spacing varies but the rate does not. Set this near the decay time — much longer and the pool visibly flattens between events, much shorter and successive fronts stack into chop.",
	},
	{
		name: "SWELL_SPREAD_DEG", domain: "js", group: "Ambient swell impulses",
		label: "Heading spread (deg)", min: 0.0, max: 90.0, step: 1.0,
		hint: "How far off the long axis a swell's heading can be. 0 fires every front dead horizontal, which reads as mechanical; 90 makes every heading equally likely. Between them fronts favour the axis with the most room to travel — worth keeping below 90 at high wave speeds, where a steeply oblique front reaches the near long edge almost immediately.",
	},
	{
		name: "SWELL_INSET", domain: "js", group: "Ambient swell impulses",
		label: "Start inside the pool", min: 0.0, max: 1.0, step: 0.02,
		hint: "How far in from the upwind edge a front may start, as a fraction of the pool's width along its heading; each swell picks a random amount up to this. 0 parks them all on the wall, which reads as scheduled arrivals from off-screen. Above 0 a front can appear mid-pool and radiate BOTH ways — a line injected at rest is symmetric, it simply has nowhere to go when it starts on the wall — and the two halves then reflect off opposite walls out of step.",
	},
	{
		name: "SWELL_RADIUS", domain: "js", group: "Ambient swell impulses",
		label: "Front width (texels)", min: 1.0, max: 8.0, step: 0.5,
		hint: "Half-width of the injected band, shared with the scroll swell. Narrow fronts carry more of their energy in short wavelengths, which this sim damps at the same rate as long ones and so loses first; wider fronts travel further but lens more softly.",
	},

	// --- Ambient drips (point sources, the circular counterpart to the line
	// swells above) ----------------------------------------------------------
	{
		name: "DRIP_AMBIENT_AMP", domain: "js", group: "Ambient drips",
		label: "Drip depth", min: 0.0, max: 1.0, step: 0.02,
		hint: "Depth of each timed drip; 0 disables them (the committed default). Unlike a line swell, a drip radiates a circular front that reflects off all four walls and crosses its own earlier rings — the interference of several drips at different ages is what the reference demo's idle water actually is. Wants a high damping to be worth anything: the rings have to outlive the gap between drips or they never overlap.",
	},
	{
		name: "DRIP_PERIOD_S", domain: "js", group: "Ambient drips",
		label: "Seconds between drips", min: 0.25, max: 10.0, step: 0.25,
		hint: "Mean gap between drips, each firing at a hashed moment inside its window. The number that matters is this against the decay time: shorter and rings from several generations overlap, longer and you watch one ring at a time expand and die.",
	},
	{
		name: "DRIP_RADIUS", domain: "js", group: "Ambient drips",
		label: "Drip radius (texels)", min: 1.0, max: 12.0, step: 0.5,
		hint: "Width of the Gaussian dent, independent of the pointer's. This is the strongest lever on the initial flash, because peak curvature goes as depth/radius² while the water displaced — which is what sets the ripple that follows — goes as depth×radius². So you can trade one against the other: multiply this by k and divide Drip depth by k², and the ripple carries the same energy while the opening curvature drops by k⁴. Radius 3→5 with depth 0.35→0.13 is a 7.7x gentler start for the same wave.",
	},
];

/** Parse `const float NAME = <number>;` out of a shader source. */
function parseDefault(src: string, name: string): number | undefined {
	const m = src.match(
		new RegExp(`const\\s+float\\s+${name}\\s*=\\s*(-?[0-9]*\\.?[0-9]+)\\s*;`)
	);
	return m ? Number(m[1]) : undefined;
}

function sourceFor(domain: ParamDomain): string {
	return domain === "sim" ? simFragShader : displayFragShader;
}

/**
 * Slider defaults, read out of the shader source at import time so they are
 * always whatever production actually compiles.
 */
export const PARAM_DEFAULTS: Record<string, number> = (() => {
	const out: Record<string, number> = {};
	for (const spec of PARAM_SPECS) {
		if (spec.domain === "js") {
			// JS-side numbers live in HeaderAnimation.tsx, not in a shader.
			const v = (JS_PARAM_DEFAULTS as Record<string, number>)[spec.name];
			if (v === undefined) {
				console.warn(`[shader-params] no JS default for ${spec.name}`);
			} else {
				out[spec.name] = v;
			}
			continue;
		}
		const value = parseDefault(sourceFor(spec.domain), spec.name);
		if (value === undefined) {
			// Loud rather than silent: a renamed constant would otherwise give the
			// harness a plausible-looking 0 and quietly misreport production.
			console.warn(
				`[shader-params] no "const float ${spec.name} = ...;" found in the ` +
				`${spec.domain} shader — the slider will not match production.`
			);
			continue;
		}
		out[spec.name] = value;
	}
	return out;
})();

/**
 * Rewrite the listed `const float` declarations into `uniform float`, so they
 * can be driven live. Returns the source unchanged for any name it cannot find,
 * which keeps a typo from silently producing a shader whose uniform is never
 * set (and therefore reads as 0.0).
 */
export function withTunableUniforms(src: string, names: string[]): string {
	let out = src;
	for (const name of names) {
		const decl = new RegExp(
			`const\\s+float\\s+${name}\\s*=\\s*-?[0-9]*\\.?[0-9]+\\s*;`
		);
		if (!decl.test(out)) continue;
		out = out.replace(decl, `uniform float ${name};`);
	}
	return out;
}

export const JS_TUNABLES = PARAM_SPECS.filter(s => s.domain === "js").map(s => s.name);
export const DISPLAY_TUNABLES = PARAM_SPECS.filter(s => s.domain === "display").map(s => s.name);
export const SIM_TUNABLES = PARAM_SPECS.filter(s => s.domain === "sim").map(s => s.name);

/** The two lab shader sources, with every tunable promoted to a uniform. */
export const LAB_DISPLAY_SRC = withTunableUniforms(displayFragShader, DISPLAY_TUNABLES);
export const LAB_SIM_SRC = withTunableUniforms(simFragShader, SIM_TUNABLES);

/** Emit a tuned set as the GLSL lines to paste back over the originals. */
export function toGlsl(values: Record<string, number>): string {
	const groups = new Map<string, string[]>();
	for (const spec of PARAM_SPECS) {
		const v = values[spec.name];
		if (v === undefined || v === PARAM_DEFAULTS[spec.name]) continue;
		if (spec.domain === "js") {
			if (!groups.has("HeaderAnimation.tsx")) groups.set("HeaderAnimation.tsx", []);
			const dec = Math.max(0, -Math.floor(Math.log10(spec.step)));
			groups.get("HeaderAnimation.tsx")!.push(`const ${spec.name} = ${v.toFixed(dec)};`);
			continue;
		}
		const file = spec.domain === "sim" ? "water-sim.frag" : "header-shader.frag";
		if (!groups.has(file)) groups.set(file, []);
		// Range inputs accumulate binary float error (0.1 + 0.2 lands on
		// 0.30000000000000004), so round to the slider's own precision rather
		// than pasting that into the shader. GLSL needs a decimal point on a
		// float literal, hence the toFixed(1) floor.
		const decimals = Math.max(1, -Math.floor(Math.log10(spec.step)));
		groups.get(file)!.push(`const float ${spec.name} = ${v.toFixed(decimals)};`);
	}
	if (groups.size === 0) return "// no changes from the committed defaults";
	return [...groups.entries()]
		.map(([file, lines]) => `// ${file}\n${lines.join("\n")}`)
		.join("\n\n");
}
