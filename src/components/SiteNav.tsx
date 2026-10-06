"use client";

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

/**
 * The tab strip that sits flush under the water on every page. It is a client
 * component only so it can read the pathname for the active tab; the links
 * themselves are ordinary next/link navigations, which keep the (site) layout
 * (and the water running in it) mounted while the page below swaps.
 */
export default function SiteNav() {
	const pathname = usePathname();

	return (
		// on a phone the labels have to hold one line each or the strip doubles in
		// height: they drop their tracking and spread across the width instead of
		// sitting a fixed gap apart, which fits them down to a 320px screen
		<nav
			aria-label="Sections"
			className="flex justify-between border-b border-line min-[500px]:justify-start min-[500px]:gap-7"
		>
			{SECTIONS.map(({ href, label }) => {
				const current = isCurrent(pathname, href);
				return (
					<Link
						key={href}
						href={href}
						aria-current={current ? "page" : undefined}
						onClick={() => trackSectionNav(pathname, href)}
						className={`font-mono -mb-px whitespace-nowrap border-b-2 pb-3 pt-2 text-small min-[900px]:pt-6 min-[500px]:tracking-[.08em] ${
							current
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
