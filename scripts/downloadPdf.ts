import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MLK_POOL_PDF_URL = 'https://sfrecpark.org/DocumentCenter/View/25795'; // Example URL from PRD
// Output directory will be <project_root>/data/pdfs
const OUTPUT_DIR = path.resolve(__dirname, '..', 'data', 'pdfs'); 
const OUTPUT_FILE_PATH = path.join(OUTPUT_DIR, 'MLK_Pool_Schedule.pdf');

async function downloadPdf() {
  try {
    console.log(`Attempting to download PDF from ${MLK_POOL_PDF_URL}...`);
    console.log(`Script location (__dirname): ${__dirname}`);
    console.log(`Target PDF output directory: ${OUTPUT_DIR}`);
    console.log(`Target PDF output file path: ${OUTPUT_FILE_PATH}`);

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      console.log(`Creating directory: ${OUTPUT_DIR}`);
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    } else {
      console.log(`Output directory already exists: ${OUTPUT_DIR}`);
    }

    const response = await fetch(MLK_POOL_PDF_URL);

    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
        throw new Error('Response body is null');
    }

    console.log('Response received, attempting to write to file...');
    const fileStream = fs.createWriteStream(OUTPUT_FILE_PATH);
    
    const reader = response.body.getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        fileStream.write(value);
    }
    fileStream.end();
    
    // Wait for the stream to finish writing
    await new Promise((resolve, reject) => {
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
    });

    console.log(`PDF downloaded successfully and saved to ${OUTPUT_FILE_PATH}`);

  } catch (error) {
    console.error('Error downloading PDF:', error);
    if (fs.existsSync(OUTPUT_FILE_PATH)) {
        const stats = fs.statSync(OUTPUT_FILE_PATH);
        if (stats.size === 0) { 
            console.log(`Deleting potentially incomplete file: ${OUTPUT_FILE_PATH}`);
            fs.unlinkSync(OUTPUT_FILE_PATH);
        }
    }
    process.exit(1); 
  }
}

const currentFileUrl = import.meta.url;
// To correctly get the path of the executed script for comparison:
// process.argv[1] gives the path of the script executed by Node.
// We need to resolve it and convert to a file URL for proper comparison.
const mainModulePath = process.argv[1];
let mainModuleUrl = '';
if (mainModulePath) {
    try {
        mainModuleUrl = new URL(`file://${path.resolve(mainModulePath)}`).href;
    } catch (e) {
        // Handle cases where process.argv[1] might not be a valid path
        console.warn(`Could not convert process.argv[1] ('${mainModulePath}') to a URL.`);
    }
}


if (currentFileUrl === mainModuleUrl) {
    downloadPdf().catch(err => {
        console.error('Unhandled error during direct execution of downloadPdf:', err);
        process.exit(1);
    });
}

export { downloadPdf, MLK_POOL_PDF_URL, OUTPUT_FILE_PATH, OUTPUT_DIR };
