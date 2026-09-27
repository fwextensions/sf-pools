# MCP Server Plan

How to expose the pool schedules to AI assistants (Claude, ChatGPT, Cursor, etc.) through a remote MCP server hosted by the site itself.

## Goal

Let someone ask their assistant "where can I lap swim after 6pm on Thursday?" or "is Balboa open right now?" and have it answer from the same data the site shows, with links back to the site and the official SF Rec & Park pages.

The server is read-only and serves public data, so it needs no auth, no database, and no session state. It is a thin query layer over the JSON the weekly pipeline already commits.

---

## Approach

**A Streamable HTTP endpoint at `/mcp`, implemented as a Next.js route handler, running stateless on Vercel.**

- **Transport: Streamable HTTP, stateless.** It's the current remote transport in the MCP spec (the older HTTP+SSE transport is deprecated). Stateless mode means each POST is self-contained, which fits serverless functions and needs no Redis or session store.
- **Library: `mcp-handler` + `@modelcontextprotocol/sdk`.** `mcp-handler` (Vercel's adapter, formerly `@vercel/mcp-adapter`) wraps the official SDK's `McpServer` and returns a `(req: Request) => Response` handler that drops straight into an App Router route. Writing the transport glue by hand against the SDK is the fallback if the adapter lags behind Next 16.
- **Zod:** the repo is on Zod 4. Pin an SDK version that accepts Zod 4 schemas for tool input, and check that before writing anything else (see Phase 0).
- **Location:** `src/app/mcp/[transport]/route.ts` (or `src/app/api/mcp/route.ts`). `/mcp` is the conventional, memorable URL to publish; with the `[transport]` segment, `mcp-handler` can also serve legacy SSE clients later if needed (that requires Redis, so leave it off to start).

Why not a separate package or service: the data already lives in this repo and deploys with every weekly commit. A route in the same Next app gets fresh data on every redeploy for free and reuses the existing Zod schemas and helpers.

---

## Tool design

Tools are the main surface, since most clients support tools and not much else. Keep the set small, make inputs forgiving (pool names or ids, "lap" or "Lap Swim"), and return compact output.

| Tool | Inputs | Returns |
| --- | --- | --- |
| `list_pools` | — | id, name, short name, address, season, schedule date range, closure status, site + SF Rec & Park URLs |
| `get_pool_schedule` | `pool` (id or name), `day?` | that pool's sessions, grouped by day, plus season dates, closure, and alerts for the pool |
| `find_sessions` | `activity?`, `audience?`, `access?`, `pools?`, `days?`, `startsAfter?`, `endsBefore?`, `query?` | matching sessions across pools, sorted by day then start time |
| `whats_on_now` | `withinMinutes?` (default 60) | sessions running now and starting soon, in Pacific time, same logic as `/now` |
| `get_alerts` | `pool?` | site-wide and per-pool alerts from `alerts.json`, plus active closures |
| `list_schedule_changes` | `limit?` | recent changelog dates with counts (from `listChangelogs()`) |
| `get_schedule_changes` | `date?` (default latest) | moved/added/removed sessions per pool (from `getChangelog()`) |

Notes:

- **Filters mirror the site's facets.** `activity`, `audience` and `access` are enums built from `ACTIVITY_TAGS`, `AUDIENCE_TAGS` and `ACCESS_TAGS` in `program-taxonomy.ts`, so the model sees the valid values in the tool schema and the tags stay in one place. `query` is a free-text fallback matched against `title`/`programName`.
- **Times in and out.** Accept `"6pm"`, `"18:00"` or `"6:00p"`, normalize with the existing `parseTimeToMinutes` family. Return the site's `h:mma` strings plus minutes-since-midnight so the model can sort or compare without re-parsing.
- **Closures and seasons.** Programs are already emptied for a closed pool, so a pool with no sessions must say *why* (closure with its period from `formatClosurePeriod`, or out of season). Every result carries `scheduleStartDate`/`scheduleEndDate` so the assistant can warn when the user asks about a date outside the current season.
- **Output shape.** Return both `structuredContent` (typed JSON, with an `outputSchema`) and a short text rendering, since clients differ in which they use. Include a link to the relevant site page (`/schedules`, `/now`, `/changes/<date>`) and the pool's `sfRecParkUrl`/`pdfScheduleUrl` so answers can cite the source. Add a line reminding the assistant that schedules can change and the official PDF is authoritative.
- **Annotations.** Mark every tool `readOnlyHint: true`, `openWorldHint: false`, `idempotentHint: true` so clients don't prompt for confirmation.

### Resources and prompts (optional, cheap to add)

- Resources: `sfpools://pools`, `sfpools://pools/{id}/schedule` (a resource template), `sfpools://alerts`. Useful for clients that let users attach context directly.
- One prompt, e.g. `plan_a_swim` (args: activity, days, neighborhood), that walks the model through `find_sessions` and `get_alerts`. Low priority.

---

## Code changes

### 1. Pull shared logic out of pages and components into `src/lib`

Right now `all_schedules.json` and `alerts.json` are read with near-identical `fs.readFile` blocks in five places, and the "now in Pacific time" logic lives inside `NowSoon.tsx`. The MCP tools need the same things, so:

- **`src/lib/schedule-data.ts`** (new): `loadSchedules()`, `loadAlerts()`, `loadPools()`, parsed with `AllSchedulesSchema` and memoized per process. Switch the pages and `SiteFooter` to it. Small, mechanical, and it removes the duplication rather than adding a sixth copy.
- **`src/lib/pacific-time.ts`** (new): move `getNowInPT()` out of `NowSoon.tsx` and have it take an optional `Date` so it's testable. `NowSoon` imports it back.
- **`src/lib/schedule-query.ts`** (new): pure functions over `PoolSchedule[]`: `resolvePool(nameOrId)` (on top of `findPool`/`getPoolById`), `filterSessions(all, filters)`, `sessionsNow(all, now, withinMinutes)`. No I/O, so they're easy to unit-test and could also back client-side filtering later.

### 2. The MCP route

```ts
// src/app/mcp/[transport]/route.ts
import { createMcpHandler } from "mcp-handler";
import { registerTools } from "@/lib/mcp/tools";

const handler = createMcpHandler(
	(server) => registerTools(server),
	{ serverInfo: { name: "sf-pools", version: "1.0.0" } },
	{ basePath: "", maxDuration: 30, disableSse: true },
);

export { handler as GET, handler as POST, handler as DELETE };
```

- `src/lib/mcp/tools.ts`: one `server.registerTool(...)` per tool, each a few lines that call into `schedule-query.ts` / `changelog-data.ts` and format the result. Keeping registration out of the route file lets tests build a server without Next.
- `export const runtime = "nodejs"` (the changelog loader uses `fs`).

### 3. Make sure the data ships with the function

The pages read `public/data/*.json` and `data/changelog/*` via `fs` at request time. Next's file tracing usually picks these up, but a route that only reaches them through a shared helper may not. Either add `outputFileTracingIncludes` for the `/mcp` route in `next.config.ts` (`public/data/**`, `data/changelog/**`, `data/pools.json`), or have `schedule-data.ts` `import` the JSON so it's bundled. Bundling is simpler and fine here, since every data change is a commit and therefore a redeploy. Verify on a preview deployment either way.

### 4. Caching

Responses only change on redeploy. With memoized loaders the per-request cost is a filter over a few hundred rows, so there's nothing to cache beyond that. MCP responses are POSTs, so HTTP caching doesn't apply.

---

## Security and abuse

- Read-only, public data, no secrets touched by the route, and no LLM calls, so the risk is limited to request volume.
- Rate-limit `/mcp` with a Vercel Firewall rule (per-IP) rather than code.
- Validate every input with Zod (the SDK does this from the tool schemas); cap `limit`-style params and result counts so a broad `find_sessions` can't return the whole dataset in one response. Return a count and a "narrow your filters" note when truncated.
- Allow any origin (CORS). The endpoint is meant to be public; there are no cookies or credentials to protect.
- Keep `/api/extract-schedule` out of any MCP surface. It fetches PDFs and calls the model, and shouldn't be reachable this way.

---

## Analytics

Optional: capture a server-side PostHog event per tool call (`mcp_tool_called` with the tool name and filter keys, not free-text values) via `posthog-node`, flushed before the response returns. That shows which questions people actually ask, which is useful input for the site's own filters. Skip it in the first cut if it complicates the serverless flush.

---

## Testing

- **Unit (Jest):** `schedule-query.ts` and `pacific-time.ts` against fixture schedules, covering the edges: midnight rollover for "now", closed pools, a day with no sessions, name resolution ("MLK", "king", "martin luther king"), time parsing ("6pm", "18:00", "6:00p"). `fast-check` is already a dev dependency if property tests are useful for the time parsing.
- **Protocol:** a Jest test that registers the tools on an `McpServer`, connects an SDK `Client` over `InMemoryTransport`, and calls each tool. That checks the schemas, `structuredContent` against `outputSchema`, and error paths without running Next.
- **End to end:** `npx @modelcontextprotocol/inspector` against `npm run dev` at `http://localhost:3000/mcp`, then against a Vercel preview URL. Finally add it as a custom connector in Claude and ask a few real questions.

---

## Discoverability

- A short "Use with AI assistants" section on `/about` with the URL (`https://<domain>/mcp`) and copy-paste config for Claude (custom connector), Claude Code (`claude mcp add --transport http sf-pools https://<domain>/mcp`), Cursor and VS Code.
- A line in the README.
- Later, if it seems worth it: list it in the MCP registry.

---

## Phases

### Phase 0 — spike (half a day)
- [ ] Install `mcp-handler` and `@modelcontextprotocol/sdk`; confirm they work with Next 16.2 and Zod 4 (tool input schemas in particular).
- [ ] One `list_pools` tool at `/mcp`, deployed to a preview; confirm the JSON data is readable from the function and the Inspector connects.

### Phase 1 — shared lib refactor
- [ ] `schedule-data.ts`, `pacific-time.ts`, `schedule-query.ts` with tests.
- [ ] Switch pages, `SiteFooter` and `NowSoon` to them; no visible change on the site.

### Phase 2 — tools
- [ ] `list_pools`, `get_pool_schedule`, `find_sessions`, `whats_on_now`, `get_alerts`.
- [ ] `list_schedule_changes`, `get_schedule_changes`.
- [ ] In-memory protocol tests.

### Phase 3 — ship
- [ ] Firewall rate limit, `/about` section, README.
- [ ] Optional PostHog tool-call events.
- [ ] Optional resources and prompt.

### Phase 4 — WebMCP (experimental, later)

[WebMCP](https://github.com/webmachinelearning/webmcp) is a proposed browser API (`navigator.modelContext`) that lets a page register tools for an agent running in the browser. Where it's available, the `/schedules` page could register tools like `set_filters` or `select_time_range` that drive the UI's own filter state, so an in-browser agent operates the page instead of scraping it. The query tools from `schedule-query.ts` could be registered client-side too. It's early and behind flags, so it's worth doing only after the server exists, feature-detected so nothing changes for normal visitors.

---

## Open questions

- URL: `/mcp` on the main domain (recommended), or a subdomain?
- Should `find_sessions` accept a specific calendar date and resolve it to a weekday + season check, or leave dates to the assistant? Accepting a date is friendlier and lets the server catch out-of-season and closure dates, so it's worth doing in Phase 2 if it's cheap.
- Include per-program `notes` and `lanes` in results by default, or only in `get_pool_schedule`? Leaning toward always including them when non-empty; they're short and often matter ("main pool", lane counts).
