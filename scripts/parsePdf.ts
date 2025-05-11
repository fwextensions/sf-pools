import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load replacement configuration from JSON file
const replacementConfigPath = path.resolve(__dirname, '..', 'data', 'pdfTextReplacements.json');
const replacementConfigJson = fs.readFileSync(replacementConfigPath, 'utf-8');
const replacementConfig: { schedules: ScheduleReplacementConfig[] } = JSON.parse(replacementConfigJson);

// --- JSON Structure Definitions ---
interface ProgramEntry {
  programName: string;
  dayOfWeek: string;
  startTime: string; // Format: HH:MM (24-hour)
  endTime: string;   // Format: HH:MM (24-hour)
  notes?: string;
}

interface PoolSchedule {
  poolName: string;
  address: string;
  sfRecParkUrl: string;
  pdfScheduleUrl: string;
  scheduleLastUpdated: string; // Format: YYYY-MM-DD
  programs: ProgramEntry[];
}

type ReplacementTuple = [string, string, string]; 

interface ScheduleReplacementConfig {
  filename: string;
  replacements: ReplacementTuple[];
}

// --- End JSON Structure Definitions ---

// Path to the downloaded PDF
const PDF_FILE_BASENAME = 'MLK_Pool_Schedule.pdf'; // Used to find config in JSON
const PDF_FILE_PATH = path.resolve(__dirname, '..', 'data', 'pdfs', PDF_FILE_BASENAME);
const OUTPUT_JSON_DIR = path.resolve(__dirname, '..', 'data');
const OUTPUT_JSON_PATH = path.join(OUTPUT_JSON_DIR, 'MLK_Pool_Schedule.json');

const workerSrcPath = path.resolve(
    __dirname,
    '..',
    'node_modules',
    'pdfjs-dist',
    'legacy',
    'build',
    'pdf.worker.mjs'
);

if (fs.existsSync(workerSrcPath)) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerSrcPath).href;
} else {
    console.error(`PDF.js worker not found at: ${workerSrcPath}. PDF parsing will likely fail.`);
}

// --- Text Processing Logic ---
function cleanRawText(text: string, pdfFilename: string): string {
    let cleaned = text;

    const scheduleConfig = replacementConfig.schedules.find(s => s.filename === pdfFilename);
    const defaultConfig = replacementConfig.schedules.find(s => s.filename === "_default_processing_last");

    const allReplacements: ReplacementTuple[] = [];
    const intermediateTokensFromReplacements: string[] = [];

    if (scheduleConfig && scheduleConfig.replacements) {
        allReplacements.push(...scheduleConfig.replacements);
        scheduleConfig.replacements.forEach(ruleTuple => {
            // ruleTuple is [pattern, flags, replacementString]
            const replacementString = ruleTuple[2];
            if (replacementString && !replacementString.includes(' ') && replacementString.length > 0) {
                intermediateTokensFromReplacements.push(replacementString);
            }
        });
    }

    // Apply initial regex replacements from JSON
    for (const ruleTuple of allReplacements) {
        const [patternString, flags, replacementText] = ruleTuple;
        
        if (typeof patternString !== 'string' || typeof flags !== 'string' || typeof replacementText !== 'string') {
            console.warn('Skipping replacement rule with invalid types:', ruleTuple);
            continue;
        }

        try {
            const regex = new RegExp(patternString, flags);
            cleaned = cleaned.replace(regex, replacementText);
        } catch (e) {
            console.error(`Error applying regex (original: /${patternString}/)${flags} -> "${replacementText}"`, e);
        }
    }

    // Create a set of known tokens for efficient lookup
    const knownTokensSet = new Set<string>(intermediateTokensFromReplacements);

    // Define known tokens for adding spaces (from JSON + manually defined like days/times)
    const knownTokensArray = [
        ...knownTokensSet, // Use the Set directly for unique tokens
        'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY', 'MONDAY',
        'AM', 'PM'
        // Add any other specific tokens that are not direct replacement results but need spacing
    ];

    // Step 2: Add spaces around known entities and time-related patterns
    knownTokensArray.forEach(token => {
        if (!token || token.trim() === '') return; // Skip empty or whitespace-only tokens
        try {
            const regex = new RegExp(`(${token})`, 'g');
            cleaned = cleaned.replace(regex, ' $1 ');
        } catch (e) {
            console.error(`Error adding spaces around token "${token}":`, e);
        }
    });

    // Time normalization: HH:MM AM/PM -> HH:MMAM/PM (no space if already there due to previous step)
    // This regex handles optional space before AM/PM
    cleaned = cleaned.replace(/(\d{1,2}:\d{2})\s*(AM|PM)/gi, '$1$2');

    // Final space normalization
    // Normalize multiple spaces to a single space and trim
    cleaned = cleaned.replace(/\s+/g, ' ').trim(); 

    return cleaned;
}

function normalizeTime(timeStr: string): string {
    if (!timeStr) return '00:00';
    const upperTimeStr = timeStr.toUpperCase().trim();

    const match = upperTimeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/);

    if (!match) {
        console.warn(`Could not parse time: "${timeStr}"`);
        return '00:00'; // Return a default/error value
    }

    let hours = parseInt(match[1]);
    const minutes = match[2] ? match[2] : '00';
    const period = match[3];

    if (period === 'PM' && hours < 12) {
        hours += 12;
    } else if (period === 'AM' && hours === 12) { // 12 AM is midnight (00 hours)
        hours = 0;
    }
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

function extractScheduleFromText(rawText: string): ProgramEntry[] {
    const cleanedText = cleanRawText(rawText, PDF_FILE_BASENAME);
    console.log("\n--- Cleaned Text for Extraction ---");
    console.log(cleanedText); // Log the cleaned text to see how the cleaning function performed
    console.log("-----------------------------------\n");

    const programs: ProgramEntry[] = [];
    const timePattern = "(\\d{1,2}:\\d{2}\\s*(?:AM|PM))"; // Matches HH:MM AM/PM or H:MM AM/PM
    const timeRangePattern = `${timePattern}\\s*-\\s*${timePattern}`;

    const lapSwimRegex = new RegExp(`Lap Swim.*?${timeRangePattern}`, 'gi');
    let match;

    // For now, assume a single block of text. More advanced parsing might split by lines or use positional info.
    while ((match = lapSwimRegex.exec(cleanedText)) !== null) {
        programs.push({
            programName: 'Lap Swim',
            dayOfWeek: 'MONDAY', // Placeholder: Day extraction is a major next step
            startTime: normalizeTime(match[1]),
            endTime: normalizeTime(match[2]),
            notes: 'Extracted from PDF.'
        });
    }

    if (programs.length === 0 && cleanedText.toLowerCase().includes('lap swim')) {
        programs.push({
            programName: 'Lap Swim (General Mention)',
            dayOfWeek: 'UNKNOWN',
            startTime: '00:00',
            endTime: '00:00',
            notes: 'Could not parse specific times. General mention found.'
        });
    }
    return programs;
}
// --- End Text Processing Logic ---

async function parsePdfContent(filePath: string): Promise<void> {
  try {
    console.log(`Reading PDF file from: ${filePath}`);
    if (!fs.existsSync(filePath)) {
      console.error(`Error: PDF file not found at ${filePath}`);
      console.error('Please ensure you have run the download script first (e.g., npm run download-pdf).');
      process.exit(1);
    }

    const dataBuffer = fs.readFileSync(filePath);
    const uint8Array = new Uint8Array(dataBuffer);

    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdfDocument = await loadingTask.promise;

    console.log('--- PDF Metadata (from script) ---');
    const metadata = await pdfDocument.getMetadata();
    console.log('Title:', metadata.info?.Title);
    console.log('Author:', metadata.info?.Author);
    console.log('Creator:', metadata.info?.Creator);
    console.log('Producer:', metadata.info?.Producer);
    console.log('Number of pages:', pdfDocument.numPages);
    console.log('------------------------------------\n');

    console.log('--- Extracting Text (Page by Page from script) ---');
    let fullRawText = '';
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      // Join text items without spaces initially to keep related items (e.g., "7" and "AM") together
      const pageText = textContent.items.map(item => (item && 'str' in item ? item.str : '')).join('');
      console.log(`[Page ${i} Raw Joined]:`);
      console.log(pageText.trim() + '\\n');
      fullRawText += pageText.trim() + ' '; // Add a space when concatenating text from multiple pages
    }
    fullRawText = fullRawText.trim(); // Trim any trailing space from the last page
    console.log('--------------------------------------------------\\n');

    const extractedPrograms = extractScheduleFromText(fullRawText);

    const today = new Date().toISOString().split('T')[0];

    const scheduleData: PoolSchedule = {
        poolName: 'Martin Luther King Jr. Pool',
        address: '5701 Third St, San Francisco, CA 94124',
        sfRecParkUrl: 'https://sfrecpark.org/Facilities/Facility/Details/Martin-Luther-King-Jr-Pool-216',
        pdfScheduleUrl: 'https://sfrecpark.org/DocumentCenter/View/25795', // Example URL, update if known
        scheduleLastUpdated: today,
        programs: extractedPrograms
    };

    if (!fs.existsSync(OUTPUT_JSON_DIR)) {
        fs.mkdirSync(OUTPUT_JSON_DIR, { recursive: true });
        console.log(`Created directory: ${OUTPUT_JSON_DIR}`);
    }

    fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(scheduleData, null, 2));
    console.log(`Structured schedule data saved to: ${OUTPUT_JSON_PATH}`);
    if (extractedPrograms.length === 0) {
        console.warn('Warning: No programs were successfully extracted. The JSON file might be sparse.');
    }

  } catch (error) {
    console.error('Error in parsePdfContent function:', error);
    process.exit(1);
  }
}

const currentFileUrl = import.meta.url;
const mainModulePath = process.argv[1];
let mainModuleUrl = '';
if (mainModulePath) {
    try {
        mainModuleUrl = new URL(`file://${path.resolve(mainModulePath)}`).href;
    } catch (e) {
        console.warn(`Could not convert process.argv[1] ('${mainModulePath}') to a URL.`);
    }
}

if (currentFileUrl === mainModuleUrl) {
    parsePdfContent(PDF_FILE_PATH).catch(err => {
        console.error('Unhandled error during direct execution of parsePdfContent:', err);
        process.exit(1);
    });
}

export { parsePdfContent, PDF_FILE_PATH, OUTPUT_JSON_PATH };
