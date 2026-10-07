"use client";

import { useEffect } from "react";
import { trackError } from "@/lib/analytics";

/**
 * The last resort: a failure in the root layout itself, which replaces the
 * whole document rather than the page inside it. That means no fonts, no
 * globals.css and no site shell — hence the inline styles, and hence a plain
 * anchor instead of next/link, since the router is part of what just broke.
 */
export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		trackError(error, "root", error.digest);
	}, [error]);

	return (
		<html lang="en">
		<body
			style={{
				margin: 0,
				minHeight: "100vh",
				background: "#fff",
				color: "#0e2733",
				fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
				padding: "48px 24px",
			}}
		>
			<h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>SF Pools is down</h1>
			<p style={{ maxWidth: "54ch", marginTop: 12, fontSize: 15, color: "#4f6672" }}>
				The site failed to start up. It has been reported. Reloading sometimes clears it.
			</p>
			<p style={{ marginTop: 24 }}>
				<button
					type="button"
					onClick={reset}
					style={{
						cursor: "pointer",
						border: "1.5px solid #0e2733",
						background: "#0e2733",
						color: "#fff",
						padding: "8px 12px",
						font: "600 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace",
						letterSpacing: ".08em",
					}}
				>
					RELOAD
				</button>
			</p>
		</body>
		</html>
	);
}
