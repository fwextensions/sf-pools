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

## Header Water Animation

The animated pool header is a two-pass WebGL pipeline run by p5.js in `src/components/SFPoolsAnimation.tsx`.

### How it works

**Pass 1 — simulation (`src/components/water-sim.frag`).** A real water heightfield is simulated with the discrete 2D wave equation over a small float texture:

```
next = (2·h − hPrev + WAVE_SPEED · laplacian(h)) · DAMPING
```

Each texel stores the current height in the red channel and the previous frame's height in green; two framebuffers ping-pong so one frame's output is the next frame's input. Everything watery — rings expanding, waves interfering, reflections off the pool edges (clamped texture sampling acts as walls) — emerges from this one equation. Nothing else animates the ripples.

Disturbances are *injected* into the field each frame:

- **Pointer** — a Gaussian dent pressed into the surface, swept along the segment the pointer traveled since the last frame so fast swipes carve a continuous trough. Injection pulls the surface *toward* a target depth (`mix`) rather than adding, so holding the pointer in place can't stack the dent infinitely deep.
- **Scroll** — scrolling shoves the pool, and the water's inertia piles it against the leading edge as a full-width line swell (bottom edge when accelerating downward, top when decelerating or scrolling up). It responds to scroll *acceleration*, not velocity — a steady scroll glides silently — and injections are rate-limited (`SCROLL_COOLDOWN_MS`) so scrubbing the scrollbar can't pump the pool into chaos. Per-column hash jitter roughens the line so it doesn't read as a ruler-straight artifact.

The texture is sized in CSS pixels (`SIM_TEXEL_CSS_PX`, ~3px per texel, square on screen) so ripples have the same on-screen wavelength and speed on every device, from phone to ultrawide.

**Pass 2 — display (`src/components/header-shader.frag`).** Renders the tiles, "SF POOLS" text, and lighting. It samples the heightfield (height + gradient via central differences) and combines it with a cheap analytic ambient swell (four drifting sines). The combined wave gradient drives everything, which is what makes the effects feel physically coherent:

- **refraction** — tile UVs are displaced along the wave slope
- **caustics** — a procedural light pattern, its sampling position bent by the same slope, with per-channel falloff exponents faking chromatic dispersion at the fringes
- **crest/trough lighting** — raised water brightens, troughs darken, through saturating `x/(1+x)` curves so extreme waves can't blow out to white or black
- **specular glints** — a `pow(dot(N, L), 64)` sparkle on slopes tilted toward the light, scaled by local ripple energy so glints fade with the wave rather than snapping off

### Tuning guide

| Knob | Where | Effect |
| --- | --- | --- |
| `WAVE_SPEED` | water-sim.frag | Ring travel speed. **Must stay < 0.5** (CFL stability limit) |
| `DAMPING` | water-sim.frag | How long waves live; toward 1.0 = longer sloshing |
| `SIM_SUBSTEPS` | SFPoolsAnimation.tsx | Sim steps per frame; overall simulation speed |
| `SIM_TEXEL_CSS_PX` | SFPoolsAnimation.tsx | Master scale: bigger = chunkier, softer water everywhere |
| `SIM_IMPULSE_RADIUS` | SFPoolsAnimation.tsx | Size of the pointer's dent, in sim texels |
| `impulseAmp` formula | SFPoolsAnimation.tsx | How hard moves/clicks press into the water |
| `SCROLL_AMP_PER_PX`, `SCROLL_AMP_MAX` | SFPoolsAnimation.tsx | Scroll slosh strength per unit of scroll acceleration, and its cap |
| `SCROLL_COOLDOWN_MS` | SFPoolsAnimation.tsx | Min gap between scroll sloshes; higher = calmer under scrubbing |
| `SIM_GRAD_SCALE` | header-shader.frag | How strongly ripples refract tiles / bend caustics / glint |
| `SIM_HEIGHT_SCALE` | header-shader.frag | How strongly crests brighten and troughs darken |
| refraction `0.035` | header-shader.frag main() | Overall "looking through water" distortion |
| caustic coupling `0.6` | header-shader.frag main() | How much waves warp the caustic pattern |
| dispersion exponents `1.25 / 0.8` | header-shader.frag main() | Chromatic fringing around caustic highlights |
| glint constants | header-shader.frag main() | Sparkle tightness (`64`), threshold (`0.05`), brightness (`0.4`) |

Two structural constraints worth knowing before tweaking: sim texels must stay square on screen (the JS derives texture height from the clamped width — don't size the two axes independently) or waves propagate anisotropically; and `windowResized` deliberately ignores height-only resizes because iOS fires them as browser chrome collapses during scrolling — recreating the framebuffers there would blank the water mid-slosh.

## License

MIT
