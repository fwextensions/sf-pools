import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import fs from "fs/promises"; 
import { openai } from "@ai-sdk/openai"; 
import { generateObject } from "ai";
import { z } from "zod";

// Set workerSrc for pdfjs-dist. It's crucial for Node.js environments.
// Using the version from node_modules.
// GlobalWorkerOptions.workerSrc = path.resolve(
//   process.cwd(),
//   'node_modules',
//   'pdfjs-dist',
//   'legacy',
//   'build',
//   'pdf.worker.mjs'
// );

const ProgramSchema = z.object({
  programName: z.string().describe("Name of the program (e.g., Lap Swim, Family Swim)"),
  dayOfWeek: z.string().describe("Day of the week (e.g., Monday, Tuesday)"),
  startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).describe("Start time in HH:MM (24-hour) format"),
  endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).describe("End time in HH:MM (24-hour) format"),
  notes: z.string().optional().describe("Any specific notes for the program (e.g., Adults Only)"),
});

const PoolScheduleSchema = z.object({
  poolName: z.string().describe("Name of the swimming pool"),
  address: z.string().optional().describe("Full address of the pool"),
  sfRecParkUrl: z.string().url().optional().describe("URL to the SF Rec & Park page for this pool"),
  scheduleLastUpdated: z.string().optional().describe("Date the schedule was last updated or processed, if known from PDF"),
  programs: z.array(ProgramSchema).describe("List of all programs for the pool"),
});

type Program = z.infer<typeof ProgramSchema>;
type PoolSchedule = z.infer<typeof PoolScheduleSchema>;

type ApiResponse = {
  message: string;
  pdfPath?: string;
  schedule?: PoolSchedule; 
  error?: string;
  debug_llmInput?: any;
};

const modelName = "gpt-4o"; // Or another powerful vision model like "gpt-4-vision-preview"

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  if (req.method === "POST") {
    const pdfDirectory = path.resolve(process.cwd(), "data", "pdfs");
    const pdfFileName = "MLK_Pool_Schedule.pdf"; 
    const pdfPath = path.join(pdfDirectory, pdfFileName);

    try {
      // 1. Read PDF File
      const pdfFileBuffer = await fs.readFile(pdfPath);

      // 2. Prepare messages for LLM with file content
      const userMessages = [
        {
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: "Please extract the complete schedule information from the attached PDF document. The schedule includes various programs with their names, days of the week, start times, and end times. Also, identify the pool name. Format the output as a structured JSON object matching the provided schema. Pay close attention to correctly identifying all programs and their timings for each day listed in the PDF."
            },
            {
              type: "file" as const, // Use type: "file" as per Vercel AI SDK example
              data: pdfFileBuffer,     // Pass the raw buffer
              mimeType: "application/pdf",
              filename: pdfFileName   // Optional, but good for context
            }
          ]
        },
      ];

      // 3. Call LLM with file content
      const { object: extractedSchedule } = await generateObject({
        model: openai(modelName), 
        schema: PoolScheduleSchema,
        messages: userMessages, 
      });

      return res.status(200).json({
        message: "Schedule extracted successfully using LLM with direct PDF input.",
        pdfPath: pdfPath,
        schedule: extractedSchedule,
        debug_llmInput: {
          model: modelName,
          promptText: (userMessages[0].content[0] as { type: 'text'; text: string }).text,
          fileName: pdfFileName,
          fileSizeBytes: pdfFileBuffer.length
        }
      });

    } catch (error) {
      console.error("Error processing schedule with LLM:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      return res.status(500).json({ 
        message: "Error processing schedule with LLM.", 
        error: errorMessage,
      });
    }
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
