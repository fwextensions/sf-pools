// /llms.txt: what the site is and how an agent can ask it things, as the
// llms.txt proposal lays out (llmstxt.org): a title, a summary, details with
// no headings, then H2 sections that are only lists of links, with the ones
// an agent can skip under "Optional". Every page points here with
// rel="describedby" (see the root layout).
// Prerendered, since it only changes with the data.
import { createSwimAnswers } from "@/lib/swim-answers";
import { loadSchedules } from "@/lib/site-data";
import { SITE_URL } from "@/lib/site-url";

export const dynamic = "force-static";

export async function GET(): Promise<Response> {
	const answers = createSwimAnswers({ schedules: await loadSchedules() }, { siteUrl: SITE_URL });
	const pools = answers.listPools();
	// North Beach's two pools share a page
	const pages = pools.filter((p, i) => pools.findIndex((o) => o.pageUrl === p.pageUrl) === i);
	const categories = answers.listCategories().filter((c) => c.public);

	const text = `# SF Pools

> When and where you can swim at San Francisco's public pools. SF Pools gathers the weekly schedule PDFs SF Rec & Park posts for each pool, with their closures, and answers what's open now, what's coming up, and which sessions match a pool, program, day or time. Times are Pacific. It's an independent project, not a city site: schedules are scraped weekly and read by a model, so confirm with the pool's PDF or SF Rec & Park page before going.

Program category ids, for the program and categories filters: ${categories.map((c) => `${c.id} (${c.label})`).join(", ")}.

## Ask it directly

- [MCP server](${SITE_URL}/mcp): Streamable HTTP, no sign-in. Tools: find_sessions (when: now, soon, today, tonight, tomorrow, this-week, weekend; or from/to dates; filters for pools, program categories, weekdays and start times), get_pool, list_closures, list_pools, list_program_categories.
- [Sessions as JSON](${SITE_URL}/api/sessions?when=now): the find_sessions answer over GET. Parameters: when, or from and to (YYYY-MM-DD, at most 31 days); pools (comma separated ids or names); program (comma separated category ids); days (e.g. sat,sun); startAfter and startBefore (e.g. 6:00a, 5pm); dropIn (true or false); limit (default 50, at most 200); at (ISO 8601, Pacific when it has no zone).

## Pages

- [Week grid](${SITE_URL}/): which pools have a program at each hour of the week, filterable by program and pool, e.g. ${SITE_URL}/?program=lap&pools=balboa
- [Now & soon](${SITE_URL}/now): what's open right now and what starts in the next two hours
- [Pools](${SITE_URL}/pools): every pool, each with a page of its address, official links and full weekly schedule

## Pools

${pages.map((p) => `- [${p.name.replace(/\s*\(.*\)$/, "")}](${p.pageUrl}): ${p.address ?? ""}`.trimEnd()).join("\n")}

## Optional

- [Schedule changes](${SITE_URL}/changes): what changed in each weekly update
- [About](${SITE_URL}/about): where the data comes from and how far to trust it
`;
	return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
