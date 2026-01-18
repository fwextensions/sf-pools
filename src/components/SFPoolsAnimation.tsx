"use client";

import React, { useEffect, useRef } from "react";
import type p5 from "p5";

function renderSFPools(
	p: p5)
{
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
		
		#define TAU 6.28318530718
		#define MAX_ITER 5
		
		// --- BITMAP FONT LOGIC ---
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
	
		// --- NOISE FUNCTION FOR PER-TILE VARIATION ---
		float hash(vec2 p) {
			return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
		}
	
		// --- CAUSTIC CALCULATION ---
		float calculateCaustics(vec2 uv, float time, float timeScale, float intensityMod) {
			float causticScale = 0.15; 
			vec2 causticUV = uv * causticScale;
			vec2 p = mod(causticUV * TAU, TAU) - 250.0;
			vec2 i = vec2(p);
			float c = 1.0;
			float inten = 0.005; 
	
			for (int n = 0; n < MAX_ITER; n++) {
				float t = time * timeScale * (1.0 - (3.5 / float(n + 1)));
				i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
				c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
			}
			
			c /= float(MAX_ITER);
			c = 1.17 - pow(c, 1.4);
			return pow(abs(c), 8.0) * intensityMod;
		}
	
		// --- TILE LOGIC ---
		float tiles(vec2 st, float gridScale) {
			st *= gridScale;
			vec2 grid = fract(st);
			float lineThickness = 0.05;
			float blur = 0.02; 
			
			float xLine = smoothstep(lineThickness, lineThickness + blur, grid.x) * 
										smoothstep(1.0 - lineThickness, 1.0 - lineThickness - blur, grid.x);
			float yLine = smoothstep(lineThickness, lineThickness + blur, grid.y) * 
										smoothstep(1.0 - lineThickness, 1.0 - lineThickness - blur, grid.y);
										
			return xLine * yLine;
		}
	
		void main() {
			vec2 uv = gl_FragCoord.xy / u_resolution.xy;
			float aspectRatio = u_resolution.x / u_resolution.y;
			uv.x *= aspectRatio;
			
			float time = u_time * 0.1; 
			
			// --- DUAL CAUSTICS (HIGHLIGHTS + SHADOWS) ---
			// Primary caustics (highlights)
			float causticIntensity = calculateCaustics(uv, time, 1.0, 1.0);
			
			// Secondary caustics (shadows) - offset in time and inverted
			float shadowOffset = 0.3; // Phase offset for trailing effect
			vec2 shadowUV = uv + vec2(0.02, 0.015); // Slight spatial offset
			float causticShadow = calculateCaustics(shadowUV, time + shadowOffset, 0.95, 0.6);
			
			// --- TILES & IMPROVED REFRACTION ---
			vec2 tileUV = uv;
			
			// Surface ripples
			tileUV.x += sin(uv.y * 6.0 + time * 1.2) * 0.005;
			tileUV.y += cos(uv.x * 3.0 + time * 1.3) * 0.005;
			
			// Caustic-based refraction (use caustics to distort themselves)
			float refractStrength = 0.018;
			vec2 refractOffset = vec2(
				sin(uv.y * 4.0 + time) * causticIntensity * refractStrength,
				cos(uv.x * 4.0 + time) * causticIntensity * refractStrength
			);
			tileUV += refractOffset;
			
			// Lens distortion
			float lensFactor = 0.01; 
			tileUV *= (1.0 - causticIntensity * lensFactor);
			
			// --- DYNAMIC TILE COUNT ---
			float preferredHeight = 9.0;
			float requiredWidth = 33.0;
			float tilesNeededForWidth = requiredWidth / aspectRatio;
			float tileCountV = max(preferredHeight, tilesNeededForWidth);
	
			// --- TEXT CENTERING ---
			vec2 gridID = floor(tileUV * tileCountV);
			
			// Per-tile color variation (using stable grid for consistency)
			vec2 stableGridID = floor(uv * tileCountV);
			float tileNoise = hash(stableGridID);
			float colorVariation = mix(0.96, 1.04, tileNoise);
			
			float totalTilesH = tileCountV * aspectRatio;
			float textWidth = 29.0;
			float textHeight = 5.0;
			float startX = floor((totalTilesH - textWidth) / 2.0);
			float startY = ceil((tileCountV - textHeight) / 2.0);
			float isText = getText(gridID - vec2(startX, startY));
			
			// --- RENDERING ---
			float tilePattern = tiles(tileUV, tileCountV); 
			
			vec3 groutColor = vec3(0.28, 0.48, 0.58);
			vec3 standardTileColor = vec3(0.459, 0.776, 0.894) * colorVariation; 
			vec3 textTileColor = vec3(0.89, 0.89, 1.0); 
			
			vec3 baseColor = mix(standardTileColor, textTileColor, isText);
			vec3 tileColor = mix(groutColor, baseColor, tilePattern);
	
			// --- DEPTH GRADIENT (SUBTLE VIGNETTE) ---
			float distFromCenter = length(uv - vec2(aspectRatio * 0.5, 0.5));
			float depthDarken = smoothstep(1.2, 0.0, distFromCenter) * 0.15;
			tileColor *= (1.0 - depthDarken);
	
			// --- COMPOSITE WITH SHADOWS & HIGHLIGHTS ---
			vec3 finalColor = tileColor;
			
			// Apply shadows (darken where caustic shadow is strong)
			vec3 shadowColor = vec3(0.2, 0.35, 0.45);
			float shadowStrength = 0.25;
			finalColor = mix(finalColor, finalColor * shadowColor, causticShadow * shadowStrength);
			
			// Apply highlights
			vec3 lightHighlight = vec3(0.85, 0.95, 0.98);
			float causticStrength = 0.5;
			finalColor += lightHighlight * causticIntensity * causticStrength;
			
			finalColor = clamp(finalColor, 0.0, 1.0);
			
			gl_FragColor = vec4(finalColor, 1.0);
		}
	`;

	let myShader: p5.Shader;

	p.setup = () => {
		// Use WEBGL constant attached to the p instance type
		p.createCanvas(p.windowWidth, 200, p.WEBGL);
		myShader = p.createShader(vertShader, fragShader);
	};

	p.draw = () => {
		const d = p.pixelDensity();

		p.shader(myShader);
		p.noStroke();
		myShader.setUniform("u_resolution", [p.width * d, p.height * d]);
		myShader.setUniform("u_time", p.millis() / 1000.0);
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
