// SAVE RESULT SLOT
// Saves query results to a timestamped slot column in the project CSV
import { loadCsvTable, writeCsvTable, ensureColumns } from './table-helpers.mjs';
// PURPOSE:
// Copies content from the 'QUERY RESULTS' column to a specified target column
// with an ISO timestamp annotation, then persists changes to the CSV file.
// This enables versioning and history tracking of query results by saving
// snapshots to named slots (e.g., 'RESULT_V1', 'BACKUP_20250101').
//
// DELEGATION:
// - loadCsvTable: Reads the CSV file and parses it into headers and rows
// - ensureColumns: Guarantees both source and target columns exist, adding if needed
// - writeCsvTable: Writes the modified table back to disk (only if changes were made)
//
// PARAMETERS:
// @param {string} slotHeader - The name of the target column where results will be saved
//
// RETURN VALUE:
// @returns {Promise<{ csvPath: string, updated: number, timestamp: string }>}
//   - csvPath: Full path to the CSV file that was modified
//   - updated: Count of rows that had non-empty query results and were updated
//   - timestamp: ISO 8601 timestamp of when the save operation occurred
//
// KEY IMPLEMENTATION DETAILS:
// - Only processes rows that contain non-empty content in 'QUERY RESULTS'
// - Appends the timestamp on a new line (format: "[saved 2025-10-27T...]")
// - Optimizes file I/O by only writing to disk if at least one row was updated
// - Preserves all other row data unchanged
// - The saved format allows distinguishing original results from archived versions
export async function saveResultSlot(slotHeader) {
  // Load the complete CSV table structure from disk
  const { csvPath, headers, rows } = await loadCsvTable();
  // Ensure both the source 'QUERY RESULTS' column and target slot column exist
  // Returns a map of column names to their array indices for efficient access
  const indices = ensureColumns(headers, rows, ['QUERY RESULTS', slotHeader]);
  // Generate ISO 8601 timestamp to annotate when results were archived
  const timestamp = new Date().toISOString();
  // Track how many rows actually contain query results to update
  let updated = 0;
  // Iterate through all rows to copy query results to the target slot
  rows.forEach((row) => {
    // Extract the current query result value, handling undefined/null safely
    const value = (row[indices['QUERY RESULTS']] ?? '').trim();
    // Skip rows with empty query results - nothing to save
    if (!value) {
      return;
    }
    // Copy the query result to the target slot with timestamp annotation
    // Format: "original_result\n[saved 2025-10-27T12:34:56.789Z]"
    row[indices[slotHeader]] = `${value}\n[saved ${timestamp}]`;
    // Increment counter to track number of successful updates
    updated += 1;
  });
  // Only write to disk if at least one row was actually modified
  // This avoids unnecessary file I/O when no query results exist
  if (updated > 0) {
    await writeCsvTable(csvPath, headers, rows);
  }
  // Return operation summary with file path, update count, and timestamp
  return { csvPath, updated, timestamp };
}
