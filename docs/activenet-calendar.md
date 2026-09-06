# The ActiveNet drop-in calendar (anc.apm.activecommunities.com)

Notes from investigating the SF Rec & Park calendar page at
`anc.apm.activecommunities.com/sfrecpark/calendars?defaultCalendarId=3&locationId=85,31`,
to see whether it is a better source than the PDFs, and what it does and does not carry.
Checked 2026-09-06 against site version 26.11.66.

## How the page gets its data

The page is a client-side React app; the schedule is not in the HTML. It calls three
JSON endpoints under `/sfrecpark/rest/onlinecalendar/`, with `window.__csrfToken` from
the page as `X-CSRF-Token` and the session cookie set by loading the page first:

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/onlinecalendar/calendars` | GET | lists the calendars — `3` = "Drop-in - Pool Schedule", `1` = "Drop-in - Recreation" |
| `/onlinecalendar/filters` | POST `{calendar_id}` | centers, activities, categories, facilities and the calendar's date window |
| `/onlinecalendar/multicenter/events` | POST `{calendar_id, center_ids, display_all}` | the events themselves |

`eventdetails/{id}`, `centerdetails/{id}` and `activity-details/{id}` exist for the
detail popovers. The `locationId=85,31` in the URL is `center_ids`; `defaultCalendarId=3`
is `calendar_id`.

Underneath, each calendar entry is an ActiveNet **activity** that staff flagged onto the
calendar, with its times coming from the facility booking. So the calendar is a view onto
the registration system, not a separate schedule — which is why the entries carry
activity ids, fees and a registration URL.

## Is it only pay classes?

Neither, exactly. Calendar 3 is **drop-in sessions only** — the public swim blocks. The
prices attached are drop-in admission (Balboa Family Swim: `$8.38` adult, `$2.09` youth),
not class tuition. Registered classes are not on this calendar at all.

Those live in a different part of the same system, the activity catalog at
`POST /sfrecpark/rest/activities/list`. Filtering that to the Aquatics category returns
73 activities: 33 `Drop-in:` ones (the same ones the calendar shows) and 40 registered
ones that never appear on the calendar — `Learn to Swim - Level 1` ($83.78),
`Parent and Tot Swim` ($87.97), `Adult Swim - Improving Skills` ($142.43),
`Coffman Catfish Swim Team`, `Garfield Gators Swim Team`, `King Barracuda Swim Team`.

So the pool PDFs are the *superset*: they show the drop-in blocks **and** the lessons,
teams, SFUSD slots and rentals that occupy the water the rest of the time. The calendar
shows only the part of that you can walk in and pay for.

## Overlap with our PDF data

Comparing the calendar's 535 events (its full ~3-week window) against
`all_schedules.json` by pool, day and start time:

| Pool | ActiveNet events | our drop-in sessions | drop-in sessions with no ActiveNet counterpart |
| --- | --- | --- | --- |
| Balboa | 63 | 22 | 2 |
| Coffman | 75 | 23 | 0 |
| Hamilton | 87 | 29 | 0 |
| MLK | 87 | 29 | 2 |
| Mission | 81 | 27 | 2 |
| Rossi | 69 | 24 | 2 |
| Garfield | 67 | 23 | 10 |
| North Beach | 2 | 39 | 38 |
| Sava | 0 | 19 | 19 |

For the six pools ActiveNet covers properly, the agreement is essentially exact: every
one of Balboa's, Coffman's, Hamilton's and MLK's calendar slots lands on a day and time
we already have from the PDF. Going the other way, 172 of our 331 sessions have an
ActiveNet drop-in at the same day and time; the 159 that don't break down as:

```
 34  Swim Lessons          31  Lap Swim (mostly Sava + North Beach)
 27  Rentals / Private Use 22  Senior/Therapy (mostly Sava + Garfield)
 18  Family Swim           11  High School / SFUSD
 11  Adult Swim Lessons     4  Water Exercise      1  Special Olympics
```

The lessons, rentals and SFUSD lines are the structural gap — ActiveNet's calendar will
never carry them. The Lap/Senior/Family lines are almost entirely the three pools it
covers badly, not disagreement about the pools it covers well.

Program names line up closely with the PDFs, typos included: `Drop-in: Self-Guided
Exercise`, `Drop-in: Senior/Therapy Swim`, `Drop-in: Water Exercise (Instructor Lead)`,
and at Rossi `Drop-in: Water Expercise (Instructor Lead)`. Same authors, same vocabulary.
Nothing here resolves the `NVPS` question.

## Caveats if we ever use it

- **Coverage is incomplete.** Sava exists as a center in the system (`SAVA SWIMMING POOL`)
  but has zero activities and is not on the calendar. North Beach has exactly one drop-in
  activity, a warm-pool water exercise class, against the 39 sessions its PDFs list. Two
  non-pools are on the calendar: Garfield Square (Storytime) and Potrero Hill (Pickleball).
- **The window is fixed and short.** `calendar_period` came back as 2026-08-31 →
  2026-09-21, and passing `start_date`/`end_date` in the events body changed nothing. It
  is about three weeks; the PDFs give a whole season.
- **Garfield is the one place ActiveNet is fresher than us.** It lists 67 Fall drop-in
  events from Sep 8, while our Garfield data is still the Summer 2026 PDF. That makes the
  calendar useful as a *staleness check* even where it is not good enough as a source.
- **Two id spaces.** The calendar's `center_id` (Balboa 85, Rossi 107) is not the activity
  search's location id (Rossi 165, Sava 166). Don't mix them.
- Requests need a session cookie and the CSRF token scraped from a page load, and the
  endpoints are undocumented internals that can change with the site version.

## What it would actually be good for

Not as a schedule source — it covers 6 of our 10 pools, three weeks at a time, and omits
half of what the PDFs say. It is worth more as a cross-check and as an enrichment:

1. **Freshness signal.** If the calendar shows Fall drop-ins for a pool whose PDF we still
   have as Summer, our scrape is stale. Garfield is exactly that case today.
2. **Drop-in prices.** Per-age admission prices, per program, which the PDFs never state.
3. **Registration links.** `activity_detail_url` per program, and the activity catalog
   would let us answer "how do I sign up for these lessons?" — the question our schedule
   view currently leaves hanging.
4. **A confirmation that a slot is public.** A PDF slot with a matching drop-in activity
   is one anyone can show up for. That is the same distinction the Rentals / Private Use
   category is trying to draw, arrived at independently.
