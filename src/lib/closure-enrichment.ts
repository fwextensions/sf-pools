import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { ClosureEnrichment } from "./closures";

/**
 * Model-side reading of a closure notice.
 *
 * The scraper only ever sees a link's text — usually a filename like "Garfield
 * Pool Maintenance Closure 8-14_9-7 2026". The notice PDF behind it says what
 * the filename can't: why the pool is shut, whether the closure covers the
 * whole facility, and dates written in prose. This asks the model for that,
 * feeding it the PDF when one is available.
 *
 * What comes back is a proposal, not a decision. mergeClosure decides what the
 * site acts on, and the deterministic reading stays the floor.
 */
export const ClosureEnrichmentSchema = z.object({
	isClosure: z
		.boolean()
		.describe("true only if this announces a pool closure, not a schedule or event"),
	scope: z
		.enum(["whole-pool", "partial"])
		.describe(
			"whole-pool if swimmers cannot use the pool at all; partial if only part of the facility is affected"
		),
	startDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.nullable()
		.describe("first day of the closure, or null if not stated"),
	endDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.nullable()
		.describe("last day of the closure, or null if not stated"),
	indefinite: z.boolean().describe("true if closed with no announced end date"),
	reason: z
		.string()
		.nullable()
		.describe("short reason, e.g. 'maintenance' or 'renovation'; null if not stated"),
	summary: z
		.string()
		.describe("one plain sentence a swimmer would understand, under 120 characters"),
	confidence: z
		.number()
		.min(0)
		.max(1)
		.describe("how certain you are of isClosure, scope and the dates"),
});

export type EnrichClosureInput = {
	/** the scraped alert text (often just a document title) */
	text: string;
	/** the notice PDF, when it could be downloaded */
	pdfBuffer?: Buffer | null;
	/** the pool the notice was found on, to anchor the model */
	poolName: string;
	/** today, so relative wording like "through Labor Day" resolves */
	today: string;
};

/**
 * Ask the model to read a closure notice. Returns null when enrichment is
 * unavailable or fails — the caller keeps whatever the patterns found, so a bad
 * API day degrades to the previous behaviour rather than breaking the run.
 */
export async function enrichClosure(
	input: EnrichClosureInput
): Promise<ClosureEnrichment | null> {
	if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
		// say so rather than silently degrading to the pattern layer
		console.warn("GOOGLE_GENERATIVE_AI_API_KEY not set — skipping closure enrichment");
		return null;
	}

	const system = `
You read closure notices for San Francisco public pools and return structured data.
Rules:
- Output must conform exactly to the provided JSON schema.
- Dates are Pacific Time, formatted YYYY-MM-DD. Today is ${input.today}.
- A notice that gives only a month and day takes the year that makes the closure
  fall nearest to today, without inventing a year the notice does not imply.
- scope is "whole-pool" only when swimmers cannot use the pool at all. A closed
  locker room, sauna, slide, diving board or community room is "partial".
- A single-day holiday or observance closure is a closure, but set scope to
  "partial" — it should not blank out a weekly schedule.
- If the text announces a schedule, a program or an event rather than a closure,
  set isClosure to false.
- Report low confidence when the text is ambiguous or the dates are unclear.
  Do not guess dates to seem certain.`;

	const instructions = `
Pool: ${input.poolName}
Notice text: "${input.text}"
${input.pdfBuffer ? "The notice document is attached; prefer what it says over the text above." : "No document is available; read the text above only."}`;

	try {
		const result = await generateText({
			model: google("gemini-3.1-flash-lite"),
			output: Output.object({ schema: ClosureEnrichmentSchema }),
			// deterministic: the same notice should not flip between runs
			temperature: 0,
			maxRetries: 2,
			system,
			messages: [
				{
					role: "user",
					content: input.pdfBuffer
						? [
								{ type: "text" as const, text: instructions },
								{
									type: "file" as const,
									mediaType: "application/pdf",
									data: input.pdfBuffer,
								},
							]
						: [{ type: "text" as const, text: instructions }],
				},
			],
		});

		return ClosureEnrichmentSchema.parse(result.output);
	} catch (err) {
		console.warn("closure enrichment failed for", input.poolName, err);
		return null;
	}
}
