# SF Pools Schedule Viewer

Centralized, searchable schedules for San Francisco public swimming pools. This app scrapes official pool schedule PDFs from SF Rec & Park, uses an LLM to extract structured schedules, and provides a clean UI to browse by program, day, time, and pool.

## Tech

- Next.js (App Router), React 19, TypeScript
- Tailwind CSS v4 (via `@tailwindcss/postcss` and `@import "tailwindcss"`)
- Vercel AI SDK (`ai`) with Google Generative AI provider (`@ai-sdk/google`)
- Zod for strict schema validation
- GitHub Actions for automated weekly schedule updates

## Prerequisites

- Node.js 22+
- npm
- A Google Generative AI API key

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

4. Generate schedules:

	```
	npm run build-schedules
	```

This will scrape PDF URLs, download PDFs, extract schedules, and write `public/data/all_schedules.json`. View at `/schedules`.

## Architecture

### Data Files

- **`data/pools.json`** — Source of truth for static pool metadata (id, name, shortName, address, pageUrl). Does not change frequently.
- **`public/data/discovered_pool_schedules.json`** — Scraped PDF URLs (poolId → pdfUrl mapping). Regenerated on each scrape.
- **`data/pdf-manifest.json`** — Tracks downloaded PDFs by hash to detect changes.
- **`data/extracted/<poolId>.json`** — Cached LLM extractions per PDF.
- **`public/data/all_schedules.json`** — Aggregated schedule data for the UI.
- **`data/changelog/`** — Change history between schedule updates.

### Pipeline Flow

```
scrape →    download-pdfs →   process-all-pdfs
   ↓             ↓                 ↓
validates   checks hash       preserves data
pool count  downloads if      fails on large
& URLs      content changed   changes
```

1. **Scrape**: Discovers pool pages and PDF URLs from SF Rec & Park. Validates against `pools.json` — fails if pool count or page URLs change unexpectedly.
2. **Download**: Fetches PDFs, checks content hash against manifest. Only downloads if content actually changed (handles URL changes gracefully).
3. **Process**: Extracts schedules via LLM, preserves unchanged pool schedules, detects large changes.

### Change Detection

The pipeline computes a changelog comparing old vs new schedules:
- **none/minor**: Normal updates, build succeeds
- **major/wholesale**: Large changes detected, build fails in CI (requires manual review)

Set `FAIL_ON_LARGE_CHANGES=false` locally to bypass this check during development.

## Scripts

- `npm run dev` — start Next.js dev server
- `npm run build` — build for production
- `npm run start` — start production build
- `npm run lint` — run ESLint
- `npm run test` — run tests
- `npm run scrape` — scrape pool pages, validate against pools.json, discover PDF URLs
- `npm run download-pdfs` — download changed PDFs into `data/pdfs/`
- `npm run process-all-pdfs` — extract schedules from PDFs, preserve unchanged, write changelog
- `npm run build-schedules` — full pipeline: scrape → download → process
- `npm run scrape-alerts` — scrape pool alerts from SF Rec & Park
- `npm run analyze-programs` — analyze raw vs canonical program names

## How Extraction Works

1. For each PDF, send content to the LLM with a strict Zod schema
2. The model extracts:
	- Pool metadata (name, season, date range)
	- Program entries with day, time, lanes, notes
3. Pipeline normalizes program names to canonical labels (e.g., "LAP SWIM" → "Lap Swim")
4. Enriches with static metadata from `pools.json` (address, URLs)

## Automated Updates

GitHub Actions runs weekly to:
1. Scrape and download new PDFs
2. Extract schedules from changed PDFs
3. Commit changes to `public/data/` and `data/changelog/`
4. Send push notifications via Pushover

If large changes are detected, the build fails and a notification is sent for manual review.

## Environment Variables

```bash
# Required: Google AI API key for schedule extraction
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here

# Optional: Disable build failure on large changes (for local dev)
FAIL_ON_LARGE_CHANGES=false

# Optional: Force re-extraction even if cache exists
REFRESH_EXTRACT=1

# For CI notifications (GitHub Actions secrets)
PUSHOVER_USER_KEY=...
PUSHOVER_API_TOKEN=...
```

## License

MIT
