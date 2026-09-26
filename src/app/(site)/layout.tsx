import HeaderAnimation from "@/components/header/HeaderAnimation";
import { HEADER_HEIGHT } from "@/components/header/HeaderPlaceholder";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";

/**
 * The shell every public page shares: the water, then the section tabs, then
 * the page, then the footer. It lives in a layout rather than in each page so
 * that moving between sections is a client-side navigation that swaps only the
 * page between the tabs and the footer — the water keeps its simulation state
 * and never remounts. The header lab sits outside this route group on purpose;
 * it draws its own water.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="plex-sans container pb-8 text-[#0e2733]">
			{/* no top padding: the water is positioned from the top of the page,
			    not from this box, so padding here would only push the space the
			    header holds for it down below it, leaving a band above the tabs */}
			<header style={{ height: HEADER_HEIGHT }}>
				<HeaderAnimation />
			</header>
			<SiteNav />
			{children}
			<SiteFooter />
		</div>
	);
}
