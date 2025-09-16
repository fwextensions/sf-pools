import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";

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
	notes: z.string().optional().nullable().default(""),
});

export const PoolScheduleSchema = z.object({
	poolName: z.string(),
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
	programs: z.array(ProgramSchema),
});

export const AllSchedulesSchema = z.array(PoolScheduleSchema);

export type ProgramEntry = z.infer<typeof ProgramSchema>;
export type PoolSchedule = z.infer<typeof PoolScheduleSchema>;

export async function extractScheduleFromPdf(
	pdfBuffer: Buffer,
	hints?: { pdfScheduleUrl?: string; sfRecParkUrl?: string }
): Promise<PoolSchedule[]> {
	const system = [
		"You are an expert data extractor for San Francisco public pool schedules.",
		"Extract exactly the fields required by the provided JSON schema.",
		"Important rules:",
		"- Output must be valid JSON that strictly conforms to the schema.",
		"- Use 12-hour time format 'h:mm[a|p]' for startTime and endTime (e.g., '9:00a', '2:15p'). No spaces.",
		"- dayOfWeek must be one of Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.",
		"- Times and dates should be interpreted in Pacific Time.",
		"- Try to extract scheduleSeason, scheduleStartDate (YYYY-MM-DD), scheduleEndDate (YYYY-MM-DD), and lanes from context if present; if not present, set them to null.",
		"- Keep program names exactly as written in the PDF (no normalization at this stage).",
	].join("\n");

	const instructions = [
		"Extract the complete weekly schedule from the attached pool schedule PDF.",
		"Return a JSON array with a single pool object.",
		`If known, set pdfScheduleUrl to: ${hints?.pdfScheduleUrl ?? ""}`,
		`If known, set sfRecParkUrl to: ${hints?.sfRecParkUrl ?? ""}`,
	].join("\n");

	const { object } = await generateObject({
		model: google("gemini-2.5-flash"),
		schema: AllSchedulesSchema,
		system,
		messages: [
			{
				role: "user",
				content: [
					{ type: "text", text: instructions },
					{ type: "file", mediaType: "application/pdf", data: pdfBuffer },
				],
			},
		],
	});

	// validate again just to be safe
	return AllSchedulesSchema.parse(object);
}
