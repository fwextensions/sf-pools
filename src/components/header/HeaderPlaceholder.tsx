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
// The shader's base colors, straight from header-shader.frag.
const GROUT = "#477a94"; // vec3(0.28, 0.48, 0.58)
const TILE_BLUE = "#75c6e4"; // vec3(0.459, 0.776, 0.894)
const TEXT_TILE = "#f2f2ff"; // vec3(0.95, 0.95, 1.0)
const GROUT_PCT = 12; // grout line width as % of a tile
// Half the grout goes at each end of a pattern cell, so the grout stays
// centered on the cell boundaries (like the shader's symmetric tile mask) and
// the tile face is centered at 50% — same as the white text faces.
const GROUT_HALF = GROUT_PCT / 2; // 6%

// Two grout-line gradients form the grid, with half the grout at each end of
// the cell so the lines straddle the cell boundaries.
const GROUT_LAYERS = [90, 0].map((angle) =>
	`repeating-linear-gradient(${angle}deg, ${GROUT} 0 ${GROUT_HALF}%, transparent ${GROUT_HALF}% ${100 -
	GROUT_HALF}%, ${GROUT} ${100 - GROUT_HALF}% 100%)`
);

// The shader's pillowed bevel: `color += color * dot(slope, light) * 0.14`,
// with the light from the upper right, so the top and right edges brighten
// and the bottom and left darken (normalize(0.35, 0.55) weights up and down
// over across about 1.6:1). On screen the refraction and caustics roughly
// double that contrast and spread it most of the way across the face, so
// these bands are stronger and wider than the shader's own constants. Black
// darkens multiplicatively, like the shader; the brightening is a tint with the
// tile's own R:G:B ratios, so it lightens without shifting the hue toward green
// (the shader clamps white text tiles, so theirs is white).
function bevelLayers(light: string, lightX: number, lightY: number)
{
	const band = (angle: number, start: string, startMid: string, end: string, endMid: string) =>
		`linear-gradient(${angle}deg, ${start} 0 7%, ${startMid} 18%, transparent 35% 65%, ${endMid} 82%, ${end} 93% 100%)`;
	const rgba = (alpha: number, rgb = "0, 0, 0") => `rgba(${rgb}, ${alpha})`;

	return [
		band(90, rgba(0.12), rgba(0.05), rgba(lightX, light), rgba(lightX / 2.5, light)),
		band(180, rgba(lightY, light), rgba(lightY / 2.5, light), rgba(0.2), rgba(0.08)),
	];
}

const TILE_BEVEL = bevelLayers("132, 221, 255", 0.55, 0.85);
const TEXT_BEVEL = bevelLayers("255, 255, 255", 0.5, 0.8);

// The shader varies each blue tile's brightness by up to 4% with a hash of its
// grid cell. CSS has no hash, so this approximates it the cicada way: each
// layer marks one tile in an N x M block, and the blocks' prime sizes keep
// the overlaps from lining up into a visible repeat for a long way. The
// marker is a conic-gradient quarter centered on the block's first tile
// corner, which fills exactly that tile; [cols, rows, x, y, color].
const TILE_VARIATION: [number, number, number, number, string][] = [
	[3, 5, 1, 2, "rgba(0, 0, 0, 0.04)"],
	[5, 3, 3, 0, "rgba(255, 255, 255, 0.07)"],
	[7, 2, 5, 1, "rgba(0, 0, 0, 0.035)"],
	[2, 7, 0, 4, "rgba(255, 255, 255, 0.05)"],
	[11, 3, 8, 2, "rgba(0, 0, 0, 0.045)"],
	[13, 5, 6, 3, "rgba(255, 255, 255, 0.06)"],
	[17, 2, 12, 0, "rgba(0, 0, 0, 0.04)"],
];
const VARIATION_LAYERS = TILE_VARIATION.map(([, , , , color]) =>
	`conic-gradient(from 270deg at ${TILE} ${TILE}, ${color} 0 90deg, transparent 90deg)`
);

// A stand-in for the caustics: soft pale patches a few tiles across, again
// on prime-sized repeats so they don't fall into an obvious pattern. They sit
// under the grout, which the shader's caustics do light, but a flat grout
// reads better here than a half-lit one. [cols, rows, x, y, width, height].
const CAUSTIC_PATCHES: [number, number, number, number, number, number][] = [
	[7, 5, 2, 1, 3.5, 1.8],
	[11, 7, 6, 4, 2.6, 2.2],
	[13, 3, 9, 0, 4, 1.2],
];
const CAUSTIC_LAYERS = CAUSTIC_PATCHES.map(([, , x, y, width, height]) =>
	`radial-gradient(calc(${width / 2} * ${TILE}) calc(${height / 2} * ${TILE}) at calc(${x + width / 2} * ${TILE}) calc(${y + height / 2} * ${TILE}), rgba(225, 245, 255, 0.3), rgba(225, 245, 255, 0.12) 50%, transparent)`
);

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

export function HeaderPlaceholder()
{
	return (
		<div
			aria-hidden
			className="absolute inset-0"
			style={{
				pointerEvents: "none",
				backgroundColor: TILE_BLUE,
				// Grout over the bevel over the caustics and variation, so the grout lines
				// stay flat like the shader's (it masks the bevel to the face).
				backgroundImage: [...GROUT_LAYERS, ...TILE_BEVEL, ...CAUSTIC_LAYERS, ...VARIATION_LAYERS].join(", "),
				backgroundSize: [
					...Array(GROUT_LAYERS.length + TILE_BEVEL.length).fill(`${TILE} ${TILE}`),
					...[...CAUSTIC_PATCHES, ...TILE_VARIATION].map(([cols, rows]) => `calc(${cols} * ${TILE}) calc(${rows} * ${TILE})`),
				].join(", "),
				// The shader's grid origin is gl_FragCoord (0,0) = bottom-left,
				// so anchor there; when the height isn't a whole number of
				// tiles, the partial row lands at the top like the canvas.
				backgroundPosition: [
					...Array(GROUT_LAYERS.length + TILE_BEVEL.length + CAUSTIC_PATCHES.length).fill("left bottom"),
					...TILE_VARIATION.map(([, , x, y]) => `left calc(${x} * ${TILE}) bottom calc(${y} * ${TILE})`),
				].join(", "),
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
										backgroundColor: TEXT_TILE,
										backgroundImage: [...GROUT_LAYERS, ...TEXT_BEVEL].join(", "),
									}}
								/>
							) : null
						)
					)}
			</div>
		</div>
	);
}
