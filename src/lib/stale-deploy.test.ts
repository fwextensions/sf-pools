// tests for stale-deploy.ts
import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { isChunkLoadError, reloadForNewDeploy } from "./stale-deploy";

function chunkError() {
	const error = new Error("Failed to load chunk /_next/static/chunks/1hp0rm6axy59t.js from module 64893");
	error.name = "ChunkLoadError";
	return error;
}

describe("isChunkLoadError", () => {
	it("recognizes Turbopack's ChunkLoadError", () => {
		expect(isChunkLoadError(chunkError())).toBe(true);
	});

	it("recognizes a failed dynamic import by its message", () => {
		expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/a.js"))).toBe(true);
	});

	it("leaves other errors alone", () => {
		expect(isChunkLoadError(new TypeError("undefined is not an object"))).toBe(false);
		expect(isChunkLoadError("ChunkLoadError")).toBe(false);
	});
});

describe("reloadForNewDeploy", () => {
	let store: Map<string, string>;
	let reload: jest.Mock;

	beforeEach(() => {
		store = new Map();
		reload = jest.fn();
		Object.assign(globalThis, {
			window: { location: { reload } },
			sessionStorage: {
				getItem: (key: string) => store.get(key) ?? null,
				setItem: (key: string, value: string) => store.set(key, value),
			},
		});
	});

	it("reloads once for a chunk error", () => {
		expect(reloadForNewDeploy(chunkError())).toBe(true);
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it("doesn't reload again straight after, so a missing chunk can't loop", () => {
		reloadForNewDeploy(chunkError());
		expect(reloadForNewDeploy(chunkError())).toBe(false);
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it("ignores other errors", () => {
		expect(reloadForNewDeploy(new Error("boom"))).toBe(false);
		expect(reload).not.toHaveBeenCalled();
	});
});
