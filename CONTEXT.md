# SF Pools

A site that gathers the weekly schedules San Francisco Rec & Park prints for its public pools, and answers when and where someone can swim.

## Schedules

**Pool**:
One body of water with its own schedule. North Beach's cool and warm pools are two pools at one facility.
_Avoid_: facility, location

**Schedule**:
The weekly timetable one PDF prints for a pool, with the dates it says it runs from and to. A pool has one current schedule, and at most one upcoming schedule.
_Avoid_: timetable, season

**Upcoming schedule**:
A schedule its facility page already lists that starts after the current one: next season's PDF, or the next part of a split season. It takes over on its start date.
_Avoid_: future schedule, next schedule

**Program**:
One line of a schedule: a named activity at a pool on a weekday, from a start time to an end time ("Lap Swim, Mondays 6:00a–9:00a"). It repeats every week the schedule runs, and closures never change it.
_Avoid_: class, activity, event

**Session**:
One program on one date ("Lap Swim, Mon Oct 27, 6:00a–9:00a"). Closures remove sessions; a view shows sessions.
_Avoid_: slot, occurrence, program

**Program category**:
The one group a program is filed under for filtering (lap swim, family swim, swim teams). The Balboa "Family/Lap Swim" program is the only one filed under two.
_Avoid_: program type, audience

## Closures

**Alert closure**:
A closure read from the notice on a pool's facility page, usually open-ended or spanning weeks ("closed for maintenance through Nov 1"). Only one marked to hide programs removes sessions.
_Avoid_: facility closure, alert

**Scheduled closure**:
A closure a schedule's PDF lists in its notes, for a whole day or some hours of it (holidays, staff training).
_Avoid_: PDF closure, holiday

**City holiday**:
A day on San Francisco's official holiday list (sf.gov), which closes every pool. The pool calendar treats one as a scheduled closure for the whole day, unless the pool's PDF already lists a closure on that date or names the same holiday a few days away.
_Avoid_: federal holiday

**Pool calendar**:
The one place that decides which sessions a pool has on a date, and why it has none: an alert closure, a scheduled closure (including city holidays), or a date outside its schedule. On each date it uses the schedule in force then, current or upcoming.
_Avoid_: availability, open hours
