// /pools.md (see the rewrites in next.config.ts): the pool list as markdown
import { markdownHeaders, poolsIndexMarkdown } from "@/lib/page-markdown";
import { buildPoolPages } from "@/lib/pool-pages";
import { loadPools, loadSchedules } from "@/lib/site-data";
import { SITE_URL } from "@/lib/site-url";

export const dynamic = "force-static";

export async function GET(): Promise<Response> {
	const [records, schedules] = await Promise.all([loadPools(), loadSchedules()]);
	const text = poolsIndexMarkdown(buildPoolPages(records, schedules), SITE_URL);
	return new Response(text, { headers: markdownHeaders(`${SITE_URL}/pools`) });
}
