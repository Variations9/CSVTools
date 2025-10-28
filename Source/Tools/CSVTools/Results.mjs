// ============================================================================
// QUERIER RESULTS REPORTER
// ============================================================================

import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCsvTable, writeCsvTable, ensureColumns, createValueAccessor, buildRowPath } from './lib/table-helpers.mjs';

// ============================================================================
// SECTION 1: CONSTANTS AND PATH UTILITIES
// ============================================================================
// Required CSV column headers that must exist to export and optionally clear results.
const REQUIRED_COLUMNS = [
  'DEBUGGER QUERY',
  'QUERY RESULTS',
  'SAVED RESULT 1',
  'SAVED RESULT 2',
  'SAVED RESULT 3',
];

// Resolve the current workspace root and target directory where log exports are written.
const workspaceRoot = process.cwd();
const logDir = path.join(workspaceRoot, 'Source/Tools/logs');

// ============================================================================
// SECTION 2: FILESYSTEM HELPERS
// ============================================================================
/**
 * ensureLogDirectory
 *
 * Purpose: Creates the log output directory if it does not already exist.
 *
 * Behavior:
 * - Delegates to fs.mkdir with recursive mode to avoid errors when the path already exists
 * - Guarantees that downstream write operations have a destination directory
 *
 * Parameters: none
 *
 * Returns: Promise<void>
 *
 * Key Features:
 * - Idempotent directory setup leveraging the Node.js recursive mkdir flag
 * - Keeps I/O helpers isolated for reuse across future reporters
 */
async function ensureLogDirectory() {
  await fs.mkdir(logDir, { recursive: true });
}

/**
 * formatEntry
 *
 * Purpose: Generates a human-readable log snippet for a single CSV row.
 *
 * Behavior:
 * - Builds an array of string lines containing file path, query (when present), and result content
 * - Inserts a separator line to keep individual entries distinct inside the log file
 *
 * Parameters:
 * - rowPath: string
 * - query: string
 * - result: string
 *
 * Returns: string formatted for aggregation into the log body
 *
 * Key Features:
 * - Keeps log generation deterministic and easy to parse manually
 * - Avoids trailing whitespace by constructing the message line by line
 */
function formatEntry(rowPath, query, result) {
  const lines = [];
  lines.push(`File: ${rowPath}`);
  if (query) {
    lines.push(`Query: ${query}`);
  }
  lines.push('Result:');
  lines.push(result);
  lines.push('---');
  return lines.join('\n');
}

// ============================================================================
// SECTION 3: MAIN EXECUTION FLOW
// ============================================================================
/**
 * main
 *
 * Purpose: Exports populated QUERY RESULTS cells to timestamped log files and optionally clears the source cells.
 *
 * Behavior:
 * - Detects the --clear flag to decide whether Column R should be emptied after export
 * - Loads the shared CSV dataset and ensures required columns exist (creating them when absent)
 * - Scans each row for populated QUERY RESULTS entries and captures contextual metadata
 * - Writes a timestamped log file containing formatted entries
 * - Optionally clears the source cells and persists the mutated CSV when --clear is provided
 *
 * Parameters: none (uses process.argv for configuration)
 *
 * Returns: Promise<void>
 *
 * Key Features:
 * - Centralized CLI entry point for result archival
 * - Respects existing helper utilities for CSV manipulation and path resolution
 * - Provides progress output for operator feedback
 */
async function main() {
  const clearAfterExport = process.argv.includes('--clear');
  console.log('============================================================');
  console.log('Querier Results Reporter (Column R snapshot)');
  console.log('============================================================\n');

  const { csvPath, headers, rows } = await loadCsvTable();
  const columnIndices = ensureColumns(headers, rows, REQUIRED_COLUMNS);
  const typeIndex = headers.findIndex((header) => header.trim().toUpperCase() === 'TYPE');
  const getValue = createValueAccessor(headers);

  const entries = [];

  rows.forEach((row) => {
    const result = (row[columnIndices['QUERY RESULTS']] ?? '').trim();
    if (!result) {
      return;
    }
    const query = (row[columnIndices['DEBUGGER QUERY']] ?? '').trim();
    const rowPath = buildRowPath(row, typeIndex);
    entries.push({ row, query, result, rowPath });
  });

  if (entries.length === 0) {
    console.log('No populated QUERY RESULTS cells were found. Nothing to export.');
    return;
  }

  await ensureLogDirectory();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = path.join(logDir, `querier-results-${timestamp}.log`);
  const logBody = entries.map((entry) => formatEntry(entry.rowPath, entry.query, entry.result)).join('\n');
  await fs.writeFile(logPath, logBody, 'utf8');

  console.log(`Exported ${entries.length} result(s) to ${path.relative(process.cwd(), logPath)}.`);

  if (clearAfterExport) {
    entries.forEach((entry) => {
      entry.row[columnIndices['QUERY RESULTS']] = '';
    });
    await writeCsvTable(csvPath, headers, rows);
    console.log('Cleared Column R after exporting.');
  }
}

// Trigger the CLI and surface errors with non-zero exit codes when failures occur.
main().catch((error) => {
  console.error('Results reporter failed:', error.message);
  process.exit(1);
});
