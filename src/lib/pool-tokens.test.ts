import { describe, it, expect } from "@jest/globals";
import { POOL_TOKENS } from "./pool-tokens";

// WCAG relative luminance of a #rgb or #rrggbb color
function luminance(hex: string): number {
	const h = hex.replace("#", "");
	const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
	const [r, g, b] = [0, 2, 4].map((i) => {
		const c = parseInt(full.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

describe("pool chips", () => {
	it.each(POOL_TOKENS)("$code has a chip fill, chip text and a full name", (token) => {
		expect(token.chip).toMatch(/^#[0-9a-f]{3}([0-9a-f]{3})?$/i);
		expect(token.chipText).toMatch(/^#[0-9a-f]{3}([0-9a-f]{3})?$/i);
		expect(token.fullName.length).toBeGreaterThan(token.code.length);
	});

	it.each(POOL_TOKENS)("$code chip text is legible on its fill", (token) => {
		expect(contrast(token.chip, token.chipText)).toBeGreaterThanOrEqual(4.5);
	});

	it("measures contrast against known values", () => {
		expect(contrast("#000", "#fff")).toBeCloseTo(21, 5);
		expect(contrast("#fff", "#fff")).toBeCloseTo(1, 5);
	});
});
