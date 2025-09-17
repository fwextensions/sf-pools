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
]);

function capitalizeWord(w: string): string {
	if (!w) return w;
	const lower = w.toLowerCase();
	// keep known acronyms	s
	for (const ac of ACRONYMS) {
		if (lower === ac.toLowerCase()) return ac;
	}
	// keep single-letter words uppercase as-is (e.g., "A")
	if (w.length === 1) return w.toUpperCase();
	return lower.charAt(0).toUpperCase() + lower.slice(1);
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
	"Special Olympics",
] as const;

export type CanonicalCategory = typeof CANONICAL_CATEGORIES[number];

export function findCanonicalProgram(raw: string): CanonicalCategory | null {
	const s = (raw || "").trim().toLowerCase();
	if (!s) return null;

	// closures and non-program usage
	if (/(closure|closed|maintenance|staff|training|department|dept|private|permit|reserved)/.test(s)) {
		return "Pool Closure / Staff & Departmental Use";
	}

	if (s.includes("special olympics")) return "Special Olympics";

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

	if (s.includes("water exercise") || s.includes("water aerobics") || s.includes("aqua")) return "Water Exercise";

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

	if (s.includes("lesson")) {
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
	if (s.includes("piranhas") || s.includes("junior piranhas") || (s.includes("junior") && s.includes("swim"))) {
		return "Youth Swim Teams / Club Teams";
	}

	if (s.includes("team")) {
		if (s.includes("high school") || /\bhs\b/.test(s)) return "High School Swim Programs";
		return "Youth Swim Teams / Club Teams";
	}

	if (s.includes("rec swim") || s.includes("recreational swim") || s.includes("open swim")) return "Family Swim";

	return null;
}

// placeholder for future canonical mapping logic; for now just title-case
export function normalizeProgramName(raw: string): string {
	return toTitleCase(raw);
}
