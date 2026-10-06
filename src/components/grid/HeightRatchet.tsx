"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

// The detail list sits under the grid, so a shorter list pulls everything
// below it upward — pick a sparse cell while scrolled down and the page
// shifts under you. Hold the tallest list rendered so far as a floor: the
// space can grow but never shrink, so switching cells never moves the page.
// Changing the filters is the one time a smaller list is expected, so the
// floor resets there rather than stranding a gap for the rest of the session.
// Focus mode opts out: the page doesn't scroll there and the list has its
// own scroller, so a floor would only add one.
export default function HeightRatchet({
	enabled,
	resetKey,
	children,
}: {
	enabled: boolean;
	resetKey: string;
	children: ReactNode;
}) {
	const inner = useRef<HTMLDivElement>(null);
	const [floor, setFloor] = useState(0);

	// reset during render rather than in an effect, so the stale floor is
	// never committed for a frame before being cleared
	const key = `${resetKey}|${enabled}`;
	const [floorKey, setFloorKey] = useState(key);
	if (floorKey !== key) {
		setFloorKey(key);
		setFloor(0);
	}

	// every commit, not just when the content changes: fonts and wrapping can
	// settle a row later. offsetHeight is 0 while this copy of the grid is
	// display:none (the layout keeps both the mobile and desktop trees
	// mounted), which leaves the floor alone rather than crushing it
	useLayoutEffect(() => {
		if (!enabled) return;
		const h = inner.current?.offsetHeight ?? 0;
		setFloor((prev) => (h > prev ? h : prev));
	});

	return (
		<div style={{ minHeight: enabled && floor ? floor : undefined }}>
			<div ref={inner}>{children}</div>
		</div>
	);
}
