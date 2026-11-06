"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The pool page's name row, pinned under the site header so a schedule
 * scrolled far down (or jumped to from the grid or Now & Soon) still says
 * which pool it is. Its height goes in --pool-head-h, which the schedule's
 * pinned day row sits below; the name can wrap to two lines on a phone, so
 * it's measured rather than assumed.
 */
export default function PoolPageHeader({ children }: { children: ReactNode }) {
	const ref = useRef<HTMLElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const root = document.documentElement;
		const update = () => root.style.setProperty("--pool-head-h", `${el.offsetHeight}px`);
		update();
		// Safari before 13.1 has no ResizeObserver; the first measure still runs
		const observer = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
		observer?.observe(el);
		return () => {
			observer?.disconnect();
			root.style.removeProperty("--pool-head-h");
		};
	}, []);

	return (
		// the space above is a margin, outside the sticky box, so the row
		// doesn't carry it up under the site header once it pins
		<header ref={ref} className="sticky top-[var(--site-sticky-h)] z-[5] mt-3 bg-page pt-3 pb-3">
			{children}
		</header>
	);
}
