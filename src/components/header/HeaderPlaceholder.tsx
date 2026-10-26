// ============================================================================
// SSR TILE PLACEHOLDER
// ============================================================================
// A pure-CSS tile grid the server paints on first load, so the header shows
// tiles (and "SF POOLS") within the first paint instead of a blank box while
// the shaders compile. The opaque WebGL canvas is stacked on top and covers
// this once its first frame draws. Layout mirrors header-shader.frag exactly so
// the two line up:
//   - The tile edge is a whole number of CSS px: min(22px, floor(width / 33))
//     — 9 rows of 22px tiles on the 198px-tall header when the viewport is
//     wide, at least 33 columns on narrow ones. Integer tiles keep the grid
//     lines on pixel boundaries in both renderers; fractional tiles let the
//     CSS raster and the (density-scaled) canvas raster snap each grout line
//     differently, and the disagreement accumulates across the 33 columns.
//     The animation computes the same value and hands it to the shader as the
//     u_tilePx uniform.
//   - Colors, the 5x29 bitmap text, and its glyph spacing are the shader's.
//     They're in header-placeholder.css, which HeaderAnimation imports (so
//     the sizing helpers here stay importable from tests).

import type { CSSProperties } from "react";

export const HEADER_TARGET_HEIGHT_PX = 198; // 9 rows of 22px tiles on wide screens
export const TILE_MAX_PX = 22;
export const TILE_MIN_COLS = 33; // 29 for the text + margin

export const TILE = `min(${TILE_MAX_PX}px, round(down, calc(100vw / ${TILE_MIN_COLS}), 1px))`;

// The header is the whole number of tile rows nearest the target height, so
// the grid always fits exactly top to bottom (no partial row on phones).
// HEADER_HEIGHT is the CSS mirror of headerHeightPx; both round half up.
export const HEADER_HEIGHT = `round(nearest, ${HEADER_TARGET_HEIGHT_PX}px, ${TILE})`;

// JS mirrors of TILE and HEADER_HEIGHT for sizing the canvas.
export function tileCssPx(width: number) {
	return Math.min(TILE_MAX_PX, Math.floor(width / TILE_MIN_COLS));
}

export function headerHeightPx(width: number) {
	const tile = tileCssPx(width);
	return Math.round(HEADER_TARGET_HEIGHT_PX / tile) * tile;
}

export function HeaderPlaceholder()
{
	// The look is all in header-placeholder.css, so the browser caches it
	// rather than every page inlining it; only the tile size comes from here.
	return (
		<div
			aria-hidden
			className="header-placeholder"
			style={{ "--tile": TILE } as CSSProperties}
		>
			<div className="header-placeholder-text" />
		</div>
	);
}
