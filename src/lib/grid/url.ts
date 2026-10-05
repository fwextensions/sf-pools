import { TAG_FACETS, tagFacet } from "@/lib/program-taxonomy";
import { validatePoolId } from "@/lib/pool-mapping";
import { pickerTags } from "./filters";
import { DAYS, FIRST_HOUR, LAST_HOUR, type GridCell } from "./sessions";

// The grid's state in the query string, one param per facet with the tag's
// slug alone: ?program=lap,family&audience=youth&pools=balboa,mlk&cell=thu-14.
// The facet is already in the param name, so repeating it on every value
// (and escaping the colon) only made links long and hard to read.

export type GridUrlState = { tags: string[]; pools: string[]; cell: GridCell | null };

// the param each picker facet is written under, named for what the picker
// calls it rather than the taxonomy's internal facet id
const FACET_PARAMS: Record<(typeof TAG_FACETS)[number]["id"], string> = {
	activity: "program",
	audience: "audience",
};

// the pre-facet format, ?tags=activity:lap,audience:youth, still read so
// links already shared keep working
const LEGACY_TAGS_PARAM = "tags";

// commas stay literal: URLSearchParams would escape them to %2C, which is
// legal but turns every list back into noise
function formatList(values: string[]): string {
	return values.map(encodeURIComponent).join(",");
}

function parseList(raw: string | null): string[] {
	return raw == null ? [] : raw.split(",").filter(Boolean);
}

// ?cell=thu-14 — the three-letter day the grid already labels its columns
// with, and the hour the selection starts on
function formatCell(cell: GridCell): string {
	return `${cell.day.slice(0, 3).toLowerCase()}-${cell.hour}`;
}

function parseCell(raw: string | null): GridCell | null {
	if (!raw) return null;
	const [abbr, rest] = raw.toLowerCase().split("-");
	const day = DAYS.find((d) => d.slice(0, 3).toLowerCase() === abbr);
	const hour = Number(rest);
	if (!day || !Number.isInteger(hour) || hour < FIRST_HOUR || hour > LAST_HOUR) return null;
	return { day, hour };
}

export function formatGridQuery({ tags, pools, cell }: GridUrlState): string {
	const parts: string[] = [];
	for (const facet of TAG_FACETS) {
		const slugs = tags
			.filter((t) => tagFacet(t) === facet.id)
			.map((t) => t.slice(facet.id.length + 1));
		if (slugs.length) parts.push(`${FACET_PARAMS[facet.id]}=${formatList(slugs)}`);
	}
	if (pools.length) parts.push(`pools=${formatList(pools)}`);
	if (cell) parts.push(`cell=${encodeURIComponent(formatCell(cell))}`);
	return parts.join("&");
}

// anything the grid can't show is dropped: tags from facets the picker
// doesn't offer, unknown pools, a cell outside the grid's hours
export function parseGridQuery(params: Pick<URLSearchParams, "get">): GridUrlState {
	const tags = parseList(params.get(LEGACY_TAGS_PARAM));
	for (const facet of TAG_FACETS) {
		tags.push(...parseList(params.get(FACET_PARAMS[facet.id])).map((s) => `${facet.id}:${s}`));
	}
	return {
		tags: pickerTags([...new Set(tags)]),
		pools: parseList(params.get("pools")).filter((id) => validatePoolId(id)),
		cell: parseCell(params.get("cell")),
	};
}

// The query string the grid last wrote in this document, or null until it has
// written one.
//
// The url is the only place the grid's state lives. Until the grid has
// written it, the address bar holds what the reader arrived on, which is what
// makes a shared link work. After that the address bar can't be trusted on a
// later mount: writeGridUrl uses replaceState, which the App Router never
// hears about, so tabbing to another section and back restores whatever
// query string the route was last navigated to, and that resurrected filters
// the reader had just cleared. So a remount reads back what the grid itself
// last wrote.
//
// Module scope, not a ref: it is per document, and has to outlive the
// unmount that a section change puts the grid through.
let lastWrittenQuery: string | null = null;

// what the grid starts from: the url the reader arrived on, or what the grid
// last wrote if it has already been mounted in this document
export function initialGridState(searchParams: Pick<URLSearchParams, "get">): GridUrlState {
	return parseGridQuery(lastWrittenQuery == null ? searchParams : new URLSearchParams(lastWrittenQuery));
}

export function writeGridUrl(pathname: string, state: GridUrlState): void {
	const qs = formatGridQuery(state);
	lastWrittenQuery = qs;
	// the native history call, not router.replace: the router treats a new
	// query as a navigation, fetching the page from the server and
	// re-rendering it on every click, and scrolling to the top besides.
	// Next keeps useSearchParams in step with replaceState on its own
	window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
}
