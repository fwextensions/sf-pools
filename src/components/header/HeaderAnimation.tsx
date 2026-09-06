"use client";

import React, { useEffect, useRef } from "react";
import type p5 from "p5";
import displayFragShader from "./header-shader.frag";
import simFragShader from "./water-sim.frag";
import {
	HeaderPlaceholder,
	HEADER_HEIGHT,
	headerHeightPx,
	tileCssPx,
} from "@/components/header/HeaderPlaceholder";
import {
	advanceSimClock,
	createSimClock,
	dueBucket,
	hash01,
} from "./wave-schedule";

const vertShader = `
	attribute vec3 aPosition;
	varying vec2 vTexCoord;
	void main() {
		vTexCoord = aPosition.xy * 0.5 + 0.5;
		gl_Position = vec4(aPosition, 1.0);
	}
`;

// Size the simulation by CSS pixels, not a fixed texel count, so ripples
// have the same on-screen wavelength, dent size, and speed on every device.
// (A fixed 512-wide sim made one texel ~2.7px on desktop but ~0.8px on a
// phone, so phone ripples came out small and overly crisp.) Texels stay
// square on screen so waves propagate isotropically.
const SIM_TEXEL_CSS_PX = 3;
const SIM_MAX_WIDTH = 512;
const SIM_MIN_WIDTH = 96;
const SIM_SUBSTEPS = 3; // wave-equation steps per frame; more = faster waves
const SIM_IMPULSE_RADIUS = 3.0; // pointer dent radius, in sim texels

// Pointer dent depth: IMPULSE_BASE for a slow drag, rising with pointer speed
// at IMPULSE_PER_PX and capped at IMPULSE_MAX. These were 0.15 / 0.01 / 1.0,
// which let an ordinary flick carve a full-depth trough — fine when curvature
// only scaled a texture, but the caustic lens reads curvature directly, so a
// full-depth dent throws a glare far brighter than the settled ripples that
// follow it. Halved, so the moment of contact is closer in strength to the
// wake it leaves behind.
const IMPULSE_BASE = 0.08;
const IMPULSE_PER_PX = 0.005;
const IMPULSE_MAX = 0.5;
const CLICK_AMP = 0.7; // clicks still splash harder than moves (was 1.2)
const MAX_PIXEL_DENSITY = 1.5; // retina resolution is invisible on blurry water

// Scroll-driven swell: inertia responds to acceleration, not velocity, so
// the water sloshes when scrolling starts, stops, or jerks — a steady
// scroll glides without pumping energy in every frame (a full-width line
// source held for even a second visibly overdrives the pool).
const SWELL_RADIUS = 2.5; // line-source band half-width, in sim texels
const SCROLL_AMP_PER_PX = 0.006; // swell height per px/frame of speed change
const SCROLL_AMP_MAX = 0.4;

// Timed ambient swells: a line source fired off the left or right edge every
// few seconds at an oblique heading, so the pool is stirred by discrete events
// travelling across it rather than by a permanent analytic sea.
//
// SWELL_AMP = 0 disables them, which is the committed default — they were tried
// and rejected. A full-width straight front that appears on a timer reads as
// artificial no matter how it is roughened or where it starts, because nothing
// on screen caused it. The identical mechanism driven by scrolling reads fine,
// which is the tell: the problem was never the wavefront, it was that an
// ambient one arrives without a cause. Circular drips do not have this problem
// — a ring implies a point event the eye is happy to infer.
//
// Left in place because the scroll swell shares every line of it, and because
// the sliders make it a two-second experiment if the question comes back.
const SWELL_AMP = 0.0;
const SWELL_PERIOD_S = 4.0; // mean seconds between swells
// Heading spread off the horizontal, in degrees. At 90 every heading is equally
// likely; below that fronts favour the long axis, which gives them the longest
// run across the pool before they reach an edge.
const SWELL_SPREAD_DEG = 60;
// How far into the pool a front may start, as a fraction of the pool's width
// along its own heading. 0 parks every front tangent to the edge, which reads
// as mechanical once you notice it — the swells all arrive from outside, on
// schedule. Starting some of them inside means a front can appear mid-pool and
// radiate BOTH ways (a line injected at rest is symmetric), and the two halves
// then reflect off opposite walls at different times.
const SWELL_INSET = 0.35;

// Ambient drips: point impulses on a timer, the circular-wavefront counterpart
// to the line swells. These are what produce expanding rings that reflect off
// the walls and interfere with each other — the character of the reference
// demo's idle state. Deterministic from the clock, like the swells, so both
// harness panes drip identically.
//
// Distinct from the idle drips below: those exist so an untouched page is not
// dead, fire only after 6s of stillness, and are suppressed under the harness.
// These run continuously and are part of the wave field's design.
const DRIP_AMBIENT_AMP = 0.35; // 0 disables them entirely
// Mean seconds between drips. Set against the ~3.7s decay time from DAMPING:
// close enough that a new ring arrives while the previous one is still crossing
// the pool, so there are usually two or three generations interfering, but far
// enough apart that each one is still legible as a single expanding ring.
const DRIP_PERIOD_S = 5.0;
const DRIP_RADIUS = 3.0; // drip radius, in sim texels
// Minimum time between swell injections. Scrubbing the scroll thumb up and
// down flips the jerk sign every frame, and a full-width line source fired
// at 60Hz pumps the pool into chaos; a cooldown turns that into a few
// discrete sloshes per second, which the damping can absorb.
const SCROLL_COOLDOWN_MS = 180;

// Idle drips: when nobody has touched or scrolled for a while, a drop
// falls somewhere random — much gentler than a real click (amp 1.2).
//
// INACTIVE at the shipped values: the ambient drips above run continuously and
// suppress these (see the guard in draw), because both writing to the impulse
// channel would mean two uncoordinated drip schedules fighting for it. This
// survives only as the fallback for DRIP_AMBIENT_AMP = 0, which is the one
// configuration where an untouched page would otherwise be dead water.
const DRIP_IDLE_DELAY_MS = 6000; // stillness required before dripping starts
const DRIP_MIN_GAP_MS = 6000; // random spacing between drips
const DRIP_MAX_GAP_MS = 12000;
const DRIP_AMP = 0.35;

/**
 * Shared input for the tuning harness. Two sims must receive IDENTICAL input or
 * an A/B comparison is meaningless: p5 computes mouseX/mouseY per canvas from
 * its own bounding rect, so only the pane the pointer is physically over would
 * otherwise be stirred.
 */
export type InputBus = {
	/**
	 * Impulse for the next frame, in sim UV (y already flipped).
	 *
	 * `seq` increments on every new pointer event and is what makes an impulse
	 * fire ONCE PER INSTANCE. A plain amp flag cannot work here: leaving it set
	 * re-injects the dent every frame, so it never decays and sits there warping
	 * the water forever; clearing it on read means whichever instance draws
	 * first consumes it and the other never sees it at all, which silently
	 * defeats the point of sharing the bus. Each sketch remembers the last seq
	 * it applied instead.
	 */
	impulse: {
		x: number; y: number; prevX: number; prevY: number; amp: number; seq: number;
	};
	/** synthetic scroll position, in px, shared by both instances */
	scrollY: number;
};

/** JS-side tunables, mirrored by the harness so they get sliders too. */
export type JsParams = {
	IMPULSE_BASE: number;
	IMPULSE_PER_PX: number;
	IMPULSE_MAX: number;
	CLICK_AMP: number;
	SIM_IMPULSE_RADIUS: number;
	SIM_SUBSTEPS: number;
	SCROLL_AMP_MAX: number;
	SWELL_RADIUS: number;
	SWELL_AMP: number;
	SWELL_PERIOD_S: number;
	SWELL_SPREAD_DEG: number;
	SWELL_INSET: number;
	DRIP_AMBIENT_AMP: number;
	DRIP_PERIOD_S: number;
	DRIP_RADIUS: number;
};

export const JS_PARAM_DEFAULTS: JsParams = {
	IMPULSE_BASE,
	IMPULSE_PER_PX,
	IMPULSE_MAX,
	CLICK_AMP,
	SIM_IMPULSE_RADIUS,
	SIM_SUBSTEPS,
	SCROLL_AMP_MAX,
	SWELL_RADIUS,
	SWELL_AMP,
	SWELL_PERIOD_S,
	SWELL_SPREAD_DEG,
	SWELL_INSET,
	DRIP_AMBIENT_AMP,
	DRIP_PERIOD_S,
	DRIP_RADIUS,
};

export type SketchOptions = {
	/** override the compiled shader sources (the harness promotes consts to uniforms) */
	displaySrc?: string;
	simSrc?: string;
	/** live uniform values, read every frame; keys are shader constant names */
	getUniforms?: () => Record<string, number>;
	/**
	 * Shared clock origin, in performance.now() ms. p5's millis() is stamped per
	 * instance at ITS setup, so two instances booting milliseconds apart animate
	 * the analytic swell permanently out of phase — which alone would invalidate
	 * a side-by-side comparison of the caustics.
	 */
	t0?: number;
	/** canvas width in CSS px; defaults to the viewport width */
	getWidth?: () => number;
	/**
	 * Live overrides for the JS-side numbers, read every frame. These cannot be
	 * uniforms: they shape the impulse BEFORE it reaches the shader.
	 */
	getJsParams?: () => Partial<JsParams>;
	/** when present, replaces p5's own pointer/scroll handling and idle drips */
	input?: InputBus;
};

function renderSFPools(
	p: p5,
	opts: SketchOptions = {})
{
	let displayShader: p5.Shader;
	let simShader: p5.Shader;
	// p5.Framebuffer isn't in the (1.x) type definitions yet
	let simRead: any;
	let simWrite: any;
	let simTexel = [1 / SIM_MAX_WIDTH, 1 / SIM_MAX_WIDTH];

	let canvasEl: HTMLElement;
	let firstFrame = true;
	// 1.0 when the GPU can linearly filter the float sim texture, 0.0 otherwise.
	// Feeds u_simLens: without linear filtering the sim's second derivative is
	// meaningless, so the caustic lens falls back to the analytic field alone
	// rather than rendering per-texel blocks.
	let simLens = 1.0;
	// Antialias fade for ambient wave groups B and C, recomputed on resize. A
	// band whose wavelength approaches a few device pixels is faded out rather
	// than left to alias into crawling speckle. Frame-invariant, so it is
	// computed here instead of per fragment.
	let bandFade: [number, number] = [1, 1];

	// pointer impulse pending for the next sim step (consumed each frame);
	// the prev position sweeps the dent along the swipe segment
	let impulseX = 0.5;
	let impulseY = 0.5;
	let impulsePrevX = 0.5;
	let impulsePrevY = 0.5;
	let impulseAmp = 0.0;

	// Sim dimensions in texels, for placing a line source against the pool's
	// edges. Texel space is square on screen, so these are also the pool's
	// on-screen proportions.
	let simDims = [SIM_MAX_WIDTH, SIM_MAX_WIDTH];

	// Simulated seconds, advanced once per drawn frame. Everything time-driven
	// reads this rather than wall clock, because the sim itself advances per
	// frame — see wave-schedule.ts for why the two coming apart is what makes a
	// backgrounded tab come back chaotic.
	const simClock = createSimClock();

	let lastScrollY = 0;
	let lastScrollDelta = 0;
	let lastSwellTime = -Infinity;
	// Which SWELL_PERIOD_S bucket last fired an ambient swell. The schedule is
	// derived from the clock rather than from Math.random() so that two harness
	// panes, which share a clock origin, fire identically — the idle drips had
	// to be suppressed under the harness for exactly the lack of this, since
	// random draws get consumed in interleaved draw order and the panes diverge
	// for reasons unrelated to the parameters being compared.
	let lastSwellBucket = -1;
	// Same scheme, own schedule, for the ambient drips.
	let lastDripBucket = -1;
	// Radius the sim should use for whatever is in the impulse channel this
	// frame: the pointer dent and an ambient drip want different sizes.
	let impulseRadius = SIM_IMPULSE_RADIUS;

	let lastInteractionTime = 0;
	let nextDripTime = 0;
	// Last harness impulse this instance applied, so a shared bus fires each
	// event once here rather than every frame until the next one.
	let lastImpulseSeq = -1;

	function createSimBuffers() {
		if (simRead) simRead.remove();
		if (simWrite) simWrite.remove();

		const simWidth = Math.min(
			SIM_MAX_WIDTH,
			Math.max(SIM_MIN_WIDTH, Math.round(p.width / SIM_TEXEL_CSS_PX))
		);
		// derive height from the clamped width so texels stay square on
		// screen even when the width clamp changes the effective texel size
		const simHeight = Math.max(32, Math.round((simWidth * p.height) / p.width));
		const options = {
			width: simWidth,
			height: simHeight,
			format: "float",
			depth: false,
			antialias: false,
			density: 1,
			// The display shader reconstructs a smooth second derivative of this
			// texture for the caustic lens, which needs interpolated samples —
			// with NEAREST the Hessian collapses to zero inside a texel and a
			// spike on each boundary, and the caustics break into 3-CSS-px
			// blocks. Requires OES_texture_float_linear; see simLinearFiltering.
			textureFiltering: (p as any).LINEAR,
		};
		simRead = (p as any).createFramebuffer(options);
		simWrite = (p as any).createFramebuffer(options);
		simTexel = [1 / simWidth, 1 / simHeight];
		simDims = [simWidth, simHeight];

		// Linear filtering of FLOAT textures is a separate extension from float
		// textures themselves, and it is missing on some mobile GPUs. Ask the
		// real context rather than assuming the option above took effect.
		const gl = (p as any)._renderer?.GL as WebGLRenderingContext | undefined;
		simLens = gl && (gl.getExtension("OES_texture_float_linear") ||
			gl.getExtension("EXT_color_buffer_float")) ? 1.0 : 0.0;

		// One uv unit spans u_resolution.y device px, so a wave of magnitude k
		// has wavelength TAU * height / k. Fade a band out below AA_CUTOFF_PX
		// device px. At the header's real size nothing fades; this is insurance
		// for a very short canvas.
		const AA_CUTOFF_PX = 8.0;
		const heightPx = p.height * p.pixelDensity();
		const fade = (k: number) => {
			const lambdaPx = (Math.PI * 2 * heightPx) / k;
			const t = Math.min(Math.max((lambdaPx - AA_CUTOFF_PX) / AA_CUTOFF_PX, 0), 1);
			return t * t * (3 - 2 * t); // smoothstep
		};
		bandFade = [fade(17.0), fade(42.9)]; // peak |k| of wave groups B and C
	}

	function canvasWidth() {
		return opts.getWidth ? opts.getWidth() : p.windowWidth;
	}

	// Seconds since the shared clock origin. Falls back to p5's per-instance
	// millis() in production, where there is only one instance to be in phase
	// with.
	function nowSeconds() {
		return opts.t0 !== undefined
			? (performance.now() - opts.t0) / 1000
			: p.millis() / 1000;
	}

	// p5 listens for mouse events window-wide, so ignore anything outside
	// the canvas; otherwise a pointer near the header still stirs the water
	function pointerInCanvas() {
		return (
			p.mouseX >= 0 && p.mouseX <= p.width &&
			p.mouseY >= 0 && p.mouseY <= p.height
		);
	}

	function handlePointerMove() {
		if (!pointerInCanvas()) return;

		const speedPx = Math.hypot(p.mouseX - p.pmouseX, p.mouseY - p.pmouseY);

		impulseX = p.mouseX / p.width;
		impulseY = 1.0 - p.mouseY / p.height;
		const jp = opts.getJsParams
			? { ...JS_PARAM_DEFAULTS, ...opts.getJsParams() }
			: JS_PARAM_DEFAULTS;
		impulseAmp = Math.min(jp.IMPULSE_MAX, jp.IMPULSE_BASE + speedPx * jp.IMPULSE_PER_PX);

		// sweep the dent from last frame's position, unless the pointer
		// just entered the canvas (a segment from outside would streak)
		const prevInCanvas =
			p.pmouseX >= 0 && p.pmouseX <= p.width &&
			p.pmouseY >= 0 && p.pmouseY <= p.height;
		impulsePrevX = prevInCanvas ? p.pmouseX / p.width : impulseX;
		impulsePrevY = prevInCanvas ? 1.0 - p.pmouseY / p.height : impulseY;
		lastInteractionTime = simClock.simTime * 1000;
	}

	p.setup = () => {
		p.pixelDensity(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_DENSITY));
		const w = canvasWidth();
		const canvas = p.createCanvas(w, headerHeightPx(w), p.WEBGL);
		// Stack the canvas over the SSR tile placeholder, and fade it in on the
		// first drawn frame so it doesn't pop over the static placeholder.
		canvasEl = (canvas as any).elt as HTMLElement;
		canvasEl.style.position = "absolute";
		canvasEl.style.top = "0";
		canvasEl.style.left = "0";
		canvasEl.style.zIndex = "1";
		canvasEl.style.opacity = "0";
		canvasEl.style.transition = "opacity 300ms ease";
		displayShader = p.createShader(vertShader, opts.displaySrc ?? displayFragShader);
		simShader = p.createShader(vertShader, opts.simSrc ?? simFragShader);
		createSimBuffers();
		lastScrollY = window.scrollY;

		p.mouseMoved = p.mouseDragged = handlePointerMove;

		p.mouseClicked = () => {
			if (!pointerInCanvas()) return;

			impulseX = p.mouseX / p.width;
			impulseY = 1.0 - p.mouseY / p.height;
			impulsePrevX = impulseX; // point dent, no sweep
			impulsePrevY = impulseY;
			impulseAmp = (opts.getJsParams?.().CLICK_AMP) ?? CLICK_AMP;
			lastInteractionTime = simClock.simTime * 1000;
		};

		//@ts-ignore
		p.touchMoved = () => {
			handlePointerMove();
			return false;
		};
	};

	p.draw = () => {
		const d = p.pixelDensity();
		// One frame of simulated time. `stalled` means the gap since the last
		// frame was too long to be one — the tab was backgrounded, or the device
		// could not keep up — so anything measured as a per-frame difference
		// against the outside world is stale rather than a real change.
		const { simTime: time, stalled } = advanceSimClock(simClock, nowSeconds());
		// JS-side tunables. Production passes nothing and gets the constants.
		const js: JsParams = opts.getJsParams
			? { ...JS_PARAM_DEFAULTS, ...opts.getJsParams() }
			: JS_PARAM_DEFAULTS;

		p.noStroke();

		// The harness feeds both instances the same impulse; without this each
		// pane would only respond to a pointer physically over it. Each new
		// event is applied exactly once per instance — see InputBus.impulse.
		if (opts.input) {
			const i = opts.input.impulse;
			if (i.seq !== lastImpulseSeq) {
				lastImpulseSeq = i.seq;
				impulseX = i.x;
				impulseY = i.y;
				impulsePrevX = i.prevX;
				impulsePrevY = i.prevY;
				impulseAmp = i.amp;
			}
		}

		// --- scroll swell: how much did the scroll speed change? ---
		// Accelerating downward shoves the pool up, piling water against the
		// bottom edge; decelerating (or accelerating upward) piles it
		// against the top.
		//
		// Re-baselined after a stall rather than differenced: the page can be
		// scrolled while the tab is in the background, and the whole distance
		// would otherwise arrive as one frame's worth of acceleration and fire a
		// capped swell the moment you come back.
		const scrollY = opts.input ? opts.input.scrollY : window.scrollY;
		const scrollDelta = stalled ? 0 : scrollY - lastScrollY;
		const scrollJerk = stalled ? 0 : scrollDelta - lastScrollDelta;
		lastScrollY = scrollY;
		lastScrollDelta = scrollDelta;
		// The line source fires at most once per frame. Both the scroll swell and
		// the timed ambient swell drive it, scroll winning: a swell the user
		// caused should never be dropped in favour of one on a timer.
		let lineAmp = 0.0;
		let lineDir = [0, 1]; // unit normal, texel space, pointing where it travels
		// 0 = tangent to the pool on the upwind side, 1 = all the way across
		let lineInset = 0.0;
		const nowMs = time * 1000;
		if (scrollJerk !== 0 && nowMs - lastSwellTime > SCROLL_COOLDOWN_MS) {
			lineAmp = Math.min(js.SCROLL_AMP_MAX, Math.abs(scrollJerk) * SCROLL_AMP_PER_PX);
			// accelerating downward shoves the pool up, piling water against the
			// bottom edge, and the front then travels upward; decelerating (or
			// accelerating upward) piles it against the top
			lineDir = scrollJerk > 0 ? [0, 1] : [0, -1];
			lastSwellTime = nowMs;
			lastInteractionTime = nowMs;
		} else if (js.SWELL_AMP > 0 && js.SWELL_PERIOD_S > 0) {
			// One swell per SWELL_PERIOD_S window, at a hashed moment inside it —
			// so the spacing varies but the long-run rate does not.
			const bucket = dueBucket(time, js.SWELL_PERIOD_S, lastSwellBucket);
			if (bucket !== null) {
				lastSwellBucket = bucket;
				lineAmp = js.SWELL_AMP * (0.7 + 0.6 * hash01(bucket + 17));
				// Heading: leftward or rightward, tilted up to SWELL_SPREAD_DEG off
				// the long axis. At 90 the two halves meet and every heading is
				// equally likely; below that fronts favour the axis with the most
				// room to travel.
				const side = hash01(bucket + 31) < 0.5 ? -1 : 1;
				const spread = (js.SWELL_SPREAD_DEG * Math.PI) / 180;
				const theta = (hash01(bucket + 53) * 2 - 1) * spread;
				lineDir = [side * Math.cos(theta), Math.sin(theta)];
				lineInset = hash01(bucket + 71) * js.SWELL_INSET;
			}
		}

		// Place the front along its own normal. For a box, the support distance in
		// direction d is |d.x|*W/2 + |d.y|*H/2, so -support is tangent to the
		// pool on the upwind side and +support is tangent on the far side.
		// Getting this from the box rather than assuming an edge is what lets the
		// heading be arbitrary without the band landing half outside the pool and
		// injecting nothing. lineInset slides it in from there, which is also
		// what turns a one-way front into a symmetric pair (a line injected at
		// rest radiates both ways; it just has nowhere to go when it starts on
		// the wall).
		const lineSupport =
			Math.abs(lineDir[0]) * simDims[0] * 0.5 +
			Math.abs(lineDir[1]) * simDims[1] * 0.5;
		const lineOffset = lineSupport * (2.0 * lineInset - 1.0);

		// --- ambient drips: expanding rings that reflect and interfere ---
		// The point-source half of the ambient field. Hashed from the clock, so
		// both harness panes drip identically — see lastSwellBucket.
		impulseRadius = js.SIM_IMPULSE_RADIUS;
		if (js.DRIP_AMBIENT_AMP > 0 && js.DRIP_PERIOD_S > 0) {
			// salted so drips and swells do not pick the same moment in a window
			const bucket = dueBucket(time, js.DRIP_PERIOD_S, lastDripBucket, 101);
			if (bucket !== null) {
				lastDripBucket = bucket;
				// Skipped rather than queued when the pointer already owns the
				// impulse channel this frame — one lost drip while the user is
				// actively stirring the water is not a drip anyone wanted.
				if (impulseAmp === 0.0) {
					// Deliberately allowed near the walls, unlike the idle drips: a
					// ring breaking against a nearby edge and folding back over
					// itself is most of what makes the reflections read.
					impulseX = 0.04 + hash01(bucket + 211) * 0.92;
					impulseY = 0.04 + hash01(bucket + 307) * 0.92;
					impulsePrevX = impulseX; // point dent, no sweep
					impulsePrevY = impulseY;
					impulseAmp = js.DRIP_AMBIENT_AMP * (0.7 + 0.6 * hash01(bucket + 401));
					impulseRadius = js.DRIP_RADIUS;
				}
			}
		}

		// --- idle drips: an occasional drop lands while nobody's touching ---
		// Suppressed under the harness: Math.random() is consumed in interleaved
		// draw order, so two instances would drip at different times and places
		// and the panes would diverge for reasons unrelated to the parameters.
		// Also suppressed once ambient drips are running, which supersede them:
		// the idle drip's whole purpose is that an untouched page is not dead
		// water, and ambient drips already guarantee that.
		const now = nowMs;
		if (!opts.input && js.DRIP_AMBIENT_AMP === 0 &&
			now - lastInteractionTime > DRIP_IDLE_DELAY_MS && now >= nextDripTime) {
			impulseX = 0.1 + Math.random() * 0.8; // keep away from the walls
			impulseY = 0.1 + Math.random() * 0.8;
			impulsePrevX = impulseX; // point dent, no sweep
			impulsePrevY = impulseY;
			impulseAmp = DRIP_AMP * (0.7 + Math.random() * 0.6);
			nextDripTime = now + DRIP_MIN_GAP_MS + Math.random() * (DRIP_MAX_GAP_MS - DRIP_MIN_GAP_MS);
		}

		// Live tunables, present only under the harness (where the shader's
		// `const float`s have been rewritten into uniforms). Setting a uniform
		// that does not exist is a no-op in p5, so the same loop safely feeds
		// both shaders every name.
		const tunables = opts.getUniforms ? opts.getUniforms() : null;

		// --- advance the wave simulation (ping-pong) ---
		for (let step = 0; step < js.SIM_SUBSTEPS; step++) {
			simWrite.begin();
			p.shader(simShader);
			if (tunables) {
				for (const k in tunables) simShader.setUniform(k, tunables[k]);
			}
			simShader.setUniform("u_state", simRead);
			simShader.setUniform("u_texel", simTexel);
			simShader.setUniform("u_impulsePos", [impulseX, impulseY]);
			simShader.setUniform("u_impulsePrev", [impulsePrevX, impulsePrevY]);
			simShader.setUniform("u_impulseAmp", step === 0 ? impulseAmp : 0.0);
			simShader.setUniform("u_impulseRadius", impulseRadius);
			simShader.setUniform("u_lineAmp", step === 0 ? lineAmp : 0.0);
			simShader.setUniform("u_lineDir", lineDir);
			simShader.setUniform("u_lineOffset", lineOffset);
			simShader.setUniform("u_lineRadius", js.SWELL_RADIUS);
			simShader.setUniform("u_time", time);
			p.quad(-1, -1, 1, -1, 1, 1, -1, 1);
			simWrite.end();
			[simRead, simWrite] = [simWrite, simRead];
		}
		impulseAmp = 0.0;

		// --- render the pool ---
		p.shader(displayShader);
		if (tunables) {
			for (const k in tunables) displayShader.setUniform(k, tunables[k]);
		}
		displayShader.setUniform("u_resolution", [p.width * d, p.height * d]);
		displayShader.setUniform("u_time", time);
		displayShader.setUniform("u_water", simRead);
		displayShader.setUniform("u_waterTexel", simTexel);
		displayShader.setUniform("u_bandFade", bandFade);
		displayShader.setUniform("u_simLens", simLens);
		// integer-CSS-px tile edge, in device px; the CSS placeholder computes
		// the identical value as min(22px, round(down, 100vw / 33, 1px))
		displayShader.setUniform("u_tilePx", tileCssPx(p.width) * d);
		p.quad(-1, -1, 1, -1, 1, 1, -1, 1);

		if (firstFrame) {
			firstFrame = false;
			canvasEl.style.opacity = "1";
		}
	};

	p.windowResized = () => {
		// iOS fires window resizes as the browser chrome collapses and
		// expands during scrolling; recreating the sim then would blank
		// the water mid-slosh. Only a width change matters to a
		// fixed-height canvas.
		const w = canvasWidth();
		if (w === p.width) return;

		p.resizeCanvas(w, headerHeightPx(w));
		createSimBuffers(); // aspect changed, keep sim texels square on screen
	};

	// The harness resizes panes without a window resize (splitter drags, layout
	// toggles), which p5's windowResized never sees.
	(p as any).__resize = () => p.windowResized!();
}

export { renderSFPools };

export default function HeaderAnimation()
{
	// 1. Type the Ref as an HTMLDivElement
	const renderRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let myP5: p5 | undefined;
		// The p5 import is awaited, so cleanup can run while it is still pending
		// — React StrictMode's dev double-invoke does exactly that. Without this
		// flag the instance created after cleanup is never removed, leaking a
		// canvas, a WebGL context, a RAF loop and two float framebuffers per
		// mount; Chrome drops the oldest context after ~16.
		let cancelled = false;

		(async () => {
			try {
				// Dynamically load p5 here, ensuring it ONLY happens in the browser
				const p5Import = await import("p5");
				const P5 = p5Import.default;

				if (cancelled || !renderRef.current) return;
				myP5 = new P5(renderSFPools, renderRef.current);
			} catch (error) {
				console.error("Error loading p5:", error);
			}
		})();

		return () => {
			cancelled = true;
			if (myP5) {
				myP5.remove();
			}
		};
	}, []);

	// TODO: update the rendering code to take in props for the height and width
	return (
		<div
			ref={renderRef}
			className="absolute left-0 top-0 w-full overflow-hidden"
			style={{ height: HEADER_HEIGHT }}
		>
			<HeaderPlaceholder />
		</div>
	);
}
