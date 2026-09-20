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

export function initAnalytics() {
	const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
	if (!key || typeof window === "undefined") return;

	posthog.init(key, {
		// requests go through the /lane rewrite in next.config.ts rather than
		// straight to posthog.com, so that content blockers — which most of
		// this site's readers on phones have — don't drop them. ui_host only
		// affects the links the toolbar builds back to the dashboard
		api_host: "/lane",
		ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.posthog.com",
		// opts into the current defaults, which include pageviews on App
		// Router history changes and a pageleave on the way out. Pinning the
		// date means a posthog-js upgrade can't silently change what we send
		defaults: "2026-05-30",
		person_profiles: "always",
	});
	enabled = true;
}

function capture(event: string, properties?: Record<string, unknown>) {
	if (!enabled) return;
	posthog.capture(event, properties);
}

/** A program tag was ticked or unticked in the filter list. */
export function trackProgramFilter(tag: string, selected: boolean, total: number) {
	capture("program_filter_toggled", { tag, selected, selected_count: total });
}

/** A whole tag category ("activity", …) was ticked or unticked at once. */
export function trackCategoryFilter(category: string, selected: boolean, total: number) {
	capture("program_category_toggled", { category, selected, selected_count: total });
}

/** A pool was ticked or unticked in the filter list. */
export function trackPoolFilter(pool: string, selected: boolean, total: number) {
	capture("pool_filter_toggled", { pool, selected, selected_count: total });
}

/** The clear button was pressed. Counts are what was thrown away. */
export function trackFiltersCleared(programCount: number, poolCount: number) {
	capture("filters_cleared", { program_count: programCount, pool_count: poolCount });
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
