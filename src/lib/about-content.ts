// The About page's text lives in one markdown file, src/content/about.md. The
// page renders it section by section, and /about.md serves it with absolute
// links. Two things in it aren't plain text: {SITE_URL}, which becomes the
// site's address, and the comment under "The pools", where each version puts
// its own list of the pools.

import { promises as fs } from "fs";
import path from "path";
import { escapeMarkdown, markdownPath } from "./page-markdown";
import { poolPageHref } from "./pool-pages";
import { getPoolToken, type PoolToken } from "./pool-tokens";
import type { PoolRecord } from "./site-data";

export type AboutSection = {
	title: string;
	/** the section's markdown, without its heading */
	body: string;
	/** the section is the pool list, which the page draws itself */
	pools: boolean;
};

export type AboutContent = {
	title: string;
	/** the line under the title */
	lede: string;
	sections: AboutSection[];
};

export type Facility = {
	// the first pool's id, whose page the facility's name links to
	poolId: string;
	name: string;
	address: string;
	pageUrl: string;
	tokens: PoolToken[];
};

const POOLS_MARKER = /<!--[^]*?-->/;

export async function loadAboutSource(): Promise<string> {
	return fs.readFile(path.join(process.cwd(), "src", "content", "about.md"), "utf8");
}

function withSiteUrl(markdown: string, siteUrl: string): string {
	return markdown.replaceAll("{SITE_URL}", siteUrl.replace(/\/$/, ""));
}

/** the title, the lede and the ## sections, for the page to lay out */
export function parseAbout(source: string, siteUrl: string): AboutContent {
	const [head, ...chunks] = withSiteUrl(source, siteUrl).split(/^## /m);
	const title = /^# (.+)$/m.exec(head)?.[1].trim() ?? "About";
	const lede = head.replace(/^# .+$/m, "").trim();
	const sections = chunks.map((chunk) => {
		const newline = chunk.indexOf("\n");
		const body = chunk.slice(newline + 1).trim();
		return {
			title: chunk.slice(0, newline).trim(),
			body: body.replace(POOLS_MARKER, "").trim(),
			pools: POOLS_MARKER.test(body),
		};
	});
	return { title, lede, sections };
}

// North Beach's warm and cool pools are two schedules at one address with one
// page, so the list is of facilities: one row each, with every pool's chip
export function aboutFacilities(records: PoolRecord[]): Facility[] {
	const byPage = new Map<string, Facility>();
	for (const pool of records) {
		const token = getPoolToken(pool.id);
		const existing = byPage.get(pool.pageUrl);
		if (existing) {
			if (token) existing.tokens.push(token);
			continue;
		}
		byPage.set(pool.pageUrl, {
			poolId: pool.id,
			name: pool.nameTitle.replace(/\s*\(.*\)$/, ""),
			address: pool.address.replace(/, San Francisco$/, ""),
			pageUrl: pool.pageUrl,
			tokens: token ? [token] : [],
		});
	}
	return [...byPage.values()];
}

/** /about.md: the file with the site's address in its links and the pools listed */
export function aboutMarkdown(source: string, siteUrl: string, facilities: Facility[]): string {
	const site = siteUrl.replace(/\/$/, "");
	const pools = facilities
		.map((f) => `- [${escapeMarkdown(f.name)}](${site}${markdownPath(poolPageHref(f.poolId))}): ${escapeMarkdown(f.address)} ([SF Rec & Parks page](${f.pageUrl}))`)
		.join("\n");
	return withSiteUrl(source, siteUrl)
		// a link to one of the site's own pages has to say which site, once
		// the file is read somewhere else
		.replace(/\]\(\//g, `](${site}/`)
		.replace(POOLS_MARKER, pools)
		.replace(/\n*$/, "\n");
}
