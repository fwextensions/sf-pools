"use client";

import { useEffect } from "react";

/**
 * Picks out the session a link names with ?session= (a grid row links here
 * with one, see sessionParam): every other session on the page fades and the
 * picked one scrolls into view. A click or Escape anywhere puts the week back.
 *
 * It reads the URL after hydration rather than through useSearchParams, which
 * would push the prerendered page into client rendering, and it marks the
 * blocks with attributes React never renders, so a re-render leaves them be.
 */
export default function SessionFocus() {
	useEffect(() => {
		const key = new URLSearchParams(window.location.search).get("session");
		if (!key) return;
		const blocks = [...document.querySelectorAll<HTMLElement>("[data-session]")].filter(
			(el) => el.dataset.session === key
		);
		// a link from an older schedule names nothing here: show the week as is
		if (!blocks.length) return;

		const root = document.documentElement;
		root.setAttribute("data-session-focus", "");
		for (const el of blocks) el.setAttribute("data-focused", "");

		// the timeline and the day list both hold the session, one of them hidden
		const shown = blocks.find((el) => el.getClientRects().length);
		// after the router has done its own scrolling for the navigation
		const frame = requestAnimationFrame(() => shown?.scrollIntoView({ block: "center" }));

		function clear() {
			root.removeAttribute("data-session-focus");
			for (const el of blocks) el.removeAttribute("data-focused");
			const url = new URL(window.location.href);
			url.searchParams.delete("session");
			window.history.replaceState(window.history.state, "", url);
			window.removeEventListener("click", clear);
			window.removeEventListener("keydown", onKey);
		}
		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape") clear();
		}
		// a click, not a pointerdown, so the touch that starts a scroll doesn't
		// count
		window.addEventListener("click", clear);
		window.addEventListener("keydown", onKey);

		return () => {
			cancelAnimationFrame(frame);
			root.removeAttribute("data-session-focus");
			for (const el of blocks) el.removeAttribute("data-focused");
			window.removeEventListener("click", clear);
			window.removeEventListener("keydown", onKey);
		};
	}, []);

	return null;
}
