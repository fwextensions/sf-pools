"use client";

import { useEffect, useRef } from "react";
import { HeaderPlaceholder, HEADER_HEIGHT } from "./HeaderPlaceholder";
import "./header-placeholder.css";
import displayFragShader from "./header-shader.frag";
import { daylight, PRESET_ALTITUDES, sunAltitudeDeg } from "./sun";
import { mountWater, type Water } from "./water";
import { onMediaChange } from "@/lib/media-query";

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

// The pinned water's background by day and by night, as RGB, for the bar
// Safari 26 colors from it (see the effect below).
const STRIP_DAY = [0x7b, 0xbc, 0xda];
const STRIP_NIGHT = [0x2c, 0x5f, 0x8e];

function stripColor(sun: number) {
	const [r, g, b] = STRIP_NIGHT.map((night, i) => Math.round(night + (STRIP_DAY[i] - night) * sun));
	return `rgb(${r}, ${g}, ${b})`;
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
		const plain = flags.includes("plain");
		const timeOfDay = plain ? "day" : flags.find(f => f === "day" || f === "night");

		// Safari 26 on iOS no longer reads theme-color for the bar behind the
		// clock. It hit-tests just inside the top of the screen, walks up to the
		// first fixed or sticky element, and takes the first plain
		// background-color on the way; with none, the bar showed the day
		// water's light blue all night. So the pinned water gets a background
		// that follows the sun like the water does: the day color is what
		// Safari showed before, and the night one the darker tiles between the
		// pool lights. data-night switches the placeholder to its night look
		// (see header-placeholder.css). The water reads the sun every minute,
		// so this does too, and again when a tab left in the background, where
		// timers are throttled, comes back.
		const strip = host.closest<HTMLElement>("[data-site-water]");
		const updateSun = () => {
			const altitude = timeOfDay ? PRESET_ALTITUDES[timeOfDay] : sunAltitudeDeg(new Date());
			const sun = daylight(altitude);
			host.toggleAttribute("data-night", sun < 0.5);
			if (strip) {
				const color = stripColor(sun);
				strip.style.backgroundColor = color;
				// the same color carried 8px above the strip, so at the top of the
				// page the seam where Safari's bar meets the page has the strip's
				// color under it rather than the page's
				strip.style.boxShadow = `0 -8px 0 ${color}`;
			}
		};
		const sunTimer = setInterval(updateSun, 60_000);
		document.addEventListener("visibilitychange", updateSun);
		updateSun();
		const stopSun = () => {
			clearInterval(sunTimer);
			document.removeEventListener("visibilitychange", updateSun);
		};

		if (flags.includes("off")) return stopSun;
		const zeroed = Object.entries(EFFECTS)
			.filter(([flag]) => plain || flags.includes(`no-${flag}`))
			.map(([, name]) => name);
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
		const stopWatchingMotion = onMediaChange(reducedMotion, applyLoopState);
		observer.observe(host);
		mount();

		return () => {
			stopSun();
			observer.disconnect();
			stopWatchingMotion();
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
