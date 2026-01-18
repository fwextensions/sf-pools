import type { Config } from "jest";

const config: Config = {
	preset: "ts-jest",
	testEnvironment: "node",
	roots: ["<rootDir>/src"],
	testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
	moduleNameMapper: {
		"^@/(.*)$": "<rootDir>/src/$1",
	},
	collectCoverageFrom: [
		"src/**/*.{ts,tsx}",
		"!src/**/*.d.ts",
		"!src/**/*.test.ts",
		"!src/**/*.spec.ts",
	],
	transform: {
		"^.+\\.tsx?$": ["ts-jest", {
			useESM: true,
		}],
	},
	extensionsToTreatAsEsm: [".ts", ".tsx"],
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
};

export default config;
