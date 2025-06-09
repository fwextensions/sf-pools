import fs from "fs/promises";
import path from "path";
import { extractScheduleFromPdf, PoolSchedule } from "@/lib/pdf-processor";
import { PDFS_DIRECTORY_PATH, ALL_SCHEDULES_FILE_PATH, PUBLIC_DATA_DIR } from "../src/lib/constants";

const PDFS_DIRECTORY = PDFS_DIRECTORY_PATH;
const OUTPUT_DIRECTORY = PUBLIC_DATA_DIR;
const OUTPUT_FILE = ALL_SCHEDULES_FILE_PATH;

async function main()
{
	console.log("Starting PDF processing script...");

	try {
		console.time("PDF processing");

		// Ensure output directory exists
		await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true });

		const pdfFiles = await fs.readdir(PDFS_DIRECTORY);
		const allSchedules: PoolSchedule[] = [];

		for (const pdfFile of pdfFiles) {
			if (path.extname(pdfFile).toLowerCase() === ".pdf") {
				const pdfFilePath = path.join(PDFS_DIRECTORY, pdfFile);
				const schedule = await extractScheduleFromPdf(pdfFilePath);

				if (schedule) {
					allSchedules.push(schedule);
				}
			}
		}

		await fs.writeFile(OUTPUT_FILE, JSON.stringify(allSchedules, null, 2));
		console.log(`Successfully processed ${allSchedules.length} PDFs.`);
		console.log(`Consolidated data written to: ${OUTPUT_FILE}`);

		console.timeEnd("PDF processing");
	} catch (error) {
		console.error("Error in master processing script:", error);
		process.exit(1);
	}
}

main().catch(error => {
	console.error("Unhandled error in script execution:", error);
	process.exit(1);
});
