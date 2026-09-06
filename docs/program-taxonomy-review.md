# Program taxonomy review — September 2026

**Status:** steps 1-3 are done, and step 3 took a different shape than proposed —
sessions are tagged by facet rather than ranked by a precedence table. See
"Tags, not one category" at the end. Steps 4 and 5 are still open. The figures in the
body of this document are the audit as it stood before any of it, and are left as the
record of what the PDFs actually contain.

An audit of the program names coming out of the pool PDFs, against the buckets in
`src/lib/program-taxonomy.ts`. Reproduce with:

```
npm run analyze-programs            # current all_schedules.json
npm run analyze-programs -- --history   # every committed revision since 2026-01-18
```

## What the data looks like

| | current (Fall 2026) | all 22 committed revisions |
| --- | --- | --- |
| sessions | 331 | 6,497 |
| unique raw names | 62 | 220 |
| buckets shown in the filter UI | 14 | 31 |
| sessions in no canonical bucket | 18 (5.4%) | 632 (9.7%) |

The PDFs are far noisier than the taxonomy assumes: 220 distinct raw strings collapse to
15 declared categories, and the same program is spelled six ways across pools and three
ways within one pool ("Senior/Therapy Swim", "Senior/ Therapy Swim", "Senior /Therapy
Swim (Main Pool-2 Lanes)"). The collapsing itself works well — the problems are at the
edges, and they are concentrated in summer schedules, where **20% of all sessions fell
outside the taxonomy** in every July and August revision.

## 1. Programs we are missing

`findCanonicalProgram` returns `null` for these, so they leak into the UI as their own
de-facto filter options, title-cased by the fallback path.

| Raw name | Sessions | Seen | Why it misses |
| --- | --- | --- | --- |
| `Summer LTS` (+ `^`, `*`, `(Small Pool)` variants) | 352 | Jul–Aug, 7 pools | "LTS" is in `ACRONYMS` but no rule expands it to Learn To Swim |
| `SFRPD Camps` | 72 | Jul–Aug, 3 pools | no camp rule at all |
| `Rentals (Club)` / `Rentals (Synchro)` / `RENTALS` | 122 | Jul–now, 2 pools | no rental rule; see §3 |
| `ADULT HOCKEY**` / `YOUTH HOCKEY**` / `RENTALS (10) SYNCHRO/HOCKEY` / `RENTALS (10) YOUTH HOCKEY` | 48 | Jan–Aug | underwater hockey has no category |
| `DEEP WATER H2O AEROBICS` | 13 | Jan–May | Water Exercise matches `water exercise`/`water aerobics`/`aqua`, not bare `aerobics` |
| `Piranha PC Swim*` | 9 | Jul–Aug, 2 pools | the club rule tests `piranhas` (plural); the singular form misses, while `Junior Piranha PC Swim *` matches only by accident via `junior` + `swim` |
| `*SMALL POOL-NVPS CLASS` | 12 | Jan–May | unknown program (North Beach?), never investigated |
| `BAYVIEW SAFETY SWIM & SPLASH` | 4 | May | one-off community program |

Summer LTS alone is the single largest program name in the corpus after Lap Swim.
Anyone filtering for "Swim Lessons" in July saw none of it.

## 2. Merges that lose information

These map to *a* bucket, but not the one a swimmer would expect, because the rule order
in `findCanonicalProgram` makes the first match win.

- **Family swim disappears into Lap Swim.** `REC FAMILY/LAP SWIM`, `FAMILY/LAP SWIM
  (2 lanes)`, `Family/Lap Swim` — 66 sessions — hit the `lap` test first. Filtering for
  Family Swim hides slots that are explicitly family slots.
- **Senior swim disappears into school programs.** `SENIOR / THERAPY / SFUSD SWIM`,
  `SENIOR / SFUSD` (35 sessions) hit the SFUSD test, which runs before the senior test.
  The mirror case, `REC/FAMILY-SENIOR SWIM` (13 sessions), goes the other way and hides
  the family half.
- **Parent & child is split three ways.** `Parent & Tot` → Parent & Child Swim,
  `Parent/Tot Lesson` → Swim Lessons (the `lesson` test runs first), `PARENT & CHILD
  FAMILY SWIM` → Family Swim (the `family` test runs first). Same program, three filters.
- **Youth swim team disappears into lessons.** `*YOUTH LESSONS/SWIM TEAM`,
  `Youth Lessons/Swim Team (Pre-registration Req.)` (80 sessions) never reach the team
  rule.
- **Self-guided exercise is filed under Senior.** `SELF GUIDED EXERCISE` and friends
  (~180 sessions) map to "Senior Swim / Therapy Swim" although the PDFs do not restrict
  them by age. It is closer to Water Exercise, and a swimmer scanning for a senior-only
  slot is misled.

The underlying issue is that these slots really are multi-program: one lane block that
serves rec, family and lap swimmers at once. A single canonical string cannot express
that. Either pick the primary consistently by an explicit precedence table, or let a
session carry more than one canonical tag and let the filters match any of them.

## 3. Rentals are the biggest current inconsistency

Fall 2026 has 27 rental sessions across 7 pools, and they land in **five** different
places:

| Raw | Bucket today |
| --- | --- |
| `Rentals (Masters)`, `Rental (Masters)` | Masters Swim Program |
| `Rental (Youth Teams)` | Youth Swim Teams / Club Teams |
| `Rentals (Club)` | `Rentals (club)` — fallback |
| `Rentals (Synchro)` | `Rentals (synchro)` — fallback |
| `RENTALS` | `Rentals` — fallback |

Meanwhile `permit`, `private` and `reserved` all map to "Pool Closure / Staff &
Departmental Use" — the same idea as a rental, filed as a closure. A rental is not open
to the public, so the useful distinction for a swimmer is "can I swim in this slot?",
not who rented it. Recommend one **Rentals / Private Use** category, with the renting
group kept in `programNameOriginal` for the tooltip, and dropping the rental-to-Masters
and rental-to-Youth-Teams mappings so the categories mean "a program you can join".

## 4. Categories that are declared but not enforced

`CANONICAL_CATEGORIES` is exported and never imported anywhere. The filter list in
`HomeFilters.tsx:53` is built from whatever strings are in the data, so an unmapped name
silently becomes a category. Nothing asserts that `findCanonicalProgram` returns a member
of the list, and there are no tests for the taxonomy at all.

Three declared categories have not appeared since May (Adult Water Polo, Adult
Synchronized Swimming, Youth Synchronized Swimming) — that's seasonal, they belong to
school-year schedules and should stay. But note the asymmetry: synchro has adult and
youth categories, water polo has only adult, and `Water Polo (Youth)` therefore lands in
Youth Swim Teams. Both `synchronized` and `water polo` branches also `return null`
instead of falling through when they can't tell adult from youth, which is how
`RENTALS (10) SYNCHRO/HOCKEY` ended up unmapped.

## 5. Naming and display nits

- `Swim Lessons (General/Youth/Community)` is a schema label, not a user-facing one, and
  `HomeFilters.tsx:388` expands slashes for display, so the filter chip reads
  "Swim Lessons (General / Youth / Community)". Suggest `Swim Lessons`, with adult
  lessons staying separate as they are now.
- `High School Swim Programs` is the bucket for all SFUSD usage, including elementary
  classes (`*SMALL POOL-SFUSD CLASS`). `School Programs (SFUSD)` describes it better.
- `Pool Closure / Staff & Departmental Use` mixes "the pool is shut" with "staff are
  using it". Both mean "not available", but the first belongs with the closure banner
  work, not with programs.
- `toTitleCase` mis-cases any token with leading punctuation, because it splits on
  whitespace, `/`, `&` and `-` only: `Rentals (Club)` → `Rentals (club)`,
  `Youth Lessons (Pre-registration Req.)` → `Youth Lessons (pre-Registration Req.)`. This
  is visible today in the filter list for every unmapped name. It also splits inside
  hyphenated words, so `Learn-To-Swim` → `Learn-to-Swim`.
- One extraction artifact is in the corpus: `SWIM LESSONS籠` (May 22). Worth a guard in
  the extraction validation rather than the taxonomy.

## Recommended order of work

1. ~~Fix the leaks that cost the most coverage: `LTS`, camps, bare `aerobics`, singular
   `piranha`. Four rules, ~440 historical sessions.~~ Done. Camps became its own category;
   the rest folded into existing ones. What is still unmapped is underwater hockey (32
   sessions), `*SMALL POOL-NVPS CLASS` (12, still unidentified) and
   `BAYVIEW SAFETY SWIM & SPLASH` (4) — all school-year names that will return in the
   next Fall PDFs.
2. ~~Consolidate rentals into one category and stop routing them into program categories.~~
   Done, as `Rentals / Private Use`, and `private`/`permit`/`reserved` moved there from the
   closure bucket. One consequence to watch: every Fall 2026 masters session is a rental,
   so `Masters Swim Program` now has no sessions in the current schedules and drops out
   of the filter list. That is right if a category means "a program you can join", but a
   swimmer looking for masters practice will no longer find it by filter — only in the
   session tooltip, which still shows `Rentals (Masters)`. If that trade is wrong, the fix
   is to make "rented" a flag on a session rather than a category of its own.
3. Add an explicit precedence table for multi-program slots (or multi-tag sessions),
   which fixes the family/lap, senior/SFUSD and parent/tot splits at the root.
4. Make `CANONICAL_CATEGORIES` authoritative: have `findCanonicalProgram` return only its
   members, build the filter list from it, and add tests pinning the real raw names in
   this document.
5. Rename the three awkward category labels and fix `toTitleCase`.

Steps 1–3 change the data, so they need `npm run renormalize-programs` afterwards, and
the changelog for that run will look like a wholesale rewrite — worth doing on its own
commit so the diff is readable.

## Tags, not one category

Every session now carries `tags` in three facets, derived in code from the raw PDF
title by `deriveTags()`:

| Facet | What it answers | Examples |
| --- | --- | --- |
| `activity:` | what is happening in the water | `lap`, `family`, `rec`, `senior`, `therapy`, `lessons`, `swim-team`, `masters`, `synchro`, `parent-tot`, `camp` |
| `audience:` | who it is for, when the PDF says | `adult`, `youth`, `senior`, `parent-child`, `high-school`, `preschool` |
| `access:` | how you get in | `drop-in`, `registration`, `rental`, `school-group`, `shared-pool`, `contact-coach`, `closed` |

The vocabulary is closed and the derivation is regex over the raw title, so an unseen
name yields fewer tags, never a new one. What this fixes, from the audit above:

- `REC/FAMILY/LAP SWIM` is `activity:rec` + `activity:family` + `activity:lap`, and
  shows up under all three filters instead of only Lap Swim.
- `SENIOR / THERAPY / SFUSD SWIM` keeps its senior and therapy tags alongside
  `access:school-group`, rather than being filed as a high-school program.
- `Rentals (Masters)` is `activity:masters` + `access:rental`. That resolves the trade
  the rentals consolidation forced: the session is findable as masters swimming again,
  and still marked as water the public cannot join.
- The footnote symbols stop being thrown away. The schedules print a SYMBOL KEY — for
  Garfield, `(*)` registration required, `(**)` shared pool, `(♦)` contact team coaches
  — and those become access tags. Only the markers that agree across pools are mapped;
  the per-PDF legends are still unread, which is the remaining work here.

Filtering is OR within a facet and AND across facets, so "Lap swim" + "Drop in, no
sign-up" means lap swim you can walk into.

### Titles

Each session also carries `title`: the PDF's own words with the markers and stray
spacing cleaned up, `Summer LTS^` becomes `Summer LTS`, `SMALL POOL- NVPS CLASS`
becomes `Small Pool - NVPS Class`. The UI shows that instead of the invented category
name, so someone scanning for "LTS" or "Synchro" finds the words they are looking for.
The untouched string stays in `programNameOriginal`, the category in `programName`.

### The category field is still there

`programName` / `programNameCanonical` stay for now: `scripts/changelog.ts` keys its
diff on `programName`, `schedule-validation.ts` names it in error messages, and the
grid reads it nowhere else since the picker moved to tags. Dropping it means giving the
changelog a stable key that is not a category name — `title` plus day plus time is the
obvious candidate — but the first run after the switch would report every session as
changed, so it wants its own commit and a look at the changelog output either side of it.
