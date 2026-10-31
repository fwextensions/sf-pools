// Now & Soon's controls in the query string, written the way the week grid
// writes its own: ?access=all&program=lap&when=tomorrow-am. Defaults are left
// out, so the plain page is a plain url. `program` is the grid's param with the
// same tag slugs, so a link that says lap swim means it on either page.
import { PROGRAM_CHOICES, WHEN_CHOICES, type NowSoonOptions, type ProgramChoice, type When } from "./now-soon";

export const DEFAULT_OPTIONS: NowSoonOptions = { mode: "drop-in", program: null, when: "next" };

export function formatNowSoonQuery({ mode, program, when }: NowSoonOptions): string {
	const parts: string[] = [];
	if (mode === "all") parts.push("access=all");
	if (program) parts.push(`program=${program}`);
	if (when !== "next") parts.push(`when=${when}`);
	return parts.join("&");
}

// anything the page doesn't offer falls back to the default. The grid allows
// several programs; this page picks one, so the first it offers wins
export function parseNowSoonQuery(params: Pick<URLSearchParams, "get">): NowSoonOptions {
	const programs = (params.get("program") ?? "").split(",");
	const program = programs.find((p): p is ProgramChoice => (PROGRAM_CHOICES as readonly string[]).includes(p)) ?? null;
	const when = params.get("when");
	return {
		mode: params.get("access") === "all" ? "all" : "drop-in",
		program,
		when: (WHEN_CHOICES as readonly string[]).includes(when ?? "") ? (when as When) : "next",
	};
}

// The query string this page last wrote in this document, for the same reason
// the grid keeps one (see writeGridUrl): replaceState goes unseen by the App
// Router, which restores the query the route was last navigated to when the
// reader tabs away and back.
let lastWrittenQuery: string | null = null;

export function initialNowSoonOptions(searchParams: Pick<URLSearchParams, "get">): NowSoonOptions {
	return parseNowSoonQuery(lastWrittenQuery == null ? searchParams : new URLSearchParams(lastWrittenQuery));
}

// params this page doesn't own, like the preview page's `at`, are kept ahead
// of its own
export function writeNowSoonUrl(pathname: string, options: NowSoonOptions): void {
	const others = new URLSearchParams(window.location.search);
	for (const key of ["access", "program", "when"]) others.delete(key);
	const kept = [...others].map(([key, value]) => `${key}=${encodeURIComponent(value).replace(/%3A/gi, ":")}`);
	const qs = [...kept, formatNowSoonQuery(options)].filter(Boolean).join("&");
	lastWrittenQuery = qs;
	window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
}
