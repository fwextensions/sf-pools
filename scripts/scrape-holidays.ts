// Fetch San Francisco's holiday list from sf.gov into public/data/city_holidays.json.
// A run that already has the wanted year (next year's in December, this
// year's otherwise) does nothing, so the workflow can run every day until
// the city posts the new list. --force fetches anyway.
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchWithRetry } from "./http";
import { sendNotification } from "./notify";
import { pacificToday } from "../src/lib/closures";
import {
	HOLIDAY_API_URL,
	HOLIDAY_PAGE_URL,
	hasYear,
	mergeHolidays,
	parseHolidayPage,
	wantedYear,
	type CityHolidaysData,
} from "../src/lib/city-holidays";

const OUT_FILE = path.join(process.cwd(), "public", "data", "city_holidays.json");

async function loadSaved(): Promise<CityHolidaysData | null> {
	try {
		return JSON.parse(await readFile(OUT_FILE, "utf-8")) as CityHolidaysData;
	} catch {
		return null;
	}
}

// sf.gov's firewall now and then answers with an empty 202 and a challenge
// for a browser to solve, rather than an error status, and lets the same
// request through a moment later
const ATTEMPTS = 4;

async function fetchPage(): Promise<unknown> {
	for (let attempt = 1; ; attempt++) {
		const res = await fetchWithRetry(HOLIDAY_API_URL, { headers: { accept: "application/json" } });
		const body = await res.text();
		const challenged = res.headers.get("x-amzn-waf-action") || !body;
		if (!challenged) {
			if (!res.ok) throw new Error(`request failed ${res.status} ${res.statusText} for ${HOLIDAY_API_URL}`);
			return JSON.parse(body);
		}
		const why = `${res.status}, ${res.headers.get("x-amzn-waf-action") ?? "empty body"}`;
		if (attempt === ATTEMPTS) throw new Error(`sf.gov's firewall turned the request away ${ATTEMPTS} times (${why})`);
		console.warn(`sf.gov's firewall turned the request away (${why}); trying again`);
		await new Promise((res) => setTimeout(res, 2000 * 2 ** attempt));
	}
}

async function main() {
	const force = process.argv.includes("--force");
	const notify = process.argv.includes("--notify");
	const today = pacificToday();
	const year = wantedYear(today);
	const saved = await loadSaved();
	const before = saved?.holidays ?? [];

	if (hasYear(before, year) && !force) {
		console.log(`already have the ${year} holidays; nothing to do`);
		return;
	}

	const found = parseHolidayPage(await fetchPage());
	if (!found.length) {
		// the page is there but nothing on it reads as a holiday, so its layout
		// has likely changed
		throw new Error(`no holidays found on ${HOLIDAY_PAGE_URL}`);
	}
	const years = [...new Set(found.map((h) => h.date.slice(0, 4)))];
	console.log(`found ${found.length} holidays for ${years.join(", ")}`);

	const holidays = mergeHolidays(before, found);
	if (JSON.stringify(holidays) !== JSON.stringify(before)) {
		const data: CityHolidaysData = { source: HOLIDAY_PAGE_URL, lastUpdated: today, holidays };
		await writeFile(OUT_FILE, JSON.stringify(data, null, "\t") + "\n");
		console.log(`wrote ${path.relative(process.cwd(), OUT_FILE)}`);
	}

	if (!hasYear(holidays, year)) {
		console.log(`sf.gov hasn't posted the ${year} holidays yet; the next run tries again`);
		return;
	}
	if (notify && !hasYear(before, year)) {
		const list = holidays.filter((h) => h.date.startsWith(year));
		await sendNotification({
			title: `📅 ${year} City Holidays`,
			message: [
				`Pools close on these ${list.length} dates unless a PDF says otherwise:`,
				...list.map((h) => `• ${h.date} ${h.name}${h.observed ? " (observed)" : ""}`),
			].join("\n"),
			priority: -1,
			url: HOLIDAY_PAGE_URL,
			urlTitle: "sf.gov holiday schedule",
		});
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
