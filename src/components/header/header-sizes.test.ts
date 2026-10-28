import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import path from "node:path";
import { headerHeightPx, tileCssPx } from "./HeaderPlaceholder";

// globals.css spells the header's tile sizes out per width, so the CSS and
// the canvas sizing can drift apart without either failing on its own
function cssSteps() {
	const css = readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8");
	const steps = [...css.matchAll(/@media \(min-width: (\d+)px\) \{\s*:root \{\s*--tile: (\d+)px;\s*--header-h: (\d+)px;\s*--header-text-bottom: (\d+)px;/g)];

	return steps.map(([, width, tile, height, textBottom]) => ({
		width: Number(width),
		tile: Number(tile),
		height: Number(height),
		textBottom: Number(textBottom),
	}));
}

describe("header tile sizes in globals.css", () => {
	const steps = cssSteps();

	it("has a step for every tile size up to the largest", () => {
		expect(steps.map(s => s.tile)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
	});

	it("matches tileCssPx and headerHeightPx across each step", () => {
		for (const { width, tile, height, textBottom } of steps) {
			const rows = height / tile;
			for (const w of [width, width + 32]) {
				expect(tileCssPx(w)).toBe(tile);
				expect(headerHeightPx(w)).toBe(height);
			}
			expect(textBottom).toBe(Math.ceil((rows - 5) / 2) * tile);
		}
	});
});
