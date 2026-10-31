// /about.md (see the rewrites in next.config.ts): the About page's own
// markdown, which the page is rendered from
import { aboutFacilities, aboutMarkdown, loadAboutSource } from "@/lib/about-content";
import { markdownHeaders } from "@/lib/page-markdown";
import { loadPools } from "@/lib/site-data";
import { SITE_URL } from "@/lib/site-url";

export const dynamic = "force-static";

export async function GET(): Promise<Response> {
	const [source, records] = await Promise.all([loadAboutSource(), loadPools()]);
	const text = aboutMarkdown(source, SITE_URL, aboutFacilities(records));
	return new Response(text, { headers: markdownHeaders(`${SITE_URL}/about`) });
}
