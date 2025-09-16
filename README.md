# SF Pools Schedule Viewer

Centralized, searchable schedules for San Francisco public swimming pools.

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

- PDFs are not committed. Place any local PDFs under `data/pdfs/` if needed for testing.
- For Milestone 1 we extract:
	- `poolName`, `address`, `sfRecParkUrl`, `pdfScheduleUrl`
	- `scheduleLastUpdated`, `scheduleSeason`, `scheduleStartDate`, `scheduleEndDate`
	- `lanes`
	- `programs[]` with `programName`, `dayOfWeek`, `startTime`, `endTime`, `notes`
- Program name normalization is deferred (M3).
- Writing `public/data/all_schedules.json` at runtime is fine locally; on Vercel it is ephemeral. We'll address durable storage later.

## Scripts

- `npm run dev` — start Next.js dev server
- `npm run build` — build for production
- `npm run start` — start production build
- `npm run lint` — run ESLint

## License

MIT
