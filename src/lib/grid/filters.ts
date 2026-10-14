// The grid's program and pool filters: which tags the picker offers, what a
// selection matches, and how the toggles change it. Selections are tag ids
// from the closed vocabulary in program-taxonomy, so they survive the churn
// in the PDFs' own wording.
import { CATEGORY_GROUPS, PROGRAM_CATEGORIES, tagFacet, tagLabel } from "@/lib/program-taxonomy";
import type { Session } from "@/lib/sessions";

// the tags the picker offers, one per program category
const PICKER_TAGS = new Set<string>(PROGRAM_CATEGORIES.map((c) => `program:${c.id}`));

// drop any tag the picker doesn't offer, so an old link with an activity or
// audience choice doesn't filter with no visible chip
export function pickerTags(tags: string[]): string[] {
	return tags.filter((t) => PICKER_TAGS.has(t));
}

// how many sessions carry each tag, so the picker can show real counts and
// hide tags no current schedule uses
export function countTags(sessions: Pick<Session, "tags">[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const s of sessions) for (const t of s.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
	return counts;
}

export type GridFilter = {
	// passes the program filter: OR within a facet, AND across facets
	matchesTags: (s: Pick<Session, "tags">) => boolean;
	// the picked pools, or null when every pool is shown
	poolSet: Set<string> | null;
	// the selected tags that filter something, which is all the url needs
	urlTags: string[];
};

export function createFilter(
	{ tags, pools }: { tags: string[]; pools: string[] },
	tagCounts: Map<string, number>
): GridFilter {
	// one set of wanted tags per facet the viewer picked in
	const byFacet = new Map<string, Set<string>>();
	for (const tag of tags) {
		const facet = tagFacet(tag);
		if (!byFacet.has(facet)) byFacet.set(facet, new Set());
		byFacet.get(facet)!.add(tag);
	}

	// A facet with every chip ticked is no filter at all, and leaves the url
	// as clean as ticking none
	const facetSize = new Map<string, number>();
	for (const t of tagCounts.keys()) facetSize.set(tagFacet(t), (facetSize.get(tagFacet(t)) ?? 0) + 1);
	const filtering = [...byFacet].filter(
		([facet, wanted]) => [...wanted].filter((t) => tagCounts.has(t)).length < (facetSize.get(facet) ?? 0)
	);
	const wantedSets = filtering.map(([, wanted]) => wanted);
	const filteringFacets = new Set(filtering.map(([facet]) => facet));

	return {
		matchesTags: (s) => wantedSets.every((wanted) => s.tags.some((t) => wanted.has(t))),
		poolSet: pools.length ? new Set(pools) : null,
		urlTags: tags.filter((t) => filteringFacets.has(tagFacet(t))),
	};
}

export type FacetGroup = {
	id: string;
	label: string;
	tags: string[];
	allSelected: boolean;
	someSelected: boolean;
};

// one picker group per category group, listing only the categories this
// season's schedules actually use, alphabetized by the label the picker shows
export function facetGroups(tagCounts: Map<string, number>, selected: string[]): FacetGroup[] {
	const selectedSet = new Set(selected);
	const groups: FacetGroup[] = [];
	for (const group of CATEGORY_GROUPS) {
		const tags = PROGRAM_CATEGORIES
			.filter((c) => c.group === group.id && tagCounts.has(`program:${c.id}`))
			.map((c) => `program:${c.id}`)
			.sort((a, b) => tagLabel(a).localeCompare(tagLabel(b)));
		if (!tags.length) continue;
		const selCount = tags.filter((t) => selectedSet.has(t)).length;
		groups.push({
			id: group.id,
			label: group.label,
			tags,
			allSelected: selCount === tags.length,
			someSelected: selCount > 0,
		});
	}
	return groups;
}

// adds the item if it is missing, removes it if present
export function toggleItem(list: string[], item: string): string[] {
	return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

// ticks every tag in the group, or unticks them all when they already are
export function toggleGroup(selected: string[], group: Pick<FacetGroup, "tags" | "allSelected">): string[] {
	return group.allSelected
		? selected.filter((t) => !group.tags.includes(t))
		: Array.from(new Set([...selected, ...group.tags]));
}
