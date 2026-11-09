// tests for analytics.ts
import { describe, it, expect } from "@jest/globals";
import { internalTagFor, outboundLinkFor } from "./analytics";

describe("internalTagFor", () => {
	it("marks the browser on ?me=1", () => {
		expect(internalTagFor("?me=1", "sfpools.org")).toBe("mark");
		expect(internalTagFor("?cell=thu-20&me=1", "sfpools.org")).toBe("mark");
	});

	it("unmarks it on ?me=0, even on a dev server", () => {
		expect(internalTagFor("?me=0", "sfpools.org")).toBe("unmark");
		expect(internalTagFor("?me=0", "localhost")).toBe("unmark");
	});

	it("always marks a dev server", () => {
		expect(internalTagFor("", "localhost")).toBe("mark");
		expect(internalTagFor("?cell=thu-20", "127.0.0.1")).toBe("mark");
	});

	it("leaves an ordinary visit alone", () => {
		expect(internalTagFor("", "sfpools.org")).toBe("keep");
		expect(internalTagFor("?me=yes", "sfpools.org")).toBe("keep");
	});
});

describe("outboundLinkFor", () => {
	const origin = "https://sfpools.org";

	it("ignores links within the site", () => {
		expect(outboundLinkFor("/pools/balboa", origin)).toBeNull();
		expect(outboundLinkFor("#pool-mlk", origin)).toBeNull();
		expect(outboundLinkFor("https://sfpools.org/about", origin)).toBeNull();
	});

	it("counts Rec & Park's DocumentCenter links as PDFs", () => {
		expect(outboundLinkFor("https://sfrecpark.org/DocumentCenter/View/26035/Balboa-Pool-Schedule", origin))
			.toMatchObject({ kind: "pdf", host: "sfrecpark.org" });
		expect(outboundLinkFor("https://example.com/schedule.PDF", origin)).toMatchObject({ kind: "pdf" });
	});

	it("tells Rec & Park pages, maps and GitHub apart", () => {
		expect(outboundLinkFor("https://sfrecpark.org/482/Swimming-Pools", origin)).toMatchObject({ kind: "rec_park" });
		expect(outboundLinkFor("https://www.sfrecpark.org/register", origin)).toMatchObject({ kind: "rec_park", host: "sfrecpark.org" });
		expect(outboundLinkFor("https://maps.apple.com/?q=Balboa+Pool", origin)).toMatchObject({ kind: "map" });
		expect(outboundLinkFor("https://www.google.com/maps/search/?api=1&query=x", origin)).toMatchObject({ kind: "map" });
		expect(outboundLinkFor("https://github.com/fwextensions/sf-pools", origin)).toMatchObject({ kind: "github" });
		expect(outboundLinkFor("https://llmstxt.org", origin)).toMatchObject({ kind: "external" });
	});

	it("counts phone and email links", () => {
		expect(outboundLinkFor("tel:4155551234", origin)).toMatchObject({ kind: "phone" });
		expect(outboundLinkFor("mailto:someone@example.com", origin)).toMatchObject({ kind: "email" });
	});

	it("skips hrefs that aren't URLs or aren't web links", () => {
		expect(outboundLinkFor("javascript:void(0)", origin)).toBeNull();
		expect(outboundLinkFor("http://[bad", origin)).toBeNull();
	});
});
