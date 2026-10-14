import type { CSSProperties } from "react";
import HeaderAnimation from "@/components/header/HeaderAnimation";
import { HEADER_HEIGHT, TILE } from "@/components/header/HeaderPlaceholder";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";

// How many rows of tiles stay on screen once the header pins: enough to keep
// the water in view as a strip above the tabs, not so much that it eats into
// the page on a phone.
const PEEK_ROWS = 2;

/**
 * The shell every public page shares: the water, then the section tabs, then
 * the page, then the footer. It lives in a layout rather than in each page so
 * that moving between sections is a client-side navigation that swaps only the
 * page between the tabs and the footer — the water keeps its simulation state
 * and never remounts. The header lab sits outside this route group on purpose;
 * it draws its own water.
 *
 * The water and the tabs pin together. The pair is sticky with a negative top
 * of the water's height less its last PEEK_ROWS rows, so it scrolls with the
 * page until only that bottom strip of tiles is left, then holds there with
 * the tabs under it. --site-sticky-h is the height of what stays pinned, which
 * anything sticky inside a page offsets its own top by.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
	const peek = `calc(${PEEK_ROWS} * ${TILE})`;

	return (
		<div
			className="font-sans pb-8 text-ink"
			style={{ "--site-sticky-h": `calc(${peek} + var(--site-nav-h))` } as CSSProperties}
		>
			{/* full width rather than inside the container, so the water still
			    spans the window; only the tabs sit in the container. Above every
			    sticky bar a page has, so those pass under it. */}
			<div className="sticky z-20 bg-white" style={{ top: `calc(${peek} - ${HEADER_HEIGHT})` }}>
				<header className="relative" style={{ height: HEADER_HEIGHT }}>
					<HeaderAnimation />
				</header>
				<div className="container">
					<SiteNav />
				</div>
			</div>
			<div className="container">
				{children}
				<SiteFooter />
			</div>
		</div>
	);
}
