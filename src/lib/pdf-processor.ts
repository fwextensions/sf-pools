import fs from "fs/promises";
import path from "path";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

// Zod Schemas (copied from api/extract-schedule.ts)
const ProgramSchema = z.object({
  programName: z.string().describe("Name of the program (e.g., Lap Swim, Family Swim)"),
  dayOfWeek: z.string().describe("Day of the week (e.g., Monday, Tuesday)"),
  startTime: z.string().describe("Start time of the program (e.g., 09:00, 14:15) in HH:MM format"),
  endTime: z.string().describe("End time of the program (e.g., 11:00, 15:15) in HH:MM format"),
  notes: z.string().optional().describe("Optional notes for the program (e.g., 'Adults Only', '6 lanes')"),
});

const PoolScheduleSchema = z.object({
  poolName: z.string().describe("Full name of the swimming pool"),
  address: z.string().optional().describe("Street address of the pool"),
  sfRecParkUrl: z.string().optional().describe("URL to the SF Rec & Park page for this pool"),
  scheduleLastUpdated: z.string().optional().describe("Indication of when the schedule was last updated (e.g., 'Spring 2025', 'Effective Jan 1, 2024')"),
  programs: z.array(ProgramSchema).describe("List of all programs and their schedules"),
});

// Type for the structured schedule data
export type PoolSchedule = z.infer<typeof PoolScheduleSchema>;

const modelName = "gpt-4o"; // Or another powerful vision model

/**
 * Processes a single PDF file and extracts structured schedule data using an LLM.
 * @param pdfFilePath Absolute path to the PDF file.
 * @returns A Promise that resolves to the structured PoolSchedule data, or null if an error occurs.
 */
export async function extractScheduleFromPdf(pdfFilePath: string): Promise<PoolSchedule | null> {
  const pdfFileName = path.basename(pdfFilePath);
  console.log(`Processing PDF: ${pdfFileName}`);

  try {
    const pdfFileBuffer = await fs.readFile(pdfFilePath);

    const userMessages = [
      {
        role: "user" as const,
        content: [
          {
            type: "text" as const,
            text: "Please extract the complete schedule information from the attached PDF document. The schedule includes various programs with their names, days of the week, start times, and end times. Also, identify the pool name and any listed address or last updated information. Format the output as a structured JSON object matching the provided schema. Pay close attention to correctly identifying all programs and their timings for each day listed in the PDF."
          },
          {
            type: "file" as const,
            data: pdfFileBuffer,
            mimeType: "application/pdf",
            filename: pdfFileName
          }
        ]
      },
    ];

    const { object: extractedSchedule } = await generateObject({
      model: openai(modelName),
      schema: PoolScheduleSchema,
      messages: userMessages,
    });

    console.log(`Successfully extracted schedule for: ${pdfFileName}`);
    // Ensure the returned object conforms to PoolSchedule. Zod already did, but this is an explicit cast.
    return extractedSchedule as PoolSchedule; 

  } catch (error) {
    console.error(`Error processing PDF ${pdfFileName}:`, error);
    return null;
  }
}
