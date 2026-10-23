// A session is one program on one date, described for display, with its
// times parsed once into minutes. The pool calendar decides which sessions a
// date has; a view that wants to list the programs whose times don't parse
// (the schedules page) asks programMinutes directly.
import type { ProgramEntry } from "@/lib/pdf-processor";
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
	/** YYYY-MM-DD, a date the program falls on */
	date: string;
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

/** whether any part of the session falls in [from, to) */
export function overlaps(s: Session, from: number, to: number): boolean {
	return s.startMin < to && s.endMin > from;
}
