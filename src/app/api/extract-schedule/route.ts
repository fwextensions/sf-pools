import { NextResponse } from 'next/server';
import path from 'path';
// Adjust the import path based on your project structure
import { extractScheduleFromPdf, PoolSchedule } from '@/lib/pdf-processor';

const pdfDirectory = path.resolve(process.cwd(), 'data', 'pdfs');
const pdfFileName = 'MLK_Pool_Schedule.pdf'; // Still hardcoded for this specific API route's PoC purpose

export async function POST(request: Request) {
  // For App Router, query parameters or request body would be handled differently if needed.
  // For now, this route processes a hardcoded PDF on POST request.
  
  const pdfPath = path.join(pdfDirectory, pdfFileName);

  try {
    const extractedSchedule = await extractScheduleFromPdf(pdfPath);

    if (extractedSchedule) {
      return NextResponse.json({
        message: 'Schedule extracted successfully using LLM with direct PDF input.',
        pdfPath: pdfPath,
        schedule: extractedSchedule,
        debug_llmInput: {
          fileName: pdfFileName, // Basic debug info
        }
      });
    } else {
      return NextResponse.json(
        { 
          message: 'Error processing schedule with LLM.', 
          pdfPath: pdfPath,
          error: `Failed to extract schedule from ${pdfFileName}. Check server logs for details.`,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Critical error in /api/extract-schedule handler:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown server error occurred';
    return NextResponse.json(
      { 
        message: 'Critical server error during PDF processing.', 
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

// If you need a GET handler or other methods, you can define them similarly:
// export async function GET(request: Request) { ... }
