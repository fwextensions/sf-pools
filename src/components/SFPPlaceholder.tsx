// ============================================================================
// SSR TILE PLACEHOLDER
// ============================================================================
// A pure-CSS tile grid the server paints on first load, so the header shows
// tiles (and "SF POOLS") within the first paint instead of a blank box while
// p5 downloads and boots. The opaque WebGL canvas is stacked on top and covers
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

export const HEADER_TARGET_HEIGHT_PX = 198; // 9 rows of 22px tiles on wide screens
export const TILE_MAX_PX = 22;
export const TILE_MIN_COLS = 33; // 29 for the text + margin

const TILE = `min(${TILE_MAX_PX}px, round(down, calc(100vw / ${TILE_MIN_COLS}), 1px))`;

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
//const GROUT = "#4f89aa"; // vec3(0.28, 0.48, 0.58)
const GROUT = "#477a94"; // vec3(0.28, 0.48, 0.58)
const TILE_BLUE = "#7bd2f6"; // vec3(0.459, 0.776, 0.894)
// Brighter than the shader's base text tile (0.89): once the animation loads
// the caustics brighten these toward white, so a brighter placeholder matches
// the lit canvas better and softens the crossfade.
const TEXT_TILE = "#f0f0ff";
const GROUT_PCT = 12; // grout line width as % of a tile
// Half the grout goes at each end of a pattern cell, so the grout stays
// centered on the cell boundaries (like the shader's symmetric tile mask) and
// the tile face is centered at 50% — same as the white text faces.
const GROUT_HALF = GROUT_PCT / 2; // 6%

// Same bitmap font as the shader: each glyph is a 15-bit 3x5 map, laid out on
// 4-tile centers with a 6-tile gap between "SF" and "POOLS" (textWidth = 29).
const GLYPHS: { map: number; col: number }[] = [
	{ map: 29671, col: 0 },  // S
	{ map: 29641, col: 4 },  // F
	{ map: 31689, col: 10 }, // P
	{ map: 31599, col: 14 }, // O
	{ map: 31599, col: 18 }, // O
	{ map: 4687, col: 22 },  // L
	{ map: 29671, col: 26 }, // S
];
const TEXT_COLS = 29;
const TEXT_ROWS = 5;

// Decode the glyphs into [row][col] booleans. The shader's y increases upward
// (bitIndex = x + y*3, y = 0 is the bottom row), so row 0 here (the top) is
// glyph y = 4.
const TEXT_GRID: boolean[][] = Array.from({ length: TEXT_ROWS }, () =>
	Array<boolean>(TEXT_COLS).fill(false)
);
for (const { map, col } of GLYPHS) {
	for (let y = 0; y < 5; y++) {
		for (let x = 0; x < 3; x++) {
			if (Math.floor(map / 2 ** (x + y * 3)) % 2 === 1) {
				TEXT_GRID[4 - y][col + x] = true;
			}
		}
	}
}

export function HeaderTilePlaceholder()
{
	return (
		<div
			aria-hidden
			className="absolute inset-0"
			style={{
				pointerEvents: "none",
				backgroundColor: TILE_BLUE,
				// Two grout-line gradients over the blue base form the grid, with
				// half the grout at each end of the cell so the lines straddle
				// the cell boundaries and the tile face stays centered.
				backgroundImage: `repeating-linear-gradient(90deg, ${GROUT} 0 ${GROUT_HALF}%, transparent ${GROUT_HALF}% ${100 -
				GROUT_HALF}%, ${GROUT} ${100 -
				GROUT_HALF}% 100%), repeating-linear-gradient(0deg, ${GROUT} 0 ${GROUT_HALF}%, transparent ${GROUT_HALF}% ${100 -
				GROUT_HALF}%, ${GROUT} ${100 - GROUT_HALF}% 100%)`,
				backgroundSize: `${TILE} ${TILE}`,
				// The shader's grid origin is gl_FragCoord (0,0) = bottom-left,
				// so anchor there; when the height isn't a whole number of
				// tiles, the partial row lands at the top like the canvas.
				backgroundPosition: "left bottom",
			}}
		>
			{/* Text placement matches the shader's snapping, not true centering:
			    textStart = (floor((totalTiles - 29) / 2), ceil((rows - 5) / 2))
			    in whole tiles from the bottom-left grid origin. round(down|up)
			    reproduces the floor/ceil so the letters sit on the 0,0 grid
			    even when the width is a fractional number of tiles.
			    100vw, not 100%: the canvas is sized from window.innerWidth,
			    which includes the scrollbar like vw does; 100% excludes it,
			    which can flip the floor by a column. The -0.1px keeps the
			    round(up) from overshooting a row when (100% - 5*TILE)/2 lands
			    exactly on a tile boundary (TILE is a hair under 200/9px, so
			    the operand comes out epsilon above 2*TILE at 9 rows). */}
			<div
				style={{
					position: "absolute",
					left: `round(down, calc((100vw - ${TEXT_COLS} * ${TILE}) / 2), ${TILE})`,
					bottom: `round(up, calc((100% - ${TEXT_ROWS} * ${TILE}) / 2 - 0.1px), ${TILE})`,
					display: "grid",
					gridTemplateColumns: `repeat(${TEXT_COLS}, ${TILE})`,
					gridTemplateRows: `repeat(${TEXT_ROWS}, ${TILE})`,
				}}
			>
					{TEXT_GRID.flatMap((
						row,
						r) =>
						row.map((
							on,
							c) =>
							on ? (
								<div
									key={`${r}-${c}`}
									style={{
										gridColumn: c + 1,
										gridRow: r + 1,
										backgroundColor: GROUT,
										padding: `${GROUT_PCT / 2}%`,
									}}
								>
									<div style={{
										width: "100%",
										height: "100%",
										backgroundColor: TEXT_TILE
									}} />
								</div>
							) : null
						)
					)}
			</div>
		</div>
	);
}
