// Pushover notification integration for schedule updates
import "dotenv/config";

const PUSHOVER_API_URL = "https://api.pushover.net/1/messages.json";

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

export async function notifyScheduleUpdate(summary: string): Promise<boolean> {
	return sendNotification({
		title: "🏊 Pool Schedules Updated",
		message: summary,
		priority: 0,
		url: "https://sf-pools.vercel.app/schedules",
		urlTitle: "View Schedules",
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
	const message = args.slice(1).join(" ");

	if (type === "update") {
		notifyScheduleUpdate(message || "Schedules have been updated.").then((ok) => {
			process.exit(ok ? 0 : 1);
		});
	} else if (type === "no-changes") {
		notifyScheduleNoChanges().then((ok) => {
			process.exit(ok ? 0 : 1);
		});
	} else if (type === "error") {
		notifyError(message || "An error occurred during schedule update.").then((ok) => {
			process.exit(ok ? 0 : 1);
		});
	} else {
		console.log("Usage: tsx scripts/notify.ts <update|no-changes|error> [message]");
		process.exit(1);
	}
}
