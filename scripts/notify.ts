// Pushover notification integration for schedule updates
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ChangelogEntry } from "./changelog";

const PUSHOVER_API_URL = "https://api.pushover.net/1/messages.json";
const GITHUB_REPO = "fwextensions/sf-pools";
const GITHUB_CHANGELOG_PATH = "data/changelog";

export type NotificationOptions = {
	title: string;
	message: string;
	priority?: -2 | -1 | 0 | 1 | 2;
	url?: string;
	urlTitle?: string;
};

export async function sendNotification(options: NotificationOptions): Promise<boolean> {
	const userKey = process.env.PUSHOVER_USER_KEY;
	const apiToken = process.env.PUSHOVER_API_TOKEN;

	if (!userKey || !apiToken) {
		console.warn("Pushover credentials not configured, skipping notification");
		return false;
	}

	const body = new URLSearchParams({
		token: apiToken,
		user: userKey,
		title: options.title,
		message: options.message,
		priority: String(options.priority ?? 0),
	});

	if (options.url) {
		body.set("url", options.url);
	}
	if (options.urlTitle) {
		body.set("url_title", options.urlTitle);
	}

	try {
		const res = await fetch(PUSHOVER_API_URL, {
			method: "POST",
			body,
		});

		if (!res.ok) {
			const text = await res.text();
			console.error("Pushover API error:", res.status, text);
			return false;
		}

		console.log("Notification sent successfully");
		return true;
	} catch (err) {
		console.error("Failed to send notification:", err);
		return false;
	}
}

function formatDateRange(start: string | null, end: string | null): string {
	if (!start || !end) return "";
	// format as "Jan 6 – Mar 14"
	const startDate = new Date(start + "T00:00:00");
	const endDate = new Date(end + "T00:00:00");
	const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
	return `${startDate.toLocaleDateString("en-US", opts)} – ${endDate.toLocaleDateString("en-US", opts)}`;
}

function severityEmoji(severity: string): string {
	switch (severity) {
		case "wholesale": return "🔄"; // new season
		case "major": return "📢";
		case "moderate": return "📝";
		case "minor": return "✏️";
		default: return "";
	}
}

function severityLabel(severity: string): string {
	switch (severity) {
		case "wholesale": return "New schedule season";
		case "major": return "Major update";
		case "moderate": return "Moderate update";
		case "minor": return "Minor update";
		default: return "Update";
	}
}

export async function loadLatestChangelog(): Promise<ChangelogEntry | null> {
	const changelogDir = path.join(process.cwd(), "data", "changelog");
	try {
		const { readdir } = await import("node:fs/promises");
		const files = await readdir(changelogDir);
		const jsonFiles = files.filter((f) => f.endsWith(".json")).sort().reverse();
		if (jsonFiles.length === 0) return null;
		const latest = path.join(changelogDir, jsonFiles[0]!);
		const raw = await readFile(latest, "utf-8");
		return JSON.parse(raw) as ChangelogEntry;
	} catch {
		return null;
	}
}

export async function notifyScheduleUpdate(changelog?: ChangelogEntry | null): Promise<boolean> {
	const entry = changelog ?? await loadLatestChangelog();

	let title = "🏊 Pool Schedules Updated";
	let message = "Schedules have been updated.";
	let url = "https://sf-pools.vercel.app/schedules";
	let urlTitle = "View Schedules";

	if (entry) {
		const emoji = severityEmoji(entry.changeSeverity);
		const label = severityLabel(entry.changeSeverity);
		title = `${emoji} ${label}`;

		const lines: string[] = [];

		// schedule date range
		if (entry.scheduleSeason) {
			lines.push(entry.scheduleSeason);
		}
		const dateRange = formatDateRange(entry.scheduleStartDate, entry.scheduleEndDate);
		if (dateRange) {
			lines.push(dateRange);
		}

		// change summary
		const parts: string[] = [];
		if (entry.totalProgramsAdded > 0) parts.push(`+${entry.totalProgramsAdded}`);
		if (entry.totalProgramsRemoved > 0) parts.push(`-${entry.totalProgramsRemoved}`);
		if (entry.totalProgramsModified > 0) parts.push(`~${entry.totalProgramsModified}`);
		if (parts.length > 0) {
			lines.push(`${entry.poolsChanged} pool(s): ${parts.join(" ")} programs`);
		}

		// warnings
		if (entry.warnings.length > 0) {
			lines.push(`⚠️ ${entry.warnings.length} warning(s)`);
		}

		message = lines.join("\n");

		// link to GitHub changelog
		url = `https://github.com/${GITHUB_REPO}/tree/main/${GITHUB_CHANGELOG_PATH}`;
		urlTitle = "View Change History";
	}

	return sendNotification({
		title,
		message,
		priority: 0,
		url,
		urlTitle,
	});
}

export async function notifyScheduleNoChanges(): Promise<boolean> {
	return sendNotification({
		title: "🏊 Pool Schedules Checked",
		message: "No changes detected in pool schedules.",
		priority: -1,
	});
}

export async function notifyError(error: string): Promise<boolean> {
	return sendNotification({
		title: "⚠️ Pool Schedule Update Failed",
		message: error,
		priority: 1,
	});
}

// CLI interface
if (import.meta.main) {
	const args = process.argv.slice(2);
	const type = args[0];

	if (type === "update") {
		// load changelog and send rich notification
		notifyScheduleUpdate().then((ok) => {
			process.exit(ok ? 0 : 1);
		});
	} else if (type === "no-changes") {
		notifyScheduleNoChanges().then((ok) => {
			process.exit(ok ? 0 : 1);
		});
	} else if (type === "error") {
		const message = args.slice(1).join(" ");
		notifyError(message || "An error occurred during schedule update.").then((ok) => {
			process.exit(ok ? 0 : 1);
		});
	} else {
		console.log("Usage: tsx scripts/notify.ts <update|no-changes|error> [message]");
		process.exit(1);
	}
}
