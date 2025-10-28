// Project Map Preview/Comparison Tool (Dry Run)

import path from 'node:path';
import {
  readCsvFile,
  scanProjectTree,
  compareFileSystemToCsv,
} from './lib/project-map-sync-core.mjs';

// CONFIGURATION: Define workspace paths for comparison operations
// Workspace root is current working directory where script is executed
const workspaceRoot = process.cwd();
// Path to the master CSV file containing project structure metadata
const csvPath = path.join(workspaceRoot, 'Source/ProjectMap/SourceFolder.csv');
// Path to the source directory to scan for actual file system structure
const sourcePath = path.join(workspaceRoot, 'Source');

// SECTION 1: MAIN COMPARISON ORCHESTRATOR
/**
 * Main orchestration function for dry-run comparison between CSV and file system
 * 
 * Purpose:
 * - Compares current file system structure against CSV inventory
 * - Identifies discrepancies (additions, deletions, type changes, duplicates)
 * - Provides preview of changes without modifying any files
 * 
 * Process Flow:
 * 1. Loads CSV file and filters out snapshot entries
 * 2. Scans actual file system structure and filters snapshot artifacts
 * 3. Performs comparison to detect differences
 * 4. Reports detailed summary of findings
 * 
 * Output:
 * - Console report showing new entries, deleted entries, type corrections, and duplicates
 * - Suggests command to apply changes if differences found
 * 
 * Error Handling:
 * - Warnings for inaccessible directories during scan
 * - Fatal errors trigger exit code 1 via catch block
 */
async function main() {
  console.log('============================================================');
  console.log('Project Map Comparison (Dry Run)');
  console.log('============================================================\n');
  // STEP 1: Load and parse CSV data
  console.log('[1/3] Loading CSV...');
  const csvData = await readCsvFile(csvPath);
  console.log(`        Rows found: ${csvData.rows.length}`);
  // Locate the "Type" column index to determine path column count
  // Path columns precede the Type column (Root Folder through Sub-Folder Level 10)
  const typeColumnIndex = csvData.headers.findIndex(
    (header) => header.trim().toLowerCase() === 'type'
  );
  if (typeColumnIndex === -1) {
    throw new Error('Unable to locate "Type" column in CSV header.');
  }
  // Number of path columns = all columns before Type column
  const pathColumnCount = typeColumnIndex;
  // Filter out snapshot CSV files from the comparison dataset
  const csvRows = csvData.rows.filter(
    (row) => !isSnapshotRow(row, pathColumnCount)
  );
  // STEP 2: Scan actual file system structure
  console.log('\n[2/3] Scanning workspace...');
  const fileSystemEntries = await scanProjectTree(sourcePath, {
    onDirectoryError: ({ directory, error }) => {
      console.warn(`        Warning: skipped ${directory}: ${error.message}`);
    },
  });
  // Filter out snapshot artifacts from file system results
  const filteredEntries = fileSystemEntries.filter(
    (entry) => !isSnapshotArtifact(entry.fullPath)
  );
  console.log(`        Entries discovered: ${filteredEntries.length}`);
  // STEP 3: Compare file system against CSV to identify differences
  console.log('\n[3/3] Comparing results (no changes will be written)...');
  const diff = compareFileSystemToCsv({
    fileSystemEntries: filteredEntries,
    csvRows,
    headers: csvData.headers,
  });
  // Display detailed comparison report
  reportDiff(diff);
}

// SECTION 2: REPORTING FUNCTIONS
/**
 * Generates and displays a formatted comparison report
 * 
 * Purpose:
 * - Presents comparison results in human-readable format
 * - Categorizes differences into new entries, deletions, type changes, and duplicates
 * - Provides actionable next steps for synchronization
 * 
 * Parameters:
 * @param {Object} diff - Comparison result object from compareFileSystemToCsv
 * @param {Array} diff.newEntries - Files/folders present on disk but missing from CSV
 * @param {Array} diff.deletedEntries - CSV rows for files/folders no longer on disk
 * @param {Array} diff.changedEntries - Entries with type mismatches between CSV and disk
 * @param {Array} diff.duplicateCsvEntries - Duplicate paths found in CSV
 * 
 * Output Format:
 * - Summary counts for each category
 * - Detailed listings with symbols: + (new), - (deleted), ~ (changed), ! (duplicate)
 * - Suggests sync command if changes detected
 */
function reportDiff(diff) {
  console.log('\n------------------------------------------------------------');
  console.log('Comparison Summary');
  console.log('------------------------------------------------------------');
  console.log(`New entries:      ${diff.newEntries.length}`);
  console.log(`Deleted entries:  ${diff.deletedEntries.length}`);
  console.log(`Type corrections: ${diff.changedEntries.length}`);
  console.log(`Duplicate rows:   ${diff.duplicateCsvEntries.length}`);
  // Check if CSV perfectly matches file system (no differences found)
  if (
    diff.newEntries.length === 0 &&
    diff.deletedEntries.length === 0 &&
    diff.changedEntries.length === 0 &&
    diff.duplicateCsvEntries.length === 0
  ) {
    console.log('\nThe CSV exactly matches the current file system snapshot.');
    return;
  }
  // Report new entries found on disk but not in CSV
  if (diff.newEntries.length > 0) {
    console.log('\nPending additions:');
    diff.newEntries.forEach((entry) => {
      console.log(`  + ${entry.fullPath} (${entry.type})`);
    });
  }
  // Report CSV entries with no corresponding files/folders on disk
  if (diff.deletedEntries.length > 0) {
    console.log('\nOrphaned CSV rows (missing on disk):');
    diff.deletedEntries.forEach((entry) => {
      console.log(`  - ${entry.fullPath} (${entry.type})`);
    });
  }
  // Report entries where Type field differs between CSV and file system
  if (diff.changedEntries.length > 0) {
    console.log('\nRows requiring type updates:');
    diff.changedEntries.forEach((entry) => {
      console.log(
        `  ~ ${entry.fullPath}: ${entry.csvType || '(none)'} -> ${entry.fsType}`
      );
    });
  }
  // Report duplicate paths found in CSV (only first occurrence is kept)
  if (diff.duplicateCsvEntries.length > 0) {
    console.log('\nDuplicated CSV paths (first occurrence kept):');
    diff.duplicateCsvEntries.forEach((dup) => {
      console.log(`  ! ${dup.fullPath} (row ${dup.rowIndex + 2})`);
    });
  }
  // Provide command to apply changes
  console.log('\nTo apply these changes run:');
  console.log('  node Source/Tools/sync-filesystem-to-csv.mjs');
}

// SECTION 3: SNAPSHOT DETECTION UTILITIES
// Regex pattern for new snapshot file naming convention
// Format: SourceFolder-MMM-DD-YYYY-HH-MM-(am|pm)-and-SS-seconds.csv
// Example: SourceFolder-Jan-15-2024-03-45-pm-and-30-seconds.csv
const SNAPSHOT_NAME_REGEX_NEW =
  /^Source\/ProjectMap\/SourceFolder-[A-Za-z]{3}-\d{2}-\d{4}-\d{2}-\d{2}-(am|pm)-and-\d{2}-seconds\.csv$/i;
// Regex pattern for legacy snapshot file naming convention
// Format: FolderStructure_YYYY-MM-DD_HH-MM-SS.csv
// Example: FolderStructure_2024-01-15_15-45-30.csv
const SNAPSHOT_NAME_REGEX_OLD =
  /^Source\/ProjectMap\/FolderStructure_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.csv$/i;

/**
 * Determines if a file path represents a snapshot CSV artifact
 * 
 * Purpose:
 * - Identifies historical snapshot files that should be excluded from comparisons
 * - Supports both current and legacy snapshot naming conventions
 * 
 * Parameters:
 * @param {string} fullPath - Complete file path to evaluate
 * 
 * Returns:
 * @returns {boolean} - True if path matches any snapshot pattern, false otherwise
 * 
 * Implementation:
 * - Tests path against both new and old snapshot naming patterns
 * - Case-insensitive matching for robustness
 */
function isSnapshotArtifact(fullPath) {
  return SNAPSHOT_NAME_REGEX_NEW.test(fullPath) || SNAPSHOT_NAME_REGEX_OLD.test(fullPath);
}

/**
 * Determines if a CSV row represents a snapshot file entry
 * 
 * Purpose:
 * - Filters snapshot CSV entries from comparison dataset
 * - Reconstructs full path from CSV row's hierarchical folder structure
 * 
 * Parameters:
 * @param {Array} row - CSV row as array of column values
 * @param {number} pathColumnCount - Number of columns representing path segments
 * 
 * Returns:
 * @returns {boolean} - True if row represents a snapshot artifact, false otherwise
 * 
 * Implementation:
 * - Extracts path segments from first N columns (before Type column)
 * - Joins non-empty segments with '/' to form complete path
 * - Delegates to isSnapshotArtifact for pattern matching
 */
function isSnapshotRow(row, pathColumnCount) {
  const segments = [];
  for (let index = 0; index < pathColumnCount; index += 1) {
    const value = (row[index] ?? '').trim();
    if (value) {
      segments.push(value);
    }
  }
  const key = segments.join('/');
  return isSnapshotArtifact(key);
}

// Execute main comparison function with global error handling
main().catch((error) => {
  console.error('\nComparison failed.');
  console.error(error.stack || error.message);
  process.exit(1);
});
