import type { CSSProperties } from "react";
import HeaderAnimation from "@/components/header/HeaderAnimation";
import { HEADER_HEIGHT, TILE } from "@/components/header/HeaderPlaceholder";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";

/**
 * The shell every public page shares: the water, then the section tabs, then
 * the page, then the footer. It lives in a layout rather than in each page so
 * that moving between sections is a client-side navigation that swaps only the
 * page between the tabs and the footer — the water keeps its simulation state
 * and never remounts. The header lab sits outside this route group on purpose;
 * it draws its own water.
 *
 * The water and the tabs pin separately, so the tabs ride up onto the water.
 * The water is sticky with a negative top of its height less a strip just
 * tall enough to hold the tabs (their height rounded up to whole tiles), so
 * it scrolls with the page until only that strip is left. The tabs follow it
 * up and pin centered in the strip, where SiteNav turns them white.
 * --site-sticky-h is the strip's height, which anything sticky inside a page
 * offsets its own top by.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
	const strip = `round(up, var(--site-nav-h), ${TILE})`;

	return (
		<div
			className="font-sans pb-8 text-ink"
			style={{ "--site-sticky-h": strip } as CSSProperties}
		>
			{/* full width rather than inside the container, so the water still
			    spans the window. Above every sticky bar a page has, so those
			    pass under it. */}
			<div
				data-site-water
				className="sticky z-20"
				style={{ top: `calc(var(--site-sticky-h) - ${HEADER_HEIGHT})` }}
			>
				<header className="relative" style={{ height: HEADER_HEIGHT }}>
					<HeaderAnimation />
				</header>
			</div>
			{/* pins with the middle of its labels on the middle of the strip; a
			    rem-based padding puts the labels' midline --site-nav-text-mid
			    from the top of the bar */}
			<div
				className="container sticky z-30"
				style={{ top: "calc(var(--site-sticky-h) / 2 - var(--site-nav-text-mid))" }}
			>
				<SiteNav />
			</div>
			<div className="container">
				{children}
				<SiteFooter />
			</div>
		</div>
	);
}
