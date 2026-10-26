"use client";

import { useEffect, useRef } from "react";
import { HeaderPlaceholder, HEADER_HEIGHT } from "./HeaderPlaceholder";
import "./header-placeholder.css";
import displayFragShader from "./header-shader.frag";
import { mountWater, type Water } from "./water";

// Shader constants that ?water=no-<name> switches off, for comparing each
// effect against the water without it. ?water=plain switches off all of them.
const EFFECTS: Record<string, string> = {
	tint: "WATER_TINT",
};

function withConstsZeroed(src: string, names: string[]) {
	return names.reduce((out, name) => out.replace(
		new RegExp(`const\\s+float\\s+${name}\\s*=\\s*-?[0-9]*\\.?[0-9]+\\s*;`),
		`const float ${name} = 0.0;`
	), src);
}

// Water that breaks this soon after mounting means the GPU won't keep it
// going, so stop remounting and leave the placeholder rather than loop.
const REMOUNT_GIVE_UP_MS = 10_000;

export default function HeaderAnimation()
{
	const renderRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const host = renderRef.current;
		if (!host) return;

		// ?water=off leaves just the CSS placeholder, for comparing the two.
		// Other comma-separated values preview the effects: day or night
		// pins the time of day; no-tint switches the water tint off; plain
		// switches every effect off, which is the water as it was before them;
		// no-check skips the black-frame check.
		const flags = (new URLSearchParams(location.search).get("water") ?? "").split(",");
		if (flags.includes("off")) return;
		const plain = flags.includes("plain");
		const zeroed = Object.entries(EFFECTS)
			.filter(([flag]) => plain || flags.includes(`no-${flag}`))
			.map(([, name]) => name);
		const timeOfDay = plain ? "day" : flags.find(f => f === "day" || f === "night");
		const waterOpts = {
			// ?water=no-check turns off the black-frame check, for telling a GPU
			// that draws black from a check that misreads it
			healthCheck: !flags.includes("no-check"),
			displaySrc: zeroed.length ? withConstsZeroed(displayFragShader, zeroed) : undefined,
			timeOfDay,
		};

		// Run the draw loop only while it can be seen. The site layout pins the
		// header's last rows of tiles above the tabs, so on those pages it stays
		// in view (and keeps animating) for the whole visit; this covers anywhere
		// it can still scroll fully away. Backgrounded tabs already stop (the
		// browser withholds animation frames), so this only has to cover the
		// header leaving the viewport.
		//
		// prefers-reduced-motion stops the loop outright. The water still draws
		// its first frame, which is what we want: the lit, tiled pool as a still
		// image over the flat CSS placeholder, rather than nothing at all.
		//
		// Resuming is safe for the simulation: the sim clock caps how much time one
		// frame may represent, so a header that comes back after a minute picks up
		// where it left off instead of catching up on a minute of drips.
		let water: Water | null = null;
		let visible = false;
		let mountedAt = 0;
		let remountId = 0;
		const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
		const applyLoopState = () => {
			water?.setLooping(visible && !reducedMotion.matches);
		};
		const mount = () => {
			remountId = 0;
			mountedAt = performance.now();
			water = mountWater(host, { ...waterOpts, onBroken: handleBroken });
			applyLoopState();
		};

		// iOS takes the GL context from a tab left idle or in the background long
		// enough (overnight is plenty), and a GPU reset (a driver update, waking
		// from sleep) can leave it drawing black or not drawing at all. The
		// instance hides itself and reports it; swap in a fresh one. Waiting for
		// an animation frame waits for the tab to be shown again, since hidden
		// tabs get none, so no new context is asked for while the browser is
		// still reclaiming them.
		function handleBroken() {
			water?.remove();
			water = null;
			if (performance.now() - mountedAt < REMOUNT_GIVE_UP_MS) {
				console.warn("Header water broke again right after mounting; leaving the placeholder.");
				return;
			}
			remountId = requestAnimationFrame(mount);
		}

		const observer = new IntersectionObserver((entries) => {
			visible = entries[entries.length - 1].isIntersecting;
			applyLoopState();
		});
		reducedMotion.addEventListener("change", applyLoopState);
		observer.observe(host);
		mount();

		return () => {
			observer.disconnect();
			reducedMotion.removeEventListener("change", applyLoopState);
			cancelAnimationFrame(remountId);
			water?.remove();
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
