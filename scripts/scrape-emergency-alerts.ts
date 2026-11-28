// Fetch Rec & Park's emergency alerts from the Alert Center into
// public/data/emergency_alerts.json. Every alert is kept and logged; only
// the ones that read as touching the pools show on the site. The file only
// changes when the alerts do, so the scheduled workflow commits, and Vercel
// deploys, only then. --notify sends a push for each newly posted alert
// that affects the pools.
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchText } from "./http";
import { sendNotification } from "./notify";
import { pacificToday } from "../src/lib/closures";
import { ALERT_CENTER_URL, parseAlertCenter, parseAlertDetail } from "../src/lib/alert-center";
import { mergeAlerts, type EmergencyAlertsData } from "../src/lib/emergency-alerts";

const OUT_FILE = path.join(process.cwd(), "public", "data", "emergency_alerts.json");

async function loadSaved(): Promise<EmergencyAlertsData | null> {
	try {
		return JSON.parse(await readFile(OUT_FILE, "utf-8")) as EmergencyAlertsData;
	} catch {
		return null;
	}
}

async function main() {
	const notify = process.argv.includes("--notify");
	const today = pacificToday();
	const saved = await loadSaved();
	const previous = saved?.alerts ?? [];

	let listed;
	try {
		listed = parseAlertCenter(await fetchText(ALERT_CENTER_URL));
	} catch (err) {
		// sfrecpark.org has bad hours; the saved alerts stand until the next
		// run gets through, rather than failing the workflow every hour
		console.warn("could not read the Alert Center; keeping the saved alerts", err);
		return;
	}

	// the list cuts each alert short, so read the rest from its own page
	for (const alert of listed) {
		try {
			const full = parseAlertDetail(await fetchText(alert.url));
			if (full) alert.text = full;
		} catch (err) {
			console.warn(`could not read alert ${alert.id}; using the text from the list`, err);
		}
	}

	const alerts = mergeAlerts(listed, previous, today);
	console.log(`${alerts.length} alert(s) on the Alert Center`);
	for (const a of alerts) {
		const scope = !a.affectsPools ? "not pools" : a.poolIds.length ? a.poolIds.join(", ") : "all pools";
		console.log(`  [${a.id}] ${a.title} (${scope}${a.matched ? `, matched "${a.matched}"` : ""})`);
	}

	const data: EmergencyAlertsData = { alerts };
	const json = JSON.stringify(data, null, "\t") + "\n";
	if (saved && JSON.stringify(saved, null, "\t") + "\n" === json) {
		console.log("no change");
		return;
	}
	await writeFile(OUT_FILE, json, "utf-8");
	console.log("Wrote:", OUT_FILE);

	const fresh = alerts.filter((a) => a.affectsPools && !previous.some((p) => p.id === a.id));
	if (notify && fresh.length) {
		await sendNotification({
			title: `🚨 Rec & Park emergency alert${fresh.length > 1 ? "s" : ""} affecting pools`,
			message: fresh.map((a) => `• ${a.title}`).join("\n"),
			url: fresh[0]!.url,
			priority: 1,
		});
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
