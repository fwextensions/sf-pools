"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type { ProgramEntry } from "@/lib/pdf-processor";
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
 * guard in globals.css: browsers without the feature never see the tooltip,
 * rather than seeing one stuck at a wrong, unadjusted position.
 */
export default function TimelineBlock({ program, color, compact, style }: Props) {
	const boxRef = useRef<HTMLDivElement>(null);
	const [clipped, setClipped] = useState(false);
	// a stable, CSS-legal identifier for this instance's anchor-name
	const anchorName = `--tt-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

	useEffect(() => {
		const el = boxRef.current;
		if (!el) return;

		const checkClipped = () => {
			const overflowsVertically = el.scrollHeight - el.clientHeight > 1;
			// the compact label truncates with an ellipsis rather than overflowing
			// its own box, so scrollHeight on the outer box won't catch it —
			// check the truncated element itself for that case
			const label = el.querySelector<HTMLElement>(".truncate");
			const overflowsHorizontally = !!label && label.scrollWidth - label.clientWidth > 1;
			setClipped(overflowsVertically || overflowsHorizontally);
		};

		checkClipped();
		const observer = new ResizeObserver(checkClipped);
		observer.observe(el);
		return () => observer.disconnect();
	}, [program, compact]);

	const anchorStyle: AnchorStyle = { ...style, anchorName };

	return (
		<>
			<div
				ref={boxRef}
				tabIndex={clipped ? 0 : undefined}
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
