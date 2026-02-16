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
const RIPPLE_INTERVAL = 0.12; // seconds between spawning ripples while moving

function renderSFPools(
	p: p5)
{
	let myShader: p5.Shader;
	let pointerX = 0.5;
	let pointerY = 0.5;
	let lastX = pointerX;
	let lastY = pointerY;
	let pointerStrength = 0.0;

	// ring buffer for expanding ripples: flattened [x0,y0,t0, x1,y1,t1, ...]
	const ripples = new Float32Array(MAX_RIPPLES * 3);
	for (let i = 0; i < MAX_RIPPLES; i++) {
		ripples[i * 3 + 2] = -10; // birth time -10 means inactive
	}
	let rippleIndex = 0;
	let lastRippleTime = 0;

	function spawnRipple(x: number, y: number, time: number) {
		const base = rippleIndex * 3;
		ripples[base] = x;
		ripples[base + 1] = y;
		ripples[base + 2] = time;
		rippleIndex = (rippleIndex + 1) % MAX_RIPPLES;
		lastRippleTime = time;
	}

	p.setup = () => {
		p.createCanvas(p.windowWidth, 200, p.WEBGL);
		myShader = p.createShader(vertShader, fragShader);

		p.mouseMoved = p.mouseDragged = () => {
			const x = p.mouseX / p.width;
			const y = 1.0 - p.mouseY / p.height;
			const time = p.millis() / 1000.0;

			const dx = x - lastX;
			const dy = y - lastY;
			const speed = Math.sqrt(dx * dx + dy * dy);

			pointerStrength = Math.min(1.0, speed * 20.0);

			// spawn ripple if moving fast enough and enough time has passed
			if (speed > 0.005 && time - lastRippleTime > RIPPLE_INTERVAL) {
				spawnRipple(x, y, time);
			}

			lastX = pointerX = x;
			lastY = pointerY = y;
		};

		p.mousePressed = () => {
			const x = p.mouseX / p.width;
			const y = 1.0 - p.mouseY / p.height;
			const time = p.millis() / 1000.0;

			pointerX = x;
			pointerY = y;
			pointerStrength = 1.0;

			// always spawn ripple on click
			spawnRipple(x, y, time);
		};

		//@ts-ignore
		p.touchMoved = () => {
			const x = p.mouseX / p.width;
			const y = 1.0 - p.mouseY / p.height;
			const time = p.millis() / 1000.0;

			const dx = x - lastX;
			const dy = y - lastY;
			const speed = Math.sqrt(dx * dx + dy * dy);

			pointerStrength = Math.min(1.0, speed * 20.0);

			if (speed > 0.005 && time - lastRippleTime > RIPPLE_INTERVAL) {
				spawnRipple(x, y, time);
			}

			lastX = pointerX = x;
			lastY = pointerY = y;
			return false;
		};
	};

	p.draw = () => {
		const d = p.pixelDensity();
		const time = p.millis() / 1000.0;

		p.shader(myShader);
		p.noStroke();
		pointerStrength *= 0.98;

		if (pointerStrength < 0.0001) pointerStrength = 0.0;

		myShader.setUniform("u_resolution", [p.width * d, p.height * d]);
		myShader.setUniform("u_time", time);
		myShader.setUniform("u_pointer", [pointerX, pointerY]);
		myShader.setUniform("u_pointerStrength", pointerStrength);

		// pass ripple uniforms as flattened array
		myShader.setUniform("u_ripples", Array.from(ripples));

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
