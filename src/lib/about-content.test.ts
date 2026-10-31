import { describe, it, expect } from "@jest/globals";
import { aboutFacilities, aboutMarkdown, loadAboutSource, parseAbout } from "./about-content";
import { loadPools } from "./site-data";

const SITE = "https://sfpools.example";

describe("the About page's markdown", () => {
	it("splits into the title, the lede and its sections", async () => {
		const about = parseAbout(await loadAboutSource(), SITE);
		expect(about.title).toBe("About SF Pools");
		expect(about.lede).toBe("Every public pool schedule in San Francisco, in one place.");
		expect(about.sections.map((s) => s.title)).toEqual([
			"What this is",
			"Where the schedules come from",
			"Check before you go",
			"The pools",
			"For AI assistants",
			"The code",
		]);
		expect(about.sections.filter((s) => s.pools).map((s) => s.title)).toEqual(["The pools"]);
		expect(about.sections.find((s) => s.pools)!.body).toBe("");
		expect(about.sections.find((s) => s.title === "For AI assistants")!.body).toContain(`\`${SITE}/mcp\``);
	});

	it("serves with the site's address in every link and the pools listed", async () => {
		const md = aboutMarkdown(await loadAboutSource(), SITE, aboutFacilities(await loadPools()));
		expect(md).not.toMatch(/\]\(\//);
		expect(md).not.toContain("<!--");
		expect(md).not.toContain("{SITE_URL}");
		expect(md).toContain(`](${SITE}/now)`);
		expect(md).toContain(`- [Balboa Pool](${SITE}/pools/balboa.md): 1000 Ocean Ave`);
	});
});
