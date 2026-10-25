// The tools the MCP server at /mcp offers agents. Each one is a thin wrapper
// over the answers module: it validates the input, asks, and returns the
// answer as JSON, both as text (which every client shows the model) and as
// structured content. Kept apart from the route so tests can register the
// tools on a server of their own with fixture data and a fixed clock.
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { MAX_LIMIT, MAX_RANGE_DAYS, SwimAnswerError, WHEN_WINDOWS, type SwimAnswers } from "@/lib/swim-answers";
import { addDays } from "@/lib/pool-calendar";
import { momentFor } from "@/lib/agent-answers";

export const MCP_INSTRUCTIONS = `SF Pools answers when and where you can swim at San Francisco's public pools, from the schedules SF Rec & Park prints as PDFs.

- Times and dates are Pacific (San Francisco). Dates are YYYY-MM-DD; times are as the schedules print them, like "6:00a" or "2:15p".
- Start with find_sessions: when="now" for what's open now, "soon" for the next 2 hours, or "today", "tonight", "tomorrow", "this-week", "weekend", or explicit from/to dates.
- Pools can be named loosely ("mlk", "north beach", "Rossi Pool"). list_pools and list_program_categories give the exact names and filters.
- Answers leave out sessions you can't walk in on unless you ask for a program category (lessons, swim teams, rentals).
- The schedules are scraped weekly and read by a model, and pools close at short notice. Tell people to check the pool's PDF or SF Rec & Park page before they go; every answer links to them.`;

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
const AT = z
	.string()
	.optional()
	.describe('the moment to answer for, ISO 8601; a time without a zone ("2026-10-30T19:00") is Pacific. Defaults to now');
const POOLS = z
	.array(z.string())
	.optional()
	.describe('pool ids, page slugs or names, e.g. ["balboa", "north beach"]; all pools when left out');

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

type ToolResult = {
	content: Array<{ type: "text"; text: string }>;
	structuredContent?: Record<string, unknown>;
	isError?: boolean;
};

// an answer as the tool's result; a question it can't answer comes back as
// an error the agent reads and can retry from, anything else is a real fault
async function answer(name: string, args: object, ask: () => unknown): Promise<ToolResult> {
	// the shape of the call for the function logs, not what was asked
	console.log(JSON.stringify({ mcpTool: name, args: Object.keys(args) }));
	try {
		const result = ask();
		const structured = Array.isArray(result) ? { results: result } : (result as Record<string, unknown>);
		return { content: [{ type: "text", text: JSON.stringify(structured) }], structuredContent: structured };
	} catch (error) {
		if (error instanceof SwimAnswerError) return { content: [{ type: "text", text: error.message }], isError: true };
		throw error;
	}
}

export function registerSwimTools(server: McpServer, load: () => Promise<SwimAnswers>): void {
	server.registerTool(
		"find_sessions",
		{
			title: "Find swim sessions",
			description: `Sessions at San Francisco's public pools that match a time window and filters. Use it for "what's open now" (when="now"), "what's coming up" (when="soon"), "lap swim Saturday morning" (when="weekend", categories=["lap"], startBefore="12:00p") and the like.

Give either when or from/to, not both (default when="today"):
- now: sessions running at the moment, plus open pools merged into stretches ("open until 9:00a")
- soon: sessions starting in the next 2 hours
- today: the rest of today; tonight: today from 5p; tomorrow: all of tomorrow
- this-week: today through 6 days out; weekend: this Saturday and Sunday
- from/to: whole days, at most ${MAX_RANGE_DAYS}

For windows of one day the answer also lists "quiet" pools with nothing in the window, why (closures, a schedule that ended) and when they next open. Results are sorted by date and time; when "truncated" is true, narrow the query or raise limit.`,
			inputSchema: z.object({
				when: z.enum(WHEN_WINDOWS).optional().describe("a window relative to now"),
				from: DATE.optional().describe("first date, YYYY-MM-DD"),
				to: DATE.optional().describe("last date, YYYY-MM-DD"),
				pools: POOLS,
				categories: z
					.array(z.string())
					.optional()
					.describe('program category ids from list_program_categories, e.g. ["lap"], ["family", "parent-tot"]'),
				dropInOnly: z
					.boolean()
					.optional()
					.describe("only sessions you can walk in on; defaults to true, or false when categories are given"),
				days: z.array(z.string()).optional().describe('weekdays to keep, e.g. ["Saturday", "Sunday"]'),
				startAfter: z.string().optional().describe('keep sessions starting at or after this time, e.g. "6:00a", "5pm"'),
				startBefore: z.string().optional().describe('keep sessions starting before this time, e.g. "12:00p"'),
				limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe("most sessions to return, default 50"),
				at: AT,
			}),
			annotations: { title: "Find swim sessions", ...READ_ONLY },
		},
		async ({ at, ...query }) => {
			const answers = await load();
			return answer("find_sessions", { at, ...query }, () => answers.findSessions(query, momentFor(at)));
		}
	);

	server.registerTool(
		"get_pool",
		{
			title: "Get a pool's details",
			description:
				"One pool's address, links (its page here, the schedule PDF, SF Rec & Park's page), the dates its printed schedule runs, every weekly program, its closures from today on, and any upcoming schedule already posted. North Beach has two pools, cool and warm; asking for \"north beach\" returns both.",
			inputSchema: z.object({
				pool: z.string().describe('a pool id, page slug or name, e.g. "mlk", "Rossi Pool"'),
				includeUpcoming: z.boolean().optional().describe("include the weekly programs of an upcoming schedule"),
				at: AT,
			}),
			annotations: { title: "Get a pool's details", ...READ_ONLY },
		},
		async ({ pool, includeUpcoming, at }) => {
			const answers = await load();
			return answer("get_pool", { pool, includeUpcoming, at }, () =>
				answers.getPool(pool, momentFor(at), { includeUpcoming })
			);
		}
	);

	server.registerTool(
		"list_closures",
		{
			title: "List pool closures",
			description:
				"What's closed in a date range (default the two weeks from today): closure notices from the pools' SF Rec & Park pages, closures the schedule PDFs list (holidays, training, maintenance) with the pools that share each, and schedules that start, end or hand over to a new one.",
			inputSchema: z.object({
				from: DATE.optional().describe("first date, YYYY-MM-DD; defaults to today"),
				to: DATE.optional().describe("last date, YYYY-MM-DD; defaults to 13 days after from"),
				pools: POOLS,
				at: AT,
			}),
			annotations: { title: "List pool closures", ...READ_ONLY },
		},
		async ({ from, to, pools, at }) => {
			const answers = await load();
			return answer("list_closures", { from, to, pools, at }, () => {
				const start = from ?? momentFor(at).date;
				return answers.listClosures(start, to ?? addDays(start, 13), pools);
			});
		}
	);

	server.registerTool(
		"list_pools",
		{
			title: "List the pools",
			description: "Every pool, with the id, slug and names find_sessions and get_pool accept, its address and its page here.",
			annotations: { title: "List the pools", ...READ_ONLY },
		},
		async () => {
			const answers = await load();
			return answer("list_pools", {}, () => answers.listPools());
		}
	);

	server.registerTool(
		"list_program_categories",
		{
			title: "List program categories",
			description:
				"The program categories sessions are filed under (lap swim, family swim, lessons, ...), with the ids find_sessions takes. Those marked public: false (rentals, school classes, camps) aren't open to the public.",
			annotations: { title: "List program categories", ...READ_ONLY },
		},
		async () => {
			const answers = await load();
			return answer("list_program_categories", {}, () => answers.listCategories());
		}
	);
}
