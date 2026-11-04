import { describe, it, expect } from "@jest/globals";
import { passPrices, type FeeGroup } from "./admission-fees";

const group = (name: string, detail: string, fees: [string, number][]): FeeGroup => ({
	name,
	detail,
	fees: fees.map(([name, price]) => ({ name, price })),
});

// the 2026 notice, cut down
const GROUPS = [
	group("Children", "0-17", [["Rec Swim and Lap Swim Drop-in", 2], ["Summer Pass", 34]]),
	group("Adult", "18-64", [["Rec Swim and Lap Swim Drop-in", 8], ["Recreation Swim Pass - 10 visits", 76], ["Yearly Swim Pass", 1007]]),
	group("Seniors", "65+", [["Rec Swim and Lap Swim Drop-in", 7], ["Recreation Swim Pass - 10 visits", 35]]),
	group("Economic Need", "Medi-Cal recipients", [["Rec Swim and Lap Swim Drop-in ", 7], ["Recreation Swim Pass - 10 visits", 35]]),
];

const who = (name: string, detail: string) => ({ name, detail });

describe("the drop-in and 10-visit prices", () => {
	it("lists each kind of entry once, merging the groups that pay the same", () => {
		expect(passPrices(GROUPS)).toEqual([
			{
				name: "Rec Swim and Lap Swim Drop-in",
				prices: [
					{ groups: [who("Children", "0-17")], price: 2 },
					{ groups: [who("Adult", "18-64")], price: 8 },
					{ groups: [who("Seniors", "65+"), who("Economic Need", "Medi-Cal recipients")], price: 7 },
				],
			},
			{
				name: "Recreation Swim Pass - 10 visits",
				prices: [
					{ groups: [who("Adult", "18-64")], price: 76 },
					{ groups: [who("Seniors", "65+"), who("Economic Need", "Medi-Cal recipients")], price: 35 },
				],
			},
		]);
	});
});
