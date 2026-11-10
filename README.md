# SF Pools

When and where you can swim at San Francisco's public pools, live at [www.sfpools.org](https://www.sfpools.org). The site scrapes the schedule PDFs SF Rec & Park posts for each pool, uses an LLM to extract structured sessions, and lets you browse them by program, pool, day and time, along with closures, alerts and admission fees.

It's an independent project, not a city site.

## Pages

- **`/`** (Week grid) — every session in a day × hour grid, filtered by program and pool. Filters and the selected cell live in the URL (`?program=…&pools=…&cell=thu-20`).
- **`/now`** (Now & Soon) — what's open now, later today, and each pool's next opening. `/now-preview?at=2026-11-26T10:00` shows it at any San Francisco time.
- **`/pools`** — the pool list with addresses and admission fees; **`/pools/<slug>`** is a page per pool with its schedule, closures, phone and PDF links. `/schedules` redirects here.
- **`/changes`** — the changelog of each pipeline run.
- **`/about`** — text from `src/content/about.md`.

Pages follow the OS light/dark setting. The header's animated water follows San Francisco's real sun.

## For agents

- **`/llms.txt`** — what the site is and how to query it.
- **`/mcp`** — an MCP server (Streamable HTTP, via `mcp-handler`); tools are in `src/lib/mcp-tools.ts`.
- **`/api/sessions`** — the same session search as JSON.
- **`.md` copies** — `/pools.md`, `/pools/<slug>.md` and `/about.md` serve markdown versions of those pages, linked from each page with `rel="alternate"`.

## Tech

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS v4 (via `@tailwindcss/postcss`); design tokens in `src/app/globals.css`
- Vercel AI SDK (`ai`) with the Google Generative AI provider (`@ai-sdk/google`) for extraction, checked against `@firecrawl/pdf-inspector` tables
- Zod for strict schema validation (scripts and server only)
- Jest for tests
- GitHub Actions for scheduled data updates; Vercel for hosting
- Optional PostHog analytics

## Prerequisites

- Node.js 26
- npm
- A Google Generative AI API key (only needed to run the extraction pipeline)

## Setup

1. Install dependencies:

	```
	npm install
	```

2. Create `.env.local` in the project root and add:

	```
	GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
	```

3. Run the dev server:

	```
	npm run dev
	```

The committed data in `public/data/` is enough to run the site. To regenerate it:

```
npm run build-schedules
```

## Architecture

### Data Files

- **`data/pools.json`** — Static pool metadata (id, name, shortName, address, phone, pageUrl). Hand-entered; the scraper validates against it but never rewrites it.
- **`data/pdf-manifest.json`** — Tracks downloaded PDFs by hash to detect changes.
- **`data/extracted/<poolId>.json`** — Cached LLM extractions per PDF, keyed by PDF hash in `data/extracted/_manifest.json`. Committed, so a run only sends a PDF to the model when it has actually changed.
- **`data/usage/`** — Log of model token usage per run.
- **`data/changelog/`** — Change history between schedule updates.
- **`public/data/discovered_pool_schedules.json`** — Scraped PDF URLs per pool.
- **`public/data/all_schedules.json`** — The schedules in force, for the UI.
- **`public/data/upcoming_schedules.json`** — Schedules posted for a date range that hasn't started yet.
- **`public/data/alerts.json`** — Alerts and closures from each pool's facility page.
- **`public/data/maintenance_schedule.json`**, **`public/data/admission_fees.json`** — Read from the citywide PDFs on the Swimming Pools page.
- **`public/data/city_holidays.json`** — City holidays from sf.gov; all pools close on them.

### Pipeline Flow

`npm run build-schedules` runs, in order:

1. **Scrape** (`scrape-pool-info.ts`): discovers pool pages and PDF URLs from SF Rec & Park and validates them against `pools.json`. When a pool has several PDFs, it picks the one whose date range covers today, else the next to start, else the newest upload.
2. **Download** (`downloadPdf.ts`): fetches PDFs and only keeps ones whose content hash changed.
3. **Alerts** (`scrape-alerts.ts`): parses facility-page alerts into closures.
4. **Aquatics docs** (`scrape-aquatics-docs.ts`): reads the maintenance schedule and admission fees PDFs, skipping unchanged ones. A failure here warns but never stops the pipeline.
5. **Process** (`process-all-pdfs.ts`): extracts schedules via the LLM (or the cache), applies the publishing rules in `src/lib/release-rules.ts`, and writes the schedules and changelog.

### Publishing rules and change detection

Each extraction is checked against the PDF's own tables (`src/lib/grounding.ts`) and against data-quality checks. A pool whose extraction fails its health checks is quarantined and keeps its last published schedule, while healthy pools still ship; the run sends a "review required" notification. Mismatches against the PDF tables are warnings in the log, the changelog and the notification.

The changelog records the size of each run's changes (none, minor, moderate, major, wholesale). Large changes are reported, not blocked; the log notes whether the PDFs declared a new season.

Closures (from alerts, PDF notes, the maintenance schedule and city holidays) are stored as metadata; programs are never removed, and the browser hides sessions on the dates a closure covers.

## Scripts

- `npm run dev` — start the Next.js dev server
- `npm run build` — build for production
- `npm run start` — start the production build
- `npm run lint` — run ESLint
- `npm run test` — run tests (`test:watch`, `test:coverage` also available)
- `npm run scrape` — scrape pool pages, validate against pools.json, discover PDF URLs
- `npm run download-pdfs` — download changed PDFs into `data/pdfs/`
- `npm run process-all-pdfs` — extract schedules from PDFs, apply the publishing rules, write the changelog
- `npm run build-schedules` — the full pipeline above
- `npm run scrape-alerts` — scrape pool alerts from SF Rec & Park
- `npm run scrape-aquatics-docs` — read the maintenance schedule and admission fees PDFs (`-- --force`, `--dry-run`)
- `npm run scrape-holidays` — fetch the city holiday list from sf.gov into `public/data/city_holidays.json` (`-- --force` to fetch when the year is already saved)
- `npm run analyze-programs` — analyze raw vs canonical program names
- `npm run renormalize-programs` — re-apply the program taxonomy to `all_schedules.json` without re-extracting

## How Extraction Works

1. For each PDF, send its content to the LLM with a strict Zod schema
2. The model extracts:
	- Pool metadata (name, season, date range)
	- Program entries with day, time, lanes, notes
	- Closures listed in the PDF's notes
3. The pipeline normalizes program names to canonical labels and categories (`src/lib/program-taxonomy.ts`)
4. Enriches with static metadata from `pools.json`

## Automated Updates

- **Update Pool Schedules** (`update-schedules.yml`) runs every Friday at 20:00 UTC, and on demand. It runs `build-schedules`, commits changes to `public/data/`, `data/changelog/`, the extraction cache and manifests, and sends Pushover notifications. The commit to `main` triggers a Vercel deploy.
- **Update City Holidays** (`update-holidays.yml`) runs daily from December through February, and stops fetching once the new year's list is saved.

## Environment Variables

```bash
# Required for extraction
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here

# Optional: extract with a different Gemini model (also a repo variable in CI)
EXTRACT_MODEL=gemini-3.5-flash-lite

# Optional: force re-extraction even if the cache has the PDF
REFRESH_EXTRACT=1

# Optional (local dev): publish extracts even when they fail health checks
ALLOW_UNHEALTHY=1

# CI notifications (GitHub Actions secrets)
PUSHOVER_USER_KEY=...
PUSHOVER_API_TOKEN=...

# Optional site settings
NEXT_PUBLIC_POSTHOG_KEY=...        # analytics; off without it
NEXT_PUBLIC_CRASH_WATCH=off        # turn off the crash detector
NEXT_PUBLIC_SITE_URL=...           # overrides the site URL, which otherwise comes from Vercel's production domain
```

## Header Water Animation

The animated pool header is a two-pass WebGL pipeline in `src/components/header/`, written against the WebGL API directly (`webgl.ts`). `water.ts` runs the simulation and input, and `HeaderAnimation.tsx` mounts it over a CSS placeholder (`HeaderPlaceholder.tsx`, `header-placeholder.css`) that shows until the first frame lands, when WebGL isn't available, or with `?water=off`.

**Pass 1 — simulation (`water-sim.frag`).** A water heightfield simulated with the discrete 2D wave equation over a small float texture:

```
next = (2·h − hPrev + WAVE_SPEED · laplacian(h)) · DAMPING
```

Each texel stores the current height in red and the previous height in green; two framebuffers ping-pong. Rings, interference and reflections off the pool edges all come from this one equation. Disturbances are injected each frame: the pointer presses a Gaussian dent along the path it traveled, scroll acceleration sloshes a swell against the leading edge (rate-limited by `SCROLL_COOLDOWN_MS`), and occasional drips fall when the page is idle.

The simulation runs a fixed number of steps per simulated second (`wave-schedule.ts`), so waves move at the same speed on 60Hz and 165Hz screens, and the texture is sized in CSS pixels (`SIM_TEXEL_CSS_PX`) so ripples look the same from phone to ultrawide.

**Pass 2 — display (`header-shader.frag`).** Renders the tiles, the "SF POOLS" text and the lighting from the simulated heightfield plus an analytic ambient wave field: refraction of the tiles, caustics, crest and trough lighting, and specular glints. Daylight comes from San Francisco's real sun altitude (`sun.ts`); after dark the caustics give way to underwater pool lights.

### Tuning

The shaders declare their knobs as `const float NAME = value;`. Visit **`/header-lab`** to drive them from sliders side by side: the lab rewrites those declarations into uniforms (`shader-params.ts`), so production pays nothing for tunability and the defaults can't drift. Paste a tuned value back by editing that one line.

Two constraints worth knowing: `WAVE_SPEED` must stay below 0.5 (the CFL stability limit), and sim texels must stay square on screen or waves spread unevenly. `resize()` in `water.ts` ignores height-only resizes because iOS fires them as the browser chrome collapses during scrolling.

## License

MIT
