// /pools/<slug>.md (see the rewrites in next.config.ts): the pool's page as
// markdown, prerendered like the page itself
import { pacificToday } from "@/lib/closures";
import { markdownHeaders, poolPageMarkdown } from "@/lib/page-markdown";
import { buildPoolPages, poolPageSlugs } from "@/lib/pool-pages";
import { loadAlerts, loadPools, loadSchedules } from "@/lib/site-data";
import { SITE_URL } from "@/lib/site-url";

type Params = { slug: string };

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams(): Params[] {
	return poolPageSlugs().map((slug) => ({ slug }));
}

export async function GET(_request: Request, { params }: { params: Promise<Params> }): Promise<Response> {
	const { slug } = await params;
	const [records, schedules, alerts] = await Promise.all([loadPools(), loadSchedules(), loadAlerts()]);
	const page = buildPoolPages(records, schedules).find((p) => p.slug === slug);
	if (!page) return new Response("Not found\n", { status: 404 });

	const text = poolPageMarkdown(page, { siteUrl: SITE_URL, alerts: alerts?.poolAlerts ?? [], today: pacificToday() });
	return new Response(text, { headers: markdownHeaders(`${SITE_URL}/pools/${slug}`) });
}
