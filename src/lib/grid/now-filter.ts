// What Now & Soon counts, from the grid's filters, so the one picker drives
// both. A picked program counts just what it picks; with none picked, every
// program counts except those not open to the public (rentals, school use,
// camps, closures), which would fill Now with pools nobody can swim at.
import { PROGRAM_CATEGORIES, tagLabel } from "@/lib/program-taxonomy";
import type { NowSoonFilter } from "@/lib/now-soon";
import type { Session } from "@/lib/sessions";
import type { GridFilter } from "./filters";

const PRIVATE_TAGS = PROGRAM_CATEGORIES.filter((c) => c.group === "private").map((c) => `program:${c.id}`);

function isPublic(s: Pick<Session, "tags">): boolean {
	return !PRIVATE_TAGS.some((t) => s.tags.includes(t));
}

/** every pool's public sessions: the grid with nothing picked */
export const PUBLIC_SESSIONS: NowSoonFilter = { matches: isPublic, noun: "sessions" };

// the pool filter isn't here: Now & Soon lists just the picked pools, rather
// than every pool with nothing to say about the rest
export function nowSoonFilter({ urlTags, matchesTags }: Pick<GridFilter, "urlTags" | "matchesTags">): NowSoonFilter {
	if (!urlTags.length) return PUBLIC_SESSIONS;
	return {
		matches: matchesTags,
		// "No lap swim this week" when one program is picked
		noun: urlTags.length === 1 ? tagLabel(urlTags[0]!).toLowerCase() : "sessions",
	};
}
