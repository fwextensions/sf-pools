/**
 * The site's one door to PostHog.
 *
 * Analytics is optional: without NEXT_PUBLIC_POSTHOG_KEY nothing is ever
 * initialized, and every call here is a no-op. That keeps local dev and
 * forks silent without any caller having to ask whether tracking is on, and
 * it means a missing key degrades to "no data" rather than to console noise
 * or a crash.
 *
 * Callers should use the named helpers rather than capture() directly, so
 * the set of events the site emits stays readable from this one file.
 */
import posthog from "posthog-js";

let enabled = false;

// true when PostHog is on, so callers can skip work whose only output is an event
export function initAnalytics(): boolean {
	const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
	if (!key || typeof window === "undefined") return false;

	posthog.init(key, {
		// requests go through the /lane rewrite in next.config.ts rather than
		// straight to posthog.com, so that content blockers — which most of
		// this site's readers on phones have — don't drop them. That hides
		// the real host from posthog-js, so ui_host has to name it for the
		// toolbar's links back to the dashboard; it carries no events. Both
		// of these and the rewrite destinations say US cloud — moving the
		// project to EU means editing all three together
		api_host: "/lane",
		ui_host: "https://us.posthog.com",
		// opts into the current defaults, which include pageviews on App
		// Router history changes and a pageleave on the way out. Pinning the
		// date means a posthog-js upgrade can't silently change what we send
		defaults: "2026-05-30",
		person_profiles: "always",
		// unhandled errors and unhandled promise rejections, reported as
		// $exception events. Set here rather than left to the project's
		// dashboard toggle so that what the site sends is visible in the
		// code, and so a fork gets the same behaviour without a setting
		// someone has to know about. Console errors stay out: this site
		// logs plenty that is diagnostic rather than broken
		capture_exceptions: {
			capture_unhandled_errors: true,
			capture_unhandled_rejections: true,
			capture_console_errors: false,
		},
		// Core Web Vitals (LCP, INP, CLS, FCP) as $web_vitals events, mainly
		// to see what the WebGL header costs a phone. Named here rather than
		// left to the dashboard toggle for the same reason as the exceptions
		// above. Network timing only feeds session replay, which is off
		capture_performance: {
			web_vitals: true,
			network_timing: false,
		},
	});
	enabled = true;
	applyInternalTag();
	watchOutboundLinks();
	return true;
}

/**
 * What a page load says about whether this browser is the site owner's.
 * `?me=1` marks it, `?me=0` unmarks it, and a dev server always counts.
 * "keep" means the URL says nothing, so whatever was set before stands.
 */
export function internalTagFor(search: string, hostname: string): "mark" | "unmark" | "keep" {
	const me = new URLSearchParams(search).get("me");
	if (me === "1") return "mark";
	if (me === "0") return "unmark";
	if (hostname === "localhost" || hostname === "127.0.0.1") return "mark";
	return "keep";
}

/**
 * Tags the owner's own visits so PostHog's "filter out internal and test
 * users" toggle can hide them, while their errors and crash reports stay
 * queryable. $internal_or_test_user is the person property the project's
 * built-in "Internal / Test users" cohort checks, and that filter excludes
 * the cohort; cohorts are evaluated at query time, so a browser's visits
 * from before it was tagged drop out too. The super property puts the flag
 * on each event as well. posthog-js persists both, so a browser only needs
 * `?me=1` once.
 */
const INTERNAL = "$internal_or_test_user";

function applyInternalTag() {
	const { search, hostname, pathname, hash } = window.location;
	const tag = internalTagFor(search, hostname);

	if (tag === "mark") {
		posthog.register({ [INTERNAL]: true });
		posthog.setPersonProperties({ [INTERNAL]: true });
	} else if (tag === "unmark") {
		posthog.unregister(INTERNAL);
		posthog.setPersonProperties({ [INTERNAL]: false });
	}

	// drop the parameter before the app reads the URL, so a link copied
	// afterwards can't tag whoever opens it
	const params = new URLSearchParams(search);
	if (params.has("me")) {
		params.delete("me");
		const qs = params.toString();
		window.history.replaceState(window.history.state, "", `${pathname}${qs ? `?${qs}` : ""}${hash}`);
	}
}

function capture(event: string, properties?: Record<string, unknown>, options?: { beacon?: boolean }) {
	if (!enabled) return;
	posthog.capture(event, properties, options?.beacon ? { transport: "sendBeacon" } : undefined);
}

/**
 * An error React swallowed. The autocapture above only sees what reaches
 * window.onerror, and a render error caught by an error boundary never gets
 * there — so the boundaries hand it over here instead.
 *
 * `boundary` says which one caught it, since "the page failed to render" and
 * "the root layout failed to render" are very different problems.
 */
export function trackError(error: unknown, boundary: "page" | "root", digest?: string) {
	if (!enabled) return;
	posthog.captureException(error, { boundary, digest });
}

/** A program tag was ticked or unticked in the filter list. */
export function trackProgramFilter(tag: string, selected: boolean, total: number) {
	capture("program_filter_toggled", { tag, selected, selected_count: total });
}

/** A whole program group ("swim", …) was ticked or unticked at once. */
export function trackCategoryFilter(category: string, selected: boolean, total: number) {
	capture("program_category_toggled", { category, selected, selected_count: total });
}

/** A pool was ticked or unticked in the filter list. */
export function trackPoolFilter(pool: string, selected: boolean, total: number) {
	capture("pool_filter_toggled", { pool, selected, selected_count: total });
}

/**
 * Filters were cleared, by the clear button or by the button under an empty
 * cell's detail list. Counts are what was thrown away.
 */
export function trackFiltersCleared(
	programCount: number,
	poolCount: number,
	source: "clear_button" | "empty_cell" = "clear_button"
) {
	capture("filters_cleared", { program_count: programCount, pool_count: poolCount, source });
}

/**
 * A grid cell became the selection. `source` separates a tap from the end of
 * a drag, because a drag crosses many cells and only reports the last one.
 */
export function trackCellSelected(day: string, hour: number, source: "click" | "drag") {
	capture("grid_cell_selected", { day, hour, source });
}

/** The phone-only full-screen toggle above the grid. */
export function trackFocusMode(on: boolean) {
	capture("focus_mode_toggled", { enabled: on });
}

/** A section tab was followed. Pageviews cover arrivals; this covers intent. */
export function trackSectionNav(from: string, to: string) {
	capture("section_nav_clicked", { from, to });
}

/**
 * A page that was open earlier ended without closing: crashed, or killed by
 * the OS. Found on a later load by lib/crash-watch, which documents the
 * properties.
 */
export function trackCrashSuspected(properties: Record<string, unknown>) {
	capture("page_crash_suspected", properties);
}

/**
 * A tab that outlived its deploy is reloading itself (see lib/stale-deploy).
 * Sent by beacon because the page is about to go. How often this happens is
 * what Vercel's Skew Protection would save.
 */
export function trackStaleDeployReload(boundary: "page" | "root") {
	capture("stale_deploy_reloaded", { boundary }, { beacon: true });
}

export type WaterMode =
	| { mode: "webgl"; filtering: string; still: boolean }
	| { mode: "placeholder"; reason: "unsupported" | "kept_breaking" }
	| { mode: "off" };

/**
 * What the header is showing: the WebGL water, or the CSS placeholder and
 * why. A super property rather than an event, so every later event on the
 * page carries it and anything (bounces, vitals, crashes) can be split by it.
 * `still` is a reduced-motion visitor's single frame; `filtering` is how the
 * display pass samples the sim (see Filtering in header/webgl.ts).
 */
export function setWaterMode(water: WaterMode) {
	if (!enabled) return;
	posthog.register({
		water_mode: water.mode,
		water_filtering: water.mode === "webgl" ? water.filtering : null,
		water_still: water.mode === "webgl" ? water.still : null,
		water_fallback_reason: water.mode === "placeholder" ? water.reason : null,
	});
}

export type OutboundLink = {
	kind: "pdf" | "phone" | "email" | "map" | "rec_park" | "github" | "external";
	url: string;
	host: string;
};

/**
 * Whether a clicked href leaves the site, and what for. Rec & Park serves its
 * PDFs from /DocumentCenter/View/<id> without a .pdf extension, so those
 * count as PDFs too. null for links within the site.
 */
export function outboundLinkFor(href: string, origin: string): OutboundLink | null {
	let url: URL;
	try {
		url = new URL(href, origin);
	} catch {
		return null;
	}
	if (url.protocol === "tel:") return { kind: "phone", url: url.href, host: "" };
	if (url.protocol === "mailto:") return { kind: "email", url: url.href, host: "" };
	if (!/^https?:$/.test(url.protocol) || url.origin === origin) return null;

	const host = url.hostname.replace(/^www\./, "");
	const path = url.pathname.toLowerCase();
	let kind: OutboundLink["kind"] = "external";
	if (path.endsWith(".pdf") || path.includes("/documentcenter/")) kind = "pdf";
	else if (host === "maps.apple.com" || (host.startsWith("google.") && path.startsWith("/maps")) || host === "maps.google.com") kind = "map";
	else if (host === "sfrecpark.org" || host.endsWith(".sfrecpark.org")) kind = "rec_park";
	else if (host === "github.com") kind = "github";
	return { kind, url: url.href, host };
}

/**
 * Clicks on links that leave the site: schedule PDFs, Rec & Park pages, maps,
 * phone numbers. One listener on the document instead of a call at every
 * link, so a link added later is counted without anyone remembering to.
 * `pool` comes from the nearest data-pool attribute, `page` is where the
 * click happened. Sent by beacon, since a same-tab link unloads the page.
 */
function watchOutboundLinks() {
	document.addEventListener("click", (event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const anchor = target.closest("a[href]");
		if (!anchor) return;
		const link = outboundLinkFor(anchor.getAttribute("href") ?? "", location.origin);
		if (!link) return;
		capture("outbound_link_clicked", {
			...link,
			pool: anchor.closest<HTMLElement>("[data-pool]")?.dataset.pool ?? null,
			page: location.pathname,
		}, { beacon: true });
	}, { capture: true });
}
