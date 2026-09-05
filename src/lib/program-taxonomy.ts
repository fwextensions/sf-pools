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
