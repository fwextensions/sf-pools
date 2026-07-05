"use client";

import React, { useEffect, useRef } from "react";
import type p5 from "p5";
import displayFragShader from "./header-shader.frag";
import simFragShader from "./water-sim.frag";

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
const SIM_SUBSTEPS = 2; // wave-equation steps per frame; more = faster waves
const SIM_IMPULSE_RADIUS = 3.0; // pointer dent radius, in sim texels
const MAX_PIXEL_DENSITY = 1.5; // retina resolution is invisible on blurry water

// Scroll-driven swell: inertia responds to acceleration, not velocity, so
// the water sloshes when scrolling starts, stops, or jerks — a steady
// scroll glides without pumping energy in every frame (a full-width line
// source held for even a second visibly overdrives the pool).
const SCROLL_WAVE_RADIUS = 2.5; // swell band half-width, in sim texels
const SCROLL_AMP_PER_PX = 0.006; // swell height per px/frame of speed change
const SCROLL_AMP_MAX = 0.4;
// Minimum time between swell injections. Scrubbing the scroll thumb up and
// down flips the jerk sign every frame, and a full-width line source fired
// at 60Hz pumps the pool into chaos; a cooldown turns that into a few
// discrete sloshes per second, which the damping can absorb.
const SCROLL_COOLDOWN_MS = 180;

// Idle drips: when nobody has touched or scrolled for a while, a drop
// falls somewhere random — much gentler than a real click (amp 1.2).
const DRIP_IDLE_DELAY_MS = 6000; // stillness required before dripping starts
const DRIP_MIN_GAP_MS = 5000; // random spacing between drips
const DRIP_MAX_GAP_MS = 9000;
const DRIP_AMP = 0.35;

function renderSFPools(
	p: p5)
{
	let displayShader: p5.Shader;
	let simShader: p5.Shader;
	// p5.Framebuffer isn't in the (1.x) type definitions yet
	let simRead: any;
	let simWrite: any;
	let simTexel = [1 / SIM_MAX_WIDTH, 1 / SIM_MAX_WIDTH];

	// pointer impulse pending for the next sim step (consumed each frame);
	// the prev position sweeps the dent along the swipe segment
	let impulseX = 0.5;
	let impulseY = 0.5;
	let impulsePrevX = 0.5;
	let impulsePrevY = 0.5;
	let impulseAmp = 0.0;

	let lastScrollY = 0;
	let lastScrollDelta = 0;
	let lastSwellTime = -Infinity;

	let lastInteractionTime = 0;
	let nextDripTime = 0;

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
		};
		simRead = (p as any).createFramebuffer(options);
		simWrite = (p as any).createFramebuffer(options);
		simTexel = [1 / simWidth, 1 / simHeight];
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
		impulseAmp = Math.min(1.0, 0.15 + speedPx * 0.01);

		// sweep the dent from last frame's position, unless the pointer
		// just entered the canvas (a segment from outside would streak)
		const prevInCanvas =
			p.pmouseX >= 0 && p.pmouseX <= p.width &&
			p.pmouseY >= 0 && p.pmouseY <= p.height;
		impulsePrevX = prevInCanvas ? p.pmouseX / p.width : impulseX;
		impulsePrevY = prevInCanvas ? 1.0 - p.pmouseY / p.height : impulseY;
		lastInteractionTime = p.millis();
	}

	p.setup = () => {
		p.pixelDensity(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_DENSITY));
		p.createCanvas(p.windowWidth, 200, p.WEBGL);
		displayShader = p.createShader(vertShader, displayFragShader);
		simShader = p.createShader(vertShader, simFragShader);
		createSimBuffers();
		lastScrollY = window.scrollY;

		p.mouseMoved = p.mouseDragged = handlePointerMove;

		p.mouseClicked = () => {
			if (!pointerInCanvas()) return;

			impulseX = p.mouseX / p.width;
			impulseY = 1.0 - p.mouseY / p.height;
			impulsePrevX = impulseX; // point dent, no sweep
			impulsePrevY = impulseY;
			impulseAmp = 1.2; // clicks splash harder than moves
			lastInteractionTime = p.millis();
		};

		//@ts-ignore
		p.touchMoved = () => {
			handlePointerMove();
			return false;
		};
	};

	p.draw = () => {
		const d = p.pixelDensity();
		const time = p.millis() / 1000.0;

		p.noStroke();

		// --- scroll swell: how much did the scroll speed change? ---
		// Accelerating downward shoves the pool up, piling water against the
		// bottom edge; decelerating (or accelerating upward) piles it
		// against the top.
		const scrollDelta = window.scrollY - lastScrollY;
		const scrollJerk = scrollDelta - lastScrollDelta;
		lastScrollY = window.scrollY;
		lastScrollDelta = scrollDelta;
		let scrollAmp = 0.0;
		let scrollEdge = 0.0; // sim UV y: 0 = bottom edge, 1 = top edge
		if (scrollJerk !== 0 && p.millis() - lastSwellTime > SCROLL_COOLDOWN_MS) {
			scrollAmp = Math.min(SCROLL_AMP_MAX, Math.abs(scrollJerk) * SCROLL_AMP_PER_PX);
			scrollEdge = scrollJerk > 0 ? 0.0 : 1.0;
			lastSwellTime = p.millis();
			lastInteractionTime = p.millis();
		}

		// --- idle drips: an occasional drop lands while nobody's touching ---
		const now = p.millis();
		if (now - lastInteractionTime > DRIP_IDLE_DELAY_MS && now >= nextDripTime) {
			impulseX = 0.1 + Math.random() * 0.8; // keep away from the walls
			impulseY = 0.1 + Math.random() * 0.8;
			impulsePrevX = impulseX; // point dent, no sweep
			impulsePrevY = impulseY;
			impulseAmp = DRIP_AMP * (0.7 + Math.random() * 0.6);
			nextDripTime = now + DRIP_MIN_GAP_MS + Math.random() * (DRIP_MAX_GAP_MS - DRIP_MIN_GAP_MS);
		}

		// --- advance the wave simulation (ping-pong) ---
		for (let step = 0; step < SIM_SUBSTEPS; step++) {
			simWrite.begin();
			p.shader(simShader);
			simShader.setUniform("u_state", simRead);
			simShader.setUniform("u_texel", simTexel);
			simShader.setUniform("u_impulsePos", [impulseX, impulseY]);
			simShader.setUniform("u_impulsePrev", [impulsePrevX, impulsePrevY]);
			simShader.setUniform("u_impulseAmp", step === 0 ? impulseAmp : 0.0);
			simShader.setUniform("u_impulseRadius", SIM_IMPULSE_RADIUS);
			simShader.setUniform("u_scrollAmp", step === 0 ? scrollAmp : 0.0);
			simShader.setUniform("u_scrollEdge", scrollEdge);
			simShader.setUniform("u_scrollRadius", SCROLL_WAVE_RADIUS);
			simShader.setUniform("u_time", time);
			p.quad(-1, -1, 1, -1, 1, 1, -1, 1);
			simWrite.end();
			[simRead, simWrite] = [simWrite, simRead];
		}
		impulseAmp = 0.0;

		// --- render the pool ---
		p.shader(displayShader);
		displayShader.setUniform("u_resolution", [p.width * d, p.height * d]);
		displayShader.setUniform("u_time", time);
		displayShader.setUniform("u_water", simRead);
		displayShader.setUniform("u_waterTexel", simTexel);
		p.quad(-1, -1, 1, -1, 1, 1, -1, 1);
	};

	p.windowResized = () => {
		// iOS fires window resizes as the browser chrome collapses and
		// expands during scrolling; recreating the sim then would blank
		// the water mid-slosh. Only a width change matters to a
		// fixed-height canvas.
		if (p.windowWidth === p.width) return;

		p.resizeCanvas(p.windowWidth, 200);
		createSimBuffers(); // aspect changed, keep sim texels square on screen
	};
}

export default function SFPoolsAnimation()
{
	// 1. Type the Ref as an HTMLDivElement
	const renderRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let myP5: p5;

		(async () => {
			try {
				// Dynamically load p5 here, ensuring it ONLY happens in the browser
				const p5Import = await import("p5");
				const P5 = p5Import.default;

				if (renderRef.current) {
					myP5 = new P5(renderSFPools, renderRef.current);
				}
			} catch (error) {
				console.error("Error loading p5:", error);
			}
		})();

		return () => {
			if (myP5) {
				myP5.remove();
			}
		};
	}, []);

	// TODO: update the rendering code to take in props for the height and width
	return (
		<div ref={renderRef} className="absolute left-0 top-0 h-[200px] w-full" />
	);
}
