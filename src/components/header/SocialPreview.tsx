"use client";

import { useEffect, useRef, useState } from "react";

import { mountWater, type InputBus, type Water } from "./water";

// GitHub's repository social preview is 1280x640 (they ask for at least
// 640x320). The header normally sizes itself from the viewport — full width,
// ~198px tall, tiles capped at 22px — so at 1280x640 it would be a thin strip
// of small tiles. Here the canvas is pinned to the card size and the tile edge
// is chosen by hand instead, which is what the getHeight/getTilePx overrides
// on mountWater exist for.
export const CARD_WIDTH = 1280;
export const CARD_HEIGHT = 640;

// 20, 32, 40 and 64 divide both 1280 and 640, so the grid lands flush on all
// four edges with no partial row or column. 32 gives 40x20 tiles with the
// 29-tile "SF POOLS" centered in it; 64 is the zoomed-in, nearly edge-to-edge
// version. 36 divides neither (35.6 x 17.8 tiles), so it leaves a sliver of a
// column at the right and a row at the top — the shader's grid origin is the
// bottom-left corner, so that is where the partial tiles land.
const TILE_CHOICES = [20, 32, 36, 40, 64];

// Splash strength for a click, in the same units as the water's CLICK_AMP
// (0.7 in production). Rings this big are what a staged screenshot wants.
const CLICK_AMP = 1.2;

// Feeding the water an input bus takes over the pointer, the scroll swell and
// the idle drips (see mountWater's `input` option), and DRIP_AMBIENT_AMP = 0
// switches off the timed ambient drips on top of that. What's left is a still
// pool that only moves where it is clicked, so ripples can be placed on
// purpose instead of waiting for the animation to look right on its own.
function makeBus(): InputBus {
	return {
		impulse: { x: 0.5, y: 0.5, prevX: 0.5, prevY: 0.5, amp: 0, seq: 0 },
		scrollY: 0,
	};
}

export default function SocialPreview()
{
	const hostRef = useRef<HTMLDivElement>(null);
	const waterRef = useRef<Water | null>(null);
	const [tilePx, setTilePx] = useState(32);
	// Read every frame by the water, which is mounted once (a remount would
	// burn a WebGL context per change).
	const tileRef = useRef(tilePx);
	useEffect(() => {
		tileRef.current = tilePx;
	}, [tilePx]);
	const busRef = useRef<InputBus>(makeBus());

	// A click drops a point splash where it landed. The bus wants sim UV, so
	// y is flipped: the shader's origin is the bottom-left corner.
	const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
		const r = e.currentTarget.getBoundingClientRect();
		const i = busRef.current.impulse;
		i.x = (e.clientX - r.left) / r.width;
		i.y = 1 - (e.clientY - r.top) / r.height;
		i.prevX = i.x; // point dent, not a swept trough
		i.prevY = i.y;
		i.amp = CLICK_AMP;
		i.seq++; // fires the impulse exactly once — see InputBus.impulse
	};

	useEffect(() => {
		if (!hostRef.current) return;
		const water = mountWater(hostRef.current, {
			getWidth: () => CARD_WIDTH,
			getHeight: () => CARD_HEIGHT,
			getTilePx: () => tileRef.current,
			input: busRef.current,
			getJsParams: () => ({ DRIP_AMBIENT_AMP: 0 }),
		});
		waterRef.current = water;
		water?.setLooping(true);

		return () => {
			water?.remove();
			waterRef.current = null;
		};
	}, []);

	return (
		<main className="min-h-screen bg-slate-900 p-6 text-slate-100">
			<div className="mb-4 flex items-center gap-3 text-sm">
				<span className="font-mono text-xs text-slate-400">
					{CARD_WIDTH}&times;{CARD_HEIGHT}
				</span>
				<span className="text-slate-500">tile</span>
				{TILE_CHOICES.map((px) => (
					<button
						key={px}
						type="button"
						onClick={() => setTilePx(px)}
						className={`rounded px-2 py-0.5 font-mono text-xs ${
							px === tilePx
								? "bg-slate-100 text-slate-900"
								: "bg-slate-800 text-slate-300"
						}`}
					>
						{px}px
					</button>
				))}
				<span className="text-slate-500">
					click the water to place a ripple, then screenshot inside the dashed line
				</span>
			</div>
			{/* outline, not border: it is painted outside the element box, so a
			    tight crop of the 1280x640 canvas doesn't catch it. */}
			<div
				ref={hostRef}
				onClick={onClick}
				className="relative overflow-hidden"
				style={{
					width: CARD_WIDTH,
					height: CARD_HEIGHT,
					outline: "1px dashed rgba(148, 163, 184, 0.8)",
				}}
			/>
		</main>
	);
}
