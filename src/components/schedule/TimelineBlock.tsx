"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { ProgramEntry } from "@/lib/pdf-processor";
import { describeProgram } from "@/lib/program-display";
import SessionBlock from "./SessionBlock";

// anchor-name / position-anchor aren't in the shipped CSSProperties types yet
type AnchorStyle = CSSProperties & { anchorName?: string; positionAnchor?: string };

type Props = {
	program: ProgramEntry;
	color: string;
	compact: boolean;
	style: CSSProperties;
};

/**
 * A timeline block's box is a fixed size driven by its program's actual
 * duration, so a short session's name or badges can run out of room — a
 * truncated compact name, or badges/notes that don't fit under a title.
 * This wraps SessionBlock with a hover tooltip that only exists for a block
 * that is actually clipped: measured after mount via scrollHeight/scrollWidth
 * against the rendered box, not guessed from the program's data. A block
 * that already shows everything gets no tooltip and no extra DOM.
 *
 * Placement is left entirely to the CSS anchor positioning API — the anchor
 * box carries an anchor-name, the tooltip a matching position-anchor plus a
 * preferred position-area, and position-try-fallbacks flips it when that
 * side would run off the viewport. See the `@supports (anchor-name: --a)`
 * guard in globals.css: browsers without the feature never see the custom
 * tooltip, rather than seeing one stuck at a wrong, unadjusted position —
 * they fall back to a plain native `title` tooltip instead (unstyled and
 * unpositioned, but still the full detail on hover).
 */
export default function TimelineBlock({ program, color, compact, style }: Props) {
	const boxRef = useRef<HTMLDivElement>(null);
	const [clipped, setClipped] = useState(false);
	// static for the life of the tab, and undetectable on the server — so this
	// reads as "supported" (no title) for the SSR/hydration pass, same as
	// getServerSnapshot, and only flips after hydration on a browser that
	// actually lacks anchor positioning
	const needsTitleFallback = useSyncExternalStore(
		subscribeNever,
		getNeedsTitleFallbackSnapshot,
		() => false
	);
	// a stable, CSS-legal identifier for this instance's anchor-name
	const anchorName = `--tt-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

	useEffect(() => {
		const el = boxRef.current;
		if (!el) return;

		const checkClipped = () => {
			// SessionBlock's own root is `h-full` — fixed to this box's height,
			// not sized to its content — and clips with its own overflow-hidden,
			// so it is the true boundary; scrollHeight on the outer anchor here
			// would just report that root's fixed height back, never revealing
			// that the root's own children didn't fit inside it
			const content = el.firstElementChild as HTMLElement | null;
			const overflowsVertically = !!content && content.scrollHeight - content.clientHeight > 1;
			// the compact label truncates with an ellipsis rather than overflowing
			// its own box, so the scrollHeight check above won't catch it —
			// check the truncated element itself for that case
			const label = el.querySelector<HTMLElement>(".truncate");
			const overflowsHorizontally = !!label && label.scrollWidth - label.clientWidth > 1;
			setClipped(overflowsVertically || overflowsHorizontally);
		};

		checkClipped();
		// the box's own size is fixed inline (top/height/width from the layout
		// math), so ResizeObserver never fires just because the web font finishes
		// loading and the text inside it reflows — recheck once that settles,
		// or a block whose overflow only shows up in Chivo's metrics (not the
		// fallback font it briefly renders in) can get stuck marked unclipped
		let cancelled = false;
		document.fonts?.ready.then(() => {
			if (!cancelled) checkClipped();
		});
		const observer = new ResizeObserver(checkClipped);
		observer.observe(el);
		return () => {
			cancelled = true;
			observer.disconnect();
		};
	}, [program, compact]);

	const anchorStyle: AnchorStyle = { ...style, anchorName };

	// only built when it's actually needed: the native tooltip this feeds is
	// plain text, so it can't reuse SessionBlock's badge/note markup the way
	// the CSS tooltip does
	const titleFallback =
		clipped && needsTitleFallback ? describeProgramText(program) : undefined;

	return (
		<>
			<div
				ref={boxRef}
				tabIndex={clipped ? 0 : undefined}
				title={titleFallback}
				className="tt-anchor absolute overflow-hidden outline-none"
				style={anchorStyle}
			>
				<SessionBlock program={program} color={color} compact={compact} />
			</div>
			{clipped ? (
				<div
					role="tooltip"
					className="tt-tooltip"
					style={{ positionAnchor: anchorName } as AnchorStyle}
				>
					<div className="border border-[#c4d2d9] bg-white shadow-[0_4px_16px_rgba(14,39,51,0.18)]">
						<SessionBlock program={program} color={color} />
					</div>
				</div>
			) : null}
		</>
	);
}

// the answer never changes once the page has loaded, so useSyncExternalStore
// never needs to notify of an update — it exists here purely to get a value
// that's correct on the client without mismatching the server's render
function subscribeNever() {
	return () => {};
}

let cachedNeedsTitleFallback: boolean | undefined;
function getNeedsTitleFallbackSnapshot(): boolean {
	if (cachedNeedsTitleFallback === undefined) {
		cachedNeedsTitleFallback = !(
			typeof CSS !== "undefined" && CSS.supports("anchor-name: --a")
		);
	}
	return cachedNeedsTitleFallback;
}

/** Plain-text stand-in for the CSS tooltip's card, for the native `title` fallback. */
function describeProgramText(program: ProgramEntry): string {
	const { title, badges, notes } = describeProgram(program);
	const parts = [`${program.startTime}–${program.endTime}`, title, ...badges, ...notes];
	return parts.join(" · ");
}
