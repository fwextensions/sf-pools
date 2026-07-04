"use client";

import React, { useEffect, useRef } from "react";
import type p5 from "p5";
import fragShader from "./header-shader.frag";

const vertShader = `
	attribute vec3 aPosition;
	void main() {
		gl_Position = vec4(aPosition, 1.0);
	}
`;

const MAX_RIPPLES = 8;
const RIPPLE_LIFETIME = 2.5; // must match EXPANDING_RIPPLE_LIFETIME in the shader
const RIPPLE_SPACING_PX = 40; // spawn a ripple every N pixels of pointer travel
const MAX_PIXEL_DENSITY = 1.5; // retina resolution is invisible on blurry water

function renderSFPools(
	p: p5)
{
	let myShader: p5.Shader;

	// ripple slots, flattened [x0,y0,t0, x1,y1,t1, ...]
	// (plain array so it can be handed to setUniform without copying)
	const ripples: number[] = [];
	for (let i = 0; i < MAX_RIPPLES; i++) {
		ripples.push(0, 0, -10); // birth time -10 means inactive
	}
	let lastRippleX = 0.5;
	let lastRippleY = 0.5;
	let lastRippleTime = -10;

	// claims the first expired slot; if every slot is still animating, the
	// ripple is skipped — better to spawn fewer than cut a live one short
	function spawnRipple(x: number, y: number, time: number) {
		for (let i = 0; i < MAX_RIPPLES; i++) {
			if (time - ripples[i * 3 + 2] > RIPPLE_LIFETIME) {
				ripples[i * 3] = x;
				ripples[i * 3 + 1] = y;
				ripples[i * 3 + 2] = time;
				lastRippleX = x;
				lastRippleY = y;
				lastRippleTime = time;
				return;
			}
		}
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

		const x = p.mouseX / p.width;
		const y = 1.0 - p.mouseY / p.height;
		const time = p.millis() / 1000.0;

		// spawn by distance traveled, so fast swipes leave an even trail
		const travelX = (x - lastRippleX) * p.width;
		const travelY = (y - lastRippleY) * p.height;
		if (travelX * travelX + travelY * travelY > RIPPLE_SPACING_PX * RIPPLE_SPACING_PX) {
			spawnRipple(x, y, time);
		}
	}

	p.setup = () => {
		p.pixelDensity(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_DENSITY));
		p.createCanvas(p.windowWidth, 200, p.WEBGL);
		myShader = p.createShader(vertShader, fragShader);

		p.mouseMoved = p.mouseDragged = handlePointerMove;

		p.mouseClicked = () => {
			if (!pointerInCanvas()) return;

			const x = p.mouseX / p.width;
			const y = 1.0 - p.mouseY / p.height;
			const time = p.millis() / 1000.0;

			// always spawn ripple on click
			spawnRipple(x, y, time);
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

		p.shader(myShader);
		p.noStroke();

		myShader.setUniform("u_resolution", [p.width * d, p.height * d]);
		myShader.setUniform("u_time", time);

		// once every ripple has expired, the shader skips the whole loop
		const anyAlive = time - lastRippleTime < RIPPLE_LIFETIME;
		myShader.setUniform("u_rippleCount", anyAlive ? MAX_RIPPLES : 0);
		myShader.setUniform("u_ripples", ripples);

		p.quad(-1, -1, 1, -1, 1, 1, -1, 1);
	};

	p.windowResized = () => {
		p.resizeCanvas(p.windowWidth, 200);
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
