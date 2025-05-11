import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DISCOVERED_SCHEDULES_PATH = path.resolve(__dirname, "..", "public",
	"data", "discovered_pool_schedules.json");
const OUTPUT_DIR = path.resolve(__dirname, "..", "public", "data", "pdfs");

interface DiscoveredPoolInfo {
	poolName: string;
	poolPageUrl: string;
	pdfScheduleUrl?: string;
}

/**
 * Sanitizes a pool name to be used as a valid filename.
 * Replaces spaces and special characters with underscores.
 */
function sanitizePoolNameForFilename(poolName: string): string
{
	return poolName.replace(/[^a-zA-Z0-9\s.-]/g, "").replace(/[\s.]+/g, "_") +
		".pdf";
}

async function downloadAndSavePdf(
	pdfUrl: string,
	outputFilePath: string,
	poolName: string)
{
	try {
		console.log(`Attempting to download PDF for ${poolName} from ${pdfUrl}...`);
		console.log(`Target PDF output file path: ${outputFilePath}`);

		const response = await fetch(pdfUrl);

		if (!response.ok) {
			throw new Error(
				`Failed to download PDF (${pdfUrl}): ${response.status} ${response.statusText}`);
		}

		if (!response.body) {
			throw new Error(`Response body is null for ${pdfUrl}`);
		}

		console.log(
			`Response received for ${poolName}, attempting to write to file...`);
		const fileStream = fs.createWriteStream(outputFilePath);

		const reader = response.body.getReader();
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			fileStream.write(value);
		}
		fileStream.end();

		await new Promise((
			resolve,
			reject) => {
			fileStream.on("finish", resolve);
			fileStream.on("error", reject);
		});

		console.log(
			`PDF for ${poolName} downloaded successfully and saved to ${outputFilePath}`);
		return true;

	} catch (error) {
		console.error(`Error downloading PDF for ${poolName} (${pdfUrl}):`, error);
		if (fs.existsSync(outputFilePath)) {
			const stats = fs.statSync(outputFilePath);
			if (stats.size === 0) {
				console.log(`Deleting potentially incomplete file: ${outputFilePath}`);
				fs.unlinkSync(outputFilePath);
			}
		}
		return false;
	}
}

async function downloadAllDiscoveredPdfs()
{
	console.log(
		`Reading discovered schedules from: ${DISCOVERED_SCHEDULES_PATH}`);
	let discoveredSchedules: DiscoveredPoolInfo[] = [];
	try {
		const fileContent = await fs.promises.readFile(DISCOVERED_SCHEDULES_PATH,
			"utf-8");
		discoveredSchedules = JSON.parse(fileContent);
	} catch (error) {
		console.error(`Failed to read or parse ${DISCOVERED_SCHEDULES_PATH}:`,
			error);
		process.exit(1);
	}

	if (discoveredSchedules.length === 0) {
		console.log(
			"No schedules found in discovered_pool_schedules.json. Nothing to download.");
		return;
	}

	// Ensure output directory exists
	if (!fs.existsSync(OUTPUT_DIR)) {
		console.log(`Creating directory: ${OUTPUT_DIR}`);
		fs.mkdirSync(OUTPUT_DIR, { recursive: true });
	} else {
		console.log(`Output directory already exists: ${OUTPUT_DIR}`);
	}

	let successCount = 0;
	let failureCount = 0;

	for (const poolInfo of discoveredSchedules) {
		if (poolInfo.pdfScheduleUrl) {
			const outputFileName = sanitizePoolNameForFilename(poolInfo.poolName);
			const outputFilePath = path.join(OUTPUT_DIR, outputFileName);
			const success = await downloadAndSavePdf(poolInfo.pdfScheduleUrl,
				outputFilePath, poolInfo.poolName);
			if (success) {
				successCount++;
			} else {
				failureCount++;
			}
		} else {
			console.log(`Skipping ${poolInfo.poolName} as it has no pdfScheduleUrl.`);
		}
	}
	console.log(`
Download process complete.
Successfully downloaded: ${successCount} PDFs.
Failed to download: ${failureCount} PDFs.`);
}

const currentFileUrl = import.meta.url;
// To correctly get the path of the executed script for comparison:
// process.argv[1] gives the path of the script executed by Node.
// We need to resolve it and convert to a file URL for proper comparison.
const mainModulePath = process.argv[1];
let mainModuleUrl = "";
if (mainModulePath) {
	try {
		mainModuleUrl = new URL(`file://${path.resolve(mainModulePath)}`).href;
	} catch (e) {
		// Handle cases where process.argv[1] might not be a valid path
		console.warn(
			`Could not convert process.argv[1] ('${mainModulePath}') to a URL.`);
	}
}

if (currentFileUrl === mainModuleUrl) {
	downloadAllDiscoveredPdfs().catch(err => {
		console.error(
			"Unhandled error during direct execution of downloadAllDiscoveredPdfs:",
			err);
		process.exit(1);
	});
}

// Exporting the main function if needed elsewhere, though typically run as a script
export { downloadAllDiscoveredPdfs, OUTPUT_DIR };
