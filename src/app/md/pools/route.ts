// /pools.md (see the rewrites in next.config.ts): the pool list and the
// admission fees as markdown
import { markdownHeaders, poolsIndexMarkdown } from "@/lib/page-markdown";
import { buildPoolPages } from "@/lib/pool-pages";
import { loadAdmissionFees, loadPools, loadSchedules } from "@/lib/site-data";
import { SITE_URL } from "@/lib/site-url";

export const dynamic = "force-static";

export async function GET(): Promise<Response> {
	const [records, schedules, fees] = await Promise.all([loadPools(), loadSchedules(), loadAdmissionFees()]);
	const text = poolsIndexMarkdown(buildPoolPages(records, schedules), SITE_URL, fees);
	return new Response(text, { headers: markdownHeaders(`${SITE_URL}/pools`) });
}
