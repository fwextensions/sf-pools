"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { trackSectionNav } from "@/lib/analytics";

// The three sections of the site, in the order they read left to right. The
// week grid is the home page, so its tab matches only the exact root path;
// the other two match their whole subtree.
const SECTIONS = [
	{ href: "/", label: "WEEK GRID" },
	{ href: "/now", label: "NOW & SOON" },
	{ href: "/schedules", label: "FULL SCHEDULES" },
];

function isCurrent(pathname: string, href: string) {
	return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

// The bottom of the pinned water strip, in viewport px: the sticky water's
// height plus its (negative) top.
function stripBottom() {
	const water = document.querySelector<HTMLElement>("[data-site-water]");
	if (!water) return 0;
	return water.offsetHeight + parseFloat(getComputedStyle(water).top);
}

/**
 * The tab strip that sits flush under the water on every page, and rides up
 * onto the water's pinned strip as the page scrolls. Over the water it turns
 * white. It is a client
 * component only so it can read the pathname for the active tab; the links
 * themselves are ordinary next/link navigations, which keep the (site) layout
 * (and the water running in it) mounted while the page below swaps.
 */
export default function SiteNav() {
	const pathname = usePathname();
	const tabClicked = useRef(false);
	const navRef = useRef<HTMLElement>(null);
	const [overWater, setOverWater] = useState(false);

	// The labels switch to white once their midline is over the water, which
	// is the same moment on every page, since it depends only on how far the
	// page has scrolled.
	useEffect(() => {
		let frame = 0;
		const update = () => {
			frame = 0;
			const tab = navRef.current?.querySelector("a");
			if (!tab) return;
			const style = getComputedStyle(tab);
			const textMid = tab.getBoundingClientRect().top + parseFloat(style.paddingTop) +
				parseFloat(style.lineHeight) / 2;
			setOverWater(textMid < stripBottom());
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(update);
		};
		update();
		window.addEventListener("scroll", schedule, { passive: true });
		window.addEventListener("resize", schedule);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("scroll", schedule);
			window.removeEventListener("resize", schedule);
		};
	}, []);

	// A tab click keeps the header where it is rather than letting the router
	// scroll the whole page back to the top: scrolled past the point where the
	// tabs pin, the new section opens at the top of its content, just under
	// the water; above that point the page stays put. Only after a tab click,
	// so back and forward still get the browser's own scroll restoration.
	useEffect(() => {
		if (!tabClicked.current) return;
		tabClicked.current = false;
		// where the tabs pin: the scroll that brings their unpinned place in the
		// page up to their sticky top. Not where the content meets the strip,
		// which can come a few px sooner, leaving the tabs short of pinned.
		// The bar's place in the page is just below the water's full height,
		// since the water is the layout's first child.
		const bar = navRef.current?.parentElement;
		const water = bar?.previousElementSibling;
		if (!bar?.parentElement || !(water instanceof HTMLElement)) return;
		const placeInPage = bar.parentElement.getBoundingClientRect().top + window.scrollY + water.offsetHeight;
		const pinsAt = placeInPage - parseFloat(getComputedStyle(bar).top);
		window.scrollTo(0, Math.min(window.scrollY, pinsAt));
	}, [pathname]);

	return (
		// under 900px the labels have to hold one line each or the strip doubles
		// in height: they drop their tracking and spread across the width instead
		// of sitting a fixed gap apart, which fits them down to a 320px screen.
		// Its height is fixed because the pinned header's height, which every
		// sticky bar on a page offsets itself by, is built from it.
		<nav
			ref={navRef}
			aria-label="Sections"
			data-over-water={overWater || undefined}
			className={`flex h-[var(--site-nav-h)] justify-between border-b transition-colors duration-150 min-[900px]:justify-start min-[900px]:gap-7 ${
				overWater ? "border-transparent" : "border-line"
			}`}
		>
			{SECTIONS.map(({ href, label }) => {
				const current = isCurrent(pathname, href);
				return (
					<Link
						key={href}
						href={href}
						aria-current={current ? "page" : undefined}
						scroll={false}
						onClick={() => {
							// the current tab doesn't navigate, so no effect would clear it
							tabClicked.current = href !== pathname;
							trackSectionNav(pathname, href);
						}}
						className={`font-mono -mb-px whitespace-nowrap border-b-2 pb-3 pt-2 text-small leading-5 min-[900px]:pt-6 min-[900px]:tracking-[.08em] ${
							overWater
								? current
									? "site-tab-water border-transparent font-semibold text-white"
									: "site-tab-water border-transparent font-medium text-white/85 hover:text-white"
								: current
									? "border-ink font-semibold text-ink"
									: "border-transparent font-medium text-ink-2 hover:text-ink"
						}`}
					>
						{label}
					</Link>
				);
			})}
		</nav>
	);
}
