// QUERIER - CSV QUERY ENGINE WITH PLUGGABLE TRAVERSERS

import path from 'node:path';
import {
  loadCsvTable,
  writeCsvTable,
  ensureColumns,
  createValueAccessor,
  buildRowPath as computeRowPath,
} from './lib/table-helpers.mjs';

// ============================================================
// CONFIGURATION CONSTANTS
// ============================================================

// Required CSV columns for query processing
// These columns must exist in the CSV for the querier to function properly
const REQUIRED_COLUMNS = [
  'DEBUGGER QUERY',      // Column Q: Contains user query input
  'QUERY RESULTS',       // Column R: Stores query execution results
  'SAVED RESULT 1',      // Column S: First saved result slot
  'SAVED RESULT 2',      // Column T: Second saved result slot
  'SAVED RESULT 3',      // Column U: Third saved result slot
];

// Traverser modules to load dynamically
// These modules implement different query strategies (feature-mode, linkage, structure-finder, etc.)
const TRAVERSER_MODULES = [
  './Querier1.mjs',           // Feature-mode comparison traverser
  './Querier2.mjs',           // Linkage mapping traverser
  './Querier3.mjs',           // Structure-finder traverser
  './traverserQuerier2.mjs',  // Default row-summary traverser (fallback)
];

// ============================================================
// QUERY PARSING
// ============================================================

/**
 * Parses a query cell value into a structured format
 * 
 * Purpose: Extracts query information from CSV cell, supporting both plain text and JSON queries
 * 
 * Features:
 * - Handles empty/null values gracefully
 * - Attempts JSON parsing for structured queries (e.g., {"type":"linkage","target":"n44"})
 * - Tokenizes text for keyword matching
 * - Provides multiple access patterns (raw, text, tokens, json)
 * 
 * @param {string|null|undefined} value - Raw cell value from CSV
 * @returns {Object} Parsed query object with structure:
 *   - raw: Original unmodified value
 *   - text: Trimmed text content
 *   - tokens: Lowercase word array for matching
 *   - json: Parsed JSON object (if valid) or null
 */
function parseQueryCell(value) {
  const text = (value ?? '').trim();
  if (!text) {
    return { raw: '', text: '', tokens: [], json: null };
  }
  // Attempt JSON parsing for structured queries like {"type":"linkage","target":"n44"}
  let json = null;
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return {
    raw: text,
    text,
    tokens: text.toLowerCase().split(/\s+/).filter(Boolean),
    json,
  };
}

// ============================================================
// TRAVERSER LOADING
// ============================================================

/**
 * Dynamically loads all query traverser modules
 * 
 * Purpose: Imports and validates traverser modules that implement different query strategies
 * 
 * Delegation Pattern: Each traverser must export:
 * - run(context): Function that executes the query and returns results
 * - matches(context): Optional function to determine if traverser should handle query
 * 
 * Validation:
 * - Ensures each module exports a valid traverser with run() function
 * - Adds default matches() function if not provided (always returns true)
 * - Throws error if module structure is invalid
 * 
 * @returns {Promise<Array>} Array of loaded traverser modules
 * @throws {Error} If any traverser module is invalid or fails to load
 */
async function loadTraversers() {
  const modules = await Promise.all(
    TRAVERSER_MODULES.map(async (modulePath) => {
      const url = new URL(modulePath, import.meta.url);
      const mod = await import(url);
      const traverser = mod.default ?? mod;
      // Validate traverser structure - must have run() function
      if (!traverser || typeof traverser.run !== 'function') {
        throw new Error(`Traverser ${modulePath} does not export a run() function.`);
      }
      // Add default matches() function if not provided (accepts all queries)
      if (typeof traverser.matches !== 'function') {
        traverser.matches = () => true;
      }
      return traverser;
    })
  );
  return modules;
}

// ============================================================
// MAIN QUERY PROCESSING ENGINE
// ============================================================

/**
 * Main query processing workflow
 * 
 * Purpose: Orchestrates the entire query execution pipeline from CSV load to result storage
 * 
 * Workflow Steps:
 * 1. Load CSV table and validate structure
 * 2. Ensure required columns exist (creates if missing)
 * 3. Load all traverser modules
 * 4. Process each row with a query:
 *    - Parse the query cell
 *    - Build query context with row data and helper functions
 *    - Select appropriate traverser via matches() function
 *    - Execute traverser.run() to generate results
 *    - Store results in QUERY RESULTS column
 * 5. Write updated CSV with results
 * 
 * Features:
 * - Skips rows without queries
 * - Provides rich context to traversers (row data, helpers, indices)
 * - Handles traverser errors gracefully with error messages in results
 * - Tracks processing statistics (processed count, updated count)
 * - Logs progress with traverser identification
 * 
 * Context Object Structure:
 * - query: Parsed query object (from parseQueryCell)
 * - row: Current CSV row data array
 * - rowIndex: Zero-based row index
 * - rows: Complete CSV data array
 * - headers: CSV header row
 * - typeIndex: Index of TYPE column
 * - getPath(): Function to build file path for current row
 * - buildRowPath(targetRow): Function to build file path for any row
 * - getValue: Function to access column values by header name
 * 
 * @returns {Promise<void>}
 * @throws {Error} If CSV structure is invalid or processing fails
 */
async function main() {
  console.log('============================================================');
  console.log('CSV Traverser / Querier (Column Q → Column R)');
  console.log('============================================================\n');
  // Load CSV table and get structure
  const { csvPath, headers, rows } = await loadCsvTable();
  // Ensure all required columns exist (creates them if missing)
  const columnIndices = ensureColumns(headers, rows, REQUIRED_COLUMNS);
  // Find TYPE column index (required for path construction)
  const typeIndex = headers.findIndex((header) => header.trim().toUpperCase() === 'TYPE');
  if (typeIndex === -1) {
    throw new Error('Unable to locate "Type" column in CSV header.');
  }
  // Create value accessor helper function for easy column access by name
  const getValue = createValueAccessor(headers);
  // Load all traverser modules dynamically
  const traversers = await loadTraversers();
  let processed = 0;
  let updated = 0;
  // Process each row in the CSV
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const queryCell = (row[columnIndices['DEBUGGER QUERY']] ?? '').trim();
    // Skip rows without queries
    if (!queryCell) {
      continue;
    }
    processed += 1;
    // Parse the query into structured format (text, tokens, JSON)
    const parsedQuery = parseQueryCell(queryCell);
    // Build comprehensive context object for traversers
    // This provides all data and helper functions needed for query execution
    const context = {
      query: parsedQuery,
      row,
      rowIndex,
      rows,
      headers,
      typeIndex,
      getPath: () => computeRowPath(row, typeIndex),
      buildRowPath: (targetRow) => computeRowPath(targetRow, typeIndex),
      getValue,
    };
    // Select appropriate traverser using matches() function
    // Falls back to last traverser (default row-summary) if no specific match
    const traverser =
      traversers.find((candidate) => {
        try {
          return candidate.matches({
            ...context,
            query: parsedQuery,
          });
        } catch {
          return false;
        }
      }) ?? traversers[traversers.length - 1];
    // Execute traverser and capture results
    let result = '';
    try {
      result = await traverser.run(context);
    } catch (error) {
      // Store error message in results for debugging
      result = `Querier error (${traverser.id ?? 'unknown'}): ${error.message}`;
    }
    // Store trimmed result in QUERY RESULTS column
    const trimmedResult = (result ?? '').toString().trim();
    row[columnIndices['QUERY RESULTS']] = trimmedResult;
    updated += 1;
    console.log(
      `Processed query @ row ${rowIndex + 2} via ${
        traverser.id ?? path.basename(traverser)
      }`
    );
  }
  // Write updated CSV back to disk if changes were made
  if (updated > 0) {
    await writeCsvTable(csvPath, headers, rows);
    console.log(`\nUpdated ${updated} row(s) in ${path.relative(process.cwd(), csvPath)}.`);
  } else {
    console.log('\nNo queries found; nothing to update.');
  }
  console.log(`Querier complete. Queries evaluated: ${processed}.`);
}

// ============================================================
// EXECUTION
// ============================================================

// Execute main function and handle any fatal errors
main().catch((error) => {
  console.error('Querier failed:', error.message);
  process.exit(1);
});
