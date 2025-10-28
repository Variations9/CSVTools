// ============================================================================
// SAVED RESULT SLOT 2 EXPORTER
// ============================================================================

import { saveResultSlot } from './lib/save-result.mjs';

// ============================================================================
// SECTION 1: MAIN ENTRY POINT
// ============================================================================
/**
 * main
 *
 * Purpose: Copies populated QUERY RESULTS cells into the Saved Result 2 column (Column T).
 *
 * Behavior:
 * - Delegates copy logic to saveResultSlot targeting the second saved column
 * - Emits a no-op message when the source column is empty
 * - Logs the number of transferred rows, destination column, and timestamp when successful
 *
 * Parameters: none (CLI entry)
 *
 * Returns: Promise<void>
 *
 * Key Features:
 * - Centralizes console messaging for consistent CLI feedback
 * - Reuses shared helper to keep CSV update logic in one module
 */
async function main() {
  const { csvPath, updated, timestamp } = await saveResultSlot('SAVED RESULT 2');
  if (updated === 0) {
    console.log('No QUERY RESULTS entries to save into Column T.');
    return;
  }
  console.log(
    `Copied ${updated} result(s) from Column R -> Column T at ${timestamp} (${csvPath}).`
  );
}

// Execute the CLI handler and exit with failure status on unhandled errors.
main().catch((error) => {
  console.error('SavedResult2 failed:', error.message);
  process.exit(1);
});
