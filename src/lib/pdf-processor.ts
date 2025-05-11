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
  lanes: z.number().optional().describe("Number of lanes available for this program, if specified. Should be a numeric value."),
  notes: z.string().optional().describe("Other relevant textual notes for the program (e.g., 'Adults Only', 'Deep Water'). Do not include lane information here."),
});

const PoolScheduleSchema = z.object({
  poolName: z.string().describe("Full name of the swimming pool"),
  address: z.string().optional().describe("Street address of the pool"),
  sfRecParkUrl: z.string().optional().describe("URL to the SF Rec & Park page for this pool"),
  scheduleSeason: z.string().optional().describe("The general period or season the schedule is valid for (e.g., 'Spring 2025', 'Fall 2024')."),
  scheduleStartDate: z.string().optional().describe("The specific start date the schedule is valid from (e.g., 'April 5', '2025-04-05'), if mentioned separately or as part of a date range."),
  scheduleEndDate: z.string().optional().describe("The specific end date the schedule is valid until (e.g., 'June 7', '2025-06-07'), if mentioned separately or as part of a date range."),
  programs: z.array(ProgramSchema).describe("List of all programs and their schedules"),
});

// Type for the structured schedule data
export type PoolSchedule = z.infer<typeof PoolScheduleSchema>;
export type Program = z.infer<typeof ProgramSchema>;

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
            text: "Please extract the complete schedule information from the attached PDF document. The schedule includes various programs with their names, days of the week, start times, and end times. For each program, if the number of lanes is specified (e.g., '10 lanes', '6 lanes'), extract this as a numeric value into a 'lanes' field. Any other textual notes for a program (e.g., 'Adults Only', 'Shallow water') should be placed in the 'notes' field. Identify the pool name, any listed address, and SF Rec & Park URL. For the schedule's validity period (e.g., 'Spring 2025, April 5 - June 7'): extract the general season/period like 'Spring 2025' into the 'scheduleSeason' field; extract the specific start date like 'April 5' into 'scheduleStartDate'; and extract the specific end date like 'June 7' into 'scheduleEndDate'. If a year is part of the start/end dates, include it. Format the output as a structured JSON object matching the provided schema. Pay close attention to correctly identifying all programs, their timings, lane counts, and the detailed schedule validity (season, start date, end date)."
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
