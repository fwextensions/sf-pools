import displayFragShader from "./header-shader.frag";
import simFragShader from "./water-sim.frag";

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
		label: "Ripple lens gain", min: 0.0, max: 0.5, step: 0.005,
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
		name: "AMBIENT_WEIGHT", domain: "display", group: "Wave field",
		label: "Ambient swell weight", min: 0.0, max: 2.0, step: 0.02,
		hint: "Weight of the 12-wave analytic swell relative to the simulation. Drop it to zero to see what user ripples alone do to the light.",
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
		label: "Wave speed (c²)", min: 0.01, max: 0.45, step: 0.005,
		hint: "How far waves travel per sim step. MUST stay below 0.5 — above that the CFL condition breaks and the simulation explodes into checkerboard noise.",
	},
	{
		name: "DAMPING", domain: "sim", group: "Simulation",
		label: "Damping", min: 0.9, max: 1.0, step: 0.001,
		hint: "Energy retained per step. Toward 1.0 the pool sloshes dramatically longer.",
	},
	{
		name: "JITTER_WAVELENGTH", domain: "sim", group: "Simulation",
		label: "Swell front roughness (texels)", min: 1.0, max: 24.0, step: 1.0,
		hint: "Texels per noise cell along the scroll swell's leading edge. At 1 this is white noise at the grid's Nyquist frequency, which the caustic lens amplifies into hard vertical stripes; higher keeps the front irregular but band-limited.",
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
		if (spec.domain === "js") continue;
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
