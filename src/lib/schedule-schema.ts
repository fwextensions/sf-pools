// The shape of a pool's schedule, as the extractor returns it and the site
// reads it from public/data/all_schedules.json. Kept apart from the
// extractor so the site's build doesn't load the model SDK.
import { z } from "zod";
import { ClosureSchema, ScheduledClosureSchema } from "./closure-schema";

export const DayOfWeek = z.enum([
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
]);

export const ProgramSchema = z.object({
	programName: z.string(),
	dayOfWeek: DayOfWeek,
	startTime: z
		.string()
		.regex(/^(0?[1-9]|1[0-2]):[0-5]\d[ap]$/)
		.describe("12-hour format h:mm[a|p], e.g., '9:00a' or '2:15p'"),
	endTime: z
		.string()
		.regex(/^(0?[1-9]|1[0-2]):[0-5]\d[ap]$/)
		.describe("12-hour format h:mm[a|p], e.g., '9:00a' or '2:15p'"),
	// number of lanes assigned to this specific program during this time block, if shown (e.g., "Lap Swim (8)")
	lanes: z.number().int().positive().optional().nullable(),
	notes: z.string().optional().nullable().default(""),
	// m7 fields: optional to avoid breaking existing extractor responses
	programNameOriginal: z.string().optional().nullable(),
	programNameCanonical: z.string().optional().nullable(),
	// the PDF's own title, cleaned of footnote markers — what the UI shows
	title: z.string().optional().nullable(),
	// facets derived from the title: activity:*, audience:*, access:*
	tags: z.array(z.string()).optional().nullable(),
});

export const PoolScheduleSchema = z.object({
	id: z.string(),
	name: z.string(),
	nameTitle: z.string().nullable(),
	shortName: z.string().nullable(),
	address: z.string().optional().nullable(),
	sfRecParkUrl: z.string().url().optional().nullable(),
	pdfScheduleUrl: z.string().url().optional().nullable(),
	scheduleLastUpdated: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional()
		.nullable(),
	scheduleSeason: z.string().optional().nullable(),
	scheduleStartDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional()
		.nullable(),
	scheduleEndDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional()
		.nullable(),
	lanes: z.number().int().positive().optional().nullable(),
	/**
	 * Set by the pipeline (not the extractor) when a scraped alert says the pool
	 * is or will be shut. Programs stay the regular weekly schedule; the site
	 * hides the sessions that fall on the closure's dates (see pool-calendar).
	 */
	closure: ClosureSchema.optional().nullable(),
	/**
	 * Closures the PDF's own notes announce (holidays, training, maintenance).
	 * Like `closure`, the programs stay the regular week and the site hides the
	 * sessions these cover.
	 */
	scheduledClosures: z
		.array(ScheduledClosureSchema)
		.optional()
		.nullable()
		.describe("every date or date range the PDF's notes say this pool is closed, one entry per date or range"),
	programs: z.array(ProgramSchema),
});

export const AllSchedulesSchema = z.array(PoolScheduleSchema);

export type ProgramEntry = z.infer<typeof ProgramSchema>;
export type PoolSchedule = z.infer<typeof PoolScheduleSchema>;
