# WebMCP Plan

How to expose the site's schedules and UI to AI agents through [WebMCP](https://github.com/webmachinelearning/webmcp), the proposed browser API that lets a page register tools for an agent running in the browser. A conventional remote MCP server comes later, as an optional add-on that reuses the same query code.

## Why WebMCP fits this site

WebMCP tools are JavaScript functions the page registers with `document.modelContext.registerTool()`. An agent in the browser (Chrome's and Edge's built-in agents, ChatGPT Desktop, Brave's Leo, or an extension) discovers them and calls them instead of scraping the DOM and simulating clicks.

This site is a good match:

- **All the data is already on the client.** `all_schedules.json` and `alerts.json` are served statically from `/data/`, so tools can answer questions without any new backend.
- **The UI has state worth driving.** The week grid's filters (program tags, pools) and its selected cell are exactly what an agent would otherwise click through, and they already round-trip through the URL and `localStorage`. A tool that sets them updates what the user sees, which is the cooperative "agent and user on the same page" flow WebMCP is designed for.
- **Nothing here is consequential.** Tools only read public data or change view state. There are no purchases, sign-ins or personal data, so the security questions the spec worries about mostly don't arise.

### Status of the standard (as of late September 2026)

- The spec is a W3C Web Machine Learning Community Group draft, still changing week to week.
- Chrome 149 and Edge 150 have origin trials. Locally, Chrome needs `chrome://flags/#enable-webmcp-testing`.
- ChatGPT Desktop supports it; Brave has experimental support in Leo. Firefox and Safari have open standards-position issues and no implementation.
- TypeScript types are published as [`webmcp-types`](https://www.npmjs.com/package/webmcp-types).

So everything must be feature-detected and invisible to browsers without the API, and the code should be isolated enough that tracking spec changes means editing one small module.

---

## The API surface we'd use

From the current spec (`index.bs`):

```ts
document.modelContext.registerTool(
	{
		name: string,
		title?: string,
		description: string,
		inputSchema?: object, // JSON Schema
		execute: (input: object, { signal }: { signal: AbortSignal }) => Promise<any>,
		annotations?: { readOnlyHint?, untrustedContentHint?, consequentialHint? },
	},
	{ signal?: AbortSignal, exposedTo?: string[] },
): Promise<undefined>;
```

- Aborting the registration signal unregisters the tool. That maps onto React effects: register in `useEffect`, abort in the cleanup.
- The browser JSON-serializes whatever `execute` resolves with, so tools can return plain objects.
- `readOnlyHint` marks tools that only read. `untrustedContentHint` flags output containing third-party text, which applies to the scraped alert text. Nothing here needs `consequentialHint`.
- Tools are exposed to the top-level page, same-origin frames and built-in agents by default. We don't pass `exposedTo`, so no cross-origin frame can see them.
- The declarative API (`<form toolname=...>`) doesn't apply: the site's filters are buttons, not forms.

---

## Tool design

Two layers: **site-wide tools**, registered once from the shared layout, which answer questions from any page; and **page tools**, registered by the week grid only while it's mounted, which drive its UI. That follows the spec's own advice to register tools for the current page state and remove them when they stop applying, which keeps the agent's tool list short.

Section changes are client-side navigations inside `(site)/layout.tsx`, so the document never unloads. Site-wide tools stay registered across sections, and the grid's tools come and go with the `/` route, firing `toolchange` as they do.

### Site-wide tools (registered in the `(site)` layout)

| Tool | Inputs | Does |
| --- | --- | --- |
| `find-swim-sessions` | `activity?`, `audience?`, `access?`, `pools?`, `days?`, `startsAfter?`, `endsBefore?`, `text?` | Returns matching sessions across pools, sorted by day and time, each with a link |
| `whats-on-now` | `withinMinutes?` (default 60) | Sessions running now and starting soon, in Pacific time; same logic as `/now` |
| `get-pool-info` | `pool?` | Name, address, season and date range, closure status, SF Rec & Park page and PDF link; all pools if `pool` is omitted |
| `get-pool-alerts` | `pool?` | Site-wide and per-pool alerts. Marked `untrustedContentHint` because the text is scraped |
| `show-page` | `page` (`week-grid`, `now`, `schedules`, `changes`, `about`), `pool?` | Navigates with the Next router. With `pool` on `schedules`, scrolls to `#pool-<id>` (the anchors already exist) |

### Week grid tools (registered by `AvailabilityGrid` while it's mounted)

| Tool | Inputs | Does |
| --- | --- | --- |
| `set-grid-filters` | `activities?`, `audiences?`, `access?`, `pools?`, `mode` (`replace` / `add`) | Sets the program and pool filters and returns the resulting filters plus how many sessions now show |
| `select-grid-time` | `day`, `hour` | Highlights that cell and returns the sessions in it, as the detail list shows them |
| `clear-grid-filters` | — | Clears the filters and the selected cell |
| `get-grid-state` | — | Current filters, selected cell, and visible session count |

A typical exchange: "When can I lap swim near the Mission on weekday evenings?" The agent calls `find-swim-sessions` to get the answer, then `show-page("week-grid")` and `set-grid-filters({ activities: ["lap"], pools: ["mission", "garfield"] })`, and the user sees the grid filtered to match, with a shareable URL, since the grid already writes its state to the query string.

### Design notes

- **Inputs use the site's own vocabulary.** Tag enums are built from `ACTIVITY_TAGS`, `AUDIENCE_TAGS` and `ACCESS_TAGS` in `program-taxonomy.ts`, and pool enums from `POOLS`, so the schema shows the model the valid values and nothing is duplicated. Use the bare tag names (`lap`, `senior`, `drop-in`) in the schema and add the `activity:` prefixes in code.
- **Loose schema, strict code.** The spec's best-practices section warns that strict schema failures stall agents. The schemas use enums as hints but don't set `additionalProperties: false`. `execute` validates with Zod (already a dependency), accepts reasonable variants ("MLK", "king", "6pm", "18:00") and returns an actionable error message rather than throwing a bare exception.
- **No mental math for the model.** Accept `"6pm"`, `"18:00"` or `"6:00p"` and normalize with `parseTimeToMinutes`. Always answer in Pacific time and say so in the result.
- **Explain empty results.** A closed pool has its programs emptied by the pipeline, so when a pool has nothing, say why: an active closure (with `formatClosurePeriod`) or a date outside the season. Include `scheduleStartDate` and `scheduleEndDate` so the agent can catch out-of-season questions.
- **Cite sources.** Results include the pool's `sfRecParkUrl` and `pdfScheduleUrl`, and a note that the official PDF is authoritative.
- **Cap output.** `find-swim-sessions` returns at most ~50 sessions and says when it truncated, so an unfiltered call can't flood the context.
- **Keep the count low.** Five site-wide tools plus four on the grid is about right. Resist adding a tool per filter chip.

---

## Code changes

### 1. Shared, pure schedule logic in `src/lib`

Both the WebMCP tools and a future server MCP need the same queries, and some of that logic is currently stuck inside components:

- **`src/lib/pacific-time.ts`**: move `getNowInPT()` out of `NowSoon.tsx` and give it an optional `Date` argument so it's testable. `NowSoon` imports it back.
- **`src/lib/schedule-query.ts`**: pure functions over `PoolSchedule[]`: `resolvePool(nameOrId)` (on top of `findPool`/`getPoolById`), `findSessions(all, filters)`, `sessionsNow(all, now, withinMinutes)`, `explainEmpty(pool, today)`. No I/O and no DOM, so they run in Jest's node environment and in the browser alike.
- Optional cleanup: the five copies of the `fs.readFile` block for `all_schedules.json` and `alerts.json` in pages and `SiteFooter` could become one `src/lib/schedule-data.ts`. The WebMCP work doesn't need it, but the server MCP phase would.

### 2. A thin WebMCP module: `src/lib/webmcp.ts`

The only file that touches `document.modelContext`, so spec churn is contained:

```ts
export function hasWebMcp(): boolean {
	return typeof document !== "undefined" && "modelContext" in document;
}

// registers each tool against one signal, so an effect cleanup (or a failed
// registration partway through) unregisters the whole set
export async function registerTools(tools: WebMcpTool[], signal: AbortSignal) {
	if (!hasWebMcp()) return;
	for (const tool of tools) {
		await document.modelContext.registerTool(
			{ ...tool, execute: withTracking(tool.name, tool.execute) },
			{ signal },
		);
	}
}
```

- `withTracking` wraps `execute` to catch errors into readable results and to send a PostHog event (see Analytics).
- `registerTool` rejects with `NotAllowedError` when a permissions policy disables it; catch that and do nothing.
- Types: add `webmcp-types` as a dev dependency. If it lags the spec, a local `src/webmcp.d.ts` covering the IDL above is ~30 lines.

### 3. Site-wide tools: `src/components/WebMcpTools.tsx`

A `"use client"` component rendered once in `src/app/(site)/layout.tsx`, which renders nothing:

- In a `useEffect`, if `hasWebMcp()`, create an `AbortController` and register the site-wide tools; abort in the cleanup. React StrictMode's double effect run in dev is harmless, since the first set is unregistered before the second registers.
- **Load data on first use, not up front.** `execute` fetches `/data/all_schedules.json` and `/data/alerts.json` once, memoized in a module-level promise. Browsers without WebMCP, and visitors whose agent never calls a tool, pay nothing, and the layout doesn't have to pass the whole schedule down as props.
- `show-page` uses `useRouter()` from `next/navigation` and resolves once the new pathname has rendered, so the agent's next call sees the grid tools already registered.
- Keep the tool definitions in `src/lib/webmcp-tools.ts` as plain objects built from the `schedule-query.ts` functions, so they can be tested without React.

### 4. Grid tools inside `AvailabilityGrid.tsx`

The grid owns the state, so it registers its own tools in a `useEffect` that depends on `initialized`, which keeps tool calls from racing the URL/`localStorage` restore in the init effect.

- `set-grid-filters` and `clear-grid-filters` call the existing `setSelectedTags` and `setSelectedPools`, so persistence and `writeUrl` happen through the effects already there.
- `select-grid-time` calls `store.set(cell)`, sets `committedCellRef.current` and calls `writeUrl()`, the same steps a click goes through, then scrolls the cell into view.
- Tools that report state (`get-grid-state`, and the return value of the setters) read from `filtersRef` and `store.get()` rather than from closure state. React state set inside `execute` hasn't landed yet when `execute` returns, so compute the result from the requested values directly, or await a `requestAnimationFrame` before reading.
- Validate pool ids with `validatePoolId` and tags against the taxonomy, and report anything dropped.
- Record agent-driven filter changes with the existing `trackProgramFilter` and `trackPoolFilter`, tagged with a `source: "agent"` property, so analytics can tell them apart from clicks.

### 5. Origin trial

To reach Chrome 149+ and Edge 150+ users without a flag, register the site for each origin trial and serve the tokens:

- Put tokens in `NEXT_PUBLIC_WEBMCP_OT_TOKENS` (comma-separated) and render `<meta httpEquiv="origin-trial" content={token} />` in `src/app/layout.tsx`, or send them as an `Origin-Trial` response header from `headers()` in `next.config.ts`. The header is better: it applies before any script runs.
- Tokens are per-origin and expire, so note the renewal date in `.env.example`.

---

## Analytics

`posthog-js` is already loaded on the client, so `withTracking` can capture `webmcp_tool_called` with the tool name, argument keys (not free-text values), duration and success. It's the only way to learn whether any real agent uses the tools, and which questions people ask. The `toolactivated` event on `document.modelContext` is an alternative hook, but wrapping `execute` also captures the outcome.

---

## Testing

- **Unit (Jest, node environment):** `schedule-query.ts` and `pacific-time.ts` against fixture schedules: midnight rollover for "now", closed pools, out-of-season dates, pool name resolution, time parsing. `fast-check` is already available for property tests on the time parsing.
- **Tool definitions:** call each tool's `execute` from `webmcp-tools.ts` directly with a stubbed `fetch`. Check the JSON Schemas with a quick `JSON.stringify` round trip, since `registerTool` serializes `inputSchema` and throws on anything that isn't plain JSON.
- **In the browser:** the spec also defines `document.modelContext.getTools()` and `executeTool()` for in-page agents. With a WebMCP-enabled Chromium, a Playwright test can load `/`, list the tools and execute `set-grid-filters`, then check that the grid and URL updated. Whether the pre-installed Chromium has the feature behind a launch flag needs checking. If it doesn't, this stays a manual check in Chrome with the flag on.
- **With a real agent:** Chrome or Edge with the flag or origin trial, and ChatGPT Desktop. Try a handful of questions ("lap swim before work on Tuesday", "is anything open right now near Balboa", "show me senior swims at Hamilton on the grid").

---

## Phases

### Phase 0: spike
- [ ] Enable the Chrome flag, add `webmcp-types`, and register one `get-pool-info` tool from a client component in the layout. Confirm an agent sees and calls it, and that browsers without the API are unaffected.

### Phase 1: shared logic
- [ ] `pacific-time.ts` and `schedule-query.ts` with tests; `NowSoon` switched over with no visible change.

### Phase 2: site-wide tools
- [ ] `src/lib/webmcp.ts`, `src/lib/webmcp-tools.ts`, `WebMcpTools.tsx`.
- [ ] `find-swim-sessions`, `whats-on-now`, `get-pool-info`, `get-pool-alerts`, `show-page`.
- [ ] PostHog tracking.

### Phase 3: grid tools
- [ ] `set-grid-filters`, `select-grid-time`, `clear-grid-filters`, `get-grid-state` in `AvailabilityGrid`.
- [ ] Playwright check if a WebMCP-enabled Chromium is available.

### Phase 4: ship
- [ ] Origin trial tokens for Chrome and Edge.
- [ ] A short note on `/about` saying the site works with in-browser AI agents.

### Phase 5 (optional): remote MCP server

WebMCP only helps when the user has the site open in a browser with an agent. A conventional MCP server covers the other case: someone asking Claude, ChatGPT or Cursor about pool times without visiting the site. The spec describes the two as complementary, not competing.

Because the query logic lives in `schedule-query.ts`, this is mostly wiring:

- A Streamable HTTP endpoint at `/mcp`, as a Next.js route handler using Vercel's `mcp-handler` over `@modelcontextprotocol/sdk`, stateless, with no auth, since the data is public.
- The read-only tools only (`find-swim-sessions`, `whats-on-now`, `get-pool-info`, `get-pool-alerts`), plus `get-schedule-changes` backed by the existing `changelog-data.ts`. The UI tools don't apply server-side.
- Check SDK compatibility with Zod 4 and Next 16 first. Make sure `public/data/**` and `data/changelog/**` reach the function, via `outputFileTracingIncludes` or by importing the JSON. Rate-limit the endpoint with a Vercel Firewall rule.
- Test with the MCP Inspector, then as a custom connector in Claude.

---

## Open questions

- Should the grid tools also be reachable from other sections, as one `show-in-grid` tool that navigates and then filters? That's friendlier for agents but duplicates the grid tools. The current plan relies on `show-page` plus dynamic registration instead, which is what the spec recommends. Worth trying both with a real agent in Phase 3.
- Should `find-swim-sessions` accept a calendar date ("next Saturday") as well as weekdays? It lets the tool catch closures and out-of-season dates, but the agent has to pass a date and the tool has to resolve it in Pacific time.
- Should `/schedules` get tools of its own (for example, jumping to a pool's section)? `show-page` with `pool` covers the main case, so probably not.
