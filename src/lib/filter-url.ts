import { TAG_FACETS, tagFacet } from "@/lib/program-taxonomy";

// The grid's filters in the query string, one param per facet with the tag's
// slug alone: ?program=lap,family&audience=youth&pools=balboa,mlk&cell=thu-14.
// The facet is already in the param name, so repeating it on every value
// (and escaping the colon) only made links long and hard to read.

// the param each picker facet is written under, named for what the picker
// calls it rather than the taxonomy's internal facet id
export const FACET_PARAMS: Record<(typeof TAG_FACETS)[number]["id"], string> = {
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

function parseList(raw: string | null): string[] | null {
	return raw == null ? null : raw.split(",").filter(Boolean);
}

export function formatFilterQuery({
	tags,
	pools,
	cell,
}: {
	tags: string[];
	pools: string[];
	cell: string | null;
}): string {
	const parts: string[] = [];
	for (const facet of TAG_FACETS) {
		const slugs = tags
			.filter((t) => tagFacet(t) === facet.id)
			.map((t) => t.slice(facet.id.length + 1));
		if (slugs.length) parts.push(`${FACET_PARAMS[facet.id]}=${formatList(slugs)}`);
	}
	if (pools.length) parts.push(`pools=${formatList(pools)}`);
	if (cell) parts.push(`cell=${encodeURIComponent(cell)}`);
	return parts.join("&");
}

// null for either half the url says nothing about, so the caller can fall
// back to what it has stored
export function parseFilterQuery(params: Pick<URLSearchParams, "get">): {
	tags: string[] | null;
	pools: string[] | null;
} {
	let tags: string[] | null = parseList(params.get(LEGACY_TAGS_PARAM));
	for (const facet of TAG_FACETS) {
		const slugs = parseList(params.get(FACET_PARAMS[facet.id]));
		if (slugs == null) continue;
		tags = [...(tags ?? []), ...slugs.map((s) => `${facet.id}:${s}`)];
	}
	if (tags) tags = [...new Set(tags)];
	return { tags, pools: parseList(params.get("pools")) };
}
