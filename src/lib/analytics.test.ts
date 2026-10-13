// tests for analytics.ts
import { describe, it, expect } from "@jest/globals";
import { internalTagFor } from "./analytics";

describe("internalTagFor", () => {
	it("marks the browser on ?me=1", () => {
		expect(internalTagFor("?me=1", "sf-pools.vercel.app")).toBe("mark");
		expect(internalTagFor("?cell=thu-20&me=1", "sf-pools.vercel.app")).toBe("mark");
	});

	it("unmarks it on ?me=0, even on a dev server", () => {
		expect(internalTagFor("?me=0", "sf-pools.vercel.app")).toBe("unmark");
		expect(internalTagFor("?me=0", "localhost")).toBe("unmark");
	});

	it("always marks a dev server", () => {
		expect(internalTagFor("", "localhost")).toBe("mark");
		expect(internalTagFor("?cell=thu-20", "127.0.0.1")).toBe("mark");
	});

	it("leaves an ordinary visit alone", () => {
		expect(internalTagFor("", "sf-pools.vercel.app")).toBe("keep");
		expect(internalTagFor("?me=yes", "sf-pools.vercel.app")).toBe("keep");
	});
});
