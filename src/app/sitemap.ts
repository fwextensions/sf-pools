import type { MetadataRoute } from "next";
import { buildPoolPages } from "@/lib/pool-pages";
import { loadChangelogs, loadPools, loadSchedules } from "@/lib/site-data";
import { SITE_URL } from "@/lib/site-url";

// A pool's page last changed on the newest run whose changelog lists that
// pool; the pages that show every pool changed on the newest run of all.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const [records, schedules, changelogs] = await Promise.all([loadPools(), loadSchedules(), loadChangelogs()]);
	const lastChange = changelogs[0]?.date;

	const poolPages = buildPoolPages(records, schedules).map((page) => {
		const names = new Set(page.pools.map(({ schedule }) => schedule.name));
		const changed = changelogs.find((entry) => entry.pools.some((p) => names.has(p.poolName)))?.date;
		return { url: `${SITE_URL}/pools/${page.slug}`, lastModified: changed };
	});

	return [
		{ url: `${SITE_URL}/`, lastModified: lastChange },
		{ url: `${SITE_URL}/now`, lastModified: lastChange },
		{ url: `${SITE_URL}/schedules`, lastModified: lastChange },
		{ url: `${SITE_URL}/pools` },
		...poolPages,
		{ url: `${SITE_URL}/changes`, lastModified: lastChange },
		{ url: `${SITE_URL}/about` },
	];
}
