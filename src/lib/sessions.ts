// Every view of the week starts from the same flat list: one session per
// program, described for display, with its times parsed once into minutes.
// A program whose times don't parse isn't a session. The pipeline fails the
// build on those, so none should reach the site; a view that wants to list
// them anyway (the schedules page) asks programMinutes directly.
import type { PoolSchedule, ProgramEntry } from "@/lib/pdf-processor";
import { describeProgram } from "@/lib/program-display";
import { parseTimeToMinutes } from "@/lib/time";

export type Day = ProgramEntry["dayOfWeek"];

export const DAYS: Day[] = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
];

export type Session = {
	poolId: string;
	title: string;
	badges: string[];
	tags: string[];
	dayOfWeek: Day;
	startTime: string;
	endTime: string;
	startMin: number;
	endMin: number;
};

/** a program's start and end in minutes, or null when either doesn't parse */
export function programMinutes(
	p: Pick<ProgramEntry, "startTime" | "endTime">
): { startMin: number; endMin: number } | null {
	const startMin = parseTimeToMinutes(p.startTime);
	const endMin = parseTimeToMinutes(p.endTime);
	return startMin == null || endMin == null ? null : { startMin, endMin };
}

export function toSessions(all: PoolSchedule[]): Session[] {
	const out: Session[] = [];
	for (const pool of all) {
		for (const p of pool.programs || []) {
			const minutes = programMinutes(p);
			if (!minutes) continue;
			const display = describeProgram(p);
			out.push({
				poolId: pool.id,
				title: display.title,
				badges: display.badges,
				tags: p.tags ?? [],
				dayOfWeek: p.dayOfWeek,
				startTime: p.startTime,
				endTime: p.endTime,
				...minutes,
			});
		}
	}
	return out;
}

/** whether any part of the session falls in [from, to) */
export function overlaps(s: Session, from: number, to: number): boolean {
	return s.startMin < to && s.endMin > from;
}

export type SessionsAround = {
	// the running session that ends first
	current: Session | undefined;
	// sessions starting from now until the window closes, earliest first
	upcoming: Session[];
	// the first session after the window
	later: Session | undefined;
};

/** where a set of sessions (usually one pool's) stand at a moment on a day */
export function around(
	sessions: Session[],
	now: { day: Day; minutes: number },
	windowMin: number
): SessionsAround {
	const today = sessions
		.filter((s) => s.dayOfWeek === now.day)
		.sort((a, b) => a.startMin - b.startMin);
	const windowEnd = now.minutes + windowMin;

	return {
		current: today
			.filter((s) => s.startMin <= now.minutes && now.minutes < s.endMin)
			.sort((a, b) => a.endMin - b.endMin)[0],
		upcoming: today.filter((s) => s.startMin >= now.minutes && s.startMin < windowEnd),
		later: today.find((s) => s.startMin >= windowEnd),
	};
}
