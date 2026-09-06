// How a session reads on a card.
//
// The schedules put the pool area, the lane count and the closure dates in
// whatever field the LLM found them in — inside the program name, in the notes,
// or both — so a card that renders every field verbatim says "Main Pool" three
// times, and the pool next door says the same thing as a grey sentence instead
// of a badge. This works out what a session should show once: the title without
// the detail the badges carry, the badges, and only the notes that add something.
import type { ProgramEntry } from "./pdf-processor";
import { programLocationQualifier } from "./program-taxonomy";

export type ProgramDisplay = {
	title: string;
	badges: string[];
	notes: string[];
};

const POOL_AREAS = ["main", "small", "shallow", "deep", "warm", "cool"];

function normalize(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// "2 lanes", "2 ln", "2 lane" -> 2
function laneCountOf(s: string): number | null {
	const m = s.match(/(\d+)\s*(?:lanes?|ln)\b/i);
	return m ? Number(m[1]) : null;
}

// A note is often nothing but where in the building the session is: "small pool",
// "2 lanes + Small Pool", "small/main", "main pool only". Those belong in the
// badge row, in the badges' formatting. Anything that is not purely a location
// returns null and stays a note, in the pool's own words.
function locationBadgesOf(note: string): string[] | null {
	const cleaned = note.replace(/\bonly\b/gi, "").trim();
	const parts = cleaned.split(/[+/,]/).map((s) => s.trim()).filter(Boolean);
	if (!parts.length) return null;

	const badges: string[] = [];
	for (const part of parts) {
		const lanes = part.match(/^(\d+)\s*lanes?$/i);
		if (lanes) { badges.push(`${lanes[1]} LN`); continue; }
		if (/^all lanes?$/i.test(part)) { badges.push("All Lanes"); continue; }
		const area = part.match(/^(\w+)(?:\s+pool)?$/i);
		if (area && POOL_AREAS.includes(area[1].toLowerCase())) {
			badges.push(`${area[1].charAt(0).toUpperCase() + area[1].slice(1).toLowerCase()} Pool`);
			continue;
		}
		return null;
	}
	return badges;
}

// a whole note may be a location, or a note may open with one and then say
// something real: "small/main, Lap swim until 4pm"
function splitLocationPrefix(note: string): { badges: string[]; rest: string | null } {
	const whole = locationBadgesOf(note);
	if (whole) return { badges: whole, rest: null };

	const comma = note.indexOf(",");
	if (comma > 0) {
		const head = locationBadgesOf(note.slice(0, comma));
		if (head) return { badges: head, rest: note.slice(comma + 1).trim() || null };
	}
	return { badges: [], rest: note };
}

export function describeProgram(program: ProgramEntry): ProgramDisplay {
	const lanes = program.lanes ?? null;
	const qualifier = programLocationQualifier(program.programNameOriginal) ?? null;

	let title = (program.title || program.programName || "").trim();
	// the badges carry the pool area and the lane count, so the title should not
	// repeat them: "Senior/Therapy Swim (Main Pool-2 Lanes)" -> "Senior/Therapy Swim"
	title = title.replace(/\s*\([^)]*(?:pool|lane)[^)]*\)\s*$/i, "").trim();
	if (lanes) title = title.replace(new RegExp(`\\s*\\(${lanes}\\)\\s*$`), "").trim();
	if (!title) title = (program.title || program.programName || "").trim();

	const badges: string[] = [];
	const addBadge = (badge: string) => {
		// a badge already implied by one we have — "Main Pool" beside
		// "Main Pool-2 Lanes" — is the same fact twice
		const norm = normalize(badge);
		if (badges.some((b) => normalize(b).startsWith(norm))) return;
		badges.push(badge);
	};

	if (qualifier) addBadge(qualifier);
	// a qualifier that already counts the lanes makes the lane badge a repeat
	if (lanes && laneCountOf(qualifier ?? "") !== lanes) addBadge(`${lanes} LN`);

	const notes: string[] = [];
	for (const note of (program.notes || "").split(";").map((n) => n.trim()).filter(Boolean)) {
		const { badges: promoted, rest } = splitLocationPrefix(note);
		for (const badge of promoted) addBadge(badge);
		if (rest) notes.push(rest.charAt(0).toUpperCase() + rest.slice(1));
	}

	return { title, badges, notes };
}
