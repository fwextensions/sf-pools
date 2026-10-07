"use client";

import { useEffect } from "react";
import Link from "next/link";
import { trackError } from "@/lib/analytics";

/**
 * Catches a render error in any page inside the site shell. React swallows
 * these — an error boundary stops the exception before it reaches
 * window.onerror, so PostHog's autocapture never sees it and the reader gets
 * a blank column with no way back. This reports it and offers the two things
 * worth offering: try again, or go somewhere that works.
 *
 * It sits inside the (site) layout, so the water and the section tabs stay
 * where they were and only the page below them is replaced.
 */
export default function SiteError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		// the digest is the only handle on the server-side stack for an error
		// thrown while prerendering, which is otherwise redacted in production
		trackError(error, "page", error.digest);
	}, [error]);

	return (
		<div className="font-sans py-12 text-ink">
			<h1 className="text-heading font-semibold">This page didn&rsquo;t load</h1>
			<p className="mt-3 max-w-[54ch] text-body text-ink-2">
				Something went wrong rendering the schedules. The pools are fine — this is the
				site&rsquo;s problem, and it has been reported.
			</p>
			<div className="mt-6 flex items-center gap-3">
				<button
					type="button"
					onClick={reset}
					className="cursor-pointer border-[1.5px] border-ink bg-ink px-3 py-2 font-mono text-small font-semibold tracking-[.08em] text-white"
				>
					TRY AGAIN
				</button>
				<Link
					href="/"
					className="cursor-pointer border-[1.5px] border-line-strong bg-white px-3 py-2 font-mono text-small font-semibold tracking-[.08em] text-ink-2"
				>
					WEEK GRID
				</Link>
			</div>
		</div>
	);
}
