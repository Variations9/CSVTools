// CSV PROJECT MAP - TEST COVERAGE EXTRACTION WORKFLOW

// ============================================================================
// SECTION 1: DEPENDENCIES AND CSV HELPERS
// ============================================================================
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  loadCsvTable,
  writeCsvTable,
  ensureColumn,
  resolveCsvPath,
} from './lib/table-helpers.mjs';

// ============================================================================
// SECTION 2: CONFIGURATION CONSTANTS
// ============================================================================
/**
 * Workspace paths and environment switches
 *
 * Purpose: Centralize configuration details used throughout the coverage update flow.
 * Components:
 * - workspaceRoot: Base directory anchoring relative path resolution.
 * - coverageDir: Directory containing coverage artifacts (overridable via env).
 * - coverageFile: LCOV file consumed by the parser.
 * - testWorkspace: Working directory for spawning npm coverage runs.
 * - SKIP_TEST_RUN: Flag to reuse existing coverage output.
 * - COVERAGE_ARGS: Optional extra arguments passed through to the coverage script.
 */
const workspaceRoot = process.cwd();
const coverageDir = resolveCoverageDir();
const coverageFile = path.join(coverageDir, 'lcov.info');
const testWorkspace = resolveTestWorkspace();
const SKIP_TEST_RUN = process.env.SKIP_TEST_COVERAGE === 'true';
const COVERAGE_ARGS = process.env.TEST_COVERAGE_ARGS
  ? process.env.TEST_COVERAGE_ARGS.split(/\s+/).filter(Boolean)
  : [];

// ============================================================================
// SECTION 3: WORKFLOW CONTROLLER
// ============================================================================
/**
 * main
 *
 * Purpose: Drive the end-to-end update of the "TEST COVERAGE" CSV column.
 * Behavior:
 * - Optionally runs the native test coverage script unless explicitly skipped.
 * - Parses LCOV results into a normalized path map.
 * - Loads the project CSV and ensures the coverage column exists.
 * - Applies coverage strings to rows representing files.
 * - Persists updated rows when changes are detected.
 * Delegation:
 * - runNativeCoverage for executing npm coverage.
 * - parseLcov for building the coverage metrics map.
 * - loadCsvTable/writeCsvTable for CSV I/O.
 * - buildRelativePath/normalizePath/formatCoverage helpers for row updates.
 * Parameters: None
 * Returns: Promise<void>
 * Key Features:
 * - Provides detailed progress logging with step counters.
 * - Supports incremental reruns by honoring SKIP_TEST_RUN.
 */
async function main() {
  console.log('============================================================');
  console.log('Test Coverage Extraction (Column V)');
  console.log('============================================================\n');

  if (!SKIP_TEST_RUN) {
    await runNativeCoverage();
  } else if (!(await fileExists(coverageFile))) {
    throw new Error(
      `Coverage file not found at ${coverageFile}. Re-run without SKIP_TEST_COVERAGE or generate coverage manually.`
    );
  }

  console.log('[2/5] Parsing coverage report...');
  const coverageMap = await parseLcov(coverageFile);
  console.log(`        Coverage entries discovered: ${coverageMap.size}\n`);

  console.log('[3/5] Loading CSV data...');
  const { headers, rows } = await loadCsvTable();
  const typeIndex = headers.findIndex((header) => header.trim().toUpperCase() === 'TYPE');
  if (typeIndex === -1) {
    throw new Error('Unable to locate "Type" column in CSV header.');
  }
  const coverageIndex = ensureColumn(headers, rows, 'TEST COVERAGE');

  console.log('[4/5] Applying coverage metrics to rows...');
  let updated = 0;
  let matched = 0;
  rows.forEach((row) => {
    const typeValue = (row[typeIndex] ?? '').trim().toLowerCase();
    if (!typeValue || typeValue === 'folder' || !typeValue.endsWith('file')) {
      return;
    }
    const relativePath = buildRelativePath(row, typeIndex);
    if (!relativePath) {
      return;
    }
    const normalizedPath = normalizePath(relativePath);
    const metrics = coverageMap.get(normalizedPath);
    if (!metrics) {
      return;
    }
    matched += 1;
    const nextValue = formatCoverage(metrics);
    if ((row[coverageIndex] ?? '').trim() === nextValue) {
      return;
    }
    row[coverageIndex] = nextValue;
    updated += 1;
  });

  console.log(`        Rows matched:  ${matched}`);
  console.log(`        Rows updated:  ${updated}`);

  if (updated === 0) {
    console.log('No updates were required; Column V already reflects current coverage.');
    return;
  }

  console.log('\n[5/5] Writing CSV...');
  await writeCsvTable(resolveCsvPath(), headers, rows);
  console.log('Test coverage update completed.');
}

// ============================================================================
// SECTION 4: COVERAGE EXECUTION
// ============================================================================
/**
 * runNativeCoverage
 *
 * Purpose: Execute the npm coverage script to regenerate LCOV artifacts.
 * Behavior:
 * - Removes stale coverage directory to avoid mixing results.
 * - Spawns `npm run test:coverage`, optionally passing through extra arguments.
 * - Resolves when the child process exits successfully, rejects on errors.
 * Delegation:
 * - Uses child_process.spawn for process management.
 * Parameters: None
 * Returns: Promise<void>
 * Key Features:
 * - Cross-platform npm command resolution (npm vs npm.cmd).
 * - Emits informative logging around command execution.
 */
async function runNativeCoverage() {
  console.log('[1/5] Running npm test:coverage (Mocha + c8)...');
  await fs.rm(coverageDir, { recursive: true, force: true });

  await new Promise((resolve, reject) => {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const npmArgs = ['run', 'test:coverage'];
    if (COVERAGE_ARGS.length > 0) {
      npmArgs.push('--', ...COVERAGE_ARGS);
    }

    const child = spawn(npmCommand, npmArgs, {
      cwd: testWorkspace,
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Coverage run exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(new Error(`Unable to launch test coverage: ${error.message}`));
    });
  });
  console.log('        Coverage artifacts generated.\n');
}

// ============================================================================
// SECTION 5: COVERAGE PARSING
// ============================================================================
/**
 * parseLcov
 *
 * Purpose: Convert LCOV coverage data into a map keyed by normalized file paths.
 * Behavior:
 * - Reads the LCOV file and iterates through records.
 * - Maintains counters for total lines and covered lines per source file.
 * - Stores percentage metrics for files residing under the workspace root.
 * Delegation:
 * - normalizePath for consistent path separators.
 * Parameters:
 * - {string} filePath: Absolute path to an LCOV file.
 * Returns: Promise<Map<string, {total:number, covered:number, pct:number}>>.
 * Key Features:
 * - Filters out entries outside the workspace to avoid node_modules noise.
 * - Produces percentages rounded to two decimal places for stable CSV output.
 */
async function parseLcov(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  const coverage = new Map();

  let currentFile = null;
  let total = 0;
  let covered = 0;

  const resolveCoveragePath = (inputPath) => {
    if (!inputPath) {
      return '';
    }
    const absolutePath = path.isAbsolute(inputPath)
      ? inputPath
      : path.join(testWorkspace, inputPath);
    return normalizePath(path.relative(workspaceRoot, absolutePath));
  };

  const flush = () => {
    if (!currentFile) {
      return;
    }
    const normalized = resolveCoveragePath(currentFile);
    if (!normalized.startsWith('..') && total > 0) {
      const pct = Number(((covered / total) * 100).toFixed(2));
      coverage.set(normalized, { total, covered, pct });
    }
    currentFile = null;
    total = 0;
    covered = 0;
  };

  lines.forEach((line) => {
    if (line.startsWith('SF:')) {
      flush();
      currentFile = line.slice(3).trim();
    } else if (line.startsWith('DA:')) {
      const [, hitValue] = line.slice(3).split(',');
      total += 1;
      if (Number(hitValue) > 0) {
        covered += 1;
      }
    } else if (line.startsWith('end_of_record')) {
      flush();
    }
  });
  flush();

  return coverage;
}

// ============================================================================
// SECTION 6: CSV ROW HELPERS
// ============================================================================
/**
 * buildRelativePath
 *
 * Purpose: Reconstruct the CSV path hierarchy up to the type column.
 * Behavior:
 * - Collects populated columns leading to the type index.
 * - Joins segments with `/` to produce a relative path for lookup.
 * Parameters:
 * - {string[]} row: CSV row array.
 * - {number} typeIndex: Index of the Type column within the row.
 * Returns: string
 * Key Features:
 * - Ignores empty columns to prevent stray separators.
 */
function buildRelativePath(row, typeIndex) {
  const segments = [];
  for (let index = 0; index < typeIndex; index += 1) {
    const value = (row[index] ?? '').trim();
    if (value) {
      segments.push(value);
    }
  }
  if (segments.length === 0) {
    return '';
  }
  return segments.join('/');
}

/**
 * normalizePath
 *
 * Purpose: Standardize path separators for consistent map lookups.
 * Parameters:
 * - {string} input: Path string using platform-specific separators.
 * Returns: string
 */
function normalizePath(input) {
  return input.split(path.sep).join('/');
}

/**
 * formatCoverage
 *
 * Purpose: Produce a human-readable coverage summary string.
 * Behavior:
 * - Formats percentage with two decimals.
 * - Includes covered/total counts and a qualitative rating.
 * Parameters:
 * - {Object} metrics: Coverage object with pct, covered, and total numbers.
 * Returns: string
 */
function formatCoverage(metrics) {
  const rating = classifyCoverage(metrics.pct);
  return `${metrics.pct.toFixed(2)}% (${metrics.covered}/${metrics.total} lines, ${rating})`;
}

/**
 * classifyCoverage
 *
 * Purpose: Convert a numeric percentage into a qualitative rating label.
 * Parameters:
 * - {number} pct: Coverage percentage.
 * Returns: 'Excellent' | 'Good' | 'Fair' | 'Needs Attention'
 */
function classifyCoverage(pct) {
  if (pct >= 90) {
    return 'Excellent';
  }
  if (pct >= 75) {
    return 'Good';
  }
  if (pct >= 60) {
    return 'Fair';
  }
  return 'Needs Attention';
}

// ============================================================================
// SECTION 7: FILE SYSTEM UTILITIES
// ============================================================================
/**
 * fileExists
 *
 * Purpose: Determine whether a file can be accessed on disk.
 * Behavior:
 * - Attempts fs.access and resolves to a boolean without throwing.
 * Parameters:
 * - {string} filePath: Absolute or relative file system path.
 * Returns: Promise<boolean>
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * resolveCoverageDir
 *
 * Purpose: Determine the directory containing coverage outputs.
 * Behavior:
 * - Uses TEST_COVERAGE_DIR when provided.
 * - Falls back to Source/coverage relative to the workspace.
 * Parameters: None
 * Returns: string
 */
function resolveCoverageDir() {
  const override = process.env.TEST_COVERAGE_DIR;
  if (override) {
    return path.isAbsolute(override)
      ? override
      : path.join(workspaceRoot, override);
  }
  return path.join(workspaceRoot, 'Source/coverage');
}

/**
 * resolveTestWorkspace
 *
 * Purpose: Identify the working directory for coverage commands.
 * Behavior:
 * - Honors TEST_COVERAGE_CWD when supplied.
 * - Defaults to the Source directory.
 * Parameters: None
 * Returns: string
 */
function resolveTestWorkspace() {
  const override = process.env.TEST_COVERAGE_CWD;
  if (override) {
    return path.isAbsolute(override)
      ? override
      : path.join(workspaceRoot, override);
  }
  return path.join(workspaceRoot, 'Source');
}

/**
 * Workflow bootstrap with fatal error handling.
 *
 * Purpose: Execute the main routine and exit non-zero on failure.
 */
main().catch((error) => {
  console.error('Test coverage update failed:', error.message);
  process.exit(1);
});
