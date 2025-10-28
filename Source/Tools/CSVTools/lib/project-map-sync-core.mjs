// PROJECT MAP SYNCHRONIZATION CORE
// Synchronizes CSV project maps with actual file system structure

import fs from 'node:fs/promises';
import path from 'node:path';

// =============================================================================
// SECTION 1: CONFIGURATION AND CONSTANTS
// =============================================================================

// Default folders to exclude from file system scanning
// These are commonly ignored directories in development projects
const DEFAULT_EXCLUDED_FOLDERS = new Set([
  'node_modules',
  '.git',
  '.vscode',
  'dist',
  'build',
]);

// =============================================================================
// SECTION 2: CSV FILE I/O FUNCTIONS
// =============================================================================

/**
 * Load and parse a CSV file that represents the project map.
 * 
 * Reads the CSV file from disk and delegates parsing to parseCsv().
 * 
 * @param {string} csvPath - Absolute or relative path to the CSV file
 * @returns {Promise<{ headers: string[], rows: string[][] }>} Parsed CSV with headers and data rows
 */
export async function readCsvFile(csvPath) {
  const raw = await fs.readFile(csvPath, 'utf8');
  return parseCsv(raw);
}

/**
 * Serialize and write the CSV file back to disk.
 * 
 * Converts headers and rows to CSV text format and writes to file.
 * Delegates CSV text generation to buildCsvText().
 * 
 * @param {string} csvPath - Path where CSV file will be written
 * @param {string[]} headers - Column headers
 * @param {string[][]} rows - Data rows to write
 */
export async function writeCsvFile(csvPath, headers, rows) {
  const csvText = buildCsvText(headers, rows);
  await fs.writeFile(csvPath, csvText, 'utf8');
}

// =============================================================================
// SECTION 3: FILE SYSTEM SCANNING FUNCTIONS
// =============================================================================

/**
 * Scan the file system and produce a flat list of entries (folders and files).
 * 
 * Recursively walks the directory tree starting from rootPath, building a list
 * of all files and folders. Each entry includes path segments, full path, and type.
 * 
 * Features:
 * - Recursive directory traversal
 * - Configurable folder exclusion (defaults to node_modules, .git, etc.)
 * - Hidden file filtering (controlled by includeHidden option)
 * - Sorted output (folders first, then alphabetically)
 * - Error handling for inaccessible directories
 * - Customizable base path segments
 * - Optional root entry inclusion
 * 
 * @param {string} rootPath - Starting directory for the scan
 * @param {object} [options] - Configuration options
 * @param {string[]} [options.baseSegments] - Custom base path segments (defaults to root folder name)
 * @param {Iterable<string>} [options.excludeFolders] - Folders to skip during scan
 * @param {boolean} [options.includeHidden] - Whether to include hidden files/folders (starting with .)
 * @param {boolean} [options.includeRootEntry] - Whether to include the root folder itself in results
 * @param {(info: { directory: string, error: Error }) => void} [options.onDirectoryError] - Callback for directory read errors
 * @returns {Promise<Array<{ pathSegments: string[], fullPath: string, type: string }>>} List of all discovered entries
 */
export async function scanProjectTree(rootPath, options = {}) {
  // Extract and set default options
  const {
    baseSegments,
    excludeFolders = DEFAULT_EXCLUDED_FOLDERS,
    includeHidden = false,
    includeRootEntry = true,
    onDirectoryError,
  } = options;
  // Determine initial path segments (either custom or root folder name)
  const initialSegments =
    Array.isArray(baseSegments) && baseSegments.length > 0
      ? baseSegments
      : [path.basename(rootPath)];
  const excluded = new Set(excludeFolders);
  const entries = [];
  // Add root folder entry if requested
  if (includeRootEntry) {
    entries.push({
      pathSegments: initialSegments,
      fullPath: initialSegments.join('/'),
      type: 'folder',
    });
  }
  // Recursive walker function - processes directories depth-first
  // Maintains path segments array to build full paths
  async function walk(currentPath, pathSegments) {
    let dirEntries;
    try {
      dirEntries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      // Allow caller to handle directory read errors
      if (typeof onDirectoryError === 'function') {
        onDirectoryError({ directory: currentPath, error });
      }
      return;
    }
    // Sort entries: directories first, then alphabetically within each group
    dirEntries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) {
        return a.isDirectory() ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    // Process each directory entry
    for (const dirent of dirEntries) {
      // Skip hidden files/folders if not included
      if (!includeHidden && dirent.name.startsWith('.')) {
        continue;
      }
      // Skip excluded folders
      if (dirent.isDirectory() && excluded.has(dirent.name)) {
        continue;
      }
      // Build path information for this entry
      const nextSegments = [...pathSegments, dirent.name];
      const fullPath = nextSegments.join('/');
      if (dirent.isDirectory()) {
        // Add folder entry and recurse into it
        entries.push({
          pathSegments: nextSegments,
          fullPath,
          type: 'folder',
        });
        await walk(path.join(currentPath, dirent.name), nextSegments);
      } else {
        // Add file entry with classified type
        entries.push({
          pathSegments: nextSegments,
          fullPath,
          type: classifyFileType(dirent.name),
        });
      }
    }
  }
  await walk(rootPath, initialSegments);
  return entries;
}

// =============================================================================
// SECTION 4: COMPARISON AND SYNCHRONIZATION FUNCTIONS
// =============================================================================

/**
 * Compare the CSV rows with the entries discovered on disk.
 * 
 * This is the main synchronization function that reconciles the CSV project map
 * with the actual file system state. It identifies:
 * - Matched entries (exist in both CSV and file system)
 * - New entries (on disk but not in CSV)
 * - Deleted entries (in CSV but not on disk)
 * - Changed entries (type mismatches between CSV and disk)
 * - Duplicate CSV entries (same path appears multiple times)
 * 
 * Features:
 * - Dynamic header expansion to accommodate deeper folder nesting
 * - Automatic FEATURES column injection if missing
 * - Duplicate path detection in CSV
 * - Type change detection
 * 
 * @param {object} params - Comparison parameters
 * @param {Array<{ pathSegments: string[], fullPath: string, type: string }>} params.fileSystemEntries - Entries from file system scan
 * @param {string[][]} params.csvRows - Data rows from CSV file
 * @param {string[]} params.headers - CSV column headers (will be modified in place if needed)
 * @returns {{
 *   pathColumnCount: number,
 *   typeColumnIndex: number,
 *   matchedEntries: Array<{
 *     fullPath: string,
 *     pathSegments: string[],
 *     csvRow: string[],
 *     csvType: string,
 *     fsType: string
 *   }>,
 *   newEntries: Array<{ pathSegments: string[], fullPath: string, type: string }>,
 *   deletedEntries: Array<{ pathSegments: string[], fullPath: string, type: string, row: string[] }>,
 *   changedEntries: Array<{
 *     fullPath: string,
 *     pathSegments: string[],
 *     csvRow: string[],
 *     csvType: string,
 *     fsType: string
 *   }>,
 *   duplicateCsvEntries: Array<{ fullPath: string, rowIndex: number }>
 * }} Comprehensive comparison results
 */
export function compareFileSystemToCsv({ fileSystemEntries, csvRows, headers }) {
  // Locate the TYPE column and determine initial path column count
  let typeColumnIndex = findTypeColumnIndex(headers);
  let pathColumnCount = typeColumnIndex;
  // Calculate maximum depth of file system entries
  const maxDepth = fileSystemEntries.reduce(
    (max, entry) => Math.max(max, entry.pathSegments.length),
    0
  );
  // Expand headers if file system has deeper nesting than CSV columns
  if (maxDepth > pathColumnCount) {
    const diff = maxDepth - pathColumnCount;
    const newPathHeaders = [];
    for (let i = 0; i < diff; i++) {
      newPathHeaders.push(`Sub-Folder Level ${pathColumnCount + i + 1}`);
    }
    // Insert new path columns before TYPE column
    headers.splice(pathColumnCount, 0, ...newPathHeaders);
    pathColumnCount = maxDepth;
    typeColumnIndex += diff;
  }
  // Ensure FEATURES column exists (inserted after TYPE column)
  if (!headers.includes('FEATURES')) {
    headers.splice(typeColumnIndex + 1, 0, 'FEATURES');
  }
  // Build map of CSV entries by full path
  // Tracks duplicates and stores row information
  const csvEntries = new Map();
  const duplicateCsvEntries = [];
  csvRows.forEach((row, rowIndex) => {
    const pathSegments = extractPathSegmentsFromRow(row, pathColumnCount);
    if (pathSegments.length === 0) {
      return;
    }
    const fullPath = pathSegments.join('/');
    // Detect and record duplicate paths
    if (csvEntries.has(fullPath)) {
      duplicateCsvEntries.push({ fullPath, rowIndex });
      return;
    }
    csvEntries.set(fullPath, {
      pathSegments,
      type: (row[typeColumnIndex] ?? '').trim(),
      row,
      rowIndex,
    });
  });
  // Build map of file system entries by full path
  const fsEntries = new Map();
  fileSystemEntries.forEach((entry) => {
    fsEntries.set(entry.fullPath, entry);
  });
  // Categorize entries by comparing CSV and file system
  const matchedEntries = [];
  const changedEntries = [];
  const newEntries = [];
  // Process all file system entries
  fsEntries.forEach((fsEntry, fullPath) => {
    const csvEntry = csvEntries.get(fullPath);
    if (!csvEntry) {
      // Entry exists on disk but not in CSV - mark as new
      newEntries.push(fsEntry);
      return;
    }
    // Entry exists in both - create matched record
    const record = {
      fullPath,
      pathSegments: fsEntry.pathSegments,
      csvRow: csvEntry.row,
      csvType: csvEntry.type,
      fsType: fsEntry.type,
    };
    matchedEntries.push(record);
    // Check if type changed between CSV and file system
    if (!typesEqual(record.csvType, record.fsType)) {
      changedEntries.push(record);
    }
  });
  // Find entries that exist in CSV but not on disk
  const deletedEntries = [];
  csvEntries.forEach((csvEntry, fullPath) => {
    if (!fsEntries.has(fullPath)) {
      deletedEntries.push({
        fullPath,
        pathSegments: csvEntry.pathSegments,
        type: csvEntry.type,
        row: csvEntry.row,
      });
    }
  });
  return {
    pathColumnCount,
    typeColumnIndex,
    matchedEntries,
    newEntries,
    deletedEntries,
    changedEntries,
    duplicateCsvEntries,
  };
}

// =============================================================================
// SECTION 5: ROW BUILDING AND UPDATE FUNCTIONS
// =============================================================================

/**
 * Produce the updated CSV rows after applying additions and type changes.
 * 
 * Rebuilds the entire CSV row set by:
 * 1. Processing matched entries (preserving existing data, updating types)
 * 2. Adding new entries with empty FEATURES placeholders
 * 3. Sorting all rows by path for consistent organization
 * 
 * Note: This function does NOT include deleted entries - they are filtered out.
 * 
 * @param {object} params - Row building parameters
 * @param {string[]} params.headers - CSV column headers
 * @param {Array<{
 *   pathSegments: string[],
 *   csvRow: string[],
 *   fsType: string
 * }>} params.matchedEntries - Entries that exist in both CSV and file system
 * @param {Array<{ pathSegments: string[], fullPath: string, type: string }>} params.newEntries - New entries to add
 * @param {number} params.pathColumnCount - Number of columns dedicated to path segments
 * @param {number} params.typeColumnIndex - Index of TYPE column
 * @returns {string[][]} Complete set of updated rows, sorted by path
 */
export function buildUpdatedRows({
  headers,
  matchedEntries,
  newEntries,
  pathColumnCount,
  typeColumnIndex,
}) {
  const outputRows = [];
  const headerCount = headers.length;
  // Process matched entries: preserve existing data, update path and type
  matchedEntries.forEach((entry) => {
    const nextRow = copyRow(entry.csvRow, headerCount);
    // Update path columns with current path segments
    for (let index = 0; index < pathColumnCount; index += 1) {
      nextRow[index] = entry.pathSegments[index] ?? '';
    }
    // Update type to match file system
    nextRow[typeColumnIndex] = entry.fsType;
    outputRows.push(nextRow);
  });
  // Add new entries with empty cells and placeholder FEATURES
  newEntries.forEach((entry) => {
    const nextRow = new Array(headerCount).fill('');
    // Populate path columns
    for (let index = 0; index < entry.pathSegments.length; index += 1) {
      if (index < pathColumnCount) {
        nextRow[index] = entry.pathSegments[index];
      }
    }
    // Set type from file system
    nextRow[typeColumnIndex] = entry.type;
    // Set empty FEATURES placeholder for new entries
    const featuresColumnIndex = findFeaturesColumnIndex(headers);
    if (featuresColumnIndex !== -1) {
      nextRow[featuresColumnIndex] = ''; // Placeholder for new entries
    }
    outputRows.push(nextRow);
  });
  // Sort all rows by path for consistent ordering
  outputRows.sort((a, b) => {
    const aKey = buildPathKey(a, pathColumnCount);
    const bKey = buildPathKey(b, pathColumnCount);
    return aKey.localeCompare(bKey);
  });
  return outputRows;
}

// =============================================================================
// SECTION 6: TYPE AND CLASSIFICATION HELPERS
// =============================================================================

/**
 * Classify file type based on file extension.
 * 
 * Returns a lowercase type string with " file" suffix.
 * Files without extensions are classified as "file".
 * 
 * @param {string} name - File name to classify
 * @returns {string} Type classification (e.g., ".js file", ".txt file", "file")
 */
function classifyFileType(name) {
  const ext = path.extname(name);
  if (!ext) {
    return 'file';
  }
  return `${ext.toLowerCase()} file`;
}

/**
 * Compare two type strings for equality.
 * 
 * Performs case-insensitive comparison after trimming whitespace.
 * Handles null/undefined values by treating them as empty strings.
 * 
 * @param {string} a - First type string
 * @param {string} b - Second type string
 * @returns {boolean} True if types are equal (case-insensitive)
 */
function typesEqual(a, b) {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

// =============================================================================
// SECTION 7: PATH AND ROW PROCESSING HELPERS
// =============================================================================

/**
 * Copy a CSV row to a new array of specified width.
 * 
 * Creates a new array filled with empty strings, then copies values
 * from the source row. Handles rows shorter than target width by
 * filling remaining cells with empty strings.
 * 
 * @param {string[]} row - Source row to copy
 * @param {number} width - Desired width of output row
 * @returns {string[]} New row array of specified width
 */
function copyRow(row, width) {
  const result = new Array(width).fill('');
  for (let index = 0; index < width; index += 1) {
    if (index < row.length) {
      result[index] = row[index] ?? '';
    }
  }
  return result;
}

/**
 * Build a normalized path key from a CSV row for sorting.
 * 
 * Extracts path segments from the first pathColumnCount columns,
 * joins them with '/', and converts to lowercase for case-insensitive sorting.
 * 
 * @param {string[]} row - CSV row to process
 * @param {number} pathColumnCount - Number of columns containing path segments
 * @returns {string} Lowercase path key (e.g., "project/src/file.js")
 */
function buildPathKey(row, pathColumnCount) {
  const segments = [];
  for (let index = 0; index < pathColumnCount; index += 1) {
    const value = (row[index] ?? '').trim();
    if (value) {
      segments.push(value);
    }
  }
  return segments.join('/').toLowerCase();
}

/**
 * Extract path segments from a CSV row.
 * 
 * Reads the first pathColumnCount columns and collects non-empty values
 * as path segments. Skips empty cells to handle variable-depth paths.
 * 
 * @param {string[]} row - CSV row to process
 * @param {number} pathColumnCount - Number of columns that may contain path segments
 * @returns {string[]} Array of path segments (empty array if no segments found)
 */
function extractPathSegmentsFromRow(row, pathColumnCount) {
  const segments = [];
  for (let index = 0; index < pathColumnCount; index += 1) {
    const value = (row[index] ?? '').trim();
    if (value) {
      segments.push(value);
    }
  }
  return segments;
}

// =============================================================================
// SECTION 8: COLUMN INDEX HELPERS
// =============================================================================

/**
 * Find the index of the TYPE column in headers.
 * 
 * Performs case-insensitive search for "type" column.
 * Throws error if TYPE column is not found, as it is required for operation.
 * 
 * @param {string[]} headers - CSV column headers
 * @returns {number} Zero-based index of TYPE column
 * @throws {Error} If TYPE column is not found
 */
function findTypeColumnIndex(headers) {
  const index = headers.findIndex(
    (header) => header.trim().toLowerCase() === 'type'
  );
  if (index === -1) {
    throw new Error('The CSV headers do not contain a "Type" column.');
  }
  return index;
}

/**
 * Find the index of the FEATURES column in headers.
 * 
 * Performs case-insensitive search for "features" column.
 * Returns -1 if not found (non-fatal, as FEATURES column is optional).
 * 
 * @param {string[]} headers - CSV column headers
 * @returns {number} Zero-based index of FEATURES column, or -1 if not found
 */
function findFeaturesColumnIndex(headers) {
  return headers.findIndex(
    (header) => header.trim().toLowerCase() === 'features'
  );
}

// =============================================================================
// SECTION 9: CSV PARSING AND SERIALIZATION FUNCTIONS
// =============================================================================

/**
 * Parse CSV text into headers and data rows.
 * 
 * Custom CSV parser that handles:
 * - Quoted fields with embedded commas
 * - Escaped quotes ("" becomes ")
 * - Both \r\n and \n line endings
 * - Carriage return stripping in headers
 * - Empty row filtering
 * 
 * Features:
 * - State machine approach for quote handling
 * - Preserves internal whitespace in quoted fields
 * - Trims header values
 * - Filters out completely empty rows
 * 
 * @param {string} text - Raw CSV text to parse
 * @returns {{ headers: string[], rows: string[][] }} Parsed CSV with headers and non-empty data rows
 * @throws {Error} If CSV file is empty
 */
function parseCsv(text) {
  const rows = [];
  let currentField = '';
  let currentRow = [];
  let insideQuotes = false;
  // Character-by-character state machine parser
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    // Handle quote state transitions
    if (insideQuotes) {
      if (char === '"') {
        const nextChar = text[index + 1];
        if (nextChar === '"') {
          // Escaped quote: "" becomes "
          currentField += '"';
          index += 1;
        } else {
          // End of quoted field
          insideQuotes = false;
        }
      } else {
        // Regular character inside quotes
        currentField += char;
      }
      continue;
    }
    // Start of quoted field
    if (char === '"') {
      insideQuotes = true;
      continue;
    }
    // Field delimiter
    if (char === ',') {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }
    // Row delimiter: handle both \r\n and \n
    if (char === '\r') {
      const nextChar = text[index + 1];
      if (nextChar === '\n') {
        index += 1;
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
      continue;
    }
    if (char === '\n') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
      continue;
    }
    // Regular character
    currentField += char;
  }
  // Handle any remaining field/row at end of file
  if (currentRow.length > 0 || currentField !== '') {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  if (rows.length === 0) {
    throw new Error('CSV file is empty.');
  }
  // First row is headers, strip carriage returns and trim
  const headers = rows[0].map((header) => header.replace(/\r/g, '').trim());
  // Filter out completely empty data rows
  const dataRows = rows
    .slice(1)
    .filter((row) => row.some((cell) => (cell ?? '').trim() !== ''));
  return { headers, rows: dataRows };
}

/**
 * Convert headers and rows to CSV text format.
 * 
 * Serializes data to RFC 4180-compliant CSV:
 * - All fields are quoted
 * - Quotes within fields are escaped as ""
 * - Uses \r\n line endings
 * - Includes trailing newline
 * 
 * @param {string[]} headers - Column headers
 * @param {string[][]} rows - Data rows
 * @returns {string} Complete CSV text ready for file writing
 */
function buildCsvText(headers, rows) {
  const allRows = [headers, ...rows];
  return allRows.map((row) => row.map(escapeForCsv).join(',')).join('\r\n') + '\r\n';
}

/**
 * Escape a single value for CSV format.
 * 
 * RFC 4180 compliant escaping:
 * - Converts null/undefined to empty string
 * - Doubles all quote characters ("" escaping)
 * - Wraps entire value in quotes
 * 
 * This aggressive quoting approach ensures all fields are safe,
 * even those containing commas, newlines, or quotes.
 * 
 * @param {*} value - Value to escape (any type, will be converted to string)
 * @returns {string} Quoted and escaped CSV field
 */
function escapeForCsv(value) {
  const stringValue =
    value === undefined || value === null ? '' : String(value);
  const escaped = stringValue.replace(/"/g, '""');
  return `"${escaped}"`;
}
