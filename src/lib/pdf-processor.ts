import fs from "fs/promises";
import path from "path";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

function sortPrograms(programs: Program[])
{
  function timeToMinutes(timeStr: string)
  {
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);

    if (!match) {
      console.warn(`Could not parse time: ${timeStr}`);

      // Push unparseable times to the end
      return Infinity;
    }

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const modifier = match[3] ? match[3].toUpperCase() : "";

    if (modifier === "PM" && hours !== 12) {
      hours += 12;
    }

    if (modifier === "AM" && hours === 12) { // Midnight case: 12 AM is 00:00
      hours = 0;
    }

    return hours * 60 + minutes;
  }

  const dayOrder = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  programs.sort((a, b) => {
    const dayAIndex = dayOrder.indexOf(a.dayOfWeek);
    const dayBIndex = dayOrder.indexOf(b.dayOfWeek);

    const effectiveDayA = dayAIndex === -1 ? Infinity : dayAIndex;
    const effectiveDayB = dayBIndex === -1 ? Infinity : dayBIndex;

    if (effectiveDayA !== effectiveDayB) {
      return effectiveDayA - effectiveDayB;
    }

    const timeA = timeToMinutes(a.startTime);
    const timeB = timeToMinutes(b.startTime);

    return timeA - timeB;
  });
}

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
const prompt = await fs.readFile(path.join(import.meta.dirname, "prompt.txt"), "utf-8");

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
            text: prompt,
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

    console.time("PDF extraction");

    const { object: extractedSchedule } = await generateObject({
      model: openai(modelName),
      schema: PoolScheduleSchema,
      messages: userMessages,
    });

    console.timeEnd("PDF extraction");

    // make sure the extracted schedule is valid.  if it's not, it'll throw and be caught below.
    const schedule = PoolScheduleSchema.parse(extractedSchedule);

    // Sort programs within the schedule by day and then by start time
    sortPrograms(schedule.programs);

    console.log(`Successfully extracted schedule for: ${pdfFileName}`);

    return schedule;
  } catch (error) {
    console.error(`Error processing PDF ${pdfFileName}:`, error);

    return null;
  }
}
