"use client";

import { useEffect, useRef } from "react";
import { HeaderPlaceholder, HEADER_HEIGHT } from "./HeaderPlaceholder";
import { mountWater } from "./water";

export default function HeaderAnimation()
{
	const renderRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!renderRef.current) return;
		const water = mountWater(renderRef.current);
		if (!water) return;

		// Run the draw loop only while it can be seen. The header sits at the top
		// of a long page, so it is scrolled away for most of a visit; without this
		// the simulation and display passes keep running
		// underneath the schedule grid the user is actually using. Backgrounded
		// tabs already stop (the browser withholds animation frames), so this only
		// has to cover the header leaving the viewport.
		//
		// prefers-reduced-motion stops the loop outright. The water still draws
		// its first frame, which is what we want: the lit, tiled pool as a still
		// image over the flat CSS placeholder, rather than nothing at all.
		//
		// Resuming is safe for the simulation: the sim clock caps how much time one
		// frame may represent, so a header that comes back after a minute picks up
		// where it left off instead of catching up on a minute of drips.
		let visible = false;
		const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
		const applyLoopState = () => {
			water.setLooping(visible && !reducedMotion.matches);
		};
		const observer = new IntersectionObserver((entries) => {
			visible = entries[entries.length - 1].isIntersecting;
			applyLoopState();
		});
		reducedMotion.addEventListener("change", applyLoopState);
		observer.observe(renderRef.current);

		return () => {
			observer.disconnect();
			reducedMotion.removeEventListener("change", applyLoopState);
			water.remove();
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
