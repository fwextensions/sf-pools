// Reads the Alert Center page on sfrecpark.org and each alert's own page.
// Kept apart from emergency-alerts.ts, which the browser imports, so cheerio
// stays out of the client bundle.
import { load } from "cheerio";
import type { ListedAlert } from "@/lib/emergency-alerts";

export const ALERT_CENTER_URL = "https://sfrecpark.org/AlertCenter.aspx";

const clean = (text: string) => text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

/**
 * Every alert on the Alert Center page. The list cuts each alert's text
 * short ("Never walk, bike or..."), so the full text comes from the alert's
 * own page through parseAlertDetail.
 */
export function parseAlertCenter(html: string, pageUrl = ALERT_CENTER_URL): ListedAlert[] {
	const $ = load(html);
	const alerts: ListedAlert[] = [];

	$("#AlertCenterContent h3[id^='alertHeader_']").each((_i, h3) => {
		const id = $(h3).attr("id")!.replace("alertHeader_", "");
		const $alert = $(h3).closest("div.alert");
		const link = $(h3).find("a").first();
		const href = link.attr("href");
		// the category heading sits above the list the alert is in
		const category = clean($(h3).closest("div.listing").find("h2").first().text());
		alerts.push({
			id,
			title: clean(link.text() || $(h3).text()),
			text: paragraphs($, $alert),
			category: category || null,
			posted: clean($alert.find(`#alertDate_${id}`).text()) || null,
			url: href ? new URL(href, pageUrl).toString() : `${pageUrl}?AID=${id}`,
		});
	});

	return alerts;
}

/** the full text of an alert from its own page, or null when the page has none */
export function parseAlertDetail(html: string): string | null {
	const $ = load(html);
	const $alert = $("[id$='alertDetailControl_divAlert']").first();
	if (!$alert.length) return null;
	return paragraphs($, $alert) || null;
}

function paragraphs($: ReturnType<typeof load>, $alert: ReturnType<ReturnType<typeof load>>): string {
	return $alert
		.find("p, li")
		.map((_i, el) => clean($(el).text()))
		.get()
		.filter(Boolean)
		.join("\n\n");
}
