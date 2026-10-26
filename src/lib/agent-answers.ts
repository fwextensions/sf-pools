// The answers module wired to the published data, for the server routes that
// agents call: the MCP server at /mcp and the JSON endpoint at /api/sessions.
// Data only changes with a deploy, so it's read once per warm function.
import { loadCityHolidays, loadSchedules, loadUpcomingSchedules } from "@/lib/site-data";
import { SITE_URL } from "@/lib/site-url";
import { SwimAnswerError, WHEN_WINDOWS, createSwimAnswers, pacificMoment, parseMoment, type SessionQuery, type SwimAnswers, type WhenWindow } from "@/lib/swim-answers";
import type { Moment } from "@/lib/now-soon";

let answers: Promise<SwimAnswers> | null = null;

export function loadSwimAnswers(): Promise<SwimAnswers> {
	answers ??= Promise.all([loadSchedules(), loadUpcomingSchedules(), loadCityHolidays()])
		.then(([schedules, upcoming, holidays]) => createSwimAnswers({ schedules, upcoming, holidays }, { siteUrl: SITE_URL }))
		.catch((error) => {
			// a failed read is tried again on the next request rather than kept
			answers = null;
			throw error;
		});
	return answers;
}

/** the moment asked about: `at` when given, else now in San Francisco */
export function momentFor(at: string | null | undefined): Moment {
	return at ? parseMoment(at) : pacificMoment();
}

function list(raw: string | null): string[] | undefined {
	const values = raw?.split(",").map((v) => v.trim()).filter(Boolean);
	return values?.length ? values : undefined;
}

/**
 * A find_sessions query from /api/sessions' query string, named like the
 * grid's where they overlap: ?when=soon&program=lap&pools=balboa,mlk
 */
export function sessionQueryFromParams(params: URLSearchParams): SessionQuery {
	const when = params.get("when");
	if (when && !WHEN_WINDOWS.includes(when as WhenWindow)) {
		throw new SwimAnswerError(`no window "${when}"; use one of ${WHEN_WINDOWS.join(", ")}, or from and to`);
	}
	const dropIn = params.get("dropIn");
	if (dropIn != null && dropIn !== "true" && dropIn !== "false") {
		throw new SwimAnswerError(`dropIn is true or false, not "${dropIn}"`);
	}
	const limit = params.get("limit");
	if (limit != null && !/^\d+$/.test(limit)) throw new SwimAnswerError(`limit is a whole number, not "${limit}"`);

	const query: SessionQuery = {
		when: (when as WhenWindow | null) ?? undefined,
		from: params.get("from") ?? undefined,
		to: params.get("to") ?? undefined,
		pools: list(params.get("pools")),
		categories: list(params.get("program")),
		days: list(params.get("days")),
		startAfter: params.get("startAfter") ?? undefined,
		startBefore: params.get("startBefore") ?? undefined,
		dropInOnly: dropIn == null ? undefined : dropIn === "true",
		limit: limit == null ? undefined : Number(limit),
	};
	return Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined)) as SessionQuery;
}
