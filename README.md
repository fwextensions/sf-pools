# SF Pools Schedule Viewer

Centralized, searchable schedules for San Francisco public swimming pools. This app scrapes and downloads official pool schedule PDFs, uses an LLM to extract structured schedules, and provides a clean UI to browse by program, day, time, and pool.

## Tech

- Next.js (App Router), React 19, TypeScript
- Tailwind CSS v4 (via `@tailwindcss/postcss` and `@import "tailwindcss"`)
- Vercel AI SDK (`ai`) with Google Generative AI provider (`@ai-sdk/google`)
- Zod for strict schema validation

## Prerequisites

- Node.js 24.4.1+
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
	# optional: override autodiscovery of MLK pool PDF
	MLK_PDF_URL=https://sfrecpark.org/DocumentCenter/View/25795
	```

3. Run the dev server:

	```
	npm run dev
	```

4. Generate schedules (in another terminal):

	```
	curl -X POST http://localhost:3000/api/extract-schedule
	```

This will write `public/data/all_schedules.json` and you can view it at `/schedules`.

## Notes

- PDFs are not committed. Place any local PDFs under `data/pdfs/` for testing.
- Extracted data is written to `public/data/all_schedules.json` for the UI, plus a per-PDF cache under `data/extracted/` to avoid re-prompting the LLM.
- The pipeline writes these pool-level fields when known:
	- `poolName` (raw as found), `poolNameTitle` (title case), `poolShortName` (from `public/data/pools.json` mapping)
	- `address`, `sfRecParkUrl`, `pdfScheduleUrl`
	- `scheduleLastUpdated`, `scheduleSeason`, `scheduleStartDate`, `scheduleEndDate`
	- `lanes` (pool-wide context when available)
- Program entries include:
	- `programName` (canonicalized for consistent filtering)
	- `programNameOriginal` (original text from the PDF)
	- `programNameCanonical` (same as `programName` for now)
	- `dayOfWeek`, `startTime`, `endTime`, `notes`, `lanes` (per-program lanes if listed)
- Multi-program time blocks in a single box (e.g., "Senior Lap Swim (6)" stacked above "Lap Swim (4)") are split into separate program entries, each with its own `lanes` value.
- Writing `public/data/all_schedules.json` at runtime is fine locally; on Vercel it is ephemeral. Durable storage can be added later.

## Scripts

- `npm run dev` — start Next.js dev server
- `npm run build` — build for production
- `npm run start` — start production build
- `npm run lint` — run ESLint
- `npm run scrape` — scrape pool pages to discover schedule PDF URLs; writes `public/data/discovered_pool_schedules.json`
- `npm run download-pdfs` — download schedule PDFs into `data/pdfs/`
- `npm run process-all-pdfs` — extract schedules from PDFs (uses per-PDF cache); writes `public/data/all_schedules.json`
- `npm run build-schedules` — runs `scrape` → `download-pdfs` → `process-all-pdfs`
- `npm run analyze-programs` — analyze raw vs canonical program names across the dataset

## How it works

1. Scrape: collect pool metadata and schedule PDF URLs from the SF Rec & Park site.
2. Download: fetch PDFs into `data/pdfs/`.
3. Extract: for each PDF, send content to the LLM with a strict schema (Zod). The system prompt instructs the model to:
	- Use precise time formats like `h:mm[a|p]` (e.g., `9:00a`, `2:15p`).
	- Split multi-program blocks into separate entries, capturing per-program lane counts.
	- Keep original program text for provenance (`programNameOriginal`).
4. Normalize: pipeline maps `programName` to a canonical label (taxonomy rules) while preserving the original. It also writes `poolNameTitle` and `poolShortName` using `public/data/pools.json`.
5. Render: the UI provides filters by program, pool, day, and time. The schedules page shows day-by-day program blocks with time ranges and per-program lane counts.

## Pool metadata mapping

- `public/data/pools.json` maps canonical pool titles to short names used in the UI. Example:

```json
{
	"Mission Aquatic Center": { "shortName": "Mission" }
}
```

- During processing, the pipeline computes `poolNameTitle` from the PDF name (title case) and looks up `poolShortName` from this mapping.

## Per-PDF extraction cache

- Raw structured extraction for each PDF is cached in `data/extracted/<pdf-base>.json`.
- By default, the pipeline prefers the cache to avoid re-prompting the LLM.
- Force a refresh with:

```
REFRESH_EXTRACT=1 npm run process-all-pdfs
```

## API

- `POST /api/extract-schedule` — runs a one-off extraction (primarily for development) and writes to `public/data/all_schedules.json`.

## Environment

- `.env.local` values:

```
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
# override MLK autodiscovery (optional)
MLK_PDF_URL=https://sfrecpark.org/DocumentCenter/View/25795
```

- Optional at runtime:

```
# when set to 1, re-extract PDFs even if a cache exists
REFRESH_EXTRACT=1
```

## License

MIT
