// CSV PROJECT MAP - LINES OF CODE COUNTER

// ============================================================================
// SECTION 1: DEPENDENCIES
// ============================================================================
import fs from 'node:fs/promises';
import path from 'node:path';

// ============================================================================
// SECTION 2: CONFIGURATION
// ============================================================================
/**
 * Workspace context and CSV resolution.
 *
 * Purpose: Capture base directories and the CSV path used throughout the workflow.
 * Components:
 * - workspaceRoot: Root directory derived from the execution context.
 * - csvOverride: Optional override supplied via environment variable.
 * - csvPath: Absolute CSV path resolved through resolveCsvPath().
 */
const workspaceRoot = process.cwd();
const csvOverride = process.env.CSV_PROJECT_MAP_PATH ?? '';
const csvPath = resolveCsvPath(csvOverride);
const MAX_FILE_SIZE_BYTES =
  Number.isFinite(Number.parseInt(process.env.LOC_MAX_BYTES, 10)) &&
  Number.parseInt(process.env.LOC_MAX_BYTES, 10) > 0
    ? Number.parseInt(process.env.LOC_MAX_BYTES, 10)
    : 100 * 1024 * 1024; // 100MB default cap to avoid extreme memory pressure
const SKIP_PATH_SEGMENTS = new Set(
  ['library', 'temp', 'logs', 'obj', 'build', 'builds', 'binaries'].map((segment) =>
    segment.toLowerCase()
  )
);
const MAX_SKIP_LOGS_PER_REASON = 20;
const skipLogCounts = new Map(); // reason -> count
const PROGRESS_EVERY_ROWS = 5000;

// ============================================================================
// SECTION 3: WORKFLOW ORCHESTRATION
// ============================================================================
/**
 * main
 *
 * Purpose: Synchronize the "LINES OF CODE" column in the project map.
 * Behavior:
 * - Loads the CSV data and injects the LOC column when missing.
 * - Iterates file rows, counts non-empty lines, and records project totals.
 * - Writes updated rows back to disk when changes are detected.
 * Delegation:
 * - parseCsv/quoteForCsv: CSV parsing and serialization helpers.
 * - countLinesOfCode: Line counting routine applied to file contents.
 * - findRootRow: Locates the aggregate "Source" folder row for project totals.
 * Parameters: None
 * Returns: Promise<void>
 */
async function main() {
  console.log('============================================================');
  console.log('Lines Of Code Counter');
  console.log('============================================================\n');

  const csvText = await fs.readFile(csvPath, 'utf8');
  const table = parseCsv(csvText);

  if (table.length === 0) {
    throw new Error('CSV file is empty.');
  }

  const headers = table[0].map((value) => value.replace(/\r/g, '').trim());
  const typeIndex = headers.findIndex((header) => header.toUpperCase() === 'TYPE');
  if (typeIndex === -1) {
    throw new Error('Unable to locate "Type" column in CSV header.');
  }

  let locIndex = headers.findIndex(
    (header) => header.toUpperCase() === 'LINES OF CODE'
  );

  if (locIndex === -1) {
    console.log('Adding LINES OF CODE column.');
    const dataFlowIndex = headers.findIndex(
      (header) => header.trim().toUpperCase() === 'DATA FLOW / STATE MANAGEMENT'
    );
    locIndex = dataFlowIndex !== -1 ? dataFlowIndex + 1 : headers.length;
    headers.splice(locIndex, 0, 'LINES OF CODE');
    table[0] = headers;
    for (let rowIndex = 1; rowIndex < table.length; rowIndex += 1) {
      const row = table[rowIndex] ?? [];
      while (row.length < headers.length - 1) {
        row.push('');
      }
      row.splice(locIndex, 0, '');
      table[rowIndex] = row;
    }
  }

  let projectTotal = 0;
  const updatedEntries = [];

  console.log(`Scanning ${table.length - 1} rows for line counts...\n`);

  for (let rowIndex = 1; rowIndex < table.length; rowIndex += 1) {
    if (rowIndex % PROGRESS_EVERY_ROWS === 0) {
      console.log(`  ...processed ${rowIndex} of ${table.length - 1} rows`);
    }

    const row = table[rowIndex];
    if (!row || row.length === 0) {
      continue;
    }

    const typeValue = (row[typeIndex] ?? '').trim().toLowerCase();
    if (!typeValue || typeValue === 'folder') {
      continue;
    }

    if (!typeValue.endsWith('file')) {
      continue;
    }

    const pathSegments = [];
    for (let columnIndex = 0; columnIndex < typeIndex; columnIndex += 1) {
      const segment = (row[columnIndex] ?? '').trim();
      if (segment) {
        pathSegments.push(segment);
      }
    }

    if (pathSegments.length === 0) {
      continue;
    }

    const relativePath = pathSegments.reduce(
      (acc, segment) => (acc ? path.join(acc, segment) : segment),
      ''
    );
    const absolutePath = path.join(workspaceRoot, relativePath);

    const lowerSegments = pathSegments.map((segment) => segment.toLowerCase());
    const excludedSegment = lowerSegments.find((segment) =>
      SKIP_PATH_SEGMENTS.has(segment)
    );
    if (excludedSegment) {
      recordSkip(relativePath, `excluded folder "${excludedSegment}"`);
      continue;
    }

    let stats;
    try {
      stats = await fs.stat(absolutePath);
    } catch (error) {
      console.warn(`Skipping ${relativePath}: ${error.message}`);
      continue;
    }

    if (stats.size > MAX_FILE_SIZE_BYTES) {
      recordSkip(
        relativePath,
        `${stats.size} bytes exceeds ${MAX_FILE_SIZE_BYTES} byte limit`
      );
      continue;
    }

    let source;
    try {
      source = await fs.readFile(absolutePath, 'utf8');
    } catch (error) {
      console.warn(`Skipping ${relativePath}: ${error.message}`);
      continue;
    }

    const lineCount = countLinesOfCode(source);
    projectTotal += lineCount;

    const nextValue = String(lineCount);
    const currentValue = (row[locIndex] ?? '').replace(/\r/g, '').trim();
    if (nextValue === currentValue) {
      continue;
    }

    row[locIndex] = nextValue;
    updatedEntries.push({ path: relativePath, lines: lineCount });
  }

  const rootRowInfo = findRootRow(table, typeIndex);
  let rootRowChanged = false;
  if (rootRowInfo) {
    const { row } = rootRowInfo;
    const currentValue = (row[locIndex] ?? '').replace(/\r/g, '').trim();
    const totalValue = String(projectTotal);
    if (currentValue !== totalValue) {
      row[locIndex] = totalValue;
      rootRowChanged = true;
    }
  }

  if (updatedEntries.length === 0 && !rootRowChanged) {
    console.log('No LINES OF CODE updates were required.');
    console.log(`Project total (unchanged): ${projectTotal}`);
    emitSkipSummary();
    return;
  }

  const normalizedRows = table.map((row) => {
    const cells = [];
    for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
      cells.push(quoteForCsv(row[columnIndex] ?? ''));
    }
    return cells.join(',');
  });

  const updatedCsv = normalizedRows.join('\r\n') + '\r\n';
  await fs.writeFile(csvPath, updatedCsv, 'utf8');

  console.log(`Updated LINES OF CODE for ${updatedEntries.length} file(s).`);
  updatedEntries.forEach((entry) => {
    console.log(` - ${entry.path}: ${entry.lines}`);
  });
  if (rootRowChanged) {
    console.log(`Project total lines of code: ${projectTotal}`);
  }
  emitSkipSummary();
}

// ============================================================================
// SECTION 4: LINE COUNT HELPERS
// ============================================================================
/**
 * findRootRow
 *
 * Purpose: Locate the CSV row representing the top-level Source folder.
 * Behavior:
 * - Scans rows classified as folders and identifies the one with a single path segment.
 * Parameters:
 * - {string[][]} table: Parsed CSV data.
 * - {number} typeIndex: Index of the Type column.
 * Returns: {row: string[], index: number} | null
 */
function findRootRow(table, typeIndex) {
  for (let rowIndex = 1; rowIndex < table.length; rowIndex += 1) {
    const row = table[rowIndex];
    if (!row) {
      continue;
    }
    const typeValue = (row[typeIndex] ?? '').trim().toLowerCase();
    if (typeValue !== 'folder') {
      continue;
    }
    const pathSegments = [];
    for (let columnIndex = 0; columnIndex < typeIndex; columnIndex += 1) {
      const segment = (row[columnIndex] ?? '').trim();
      if (segment) {
        pathSegments.push(segment);
      }
    }
    if (pathSegments.length === 1) {
      return { row, index: rowIndex };
    }
  }
  return null;
}

/**
 * countLinesOfCode
 *
 * Purpose: Count non-empty lines in a source string.
 * Behavior:
 * - Splits on common newline delimiters and increments a counter for trimmed lines.
 * Parameters:
 * - {string} source: File contents.
 * Returns: number
 */
function countLinesOfCode(source) {
  const lines = source.split(/\r\n|\r|\n/);
  let count = 0;
  for (const line of lines) {
    if (line.trim() !== '') {
      count += 1;
    }
  }
  return count;
}

// ============================================================================
// SECTION 5: CSV UTILITIES
// ============================================================================
/**
 * quoteForCsv
 *
 * Purpose: Escape and quote values for CSV serialization.
 * Parameters:
 * - {unknown} value: Cell content.
 * Returns: string
 */
function quoteForCsv(value) {
  const stringValue = String(value ?? '');
  const escaped = stringValue.replace(/"/g, '""');
  return `"${escaped}"`;
}

function parseCsv(text) {
  const records = [];
  let currentField = '';
  let currentRow = [];
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (insideQuotes) {
      if (char === '"') {
        const nextChar = text[index + 1];
        if (nextChar === '"') {
          currentField += '"';
          index += 1;
        } else {
          insideQuotes = false;
        }
      } else {
        currentField += char;
      }
      continue;
    }

    if (char === '"') {
      insideQuotes = true;
      continue;
    }

    if (char === ',') {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if (char === '\r') {
      const nextChar = text[index + 1];
      if (nextChar === '\n') {
        index += 1;
      }
      currentRow.push(currentField);
      records.push(currentRow);
      currentRow = [];
      currentField = '';
      continue;
    }

    if (char === '\n') {
      currentRow.push(currentField);
      records.push(currentRow);
      currentRow = [];
      currentField = '';
      continue;
    }

    currentField += char;
  }

  if (currentRow.length > 0 || currentField !== '') {
    currentRow.push(currentField);
    records.push(currentRow);
  }

  return records;
}

/**
 * resolveCsvPath
 *
 * Purpose: Determine the absolute CSV location, respecting optional overrides.
 * Parameters:
 * - {string} overridePath: Provided override path or empty string.
 * Returns: string
 */
function resolveCsvPath(overridePath) {
  if (overridePath) {
    return path.isAbsolute(overridePath)
      ? overridePath
      : path.join(workspaceRoot, overridePath);
  }
  return path.join(workspaceRoot, 'Source/ProjectMap/SourceFolder.csv');
}

function recordSkip(relativePath, reason) {
  const count = skipLogCounts.get(reason) ?? 0;
  if (count < MAX_SKIP_LOGS_PER_REASON) {
    console.log(`Skipping ${relativePath}: ${reason}`);
    if (count === MAX_SKIP_LOGS_PER_REASON - 1) {
      console.log(`...further skips for "${reason}" will be suppressed.`);
    }
  }
  skipLogCounts.set(reason, count + 1);
}

function emitSkipSummary() {
  if (skipLogCounts.size === 0) {
    return;
  }
  console.log('\nSkip summary:');
  for (const [reason, count] of skipLogCounts.entries()) {
    console.log(` - ${reason}: ${count} file(s)`);
  }
}

/**
 * Workflow bootstrap with fatal error handling.
 *
 * Purpose: Execute the main routine and exit with code 1 on failure.
 */
main().catch((error) => {
  console.error('Lines of code extraction failed:', error.message);
  process.exit(1);
});
