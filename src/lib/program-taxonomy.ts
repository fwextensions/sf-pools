// program taxonomy utilities
// start simple: normalize to title case for display and filtering.
// we will expand this with canonical mappings in later M7 steps.

export const CONNECTORS = new Set<string>([
	"and",
	"or",
	"of",
	"the",
	"a",
	"an",
	"to",
	"for",
	"in",
	"on",
	"at",
	"by",
]);

// words that should remain fully uppercase
export const ACRONYMS = new Set<string>([
	"SF",
	"USA",
	"USMS",
	"YMCA",
	"LGBTQ+",
	"JCC",
	"LTS",
	"SFUSD",
	"SFRPD",
	"NVPS",
	"HS",
	"PC",
]);

function capitalizeWord(w: string): string {
	if (!w) return w;
	// a token can arrive wrapped in punctuation — "(Club)", "(Pre-registration" —
	// and the letter to capitalize is the first one inside it, not the bracket
	const m = w.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
	const [, lead, core, trail] = m ?? ["", "", w, ""];
	if (!core) return w;

	const lower = core.toLowerCase();
	// keep known acronyms
	for (const ac of ACRONYMS) {
		if (lower === ac.toLowerCase()) return lead + ac + trail;
	}
	// keep single-letter words uppercase as-is (e.g., "A")
	if (core.length === 1) return lead + core.toUpperCase() + trail;
	return lead + lower.charAt(0).toUpperCase() + lower.slice(1) + trail;
}

// pool name helpers
export function shortPoolName(name: string): string {
	const titled = toTitleCase(name || "").trim();
	if (!titled) return "";
	// remove trailing "Community Pool" or "Pool"
	let s = titled.replace(/\s*(Community)?\s*Pool$/i, "").trim();
	// remove trailing "Aquatic Center" -> keep main name
	s = s.replace(/\s*Aquatic\s+Center$/i, "").trim();
	// collapse multiple spaces
	s = s.replace(/\s{2,}/g, " ");
	return s;
}

export function toTitleCase(input: string): string {
	if (!input) return "";
	const trimmed = input.trim();
	// split and keep separators so we can properly title-case around hyphens, slashes, ampersands, and whitespace
	const parts = trimmed.split(/(\s+|\/|&|-)/g);
	// collect indices of word tokens (non-separators)
	const wordIdx: number[] = [];
	parts.forEach((p, i) => {
		if (!/(^\s+$|^\/$|^&$|^-+$)/.test(p)) wordIdx.push(i);
	});

	const firstWordIndex = wordIdx[0] ?? -1;
	const lastWordIndex = wordIdx[wordIdx.length - 1] ?? -1;

	return parts
		.map((token, i) => {
			// separators are kept as-is
			if ((/^\s+$|^\/$|^&$|^-+$/).test(token)) return token;

			const raw = token;
			const lower = raw.toLowerCase();

			// if it contains digits, keep original casing to avoid mangling things like "12U"
			if (/\d/.test(raw)) return raw;

			// downcase common connectors unless at start or end
			if (i !== firstWordIndex && i !== lastWordIndex && CONNECTORS.has(lower)) return lower;

			// handle dotted abbreviations like "jr." -> "Jr." (rare in our domain)
			if (lower === "jr" || lower === "jr.") return "Jr.";
			if (lower === "sr" || lower === "sr.") return "Sr.";

			return capitalizeWord(raw);
		})
		.join("");
}

// canonical categories used for filtering (M7)
export const CANONICAL_CATEGORIES = [
	"Adult Swim Lessons",
	"Adult Synchronized Swimming",
	"Adult Water Polo",
	"Camps",
	"Family Swim",
	"High School Swim Programs",
	"Lap Swim",
	"Masters Swim Program",
	"Parent & Child Swim",
	"Swim Lessons (General/Youth/Community)",
	"Senior Swim / Therapy Swim",
	"Water Exercise",
	"Youth Swim Teams / Club Teams",
	"Youth Synchronized Swimming",
	"Pool Closure / Staff & Departmental Use",
	"Rentals / Private Use",
	"Special Olympics",
] as const;

export type CanonicalCategory = typeof CANONICAL_CATEGORIES[number];

export function findCanonicalProgram(raw: string): CanonicalCategory | null {
	const s = (raw || "").trim().toLowerCase();
	if (!s) return null;

	// the pool is shut, or the department has it
	if (/(closure|closed|maintenance|staff|training|department|dept)/.test(s)) {
		return "Pool Closure / Staff & Departmental Use";
	}

	// a group has the water and the public cannot join, whoever that group is —
	// this has to beat the masters/synchro/team rules below, which would otherwise
	// file "Rentals (Masters)" as a program you can show up for.
	if (/\brentals?\b|private|permit|reserved/.test(s)) return "Rentals / Private Use";

	if (s.includes("special olympics")) return "Special Olympics";

	// sfrpd day camps occupying the pool
	if (/\bcamps?\b/.test(s)) return "Camps";

	// sfusd usage (school district programs)
	if (s.includes("sfusd") || s.includes("unified school") || s.includes("school district")) {
		return "High School Swim Programs";
	}

	if (s.includes("high school") || /\bhs\b/.test(s) || s.includes("prep")) return "High School Swim Programs";

	// masters variations
	if (s.includes("masters") || s.includes("master's") || s.includes("adult masters") || s.includes("masters swim")) {
		return "Masters Swim Program";
	}

	// senior/therapy should take precedence over generic lap
	if (
		s.includes("senior") ||
		s.includes("therapy") ||
		s.includes("therapeutic") ||
		s.includes("self guided") ||
		s.includes("self-guided") ||
		s.includes("selfguided") ||
		s.includes("self guide") ||
		s.includes("execise") ||
		s.includes("self guided exercise")
	) {
		return "Senior Swim / Therapy Swim";
	}

	if (s.includes("lap")) return "Lap Swim";

	if (s.includes("family")) return "Family Swim";

	if (s.includes("water exercise") || s.includes("aerobic") || s.includes("aqua")) return "Water Exercise";

	if (s.includes("synchronized") || s.includes("synchro")) {
		if (s.includes("adult")) return "Adult Synchronized Swimming";
		if (s.includes("youth") || s.includes("junior")) return "Youth Synchronized Swimming";
		return null;
	}

	if (s.includes("water polo")) {
		if (s.includes("adult") || s.includes("masters")) return "Adult Water Polo";
		if (s.includes("high school") || /\bhs\b/.test(s)) return "High School Swim Programs";
		if (s.includes("youth") || s.includes("club")) return "Youth Swim Teams / Club Teams";
		return null;
	}

	// "LTS" is how the summer schedules write Learn To Swim ("Summer LTS")
	if (s.includes("lesson") || /\blts\b/.test(s)) {
		if (s.includes("adult")) return "Adult Swim Lessons";
		return "Swim Lessons (General/Youth/Community)";
	}

	if (s.includes("learn to swim") || s.includes("learn - to - swim")) return "Swim Lessons (General/Youth/Community)";

	if (s.includes("preschool") || s.includes("pre-school") || s.includes("pre school")) return "Swim Lessons (General/Youth/Community)";

	if (
		(s.includes("parent") && (s.includes("child") || s.includes("tot") || s.includes("tots"))) ||
		s.includes("parent & child") ||
		s.includes("parent/child")
	) {
		return "Parent & Child Swim";
	}

	// youth teams heuristics
	// the club is written both "Piranhas" and "Piranha PC" across pools
	if (s.includes("piranha") || (s.includes("junior") && s.includes("swim"))) {
		return "Youth Swim Teams / Club Teams";
	}

	if (s.includes("team")) {
		if (s.includes("high school") || /\bhs\b/.test(s)) return "High School Swim Programs";
		return "Youth Swim Teams / Club Teams";
	}

	if (s.includes("rec swim") || s.includes("recreational swim") || s.includes("open swim")) return "Family Swim";

	return null;
}

// strip footnote markers (*, ^, †) and pool/lane location qualifiers like
// "(Small Pool)" or "(Main Pool-2 Lanes)" — those are per-schedule details,
// not distinct programs; the original stays in programNameOriginal.
export function stripProgramQualifiers(raw: string): string {
	let s = (raw || "").trim();
	s = s.replace(/[*^†\s]+$/g, "");
	s = s.replace(/\s*\([^)]*(pool|lane)[^)]*\)$/i, "");
	return s.trim();
}

// pull the stripped location qualifier back out of an original program name,
// e.g. "Summer LTS (Small Pool)" -> "Small Pool", for display in details
export function programLocationQualifier(raw: string | null | undefined): string | null {
	const m = (raw || "").match(/\(([^)]*(?:pool|lane)[^)]*)\)\s*[*^†]*\s*$/i);
	return m ? toTitleCase(m[1].trim()) : null;
}

export function normalizeProgramName(raw: string): string {
	return toTitleCase(stripProgramQualifiers(raw));
}

// ---------------------------------------------------------------------------
// tags
//
// A single canonical category cannot describe a slot that is genuinely two
// things at once — "REC/FAMILY/LAP SWIM" is rec, family and lap water at the
// same time, and 25% of the sessions we have ever scraped name more than one
// program. Tags let a session carry all of them, in three facets:
//
//   activity:  what is happening in the water
//   audience:  who it is for, when the PDF says
//   access:    how you get in — the facet the footnote symbols encode
//   program:   the one category the grid and Now & Soon filter on, worked out
//              from the other three (see PROGRAM_CATEGORIES)
//
// The vocabulary is closed: derivation is regex over the raw PDF title, so a
// name we have not seen yields fewer tags, never a new tag. See
// docs/program-taxonomy-review.md.
// ---------------------------------------------------------------------------

export const ACTIVITY_TAGS = [
	"lap", "family", "rec", "senior", "therapy", "self-guided", "water-exercise",
	"lessons", "swim-team", "masters", "synchro", "water-polo", "hockey", "camp",
	"parent-tot", "special-olympics", "rental", "school", "other",
] as const;

export const AUDIENCE_TAGS = ["adult", "youth", "senior", "parent-child", "high-school", "preschool"] as const;

export const ACCESS_TAGS = ["drop-in", "registration", "rental", "school-group", "closed", "shared-pool", "contact-coach"] as const;

export type ActivityTag = `activity:${typeof ACTIVITY_TAGS[number]}`;
export type AudienceTag = `audience:${typeof AUDIENCE_TAGS[number]}`;
export type AccessTag = `access:${typeof ACCESS_TAGS[number]}`;
export type CategoryTag = `program:${ProgramCategory}`;
export type ProgramTag = ActivityTag | AudienceTag | AccessTag | CategoryTag;

const ACTIVITY_PATTERNS: Array<[typeof ACTIVITY_TAGS[number], RegExp]> = [
	["lap", /\blap\b/],
	["family", /\bfamily\b/],
	["rec", /\brec\b|recreational/],
	["senior", /\bsenior\b/],
	["therapy", /therapy|therapeutic|access swim/],
	["self-guided", /self.?guided/],
	// "expercise" is a standing typo in the Rossi and Garfield schedules
	["water-exercise", /water exercise|water expercise|aerobic|aqua/],
	// "Bayview Safety Swim & Splash" at MLK is a water safety class
	["lessons", /lesson|\blts\b|learn.?to.?swim|safety swim/],
	["swim-team", /swim team|\bteams?\b|piranha|barracuda|gator|catfish/],
	["masters", /master/],
	["synchro", /synchro/],
	["water-polo", /water polo/],
	["hockey", /hockey/],
	["camp", /\bcamps?\b/],
	["parent-tot", /parent/],
	["special-olympics", /special olympics/],
	// a rental or a school class is still the thing occupying the water, so it
	// is filed under Program as well as being restricted to get into
	["rental", /\brentals?\b|private|permit|reserved/],
	["school", /sfusd|unified school|school district|nvps|school groups?/],
];

// the activities a member of the public can simply show up for
const OPEN_SWIM_ACTIVITIES: Array<typeof ACTIVITY_TAGS[number]> = [
	"lap", "family", "rec", "senior", "therapy", "self-guided", "water-exercise",
];

const AUDIENCE_PATTERNS: Array<[typeof AUDIENCE_TAGS[number], RegExp]> = [
	["adult", /\badult\b/],
	["youth", /\byouth\b|junior|\bjr\b|\btots?\b/],
	["senior", /\bsenior\b/],
	["parent-child", /parent/],
	["high-school", /high school|\bhs\b/],
	["preschool", /pre.?school/],
];

const ACCESS_PATTERNS: Array<[typeof ACCESS_TAGS[number], RegExp]> = [
	["rental", /\brentals?\b|private|permit|reserved/],
	["school-group", /sfusd|unified school|school district|nvps|school groups?/],
	["closed", /closure|closed|maintenance|staff training|department/],
	["registration", /pre-?registration|registration req/],
];

// the footnote symbols the PDFs hang off program names. Each schedule prints
// its own SYMBOL KEY and they do not all agree, so only the markers that mean
// the same thing across the pools we have seen are mapped; the rest are
// stripped from the title and carry no tag.
const MARKER_TAGS: Array<[RegExp, AccessTag]> = [
	[/\*\*/, "access:shared-pool"],
	[/[♦◆]/, "access:contact-coach"],
	[/\*/, "access:registration"],
];

export function deriveTags(raw: string): ProgramTag[] {
	const s = (raw || "").trim().toLowerCase();
	if (!s) return [];
	const tags = new Set<ProgramTag>();

	for (const [tag, re] of ACTIVITY_PATTERNS) if (re.test(s)) tags.add(`activity:${tag}`);
	for (const [tag, re] of AUDIENCE_PATTERNS) if (re.test(s)) tags.add(`audience:${tag}`);
	for (const [tag, re] of ACCESS_PATTERNS) if (re.test(s)) tags.add(`access:${tag}`);
	for (const [re, tag] of MARKER_TAGS) if (re.test(raw)) { tags.add(tag); break; }

	// Rec swim is the open swim the schedules also call family swim ("Rec/Family
	// Swim"), and the canonical name already files it there; without the tag
	// a Family filter would hide a slot printed only as "Rec Swim"
	if (tags.has("activity:rec")) tags.add("activity:family");

	// a session nobody has to register, rent or be enrolled for is one you can
	// walk in on — the distinction the ActiveNet drop-in calendar draws too.
	// Only open swims qualify: a lesson or a team practice needs a sign-up
	// whether or not the PDF prints the registration marker on it.
	const restricted: AccessTag[] = ["access:rental", "access:school-group", "access:closed", "access:registration", "access:contact-coach"];
	// a parent-and-tot swim is open water too, a parent-and-tot lesson is not
	const openSwim =
		OPEN_SWIM_ACTIVITIES.some((a) => tags.has(`activity:${a}`)) ||
		(tags.has("activity:parent-tot") && !tags.has("activity:lessons"));
	if (openSwim && !restricted.some((t) => tags.has(t))) tags.add("access:drop-in");

	// the grid filters on activity, so a session with none would drop out the
	// moment any Program box is ticked. Added after the drop-in check, so an
	// unrecognized name is not also promised as walk-in.
	if (![...tags].some((t) => t.startsWith("activity:"))) tags.add("activity:other");

	for (const category of programCategories(tags)) tags.add(`program:${category}`);

	return [...tags].sort();
}

// ---------------------------------------------------------------------------
// program categories
//
// The activity tags describe a title; they can't filter it. "Senior/Therapy
// Swim" carries both senior and therapy, so unticking Therapy hid nothing
// while Senior stayed ticked, and the same went for rec and family, and for
// every masters or synchro rental. A category is the one place a session is
// filed, so unticking it hides exactly the sessions its count says.
//
// When a title fits two categories, who can get in wins over what you do:
// closed to the public first, then seniors only, then the activity. "Senior
// Lap Swim" is a senior session; a lap swimmer under 60 can't go.
// ---------------------------------------------------------------------------

export const CATEGORY_GROUPS = [
	{ id: "swim", label: "Swim" },
	{ id: "exercise", label: "Exercise & therapy" },
	{ id: "lessons", label: "Lessons & teams" },
	{ id: "private", label: "Not open to the public" },
	{ id: "other", label: "Other" },
] as const;

export const PROGRAM_CATEGORIES = [
	{ id: "lap", label: "Lap swim", group: "swim" },
	{ id: "family", label: "Rec & family swim", group: "swim" },
	{ id: "parent-tot", label: "Parent & tot swim", group: "swim" },
	{ id: "senior", label: "Senior & therapy swim", group: "exercise" },
	{ id: "self-guided", label: "Self-guided exercise", group: "exercise" },
	{ id: "water-exercise", label: "Water exercise", group: "exercise" },
	{ id: "kids-lessons", label: "Kids' lessons", group: "lessons" },
	{ id: "adult-lessons", label: "Adult lessons", group: "lessons" },
	{ id: "swim-team", label: "Swim teams", group: "lessons" },
	{ id: "rentals", label: "Rentals", group: "private" },
	{ id: "school", label: "School classes", group: "private" },
	{ id: "camps", label: "Camps", group: "private" },
	{ id: "closed", label: "Pool closed", group: "private" },
	{ id: "other", label: "Other", group: "other" },
] as const satisfies ReadonlyArray<{ id: string; label: string; group: (typeof CATEGORY_GROUPS)[number]["id"] }>;

export type ProgramCategory = (typeof PROGRAM_CATEGORIES)[number]["id"];

// the categories a session is filed under, from its other tags: one, except
// a slot that really is two open swims side by side, like Balboa's
// "Family/Lap Swim", where a divider splits the lap lanes from the shallow end
function programCategories(tags: Set<ProgramTag>): ProgramCategory[] {
	const has = (tag: ProgramTag) => tags.has(tag);

	if (has("access:closed")) return ["closed"];
	if (has("access:school-group")) return ["school"];
	if (has("activity:rental")) return ["rentals"];
	if (has("activity:camp")) return ["camps"];
	// "Youth Lessons/Swim Team" is a team's feeder, and you join it like one;
	// Special Olympics is a team too, and too rare for a category of its own
	if (["swim-team", "special-olympics", "masters", "synchro", "water-polo", "hockey"].some((a) => has(`activity:${a}` as ActivityTag))) {
		return ["swim-team"];
	}
	if (has("activity:lessons")) return has("audience:adult") ? ["adult-lessons"] : ["kids-lessons"];
	// "Lap Swim (Lap/Therapy)" is lap lanes beside therapy lanes, open to all
	if (has("activity:senior") || (has("activity:therapy") && !has("activity:lap"))) return ["senior"];
	if (has("activity:self-guided")) return ["self-guided"];
	if (has("activity:water-exercise")) return ["water-exercise"];
	if (has("activity:lap")) return has("activity:family") ? ["lap", "family"] : ["lap"];
	if (has("activity:parent-tot")) return ["parent-tot"];
	if (has("activity:family")) return ["family"];
	return ["other"];
}

// the title as the PDF wrote it, minus the footnote markers and the stray
// spacing — "Summer LTS^" -> "Summer LTS", "SMALL POOL-REC/FAMILY SWIM" ->
// "Small Pool - Rec/Family Swim". This is what we show; the untouched string
// stays in programNameOriginal.
export function cleanProgramTitle(raw: string): string {
	let s = (raw || "").trim();
	s = s.replace(/[*^†‡♦◆+籠]/g, " ");
	s = s.replace(/\s*\/\s*/g, "/");
	// even out a hyphen the PDF spaced on one side only ("SMALL POOL- NVPS"),
	// while leaving a genuinely hyphenated word ("Pre-registration") alone
	s = s.replace(/(\S)-\s+/g, "$1 - ").replace(/\s+-(\S)/g, " - $1");
	s = s.replace(/\s{2,}/g, " ").trim();
	s = s.replace(/^[-\s]+|[-\s]+$/g, "");
	return toTitleCase(s);
}

// display labels and facet order for the filter UI. Keys are the full tag ids;
// anything missing falls back to the tag's own slug.
// only the program categories are offered as a filter. The activity and
// audience tags feed them, and the detail list shows the restrictive access
// tags; picking among them directly is what made checkboxes that hid nothing.
export const TAG_FACETS = [
	{ id: "program", label: "Program" },
] as const;

export const TAG_LABELS: Record<string, string> = {
	"activity:lap": "Lap swim",
	"activity:family": "Family swim",
	"activity:rec": "Rec swim",
	"activity:senior": "Senior swim",
	"activity:therapy": "Therapy swim",
	"activity:self-guided": "Self-guided exercise",
	"activity:water-exercise": "Water exercise",
	"activity:lessons": "Lessons",
	"activity:swim-team": "Swim team",
	"activity:masters": "Masters",
	"activity:synchro": "Synchronized swimming",
	"activity:water-polo": "Water polo",
	"activity:hockey": "Underwater hockey",
	"activity:camp": "Camps",
	"activity:parent-tot": "Parent & tot",
	"activity:special-olympics": "Special Olympics",
	"activity:rental": "Rentals",
	"activity:school": "School classes",
	"activity:other": "Other",
	"audience:adult": "Adults",
	"audience:youth": "Youth",
	"audience:senior": "Seniors",
	"audience:parent-child": "Parent & child",
	"audience:high-school": "High school",
	"audience:preschool": "Preschool",
	"access:drop-in": "Drop in, no sign-up",
	"access:registration": "Registration required",
	"access:rental": "Private",
	"access:school-group": "School group",
	"access:closed": "Pool closed",
	"access:shared-pool": "Shared pool",
	"access:contact-coach": "Contact the coach",
};

for (const c of PROGRAM_CATEGORIES) TAG_LABELS[`program:${c.id}`] = c.label;

export function tagLabel(tag: string): string {
	return TAG_LABELS[tag] ?? toTitleCase(tag.split(":")[1]?.replace(/-/g, " ") ?? tag);
}

export function tagFacet(tag: string): string {
	return tag.split(":")[0] ?? "";
}
