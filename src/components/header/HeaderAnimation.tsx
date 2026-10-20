"use client";

import { useEffect, useRef } from "react";
import { HeaderPlaceholder, HEADER_HEIGHT } from "./HeaderPlaceholder";
import { mountWater, type Water } from "./water";

// A context lost this soon after mounting means the GPU won't keep one, so
// stop remounting and leave the placeholder rather than loop.
const REMOUNT_GIVE_UP_MS = 10_000;

export default function HeaderAnimation()
{
	const renderRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const host = renderRef.current;
		if (!host) return;

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
			water = mountWater(host, { onContextLost: handleContextLost });
			applyLoopState();
		};

		// iOS takes the GL context from a tab left idle or in the background long
		// enough (overnight is plenty), and a lost context leaves the canvas
		// transparent over the placeholder for good. Swap in a fresh instance.
		// Waiting for an animation frame waits for the tab to be shown again,
		// since hidden tabs get none, so no new context is asked for while the
		// browser is still reclaiming them.
		function handleContextLost() {
			water?.remove();
			water = null;
			if (performance.now() - mountedAt < REMOUNT_GIVE_UP_MS) return;
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
