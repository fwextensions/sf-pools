"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * The notices above the grid in one row that scrolls sideways and snaps to
 * each notice (alert-carousel in globals.css), rather than a stack of them
 * pushing the grid down. A phone swipes it; from 560px up, once it holds more
 * than fit, a count and a pair of buttons above it step through, for a mouse,
 * which can't swipe.
 */
export default function AlertCarousel({ count, children }: { count: number; children: ReactNode }) {
	const rowRef = useRef<HTMLDivElement>(null);
	// whether the row overflows, and whether it is scrolled to either end
	const [edges, setEdges] = useState({ overflows: false, atStart: true, atEnd: true });

	useEffect(() => {
		const row = rowRef.current;
		if (!row) return;
		let frame = 0;
		const measure = () => {
			frame = 0;
			const max = row.scrollWidth - row.clientWidth;
			// a px of slack for the fractional widths the cards come to
			const next = { overflows: max > 1, atStart: row.scrollLeft <= 1, atEnd: row.scrollLeft >= max - 1 };
			setEdges((prev) =>
				prev.overflows === next.overflows && prev.atStart === next.atStart && prev.atEnd === next.atEnd ? prev : next
			);
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(measure);
		};
		measure();
		row.addEventListener("scroll", schedule, { passive: true });
		// the window rather than a ResizeObserver, which Safari 12 lacks; the
		// row only changes width with the window
		window.addEventListener("resize", schedule);
		return () => {
			cancelAnimationFrame(frame);
			row.removeEventListener("scroll", schedule);
			window.removeEventListener("resize", schedule);
		};
	}, [count]);

	// one card's width and the margin after it, so each step lands on a snap
	const step = (direction: 1 | -1) => {
		const row = rowRef.current;
		const card = row?.firstElementChild as HTMLElement | null;
		if (!row || !card) return;
		row.scrollBy({ left: direction * (card.offsetWidth + 8), behavior: "smooth" });
	};

	const button = "control w-9 px-0 text-ink disabled:cursor-default disabled:text-line-strong max-[899px]:w-11";

	return (
		<div className="mt-3 mb-6">
			{edges.overflows ? (
				// not on a phone, which swipes the row, and where the notice peeking
				// in at the edge already says there are more
				<div className="mb-2 flex items-center justify-between max-[559px]:hidden">
					<span className="font-mono text-label font-semibold tracking-[.08em] text-ink-2">
						{count} NOTICES
					</span>
					<span className="flex">
						<button
							type="button"
							aria-label="Earlier notices"
							disabled={edges.atStart}
							onClick={() => step(-1)}
							className={button}
						>
							<ChevronLeft aria-hidden className="h-4 w-4" />
						</button>
						<button
							type="button"
							aria-label="More notices"
							disabled={edges.atEnd}
							onClick={() => step(1)}
							className={`${button} -ml-px`}
						>
							<ChevronRight aria-hidden className="h-4 w-4" />
						</button>
					</span>
				</div>
			) : null}
			<div ref={rowRef} className="alert-carousel">
				{children}
			</div>
		</div>
	);
}
