import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { extractScheduleFromPdf, PoolSchedule } from "@/lib/pdf-processor";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PDFS_DIRECTORY = path.resolve(__dirname, "../public/data/pdfs");
const OUTPUT_DIRECTORY = path.resolve(__dirname, "../public/data");
const OUTPUT_FILE = path.join(OUTPUT_DIRECTORY, "all_schedules.json");

async function main()
{
	console.log("Starting PDF processing script...");

	try {
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

	} catch (error) {
		console.error("Error in master processing script:", error);
		process.exit(1);
	}
}

main().catch(error => {
	console.error("Unhandled error in script execution:", error);
	process.exit(1);
});
