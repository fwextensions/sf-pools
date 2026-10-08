import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import { ClosureSchema } from "./closures";
import { trackUsage } from "./llm-usage";

const EXTRACT_MODEL = "gemini-3.8-flash";

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
	 * is shut. Programs are emptied while a closure is active, so every surface
	 * hides them without having to know about closures itself.
	 */
	closure: ClosureSchema.optional().nullable(),
	programs: z.array(ProgramSchema),
});

export const AllSchedulesSchema = z.array(PoolScheduleSchema);

export type ProgramEntry = z.infer<typeof ProgramSchema>;
export type PoolSchedule = z.infer<typeof PoolScheduleSchema>;

export type ExtractHints = {
	pdfScheduleUrl?: string;
	sfRecParkUrl?: string;
	expectedPoolName?: string;
	/** labels the usage record; the caller knows which pool this is */
	poolId?: string;
	pdfHash?: string;
	/**
	 * The PDF's table cells read from its text layer (formatDayCells), which
	 * pins down what the image shows: which day column each cell sits in and
	 * which programs share it.
	 */
	cells?: string;
};

const SYSTEM_PROMPT = `
You are an expert data extractor for San Francisco public pool schedules.
Extract exactly the fields required by the provided JSON schema.
Important rules:
- Output must be valid JSON that strictly conforms to the schema.
- Use 12-hour time format 'h:mm[a|p]' for startTime and endTime (e.g., '9:00a', '2:15p'). No spaces.
- dayOfWeek must be one of Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.
- Times and dates should be interpreted in Pacific Time.
- Try to extract scheduleSeason, scheduleStartDate (YYYY-MM-DD), scheduleEndDate (YYYY-MM-DD), and pool-level lanes from context if present; if not present, set them to null.
- Keep program names exactly as written in the PDF (no normalization at this stage).
- If a single time block shows MULTIPLE programs sharing the same start/end time (e.g., 'Senior Lap Swim (6)' and 'Lap Swim (4)' stacked in the same box), you MUST output SEPARATE program entries: one per program, each with the same startTime/endTime and its own lanes value.
- If a program in a shared block runs to a different time (e.g., '(Lap swim until 4pm)'), give that program its own entry with that end time.
- Only output a session for a day whose column actually shows it. An empty cell means nothing runs then; never fill it from a neighboring day.
- When a program name includes a lane count in parentheses, e.g., 'Lap Swim (8)', set the per-program 'lanes' field to that number.
- If the block shows one program across all lanes (e.g., 'Lap Swim (10)'), set 'lanes' to that number. If no per-program lane count is shown, leave 'lanes' as null.
- If the text indicates a pool section like '(shallow)', '(deep)', '(Main Pool)' or '(2 lanes + Small Pool)', put that text in notes, not in programName. Everything else in parentheses stays in programName as written, including lane counts like '(6)' and levels like '(Beginner/Intermediate)'.
- Closure notices ('Pool CLOSED every 4th Thursday for staff training', 'Closed for In-Service August 22') are not sessions; don't output them as programs.`;

function cellsText(cells: string | undefined): string {
	if (!cells) return "";
	return `
The PDF's text layer, read cell by cell. Each line is one day's column, top to bottom, with cells separated by " | ". Every session you output must come from one of these cells, on that day:
${cells}`;
}

function extractInstructions(hints: ExtractHints | undefined): string {
	return `
Extract the complete weekly schedule from the attached pool schedule PDF.
Return a JSON array with a single pool object.
${hints?.expectedPoolName ? `This PDF is the schedule for "${hints.expectedPoolName}". Use this to set the pool's name; do not output a different pool.` : ""}
If known, set pdfScheduleUrl to: ${hints?.pdfScheduleUrl ?? ""}
If known, set sfRecParkUrl to: ${hints?.sfRecParkUrl ?? ""}`;
}

function runExtraction(pdfBuffer: Buffer, text: string, task: string, hints: ExtractHints | undefined): Promise<PoolSchedule[]> {
	const meta = {
		task,
		subject: hints?.poolId ?? hints?.expectedPoolName ?? "unknown",
		model: EXTRACT_MODEL,
		pdfHash: hints?.pdfHash,
	};
	const call = () => generateText({
		model: google(EXTRACT_MODEL),
		output: Output.array({ element: PoolScheduleSchema }),
		// deterministic extraction: avoid run-to-run drift on ambiguous cells
		temperature: 0,
		// retry transient API failures (429/5xx/network) with backoff
		maxRetries: 3,
		system: SYSTEM_PROMPT,
		messages: [
			{
				role: "user",
				content: [
					{ type: "text", text },
					{ type: "file", mediaType: "application/pdf", data: pdfBuffer },
				],
			},
		],
	});

	// validate again just to be safe
	return trackUsage(meta, call, (result) => AllSchedulesSchema.parse(result.output));
}

export async function extractScheduleFromPdf(pdfBuffer: Buffer, hints?: ExtractHints): Promise<PoolSchedule[]> {
	return runExtraction(pdfBuffer, extractInstructions(hints) + cellsText(hints?.cells), "pdf-extract", hints);
}

/**
 * Second pass after grounding found problems: the model gets its own output
 * back with the list of disagreements and returns a corrected extraction.
 */
export async function repairScheduleFromPdf(
	pdfBuffer: Buffer,
	previous: PoolSchedule[],
	issues: string[],
	hints?: ExtractHints
): Promise<PoolSchedule[]> {
	const text = `${extractInstructions(hints)}${cellsText(hints?.cells)}

A previous extraction of this PDF returned the JSON below, but checking it against the PDF's text found these problems:
${issues.map((issue) => `- ${issue}`).join("\n")}

Return the complete corrected extraction. Fix each problem from what the PDF shows: remove sessions it doesn't print, correct times and names, and add sessions that were missed. Keep everything else unchanged.

${JSON.stringify(previous)}`;
	return runExtraction(pdfBuffer, text, "pdf-extract", hints);
}
