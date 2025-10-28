// CSV PROJECT MAP - FILE SYSTEM SYNCHRONIZATION SCRIPT

// ============================================================================
// SECTION 1: DEPENDENCIES AND PATH INITIALIZATION
// ============================================================================
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  readCsvFile,
  writeCsvFile,
  scanProjectTree,
  compareFileSystemToCsv,
  buildUpdatedRows,
} from './lib/project-map-sync-core.mjs';

/**
 * Workspace configuration
 *
 * Purpose: Resolve absolute paths used throughout the synchronization workflow.
 * Components:
 * - workspaceRoot: Root directory set to the current working directory.
 * - csvPath: Absolute path to the authoritative project CSV.
 * - sourcePath: Absolute path to the Source directory that is being scanned.
 * Key Features:
 * - Centralized path resolution prevents duplicated join logic across functions.
 * - Uses process.cwd() so the script adapts to the launch context automatically.
 */
const workspaceRoot = process.cwd();
const csvPath = path.join(workspaceRoot, 'Source/ProjectMap/SourceFolder.csv');
const sourcePath = path.join(workspaceRoot, 'Source');

// ============================================================================
// SECTION 2: WORKFLOW ORCHESTRATION
// ============================================================================
/**
 * main
 *
 * Purpose: Coordinate the end-to-end synchronization pipeline between the file
 * system and the project map CSV snapshot.
 * Behavior:
 * - Loads the existing CSV dataset.
 * - Scans the Source directory tree and filters snapshot artefacts.
 * - Performs a diff to reconcile CSV rows with current file system entries.
 * - Builds an updated row set and writes a timestamped snapshot copy.
 * - Emits console summaries describing detected additions, deletions, and changes.
 * Delegation:
 * - readCsvFile: Parses the current project map.
 * - scanProjectTree: Recursively enumerates file system entries.
 * - compareFileSystemToCsv: Computes structural differences.
 * - buildUpdatedRows: Produces the merged data set.
 * - writeSnapshotCopy: Persists the refreshed snapshot.
 * Parameters: None
 * Returns: Promise<void>
 * Key Features:
 * - Guard clause for the no-change scenario to maintain traceability snapshots.
 * - Console-driven progress indicators for long-running operations.
 */
async function main() {
  console.log('============================================================');
  console.log('Project Map: File System Synchronization');
  console.log('============================================================\n');

  console.log('[1/5] Loading CSV data...');
  const csvData = await readCsvFile(csvPath);
  console.log(`        Rows discovered: ${csvData.rows.length}`);

  console.log('\n[2/5] Scanning workspace...');
  const fileSystemEntries = await scanProjectTree(sourcePath, {
    onDirectoryError: ({ directory, error }) => {
      console.warn(`        Warning: skipped ${directory}: ${error.message}`);
    },
  });
  const filteredEntries = fileSystemEntries.filter(
    (entry) => !isSnapshotArtifact(entry.fullPath)
  );
  console.log(`        Entries discovered: ${filteredEntries.length}`);

  console.log('\n[3/5] Comparing CSV with file system...');
  const diff = compareFileSystemToCsv({
    fileSystemEntries: filteredEntries,
    csvRows: csvData.rows,
    headers: csvData.headers,
  });
  
  if (diff.headers) {
    csvData.headers = diff.headers;
  }

  console.log(`        New entries:     ${diff.newEntries.length}`);
  console.log(`        Deleted entries: ${diff.deletedEntries.length}`);
  console.log(`        Type changes:    ${diff.changedEntries.length}`);

  if (diff.duplicateCsvEntries.length > 0) {
    console.log(
      `        Duplicate CSV paths skipped: ${diff.duplicateCsvEntries.length}`
    );
  }

  if (
    diff.newEntries.length === 0 &&
    diff.deletedEntries.length === 0 &&
    diff.changedEntries.length === 0
  ) {
    console.log(
      '\nNo structural changes detected. Creating fresh snapshots for traceability...'
    );
  }

  console.log('\n[4/5] Building updated row set...');
  const updatedRows = buildUpdatedRows({
    headers: csvData.headers,
    matchedEntries: diff.matchedEntries,
    newEntries: diff.newEntries,
    pathColumnCount: diff.pathColumnCount,
    typeColumnIndex: diff.typeColumnIndex,
  });
  const snapshotFileName = buildSnapshotFileName();
  console.log(`        Updated row count: ${updatedRows.length}`);

  console.log('\n[5/5] Writing snapshot CSV copy...');
  const snapshotInfo = await writeSnapshotCopy({
    headers: csvData.headers,
    rows: updatedRows,
    fileName: snapshotFileName,
  });
  console.log(
    `        Project snapshot: ${path.relative(
      workspaceRoot,
      snapshotInfo.projectSnapshotPath
    )}`
  );

  console.log(
    `\nOriginal CSV preserved: ${path.relative(workspaceRoot, csvPath)}`
  );

  logChangeSummary(diff, snapshotInfo);
}

// ============================================================================
// SECTION 3: REPORTING HELPERS
// ============================================================================
/**
 * logChangeSummary
 *
 * Purpose: Emit a human-readable summary of synchronization results.
 * Behavior:
 * - Prints added, removed, and type-changed entries discovered during diffing.
 * - Highlights duplicate CSV rows that were ignored.
 * - Announces the location of the generated snapshot file.
 * Delegation:
 * - Relies on console output exclusively; no file system writes occur here.
 * Parameters:
 * - {Object} diff: Result of compareFileSystemToCsv containing change arrays.
 * - {Object} snapshots: Paths returned by writeSnapshotCopy.
 * Returns: void
 * Key Features:
 * - Uses visual markers (+, -, ~, !) to categorize change types quickly.
 * - Leaves the base CSV untouched, reinforcing the snapshot-only contract.
 */
function logChangeSummary(diff, snapshots) {
  console.log('\n------------------------------------------------------------');
  console.log('Update Summary');
  console.log('------------------------------------------------------------');

  if (diff.newEntries.length > 0) {
    console.log('\nAdded entries:');
    diff.newEntries.forEach((entry) => {
      console.log(`  + ${entry.fullPath} (${entry.type})`);
    });
  }

  if (diff.deletedEntries.length > 0) {
    console.log('\nRemoved entries:');
    diff.deletedEntries.forEach((entry) => {
      console.log(`  - ${entry.fullPath} (${entry.type})`);
    });
  }

  if (diff.changedEntries.length > 0) {
    console.log('\nType corrections:');
    diff.changedEntries.forEach((entry) => {
      console.log(
        `  ~ ${entry.fullPath}: ${entry.csvType || '(none)'} -> ${entry.fsType}`
      );
    });
  }

  if (diff.duplicateCsvEntries.length > 0) {
    console.log('\nDuplicate CSV rows (ignored during sync):');
    diff.duplicateCsvEntries.forEach((dup) => {
      console.log(`  ! ${dup.fullPath} (row ${dup.rowIndex + 2})`);
    });
  }

  console.log('\nSnapshot created at:');
  console.log(`  - ${snapshots.projectSnapshotPath}`);

  console.log('\nSynchronization complete (base CSV left untouched).');
}

// ============================================================================
// SECTION 4: SNAPSHOT PERSISTENCE
// ============================================================================
/**
 * writeSnapshotCopy
 *
 * Purpose: Persist the reconciled data set to a timestamped CSV snapshot.
 * Behavior:
 * - Resolves a snapshot path adjacent to the canonical CSV.
 * - Writes headers and rows using the shared writeCsvFile helper.
 * Delegation:
 * - writeCsvFile handles actual serialization and file I/O.
 * Parameters:
 * - {Object} input.headers: Ordered header array for the CSV writer.
 * - {Object[]} input.rows: Updated row data emitted by buildUpdatedRows.
 * - {string} input.fileName: Snapshot file name generated by buildSnapshotFileName.
 * Returns: Promise<{projectSnapshotPath: string}>
 * Key Features:
 * - Decouples snapshot naming from persistence, enabling alternative strategies if needed.
 * - Standardizes the return payload for downstream logging.
 */
async function writeSnapshotCopy({ headers, rows, fileName }) {
  const projectSnapshotPath = path.join(path.dirname(csvPath), fileName);
  await writeCsvFile(projectSnapshotPath, headers, rows);

  return {
    projectSnapshotPath,
  };
}

// ============================================================================
// SECTION 5: SNAPSHOT NAMING UTILITIES
// ============================================================================
/**
 * buildSnapshotFileName
 *
 * Purpose: Generate a human-readable snapshot file name embedding timestamp data.
 * Behavior:
 * - Formats the provided date into month, day, year, hour, minute, second, and meridiem tokens.
 * - Constructs a consistent prefix (`SourceFolder-`) for downstream filtering.
 * Delegation: Relies on built-in Date formatting helpers.
 * Parameters:
 * - {Date} [date=new Date()]: Timestamp basis for the snapshot name.
 * Returns: string
 * Key Features:
 * - Produces sortable file names that encode 12-hour time plus seconds for uniqueness.
 * - Compatible with the SNAPSHOT_NAME_REGEX_NEW detection rule.
 */
function buildSnapshotFileName(date = new Date()) {
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  const hour12 = String(date.getHours() % 12 || 12).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  const ampm = date.getHours() < 12 ? 'am' : 'pm';
  return `SourceFolder-${month}-${day}-${year}-${hour12}-${minute}-${ampm}-and-${second}-seconds.csv`;
}

/**
 * Snapshot name detection patterns
 *
 * Purpose: Provide reusable regular expressions used to filter historical CSV artefacts.
 * Components:
 * - SNAPSHOT_NAME_REGEX_NEW: Matches modern `SourceFolder-<timestamp>` outputs.
 * - SNAPSHOT_NAME_REGEX_OLD: Supports legacy `FolderStructure_<timestamp>` archives.
 * Key Features:
 * - Case-insensitive patterns accommodate tooling variations across platforms.
 * - Encoded structure prevents accidental exclusion of valid project files.
 */
const SNAPSHOT_NAME_REGEX_NEW =
  /^Source\/ProjectMap\/SourceFolder-[A-Za-z]{3}-\d{2}-\d{4}-\d{2}-\d{2}-(am|pm)-and-\d{2}-seconds\.csv$/i;
const SNAPSHOT_NAME_REGEX_OLD =
  /^Source\/ProjectMap\/FolderStructure_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.csv$/i;

// ============================================================================
// SECTION 6: ARTIFACT FILTERING
// ============================================================================
/**
 * isSnapshotArtifact
 *
 * Purpose: Determine whether a given path refers to a historical snapshot file that
 * should be excluded from synchronization comparisons.
 * Behavior:
 * - Tests the input path against both legacy and current snapshot naming patterns.
 * Delegation: Utilizes SNAPSHOT_NAME_REGEX_NEW and SNAPSHOT_NAME_REGEX_OLD.
 * Parameters:
 * - {string} fullPath: Absolute path discovered during the file system scan.
 * Returns: boolean
 * Key Features:
 * - Prevents artificial growth of the snapshot inventory during scans.
 * - Keeps diff calculations focused on production assets and source files.
 */
function isSnapshotArtifact(fullPath) {
  return SNAPSHOT_NAME_REGEX_NEW.test(fullPath) || SNAPSHOT_NAME_REGEX_OLD.test(fullPath);
}

/**
 * Workflow execution bootstrap
 *
 * Purpose: Execute the main synchronization routine and surface fatal errors.
 * Behavior:
 * - Runs main() and captures rejections.
 * - Logs stack traces for diagnosability.
 * - Exits with code 1 to signal failure to calling processes.
 */
main().catch((error) => {
  console.error('\nSynchronization failed.');
  console.error(error.stack || error.message);
  process.exit(1);
});

