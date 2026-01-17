# SF Pools Automation & Improvement Plan

This document outlines the plan for implementing automated schedule updates and other improvements to the SF Pools Schedule Viewer.

## Overview

The goal is to create an automated pipeline that:
1. Detects when pool schedule PDFs have changed
2. Extracts updated schedule data using the LLM
3. Commits changes to the repository (triggering Vercel redeploy)
4. Optionally notifies when updates occur

Future phases will add a Convex database for real-time features.

---

## Phase 1: GitHub Actions Automation

**Goal**: Automated weekly schedule updates with change detection.

### Tasks

- [ ] **1.1** Create `.github/workflows/update-schedules.yml`
  - Scheduled cron trigger (weekly, e.g., Monday 8am UTC)
  - Manual `workflow_dispatch` trigger for on-demand runs
  - Node.js 22 setup
  - Run `npm run build-schedules`
  - Detect changes in `public/data/`
  - Commit and push if changes detected

- [ ] **1.2** Add GitHub repository secret
  - `GOOGLE_GENERATIVE_AI_API_KEY` — the Google Generative AI API key

- [ ] **1.3** Update `.gitignore` to ensure `data/pdfs/` and `data/extracted/` are ignored
  - PDFs are downloaded fresh each run
  - Extracted cache is per-run, not committed

### Files Created/Modified

- `.github/workflows/update-schedules.yml` (new)
- `.gitignore` (verify/update)

---

## Phase 2: Incremental Extraction with Hash Tracking

**Goal**: Only re-extract PDFs that have actually changed, reducing LLM API costs.

### Tasks

- [ ] **2.1** Extend `discovered_pool_schedules.json` schema
  - Add `pdfHash` field (SHA256 of PDF content)
  - Add `lastExtracted` timestamp

- [ ] **2.2** Modify `scripts/downloadPdf.ts`
  - Compute SHA256 hash after downloading each PDF
  - Store hash in a manifest file (`data/pdf-manifest.json`)

- [ ] **2.3** Modify `scripts/process-all-pdfs.ts`
  - Load previous manifest (if exists)
  - Compare current hash to previous hash
  - Skip extraction if hash unchanged AND cached extraction exists
  - Update manifest after successful extraction

- [ ] **2.4** Create `data/pdf-manifest.json` structure
  ```json
  {
    "balboa-pool": {
      "pdfUrl": "https://...",
      "pdfHash": "sha256:abc123...",
      "lastDownloaded": "2025-01-16T00:00:00Z",
      "lastExtracted": "2025-01-16T00:00:00Z"
    }
  }
  ```

### Files Created/Modified

- `scripts/downloadPdf.ts` (modify)
- `scripts/process-all-pdfs.ts` (modify)
- `data/pdf-manifest.json` (new, gitignored initially — or committed for tracking)

---

## Phase 3: Diff/Changelog Generation

**Goal**: Track what changed between schedule updates for visibility and error detection.

### Tasks

- [ ] **3.1** Before overwriting `all_schedules.json`, compute diff
  - Compare program counts per pool
  - Detect added/removed programs
  - Detect time changes

- [ ] **3.2** Write changelog to `data/changelog/YYYY-MM-DD.json`
  - Summary of changes per pool
  - Flag large changes (>20% difference) as potential errors

- [ ] **3.3** Add summary to GitHub Actions output
  - Print changelog summary in workflow logs

### Files Created/Modified

- `scripts/process-all-pdfs.ts` (modify)
- `data/changelog/` (new directory)

---

## Phase 4: Notifications

**Goal**: Get notified when schedules update or when errors occur.

### Tasks

- [ ] **4.1** Add Pushover integration
  - Create `scripts/notify.ts`
  - Send notification on successful update with change summary
  - Send notification on extraction failure

- [ ] **4.2** Add environment variables
  - `PUSHOVER_USER_KEY`
  - `PUSHOVER_API_TOKEN`

- [ ] **4.3** Integrate into GitHub Actions workflow
  - Call notify script after successful commit
  - Call notify script on workflow failure

### Files Created/Modified

- `scripts/notify.ts` (new)
- `.github/workflows/update-schedules.yml` (modify)

---

## Phase 5: Pool Alerts Integration

**Goal**: Scrape and display pool closure alerts from SF Rec & Park.

### Tasks

- [ ] **5.1** Extend `scripts/scrape-pool-info.ts`
  - Scrape alert banner from pool listing page
  - Extract per-pool alerts if available

- [ ] **5.2** Write alerts to `public/data/alerts.json`

- [ ] **5.3** Display alerts in UI
  - Banner component on homepage
  - Per-pool alerts on schedule cards

### Files Created/Modified

- `scripts/scrape-pool-info.ts` (modify)
- `public/data/alerts.json` (new)
- `src/components/AlertBanner.tsx` (new)

---

## Phase 6: Convex Database Migration

**Goal**: Move schedule data to Convex for real-time updates and future user features.

### Why Convex

- Schema and functions live in the codebase (`convex/` directory)
- No ORM or raw SQL — TypeScript functions with type-safe queries
- Real-time subscriptions built-in
- Generous free tier

### Tasks

- [ ] **6.1** Initialize Convex in the project
  - `npx convex init`
  - Configure `convex.json`

- [ ] **6.2** Define schema in `convex/schema.ts`
  ```typescript
  pools: defineTable({
    name: v.string(),
    shortName: v.optional(v.string()),
    address: v.optional(v.string()),
    sfRecParkUrl: v.optional(v.string()),
  }),
  schedules: defineTable({
    poolId: v.id("pools"),
    pdfUrl: v.string(),
    pdfHash: v.string(),
    season: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    extractedAt: v.number(),
  }),
  programs: defineTable({
    scheduleId: v.id("schedules"),
    name: v.string(),
    nameOriginal: v.string(),
    dayOfWeek: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    lanes: v.optional(v.number()),
    notes: v.optional(v.string()),
  }),
  ```

- [ ] **6.3** Create Convex functions
  - `convex/pools.ts` — queries for pools, schedules, programs
  - `convex/ingest.ts` — mutation to upsert schedule data

- [ ] **6.4** Modify extraction pipeline
  - After extraction, call Convex mutation to store data
  - Keep JSON file as backup/cache

- [ ] **6.5** Update UI to query Convex
  - Replace static JSON reads with Convex queries
  - Add real-time updates where beneficial

- [ ] **6.6** Add Convex environment variables
  - `CONVEX_DEPLOYMENT`
  - `CONVEX_DEPLOY_KEY` (for CI)

### Files Created/Modified

- `convex/` directory (new)
- `convex/schema.ts` (new)
- `convex/pools.ts` (new)
- `convex/ingest.ts` (new)
- `scripts/process-all-pdfs.ts` (modify)
- `src/app/page.tsx` (modify)
- `src/app/schedules/page.tsx` (modify)

---

## Phase 7: UI Improvements

**Goal**: Address items from `To do.md` and improve user experience.

### Tasks

- [ ] **7.1** Pool badges — visual identifiers per pool
- [ ] **7.2** Info icon for long notes (tooltip/popover)
- [ ] **7.3** Simplify day filter — no default selection, show all
- [ ] **7.4** Handle "Pool Closed" programs differently
- [ ] **7.5** Link from schedule view back to filter view
- [ ] **7.6** Cool vs. warm pool badge
- [ ] **7.7** Clean up `/now` page

---

## Phase 8: Testing & Reliability

**Goal**: Add tests to prevent regressions.

### Tasks

- [ ] **8.1** Unit tests for `program-taxonomy.ts`
- [ ] **8.2** Integration tests for scraper (mocked responses)
- [ ] **8.3** Snapshot tests for extraction output format
- [ ] **8.4** Pin dependencies in `package.json` (replace `"latest"`)

---

## Implementation Order

| Phase | Priority | Effort | Dependencies |
|-------|----------|--------|--------------|
| 1. GitHub Actions | High | Low | None |
| 2. Incremental Extraction | High | Medium | None |
| 3. Diff/Changelog | Medium | Low | Phase 2 |
| 4. Notifications | Medium | Low | Phase 1 |
| 5. Alerts Integration | Medium | Low | None |
| 6. Convex Migration | Low | High | Phases 1-3 stable |
| 7. UI Improvements | Low | Medium | None |
| 8. Testing | Medium | Medium | None |

---

## Environment Variables Summary

| Variable | Where | Purpose |
|----------|-------|---------|
| `GOOGLE_GENERATIVE_AI_API_KEY` | `.env.local`, GitHub Secret | LLM API access (Gemini Flash) |
| `PUSHOVER_USER_KEY` | GitHub Secrets | Notifications |
| `PUSHOVER_API_TOKEN` | GitHub Secrets | Notifications |
| `CONVEX_DEPLOYMENT` | `.env.local`, Vercel | Convex project |
| `CONVEX_DEPLOY_KEY` | GitHub Secrets | CI deployments |

---

## Notes

- PDFs are not committed to the repository
- Extracted JSON cache (`data/extracted/`) can be committed for faster local dev, or gitignored
- The `pdf-manifest.json` tracks hashes to enable incremental extraction
- Convex migration is optional — the static JSON approach works well for the current scale
