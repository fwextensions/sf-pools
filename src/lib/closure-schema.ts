// Validators for the closure types in closures.ts. They live apart from
// those helpers because the browser imports closures.ts, and zod pulled in
// from there put the whole library, every locale included, in the client
// bundle. The checks at the bottom keep each type and its validator from
// drifting apart.
import { z } from "zod";
import type { Closure, ScheduledClosure } from "./closures";

/** validation for a persisted closure */
export const ClosureSchema = z.object({
	summary: z.string(),
	rawText: z.string(),
	startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
	endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
	indefinite: z.boolean(),
	sourceUrl: z.string().url().nullable(),
	reason: z.string().nullable(),
	scope: z.enum(["whole-pool", "partial"]),
	source: z.enum(["pattern", "model", "pattern+model"]),
	suppressPrograms: z.boolean(),
	confidence: z.number().min(0).max(1).nullable(),
	disagreement: z.string().nullable(),
});

const TIME = /^(0?[1-9]|1[0-2]):[0-5]\d[ap]$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const ScheduledClosureSchema = z.object({
	startDate: z.string().regex(DATE).describe("first closed day, YYYY-MM-DD"),
	endDate: z.string().regex(DATE).describe("last closed day, YYYY-MM-DD; the same as startDate for one day"),
	startTime: z
		.string()
		.regex(TIME)
		.nullable()
		.describe("h:mm[a|p] when only part of the day is closed, else null"),
	endTime: z
		.string()
		.regex(TIME)
		.nullable()
		.describe("h:mm[a|p] when only part of the day is closed, else null"),
	reason: z.string().nullable().describe("the holiday or reason as written, e.g. 'Veterans Day'"),
});

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const closureMatches: Same<z.infer<typeof ClosureSchema>, Closure> = true;
const scheduledClosureMatches: Same<z.infer<typeof ScheduledClosureSchema>, ScheduledClosure> = true;
void closureMatches;
void scheduledClosureMatches;
