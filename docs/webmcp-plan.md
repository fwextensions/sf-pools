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

Nearly every tool is **site-wide**: registered once from the shared layout and callable from any section. That includes `show-in-grid`, which works from any page and navigates to the grid itself. An agent doesn't need to know which page the user is on.

The one exception is `get-grid-state`, which the week grid registers only while it's mounted, because it only makes sense when the user is looking at the grid ("what am I looking at?"). This follows the spec's advice to register tools for the current page state, and it's small enough not to cost much context.

Section changes are client-side navigations inside `(site)/layout.tsx`, so the document never unloads. Site-wide tools stay registered across sections, and `get-grid-state` comes and goes with the `/` route, firing `toolchange` as it does.

### Site-wide tools (registered in the `(site)` layout)

| Tool | Inputs | Does |
| --- | --- | --- |
| `find-swim-sessions` | `activity?`, `audience?`, `access?`, `pools?`, `days?`, `dates?`, `startsAfter?`, `endsBefore?`, `text?` | Returns matching sessions across pools, sorted by day and time, each with a link. With `dates`, checks each date against season and closures (see below) |
| `whats-on-now` | `withinMinutes?` (default 60) | Sessions running now and starting soon, in Pacific time; same logic as `/now` |
| `get-pool-info` | `pool?` | Name, address, season and date range, closure status, SF Rec & Park page and PDF link; all pools if `pool` is omitted |
| `get-pool-alerts` | `pool?` | Site-wide and per-pool alerts. Marked `untrustedContentHint` because the text is scraped |
| `show-in-grid` | `activities?`, `audiences?`, `access?`, `pools?`, `mode?` (`replace`, the default, or `add`), `day?` or `date?`, `hour?` | Navigates to the week grid if needed, sets its filters and, with a day and hour, highlights that cell. Returns the applied filters, the visible session count, the cell's sessions and the shareable URL. With no filters and `mode: "replace"`, it clears the grid |
| `show-page` | `page` (`now`, `schedules`, `changes`, `about`), `pool?`, `day?` | Navigates with the Next router. On `schedules`, `pool` scrolls to that pool's section (`#pool-<id>`), and `day` to that day's column on narrow screens (see below) |

### Week grid tool (registered by `AvailabilityGrid` while it's mounted)

| Tool | Inputs | Does |
| --- | --- | --- |
| `get-grid-state` | — | Current filters, selected cell, and visible session count, including filters the user set by hand |

A typical exchange: "When can I lap swim near the Mission on weekday evenings?" From any page, the agent calls `find-swim-sessions` to get the answer, then `show-in-grid({ activities: ["lap"], pools: ["mission", "garfield"] })`. The user lands on the grid filtered to match, with a shareable URL, since the grid already writes its state to the query string.

### Dates in `find-swim-sessions`

`dates` takes `YYYY-MM-DD` strings, and also `"today"` and `"tomorrow"`, resolved in Pacific time so the model doesn't have to work out the date. Every result includes `today` (Pacific) so the agent can compute relative dates like "next Saturday" itself. For each date, the tool:

1. Maps it to a weekday. It parses the calendar date at UTC noon so the weekday can't shift with the browser's time zone.
2. Checks the date against each pool's `scheduleStartDate`/`scheduleEndDate`. Outside that range, the pool's result says the schedule for that date isn't published yet (or has ended) instead of returning this season's sessions as if they applied.
3. Checks the pool's `closure` with `isClosureActive(closure, date)`. If the pool is closed that day, it says so, with `formatClosurePeriod`. There's one catch: the pipeline empties the programs of a pool that's closed *on the day it runs*. A date after a current closure ends has no sessions in the data, so the tool reports "reopens on X; the schedule after that isn't available yet" rather than "nothing on".
4. Includes the active alerts for matched pools, since holiday hours and one-off closures show up in alerts rather than in the schedule data.

`days` and `dates` can be combined; the results group by date when dates are given and by weekday otherwise. `show-in-grid` accepts `date` too and maps it to the grid's weekday. The grid shows a typical week, so the date only picks the column.

### The full schedules page

`/schedules` is a server-rendered page with no client state: a jump nav, then each pool's week. There's nothing for an agent to change on it beyond where it's scrolled, so it gets no tools of its own. `show-page("schedules", { pool, day })` covers it:

- `pool` scrolls to `#pool-<id>`, the same anchors the jump nav uses.
- `day` only matters on narrow screens, where the week stacks into per-day columns. Those columns need `id="pool-<id>-<day>"` added to `DayColumn` so the tool can scroll to them. On wide screens it's ignored, since the whole week is visible as a timeline.

Questions about a pool's schedule ("what's on at Rossi on Saturday?") go to `find-swim-sessions` or `get-pool-info`, which return the same data as text. The page is only for showing the user.

### Design notes

- **Inputs use the site's own vocabulary.** Tag enums are built from `ACTIVITY_TAGS`, `AUDIENCE_TAGS` and `ACCESS_TAGS` in `program-taxonomy.ts`, and pool enums from `POOLS`, so the schema shows the model the valid values and nothing is duplicated. Use the bare tag names (`lap`, `senior`, `drop-in`) in the schema and add the `activity:` prefixes in code.
- **Loose schema, strict code.** The spec's best-practices section warns that strict schema failures stall agents. The schemas use enums as hints but don't set `additionalProperties: false`. `execute` validates with Zod (already a dependency), accepts reasonable variants ("MLK", "king", "6pm", "18:00") and returns an actionable error message rather than throwing a bare exception.
- **No mental math for the model.** Accept `"6pm"`, `"18:00"` or `"6:00p"` and normalize with `parseTimeToMinutes`. Always answer in Pacific time and say so in the result.
- **Explain empty results.** A closed pool has its programs emptied by the pipeline, so when a pool has nothing, say why: an active closure (with `formatClosurePeriod`) or a date outside the season. Include `scheduleStartDate` and `scheduleEndDate` so the agent can catch out-of-season questions.
- **Cite sources.** Results include the pool's `sfRecParkUrl` and `pdfScheduleUrl`, and a note that the official PDF is authoritative.
- **Cap output.** `find-swim-sessions` returns at most ~50 sessions and says when it truncated, so an unfiltered call can't flood the context.
- **Keep the count low.** Six site-wide tools plus one on the grid is about right. Resist adding a tool per filter chip.

---

## Code changes

### 1. Shared, pure schedule logic in `src/lib`

Both the WebMCP tools and a future server MCP need the same queries, and some of that logic is currently stuck inside components:

- **`src/lib/pacific-time.ts`**: move `getNowInPT()` out of `NowSoon.tsx` and give it an optional `Date` argument so it's testable. `NowSoon` imports it back.
- **`src/lib/schedule-query.ts`**: pure functions over `PoolSchedule[]`: `resolvePool(nameOrId)` (on top of `findPool`/`getPoolById`), `resolveDate(input, today)` (handles `"today"`, `"tomorrow"` and ISO dates, and returns the weekday), `findSessions(all, filters)`, `sessionsNow(all, now, withinMinutes)`, `poolStatusOn(pool, date)` (in season, closed, or schedule unknown, with the reason). No I/O and no DOM, so they run in Jest's node environment and in the browser alike.
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
- `show-page` and `show-in-grid` use `useRouter()` from `next/navigation`. `show-page` resolves once the new pathname has rendered, then scrolls to the anchor if one was asked for.
- Keep the tool definitions in `src/lib/webmcp-tools.ts` as plain objects built from the `schedule-query.ts` functions, so they can be tested without React.

### 4. `show-in-grid`: getting a request into the grid from anywhere

The grid's state lives inside `AvailabilityGrid`, and the grid may not be mounted when the tool runs. Navigating to `/?tags=…&pools=…` isn't enough on its own: once the grid has rewritten the URL in this document (`urlRewritten`), it deliberately lets stored filters win over the query string on its next mount. So the tool hands the request over directly instead:

- **`src/lib/grid-requests.ts`** (new, tiny): a module-level slot holding at most one pending request (`{ tags, pools, mode, cell }`) plus a resolver, and a subscribe function. `show-in-grid` puts its request there and gets back a promise.
- If the user isn't on `/`, the tool calls `router.push("/")`. The grid's init effect checks the slot first and applies a pending request ahead of the URL and `localStorage`. If the grid is already mounted, it's subscribed to the slot and applies the request straight away.
- Applying it goes through the existing paths: `setSelectedTags`/`setSelectedPools` (so persistence and `writeUrl` happen through the effects already there), and for a cell, `store.set(cell)`, `committedCellRef.current = cell` and `writeUrl()`, the same steps a click takes. Then the cell scrolls into view.
- The grid resolves the promise with the result once the state has landed (after the effect that writes the URL, so the returned URL is the real one). Build the result from the applied values rather than reading React state inside the handler, since state set there hasn't landed yet. The tool times out after a few seconds with a clear error if the grid never picks the request up.
- Validate pool ids with `validatePoolId` and tags against the taxonomy before queuing, and report anything dropped.
- Record agent-driven filter changes with the existing `trackProgramFilter` and `trackPoolFilter`, tagged with a `source: "agent"` property, so analytics can tell them apart from clicks.

`get-grid-state` is registered by the grid itself in a `useEffect` that depends on `initialized`, and reads `filtersRef` and `store.get()`.

### 5. Origin trial

To reach Chrome 149+ and Edge 150+ users without a flag, register the site for each origin trial and serve the tokens:

- Put tokens in `NEXT_PUBLIC_WEBMCP_OT_TOKENS` (comma-separated) and render `<meta httpEquiv="origin-trial" content={token} />` in `src/app/layout.tsx`, or send them as an `Origin-Trial` response header from `headers()` in `next.config.ts`. The header is better: it applies before any script runs.
- Tokens are per-origin and expire, so note the renewal date in `.env.example`.

---

## Analytics

`posthog-js` is already loaded on the client, so `withTracking` can capture `webmcp_tool_called` with the tool name, argument keys (not free-text values), duration and success. It's the only way to learn whether any real agent uses the tools, and which questions people ask. The `toolactivated` event on `document.modelContext` is an alternative hook, but wrapping `execute` also captures the outcome.

---

## Testing

- **Unit (Jest, node environment):** `schedule-query.ts` and `pacific-time.ts` against fixture schedules: midnight rollover for "now", closed pools, out-of-season dates, a date after a current closure ends, `"today"` just after midnight Pacific when it's still the previous day in UTC (and the reverse), pool name resolution, time parsing. `fast-check` is already available for property tests on the time parsing.
- **Tool definitions:** call each tool's `execute` from `webmcp-tools.ts` directly with a stubbed `fetch`. Check the JSON Schemas with a quick `JSON.stringify` round trip, since `registerTool` serializes `inputSchema` and throws on anything that isn't plain JSON.
- **In the browser:** the spec also defines `document.modelContext.getTools()` and `executeTool()` for in-page agents. With a WebMCP-enabled Chromium, a Playwright test can load `/now`, list the tools and execute `show-in-grid`, then check that it navigated and that the grid and URL updated. A second case runs it with the grid already mounted. Whether the pre-installed Chromium has the feature behind a launch flag needs checking. If it doesn't, this stays a manual check in Chrome with the flag on.
- **With a real agent:** Chrome or Edge with the flag or origin trial, and ChatGPT Desktop. Try a handful of questions ("lap swim before work on Tuesday", "is anything open right now near Balboa", "show me senior swims at Hamilton on the grid").

---

## Phases

### Phase 0: spike
- [ ] Enable the Chrome flag, add `webmcp-types`, and register one `get-pool-info` tool from a client component in the layout. Confirm an agent sees and calls it, and that browsers without the API are unaffected.

### Phase 1: shared logic
- [ ] `pacific-time.ts` and `schedule-query.ts` with tests; `NowSoon` switched over with no visible change.

### Phase 2: site-wide tools
- [ ] `src/lib/webmcp.ts`, `src/lib/webmcp-tools.ts`, `WebMcpTools.tsx`.
- [ ] `find-swim-sessions` (with dates), `whats-on-now`, `get-pool-info`, `get-pool-alerts`.
- [ ] `show-page`, plus per-day anchors on the `/schedules` day columns.
- [ ] PostHog tracking.

### Phase 3: grid
- [ ] `grid-requests.ts` and `show-in-grid`, with the grid consuming requests on mount and while mounted.
- [ ] `get-grid-state` in `AvailabilityGrid`.
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

- Should `/now` get a page-level tool too? It shows the same thing `whats-on-now` returns, so probably not; `show-page("now")` is enough.
- When the next season's PDFs appear partway through the current one, should date queries for the new season work? Today the pipeline keeps one schedule per pool, so they won't until the season switches over. Fine for now, but worth knowing.

### Decided

- `show-in-grid` is a site-wide tool that navigates to the grid and applies filters from any page. It replaces the separate page-level setter tools.
- `find-swim-sessions` accepts calendar dates and checks them against seasons and closures.
- `/schedules` gets no tools of its own; `show-page` scrolls it to a pool and, on narrow screens, a day.
