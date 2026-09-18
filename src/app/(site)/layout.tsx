import HeaderAnimation from "@/components/header/HeaderAnimation";
import { HEADER_HEIGHT } from "@/components/header/HeaderPlaceholder";
import SiteNav from "@/components/SiteNav";

/**
 * The shell every public page shares: the water, then the section tabs, then
 * the page. It lives in a layout rather than in each page so that moving
 * between sections is a client-side navigation that swaps only the page below
 * the tabs — the water keeps its simulation state and never remounts. The
 * header lab sits outside this route group on purpose; it draws its own water.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="plex-sans container py-8 text-[#0e2733]">
			<header style={{ height: HEADER_HEIGHT }}>
				<HeaderAnimation />
			</header>
			<SiteNav />
			{children}
		</div>
	);
}
