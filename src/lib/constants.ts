import path from "path";

// Base directory for public data (server-side file system path)
export const PUBLIC_DATA_DIR = path.join(process.cwd(), "public", "data");

// Specific file names
export const POOL_METADATA_FILENAME = "pool_metadata.json";
//export const ALL_SCHEDULES_FILENAME = "all_schedules_old_prompt.json";
export const ALL_SCHEDULES_FILENAME = "all_schedules.json";

// Subdirectory for PDFs
export const PDFS_SUBDIR = "pdfs";

// Full paths to specific files/directories (server-side file system paths)
export const POOL_METADATA_FILE_PATH = path.join(PUBLIC_DATA_DIR,
	POOL_METADATA_FILENAME);
export const ALL_SCHEDULES_FILE_PATH = path.join(PUBLIC_DATA_DIR,
	ALL_SCHEDULES_FILENAME);
export const PDFS_DIRECTORY_PATH = path.join(PUBLIC_DATA_DIR, PDFS_SUBDIR);

// Web paths (for client-side fetch, relative to public directory)
// Assumes that the 'public/data' directory is served at '/data'
const DATA_WEB_PREFIX = "/data";
export const WEB_PATH_POOL_METADATA = `${DATA_WEB_PREFIX}/${POOL_METADATA_FILENAME}`;
export const WEB_PATH_ALL_SCHEDULES = `${DATA_WEB_PREFIX}/${ALL_SCHEDULES_FILENAME}`;
