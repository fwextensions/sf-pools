# About SF Pools

Every public pool schedule in San Francisco, in one place.

## What this is

The [San Francisco Recreation and Park Department](https://sfrecpark.org) runs nine public pools, and each one posts its schedule as a separate PDF. Finding a lap swim that fits your morning routine means opening several PDFs and comparing them by hand. This site does that comparison for you.

The [week grid](/) shows which pools have a program at each hour of the week, [now & soon](/now) shows what’s open at the moment, and the [full schedules](/schedules) list every session at every pool.

## Where the schedules come from

Every Friday, a script checks each pool’s page on the Rec & Parks site, downloads any schedule PDF that has changed, and has an AI model read it into structured data. It also picks up the closure and alert notices posted on those pages.

Each update is checked for signs of a bad read before it goes live. If one pool’s schedule looks wrong, that pool keeps last week’s data while the others update. You can see what changed in each update on the [schedule changes](/changes) page.

## Check before you go

This is an independent project, not a city site. Reading PDFs automatically can get details wrong, and pools change hours, close for maintenance, or cancel sessions at short notice. Before you head out, confirm the schedule on the pool’s page at [SF Rec & Parks](https://sfrecpark.org/482/Swimming-Pools).

## The pools

<!-- the list of pools goes here, from data/pools.json -->

## For AI assistants

AI assistants can ask this site what’s open now, what’s coming up, or which sessions match a pool, program, day or time. Add `{SITE_URL}/mcp` as a custom connector (it’s an MCP server, no sign-in needed), or fetch the same answers as JSON from [/api/sessions](/api/sessions?when=now). [llms.txt](/llms.txt) describes both.

## The code

The site and the pipeline behind it are open source on [GitHub](https://github.com/fwextensions/sf-pools). If a schedule looks wrong or something doesn’t work, [opening an issue there](https://github.com/fwextensions/sf-pools/issues/new) is the best way to report it.
