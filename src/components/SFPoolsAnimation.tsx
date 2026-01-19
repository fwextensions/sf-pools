"use client";

import React, { useEffect, useRef } from "react";
import type p5 from "p5";

const vertShader = `
	attribute vec3 aPosition;
	void main() {
		gl_Position = vec4(aPosition, 1.0);
	}
`;

const fragShader = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_pointer;
uniform float u_pointerStrength;

// ring buffer of ripples: flattened [x0,y0,t0, x1,y1,t1, ...]
#define MAX_RIPPLES 8
uniform float u_ripples[MAX_RIPPLES * 3];

#define TAU 6.28318530718
#define MAX_ITER 5

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
	charX += spacer + 2.0;
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

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

/* --- CAUSTICS ---
   Scale UVs so one caustic cell spans ~the longest canvas dimension.
   This removes visible tiling regardless of aspect ratio.
*/
float calculateCaustics(vec2 uv, float time) {
	vec2 causticUV = uv;
	float coverage = max(u_resolution.x, u_resolution.y) / min(u_resolution.x, u_resolution.y);

	causticUV *= 1.0 / coverage;
	

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

float waveHeight(vec2 p, float t) {
	float h = 0.0;
	h += sin(p.x * 4.0 + t * 1.1) * 0.5;
	h += sin(p.y * 6.0 - t * 1.3) * 0.35;
	h += sin((p.x + p.y) * 5.0 + t * 0.9) * 0.25;
	return h;
}

float ambientWaves(vec2 p, float t) {
	float h = 0.0;
	h += sin(p.x * 3.5 + t * 0.9) * 0.4;
	h += sin(p.y * 5.0 - t * 1.1) * 0.3;
	h += sin((p.x + p.y) * 4.0 + t * 0.7) * 0.25;
	h += sin((p.x - p.y) * 6.0 - t * 0.8) * 0.15;
	return h;
}

float pointerRipple(vec2 uv, vec2 p, float t) {
	float d = distance(uv, p);
	float r = sin(d * 40.0 - t * 6.0);
	r *= exp(-d * 12.0);
	return r;
}

float expandingRippleSingle(vec2 uv, float rx, float ry, float rt, float time, float aspect) {
	if (rt < 0.0) return 0.0;
	
	float age = time - rt;
	if (age < 0.0 || age > 2.5) return 0.0;
	
	vec2 center = vec2(rx * aspect, ry);
	float d = distance(uv, center);
	
	float speed = 0.25;
	float waveRadius = age * speed;
	float ringDist = abs(d - waveRadius);
	
	float fade = exp(-age * 1.5);
	float ringWidth = 0.04 + age * 0.02;
	float ring = smoothstep(ringWidth, 0.0, ringDist);
	
	float wave = sin((d - waveRadius) * 50.0) * ring * fade;
	return wave;
}

float tiles(vec2 st, float gridScale) {
	st *= gridScale;
	vec2 g = fract(st);
	float t = 0.05;
	float b = 0.02;

	float x = smoothstep(t, t + b, g.x) * smoothstep(1.0 - t, 1.0 - t - b, g.x);
	float y = smoothstep(t, t + b, g.y) * smoothstep(1.0 - t, 1.0 - t - b, g.y);
	return x * y;
}

void main() {
	vec2 uv = gl_FragCoord.xy / u_resolution.xy;
	float aspect = u_resolution.x / u_resolution.y;
	uv.x *= aspect;

	float tSurface = u_time * 0.8;
	float tCaustic = u_time * 0.12;

	// ambient surface waves (always active)
	float h = ambientWaves(uv, tSurface) * 0.8;
	
	// pointer proximity ripple
	if (u_pointerStrength > 0.0) {
		h += pointerRipple(uv, vec2(u_pointer.x * aspect, u_pointer.y), tSurface) * u_pointerStrength * 0.5;
	}
	
	// expanding ripples from ring buffer (unrolled - GLSL ES doesn't allow computed array indices)
	h += expandingRippleSingle(uv, u_ripples[0], u_ripples[1], u_ripples[2], u_time, aspect) * 0.4;
	h += expandingRippleSingle(uv, u_ripples[3], u_ripples[4], u_ripples[5], u_time, aspect) * 0.4;
	h += expandingRippleSingle(uv, u_ripples[6], u_ripples[7], u_ripples[8], u_time, aspect) * 0.4;
	h += expandingRippleSingle(uv, u_ripples[9], u_ripples[10], u_ripples[11], u_time, aspect) * 0.4;
	h += expandingRippleSingle(uv, u_ripples[12], u_ripples[13], u_ripples[14], u_time, aspect) * 0.4;
	h += expandingRippleSingle(uv, u_ripples[15], u_ripples[16], u_ripples[17], u_time, aspect) * 0.4;
	h += expandingRippleSingle(uv, u_ripples[18], u_ripples[19], u_ripples[20], u_time, aspect) * 0.4;
	h += expandingRippleSingle(uv, u_ripples[21], u_ripples[22], u_ripples[23], u_time, aspect) * 0.4;

	// compute surface normal via finite differences on the full height field
	float eps = 0.004;
	vec2 pUV = vec2(u_pointer.x * aspect, u_pointer.y);
	
	// sample height at offset positions
	float hPosX = ambientWaves(uv + vec2(eps, 0.0), tSurface) * 0.8;
	float hNegX = ambientWaves(uv - vec2(eps, 0.0), tSurface) * 0.8;
	float hPosY = ambientWaves(uv + vec2(0.0, eps), tSurface) * 0.8;
	float hNegY = ambientWaves(uv - vec2(0.0, eps), tSurface) * 0.8;
	
	// add pointer ripple to samples
	if (u_pointerStrength > 0.0) {
		float pStr = u_pointerStrength * 0.5;
		hPosX += pointerRipple(uv + vec2(eps, 0.0), pUV, tSurface) * pStr;
		hNegX += pointerRipple(uv - vec2(eps, 0.0), pUV, tSurface) * pStr;
		hPosY += pointerRipple(uv + vec2(0.0, eps), pUV, tSurface) * pStr;
		hNegY += pointerRipple(uv - vec2(0.0, eps), pUV, tSurface) * pStr;
	}
	
	// add expanding ripples to samples (unrolled)
	hPosX += expandingRippleSingle(uv + vec2(eps, 0.0), u_ripples[0], u_ripples[1], u_ripples[2], u_time, aspect);
	hNegX += expandingRippleSingle(uv - vec2(eps, 0.0), u_ripples[0], u_ripples[1], u_ripples[2], u_time, aspect);
	hPosY += expandingRippleSingle(uv + vec2(0.0, eps), u_ripples[0], u_ripples[1], u_ripples[2], u_time, aspect);
	hNegY += expandingRippleSingle(uv - vec2(0.0, eps), u_ripples[0], u_ripples[1], u_ripples[2], u_time, aspect);
	
	hPosX += expandingRippleSingle(uv + vec2(eps, 0.0), u_ripples[3], u_ripples[4], u_ripples[5], u_time, aspect);
	hNegX += expandingRippleSingle(uv - vec2(eps, 0.0), u_ripples[3], u_ripples[4], u_ripples[5], u_time, aspect);
	hPosY += expandingRippleSingle(uv + vec2(0.0, eps), u_ripples[3], u_ripples[4], u_ripples[5], u_time, aspect);
	hNegY += expandingRippleSingle(uv - vec2(0.0, eps), u_ripples[3], u_ripples[4], u_ripples[5], u_time, aspect);
	
	hPosX += expandingRippleSingle(uv + vec2(eps, 0.0), u_ripples[6], u_ripples[7], u_ripples[8], u_time, aspect);
	hNegX += expandingRippleSingle(uv - vec2(eps, 0.0), u_ripples[6], u_ripples[7], u_ripples[8], u_time, aspect);
	hPosY += expandingRippleSingle(uv + vec2(0.0, eps), u_ripples[6], u_ripples[7], u_ripples[8], u_time, aspect);
	hNegY += expandingRippleSingle(uv - vec2(0.0, eps), u_ripples[6], u_ripples[7], u_ripples[8], u_time, aspect);
	
	hPosX += expandingRippleSingle(uv + vec2(eps, 0.0), u_ripples[9], u_ripples[10], u_ripples[11], u_time, aspect);
	hNegX += expandingRippleSingle(uv - vec2(eps, 0.0), u_ripples[9], u_ripples[10], u_ripples[11], u_time, aspect);
	hPosY += expandingRippleSingle(uv + vec2(0.0, eps), u_ripples[9], u_ripples[10], u_ripples[11], u_time, aspect);
	hNegY += expandingRippleSingle(uv - vec2(0.0, eps), u_ripples[9], u_ripples[10], u_ripples[11], u_time, aspect);
	
	hPosX += expandingRippleSingle(uv + vec2(eps, 0.0), u_ripples[12], u_ripples[13], u_ripples[14], u_time, aspect);
	hNegX += expandingRippleSingle(uv - vec2(eps, 0.0), u_ripples[12], u_ripples[13], u_ripples[14], u_time, aspect);
	hPosY += expandingRippleSingle(uv + vec2(0.0, eps), u_ripples[12], u_ripples[13], u_ripples[14], u_time, aspect);
	hNegY += expandingRippleSingle(uv - vec2(0.0, eps), u_ripples[12], u_ripples[13], u_ripples[14], u_time, aspect);
	
	hPosX += expandingRippleSingle(uv + vec2(eps, 0.0), u_ripples[15], u_ripples[16], u_ripples[17], u_time, aspect);
	hNegX += expandingRippleSingle(uv - vec2(eps, 0.0), u_ripples[15], u_ripples[16], u_ripples[17], u_time, aspect);
	hPosY += expandingRippleSingle(uv + vec2(0.0, eps), u_ripples[15], u_ripples[16], u_ripples[17], u_time, aspect);
	hNegY += expandingRippleSingle(uv - vec2(0.0, eps), u_ripples[15], u_ripples[16], u_ripples[17], u_time, aspect);
	
	hPosX += expandingRippleSingle(uv + vec2(eps, 0.0), u_ripples[18], u_ripples[19], u_ripples[20], u_time, aspect);
	hNegX += expandingRippleSingle(uv - vec2(eps, 0.0), u_ripples[18], u_ripples[19], u_ripples[20], u_time, aspect);
	hPosY += expandingRippleSingle(uv + vec2(0.0, eps), u_ripples[18], u_ripples[19], u_ripples[20], u_time, aspect);
	hNegY += expandingRippleSingle(uv - vec2(0.0, eps), u_ripples[18], u_ripples[19], u_ripples[20], u_time, aspect);
	
	hPosX += expandingRippleSingle(uv + vec2(eps, 0.0), u_ripples[21], u_ripples[22], u_ripples[23], u_time, aspect);
	hNegX += expandingRippleSingle(uv - vec2(eps, 0.0), u_ripples[21], u_ripples[22], u_ripples[23], u_time, aspect);
	hPosY += expandingRippleSingle(uv + vec2(0.0, eps), u_ripples[21], u_ripples[22], u_ripples[23], u_time, aspect);
	hNegY += expandingRippleSingle(uv - vec2(0.0, eps), u_ripples[21], u_ripples[22], u_ripples[23], u_time, aspect);
	
	vec2 surfaceNormal = vec2(hPosX - hNegX, hPosY - hNegY) * 0.5;

	// tile UV with stronger refraction from surface
	vec2 tileUV = uv + surfaceNormal * 0.035;
	tileUV.x += sin(uv.y * 6.0 + tCaustic * 10.0) * 0.005;
	tileUV.y += cos(uv.x * 3.0 + tCaustic * 11.0) * 0.005;

	// dual caustics: highlights and trailing shadows
	float causticHighlight = calculateCaustics(uv + surfaceNormal * 0.3, tCaustic);
	vec2 shadowUV = uv + vec2(0.02, 0.015);
	float causticShadow = calculateCaustics(shadowUV, tCaustic + 0.3);
	
	// lens distortion from caustics
	tileUV *= (1.0 - causticHighlight * 0.012);

	float preferredHeight = 9.0;
	float requiredWidth = 33.0;
	float tilesForWidth = requiredWidth / aspect;
	float tileCountV = max(preferredHeight, tilesForWidth);

	vec2 gridID = floor(tileUV * tileCountV);
	vec2 stableGrid = floor(uv * tileCountV);
	float colorVar = mix(0.96, 1.04, hash(stableGrid));

	float totalTilesH = tileCountV * aspect;
	float textWidth = 29.0;
	float textHeight = 5.0;
	float startX = floor((totalTilesH - textWidth) / 2.0);
	float startY = ceil((tileCountV - textHeight) / 2.0);
	float isText = getText(gridID - vec2(startX, startY));

	float tileMask = tiles(tileUV, tileCountV);

	vec3 grout = vec3(0.28, 0.48, 0.58);
	vec3 tileBase = vec3(0.459, 0.776, 0.894) * colorVar;
	vec3 textTile = vec3(0.89, 0.89, 1.0);

	vec3 baseColor = mix(tileBase, textTile, isText);
	vec3 color = mix(grout, baseColor, tileMask);

	// depth vignette
	float dist = length(uv - vec2(aspect * 0.5, 0.5));
	color *= 1.0 - smoothstep(1.2, 0.0, dist) * 0.15;

	// apply shadows (darken where caustic shadow is strong)
	vec3 shadowColor = vec3(0.2, 0.35, 0.45);
	color = mix(color, color * shadowColor, causticShadow * 0.25);

	// apply highlights
	color += vec3(0.85, 0.95, 0.98) * causticHighlight * 0.5;
	color = clamp(color, 0.0, 1.0);

	gl_FragColor = vec4(color, 1.0);
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
