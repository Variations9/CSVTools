// TABLE HELPERS - CSV table manipulation utilities for project map management

import path from 'node:path';
import { readCsvFile, writeCsvFile } from './project-map-sync-core.mjs';

// Workspace root directory for resolving relative paths
const workspaceRoot = process.cwd();

// ============================================================================
// SECTION 1: PATH RESOLUTION
// ============================================================================

/**
 * Resolves the CSV file path using either an override path or default location.
 * 
 * Behavior:
 * - Checks for explicit override path parameter first
 * - Falls back to CSV_PROJECT_MAP_PATH environment variable
 * - Defaults to 'Source/ProjectMap/SourceFolder.csv' if neither provided
 * - Converts relative paths to absolute using workspace root
 * 
 * @param {string} [overridePath=''] - Optional explicit path to CSV file
 * @returns {string} Absolute path to the CSV file
 */
export function resolveCsvPath(overridePath = process.env.CSV_PROJECT_MAP_PATH ?? '') {
  if (overridePath) {
    return path.isAbsolute(overridePath)
      ? overridePath
      : path.join(workspaceRoot, overridePath);
  }
  return path.join(workspaceRoot, 'Source/ProjectMap/SourceFolder.csv');
}

// ============================================================================
// SECTION 2: CSV TABLE I/O OPERATIONS
// ============================================================================

/**
 * Loads CSV table data and normalizes all rows to consistent width.
 * 
 * Delegation: Calls readCsvFile() from project-map-sync-core.mjs for parsing
 * 
 * Process:
 * 1. Resolves CSV file path using resolveCsvPath()
 * 2. Reads and parses CSV file into headers and rows
 * 3. Normalizes all rows to match header count (adds empty strings as needed)
 * 
 * @param {string} [overridePath] - Optional explicit path to CSV file
 * @returns {Promise<{csvPath: string, headers: string[], rows: string[][]}>}
 *          Object containing resolved path, header array, and normalized row data
 */
export async function loadCsvTable(overridePath) {
  const csvPath = resolveCsvPath(overridePath);
  const data = await readCsvFile(csvPath);
  normalizeRows(data.headers, data.rows);
  return {
    csvPath,
    headers: data.headers,
    rows: data.rows,
  };
}

/**
 * Writes normalized CSV table data to disk.
 * 
 * Delegation: Calls writeCsvFile() from project-map-sync-core.mjs for serialization
 * 
 * Process:
 * 1. Normalizes all rows to consistent width before writing
 * 2. Serializes and writes data to specified path
 * 
 * @param {string} csvPath - Absolute path where CSV should be written
 * @param {string[]} headers - Array of column header names
 * @param {string[][]} rows - 2D array of row data
 * @returns {Promise<void>}
 */
export async function writeCsvTable(csvPath, headers, rows) {
  normalizeRows(headers, rows);
  await writeCsvFile(csvPath, headers, rows);
}

// ============================================================================
// SECTION 3: COLUMN MANAGEMENT
// ============================================================================

/**
 * Ensures a column exists in the table, adding it if missing.
 * 
 * Behavior:
 * - Searches for existing column by exact name match (after trimming)
 * - If found, returns existing column index
 * - If not found, appends new column to end of headers
 * - Adds empty string cell to all existing rows for new column
 * 
 * Side effects: Mutates headers array and all row arrays if column is added
 * 
 * @param {string[]} headers - Array of column header names (mutated if column added)
 * @param {string[][]} rows - 2D array of row data (mutated if column added)
 * @param {string} headerName - Name of column to ensure exists
 * @returns {number} Index position of the column (existing or newly added)
 */
export function ensureColumn(headers, rows, headerName) {
  let index = headers.findIndex((header) => header.trim() === headerName);
  if (index !== -1) {
    return index;
  }
  // Column doesn't exist - add it
  index = headers.length;
  headers.push(headerName);
  rows.forEach((row) => {
    // Pad row to reach new column position if needed
    while (row.length < index) {
      row.push('');
    }
    // Add empty cell for new column
    row.push('');
  });
  return index;
}

/**
 * Ensures multiple columns exist in the table, adding any that are missing.
 * 
 * Delegation: Calls ensureColumn() for each header name
 * 
 * Behavior:
 * - Processes columns in order provided
 * - Returns mapping of header names to their column indices
 * - Useful for batch column operations
 * 
 * Side effects: Mutates headers and rows arrays via ensureColumn()
 * 
 * @param {string[]} headers - Array of column header names (mutated if columns added)
 * @param {string[][]} rows - 2D array of row data (mutated if columns added)
 * @param {string[]} headerNames - Array of column names to ensure exist
 * @returns {Object.<string, number>} Map of header names to their column indices
 */
export function ensureColumns(headers, rows, headerNames) {
  const indices = {};
  headerNames.forEach((name) => {
    indices[name] = ensureColumn(headers, rows, name);
  });
  return indices;
}

// ============================================================================
// SECTION 4: ROW PATH CONSTRUCTION
// ============================================================================

/**
 * Builds a slash-separated path string from row's path segment columns.
 * 
 * Behavior:
 * - Extracts values from columns before the type column (path segments)
 * - Trims whitespace from each segment
 * - Skips empty segments
 * - Joins non-empty segments with '/' separator
 * - Returns '(root)' if no segments found
 * 
 * Use case: Creating file system-style paths from hierarchical CSV structure
 * Example: ['ProjectName', 'src', 'utils', '', ''] → 'ProjectName/src/utils'
 * 
 * @param {string[]} row - Array of cell values for a single row
 * @param {number} typeIndex - Column index of the Type column (path ends before this)
 * @returns {string} Slash-separated path or '(root)' if empty
 */
export function buildRowPath(row, typeIndex) {
  const segments = [];
  for (let i = 0; i < typeIndex; i += 1) {
    const value = (row[i] ?? '').trim();
    if (value) {
      segments.push(value);
    }
  }
  return segments.length > 0 ? segments.join('/') : '(root)';
}

// ============================================================================
// SECTION 5: VALUE ACCESSOR CREATION
// ============================================================================

/**
 * Creates a closure function for case-insensitive column value access.
 * 
 * Factory pattern: Returns a configured accessor function with header mapping
 * 
 * Behavior:
 * - Pre-processes headers into uppercase mapping for O(1) lookups
 * - Returns accessor function that takes (row, headerName, fallback)
 * - Accessor performs case-insensitive header matching
 * - Returns cell value as string, or fallback if column not found
 * 
 * Performance: Map lookup is cached, making repeated access efficient
 * 
 * Usage example:
 *   const getValue = createValueAccessor(headers);
 *   const type = getValue(row, 'Type', 'unknown');
 *   const features = getValue(row, 'FEATURES', '');
 * 
 * @param {string[]} headers - Array of column header names
 * @returns {function(string[], string, string=): string} Accessor function
 *          that retrieves values by header name (case-insensitive)
 */
export function createValueAccessor(headers) {
  // Build case-insensitive header index map
  const map = new Map(
    headers.map((header, index) => [header.trim().toUpperCase(), index])
  );
  // Return closure that uses the pre-built map
  return (row, headerName, fallback = '') => {
    const normalized = headerName.trim().toUpperCase();
    const index = map.get(normalized);
    if (index === undefined) {
      return fallback;
    }
    return (row[index] ?? '').toString();
  };
}

// ============================================================================
// SECTION 6: ROW NORMALIZATION
// ============================================================================

/**
 * Normalizes all rows to match header count by padding with empty strings.
 * 
 * Mutation: Directly modifies row arrays in place
 * 
 * Behavior:
 * - Determines target width from headers array length
 * - Iterates through each row
 * - Skips non-array rows (defensive programming)
 * - Appends empty strings until row length matches header count
 * - Ensures consistent column count across entire table
 * 
 * Use case: Called before CSV write operations to prevent malformed output
 * 
 * @param {string[]} headers - Array of column header names (defines target width)
 * @param {string[][]} rows - 2D array of row data (mutated to match width)
 * @returns {void}
 */
function normalizeRows(headers, rows) {
  const width = headers.length;
  rows.forEach((row) => {
    if (!Array.isArray(row)) {
      return;
    }
    while (row.length < width) {
      row.push('');
    }
  });
}
