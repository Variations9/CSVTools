// ============================================================================
// SAVED RESULT SLOT 1 EXPORTER
// ============================================================================

import { saveResultSlot } from './lib/save-result.mjs';

// ============================================================================
// SECTION 1: MAIN ENTRY POINT
// ============================================================================
/**
 * main
 *
 * Purpose: Copies populated QUERY RESULTS cells into the Saved Result 1 column (Column S).
 *
 * Behavior:
 * - Calls saveResultSlot with the target column header
 * - Logs a no-op message when no rows require copying
 * - Reports the number of affected rows, destination column, and timestamp on success
 *
 * Parameters: none (CLI entry)
 *
 * Returns: Promise<void>
 *
 * Key Features:
 * - Delegates core CSV manipulation to saveResultSlot helper
 * - Provides informative console output for operators
 */
async function main() {
  const { csvPath, updated, timestamp } = await saveResultSlot('SAVED RESULT 1');
  if (updated === 0) {
    console.log('No QUERY RESULTS entries to save into Column S.');
    return;
  }
  console.log(
    `Copied ${updated} result(s) from Column R -> Column S at ${timestamp} (${csvPath}).`
  );
}

// Execute the CLI handler and surface fatal errors with a non-zero exit code.
main().catch((error) => {
  console.error('SavedResult1 failed:', error.message);
  process.exit(1);
});
