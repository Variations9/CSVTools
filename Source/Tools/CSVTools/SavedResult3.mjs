// ============================================================================
// SAVED RESULT SLOT 3 EXPORTER
// ============================================================================

import { saveResultSlot } from './lib/save-result.mjs';

// ============================================================================
// SECTION 1: MAIN ENTRY POINT
// ============================================================================
/**
 * main
 *
 * Purpose: Copies populated QUERY RESULTS cells into the Saved Result 3 column (Column U).
 *
 * Behavior:
 * - Invokes saveResultSlot configured for the third saved result column
 * - Short-circuits with a status message when no rows require copying
 * - Logs transfer counts, destination column, and timestamp for successful runs
 *
 * Parameters: none (CLI entry)
 *
 * Returns: Promise<void>
 *
 * Key Features:
 * - Keeps CLI behavior aligned with other saved result exporters
 * - Relies on shared CSV helper for the actual data mutation
 */
async function main() {
  const { csvPath, updated, timestamp } = await saveResultSlot('SAVED RESULT 3');
  if (updated === 0) {
    console.log('No QUERY RESULTS entries to save into Column U.');
    return;
  }
  console.log(
    `Copied ${updated} result(s) from Column R -> Column U at ${timestamp} (${csvPath}).`
  );
}

// Trigger the CLI workflow and escalate unexpected errors through stderr.
main().catch((error) => {
  console.error('SavedResult3 failed:', error.message);
  process.exit(1);
});
