// CSV PROJECT MAP - EXECUTION CONTEXT EXTRACTION SCRIPT

// ============================================================================
// SECTION 1: DEPENDENCIES
// ============================================================================
import fs from 'node:fs/promises';
import path from 'node:path';
import prettier from 'prettier';
import parserBabel from 'prettier/plugins/babel';
import {
  loadCsvTable,
  writeCsvTable,
  ensureColumn,
  resolveCsvPath,
} from './lib/table-helpers.mjs';

// ============================================================================
// SECTION 2: CONFIGURATION
// ============================================================================
/**
 * Workspace resolution and analysis allowlists.
 *
 * - workspaceRoot: Base directory used to resolve CSV-relative file paths.
 * - csvOverride: Optional env override pointing at an alternate project map.
 * - SUPPORTED_EXTENSIONS: File types eligible for execution-context analysis.
 * - CALLBACK_APIS: Known timer APIs that indicate callback-based async usage.
 */
const workspaceRoot = process.cwd();
const csvOverride = process.env.CSV_PROJECT_MAP_PATH ?? '';
const SUPPORTED_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);
const CALLBACK_APIS = new Set(['setTimeout', 'setInterval', 'requestAnimationFrame']);

// ============================================================================
// SECTION 3: WORKFLOW ORCHESTRATION
// ============================================================================
/**
 * main
 *
 * Purpose: Refresh the EXECUTION CONTEXT column for supported source files.
 * Behavior:
 * - Loads the CSV, ensures the EXECUTION CONTEXT column exists, and iterates file rows.
 * - Reads each file, analyzes async constructs, and records a classification string.
 * - Persists changes back to disk and prints summary statistics.
 * Delegation:
 * - loadCsvTable/ensureColumn/resolveCsvPath/writeCsvTable manage CSV IO.
 * - analyzeExecutionContext produces async/blocking metrics for each source file.
 * - formatExecutionContext turns collected metrics into a human-readable label.
 * Parameters: None
 * Returns: Promise<void>
 */
async function main() {
  console.log('============================================================');
  console.log('Execution Context Extraction (Column W)');
  console.log('============================================================\n');

  const { headers, rows } = await loadCsvTable(csvOverride || undefined);
  const csvPath = resolveCsvPath(csvOverride);

  const typeIndex = headers.findIndex(
    (header) => header.trim().toUpperCase() === 'TYPE'
  );
  if (typeIndex === -1) {
    throw new Error('Unable to locate "Type" column in CSV header.');
  }

  const execIndex = ensureColumn(headers, rows, 'EXECUTION CONTEXT');

  let processed = 0;
  let updated = 0;
  const summary = {
    blocking: 0,
    mixed: 0,
    async: 0,
    callbacks: 0,
    sync: 0,
    errors: 0,
  };

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const typeValue = (row[typeIndex] ?? '').trim().toLowerCase();
    const currentValue = (row[execIndex] ?? '').trim();

    if (!isSupportedType(typeValue)) {
      if (currentValue !== 'N/A') {
        row[execIndex] = 'N/A';
        updated += 1;
      }
      continue;
    }

    const relativePath = buildRelativePath(row, typeIndex);
    if (!relativePath) {
      continue;
    }

    const absolutePath = path.join(workspaceRoot, relativePath);
    let source;
    try {
      source = await fs.readFile(absolutePath, 'utf8');
    } catch (error) {
      console.warn(`Skipping ${relativePath}: ${error.message}`);
      if (currentValue !== 'MISSING') {
        row[execIndex] = 'MISSING';
        updated += 1;
      }
      summary.errors += 1;
      continue;
    }

    const stats = await analyzeExecutionContext(source, absolutePath);
    if (!stats) {
      if (currentValue !== 'ERROR') {
        row[execIndex] = 'ERROR';
        updated += 1;
      }
      summary.errors += 1;
      continue;
    }

    const classification = formatExecutionContext(stats);
    processed += 1;
    summary[classification.kind] += 1;

    if (currentValue === classification.value) {
      continue;
    }
    row[execIndex] = classification.value;
    updated += 1;
  }

  if (updated === 0) {
    console.log('No updates were required; Column W already reflects current execution context.');
  } else {
    await writeCsvTable(csvPath, headers, rows);
    console.log(`Updated EXECUTION CONTEXT for ${updated} file(s).`);
  }

  console.log(`Files analyzed: ${processed}`);
  console.log(
    `  Blocking: ${summary.blocking} | Mixed: ${summary.mixed} | Async: ${summary.async} | Callbacks: ${summary.callbacks} | Sync: ${summary.sync}`
  );
  if (summary.errors > 0) {
    console.log(`  Entries skipped due to read/parse errors: ${summary.errors}`);
  }
}

// ============================================================================
// SECTION 4: ROW FILTERING UTILITIES
// ============================================================================
/**
 * isSupportedType
 *
 * Purpose: Filter CSV rows to only those representing analyzable source files.
 * Behavior:
 * - Rejects values that do not end with `file`.
 * - Extracts the extension token and checks it against the allowlist.
 * Parameters:
 * - {string} typeValue: Normalized TYPE column value (lowercase).
 * Returns: boolean
 */
function isSupportedType(typeValue) {
  if (!typeValue.endsWith('file')) {
    return false;
  }
  const ext = typeValue.split(' ')[0];
  return SUPPORTED_EXTENSIONS.has(ext);
}

/**
 * buildRelativePath
 *
 * Purpose: Reconstruct the file path described by the CSV row.
 * Behavior:
 * - Gathers non-empty segments preceding the TYPE column and joins them with `path.join`.
 * Parameters:
 * - {string[]} row: CSV row array.
 * - {number} typeIndex: Index of the TYPE column.
 * Returns: string
 */
function buildRelativePath(row, typeIndex) {
  const segments = [];
  for (let i = 0; i < typeIndex; i += 1) {
    const value = (row[i] ?? '').trim();
    if (value) {
      segments.push(value);
    }
  }
  if (segments.length === 0) {
    return '';
  }
  return segments.reduce((acc, segment) => (acc ? path.join(acc, segment) : segment), '');
}

// ============================================================================
// SECTION 5: EXECUTION CONTEXT ANALYSIS
// ============================================================================
/**
 * analyzeExecutionContext
 *
 * Purpose: Parse a source file and compute async/blocking statistics.
 * Behavior:
 * - Parses the file with Prettier's Babel parser.
 * - Walks the AST to tally sync vs async constructs at the top level and within functions.
 * Parameters:
 * - {string} source: Raw source code.
 * - {string} filePath: Used to give the parser filename context.
 * Returns: Promise<object|null> - Stats object or null when parsing fails.
 */
async function analyzeExecutionContext(source, filePath) {
  let ast;
  try {
    const parseResult = await prettier.__debug.parse(source, {
      filepath: filePath,
      parser: 'babel',
      plugins: [parserBabel],
    });
    ast = parseResult.ast;
  } catch (error) {
    console.warn(
      `Unable to parse ${path.relative(workspaceRoot, filePath)}: ${error.message}`
    );
    return null;
  }

  const stats = {
    asyncFunctions: 0,
    syncFunctions: 0,
    hasAwait: false,
    hasPromises: false,
    hasCallbacks: false,
    hasAsyncIterators: false,
    blockingReasons: new Set(),
  };

  traverseAst(ast, (node) => {
    if (isFunctionNode(node)) {
      if (node.async) {
        stats.asyncFunctions += 1;
      } else {
        stats.syncFunctions += 1;
      }
      return;
    }

    if (node.type === 'AwaitExpression') {
      stats.hasAwait = true;
      return;
    }

    if (node.type === 'ForOfStatement' && node.await) {
      stats.hasAsyncIterators = true;
      return;
    }

    if (node.type === 'NewExpression' && isIdentifierNamed(node.callee, 'Promise')) {
      stats.hasPromises = true;
      return;
    }

    if (node.type === 'CallExpression') {
      inspectCallExpression(node, stats);
    }
  });

  const totalFunctions = stats.asyncFunctions + stats.syncFunctions;
  stats.asyncRatio =
    totalFunctions === 0
      ? stats.hasAwait
        ? 100
        : 0
      : Math.min(100, Math.round((stats.asyncFunctions / totalFunctions) * 100));

  return stats;
}

/**
 * inspectCallExpression
 *
 * Purpose: Update execution statistics based on notable call sites.
 * Behavior:
 * - Flags known blocking APIs (executeAsModal, fs sync calls, execSync/spawnSync).
 * - Detects promise usage, callbacks, and event listeners.
 * Parameters:
 * - {import('@babel/types').CallExpression} node: AST call expression node.
 * - {object} stats: Mutable stats accumulator from analyzeExecutionContext.
 * Returns: void
 */
function inspectCallExpression(node, stats) {
  const callName = getCallName(node.callee);

  if (
    callName === 'core.executeAsModal' ||
    callName === 'executeAsModal' ||
    callName.endsWith('.executeAsModal')
  ) {
    stats.blockingReasons.add('executeAsModal');
  }

  if (/\b(read|write)FileSync$/.test(callName)) {
    stats.blockingReasons.add('fs-sync');
  }

  if (/execSync$/.test(callName)) {
    stats.blockingReasons.add('execSync');
  }

  if (/spawnSync$/.test(callName)) {
    stats.blockingReasons.add('spawnSync');
  }

  if (
    isMemberExpressionNamed(node.callee, 'then') ||
    isMemberExpressionNamed(node.callee, 'catch') ||
    isMemberExpressionNamed(node.callee, 'finally') ||
    (node.callee.type === 'Identifier' && node.callee.name === 'Promise')
  ) {
    stats.hasPromises = true;
  }

  const bareName = callName.split('.').pop();

  if (
    CALLBACK_APIS.has(callName) ||
    (bareName && CALLBACK_APIS.has(bareName)) ||
    isMemberExpressionNamed(node.callee, 'addEventListener') ||
    hasInlineCallback(node.arguments)
  ) {
    stats.hasCallbacks = true;
  }
}

/**
 * hasInlineCallback
 *
 * Purpose: Check whether a call expression contains inline function arguments.
 * Parameters:
 * - {Array} args: Call expression arguments array.
 * Returns: boolean
 */
function hasInlineCallback(args) {
  return args.some(
    (arg) =>
      arg &&
      (arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression')
  );
}

/**
 * isFunctionNode
 *
 * Purpose: Determine if an AST node represents a function-like structure.
 * Parameters:
 * - {object} node: AST node.
 * Returns: boolean
 */
function isFunctionNode(node) {
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'ObjectMethod' ||
    node.type === 'ClassMethod' ||
    node.type === 'ClassPrivateMethod'
  );
}

/**
 * isIdentifierNamed
 *
 * Purpose: Compare an identifier node's name to a target string.
 * Parameters:
 * - {object} node: AST node.
 * - {string} name: Expected identifier name.
 * Returns: boolean
 */
function isIdentifierNamed(node, name) {
  return node && node.type === 'Identifier' && node.name === name;
}

/**
 * isMemberExpressionNamed
 *
 * Purpose: Check whether a member expression accesses a specific property.
 * Parameters:
 * - {object} node: AST member expression.
 * - {string} propertyName: Property name to test.
 * Returns: boolean
 */
function isMemberExpressionNamed(node, propertyName) {
  return (
    node &&
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property.type === 'Identifier' &&
    node.property.name === propertyName
  );
}

/**
 * getCallName
 *
 * Purpose: Produce a dot-delimited name for a call expression callee.
 * Parameters:
 * - {object} callee: Callee expression node.
 * Returns: string
 */
function getCallName(callee) {
  if (!callee) {
    return '';
  }
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  if (callee.type === 'MemberExpression' && !callee.computed) {
    const objectName = getCallName(callee.object);
    const propertyName = getCallName(callee.property);
    if (objectName && propertyName) {
      return `${objectName}.${propertyName}`;
    }
  }
  return '';
}

// ============================================================================
// SECTION 6: CLASSIFICATION AND TRAVERSAL
// ============================================================================
/**
 * formatExecutionContext
 *
 * Purpose: Convert execution stats into a human-readable CSV value.
 * Behavior:
 * - Prioritizes blocking classifications when blocking reasons are present.
 * - Distinguishes between pure callbacks, async modes, and mixed usage.
 * Parameters:
 * - {object} stats: Metrics produced by analyzeExecutionContext.
 * Returns: {value: string, kind: string}
 */
function formatExecutionContext(stats) {
  const detailParts = [];
  if (stats.hasAwait || stats.asyncFunctions > 0) {
    detailParts.push('async+await');
  }
  if (stats.hasPromises) {
    detailParts.push('promises');
  }
  if (stats.hasCallbacks) {
    detailParts.push('callbacks');
  }
  if (stats.hasAsyncIterators) {
    detailParts.push('async-iterators');
  }

  if (stats.blockingReasons.size > 0) {
    const details = [...stats.blockingReasons];
    if (detailParts.length > 0) {
      details.push(detailParts.join('+'));
    }
    return {
      value: `BLOCKING (${details.join('; ')})`,
      kind: 'blocking',
    };
  }

  if (detailParts.length === 0) {
    return { value: 'sync', kind: 'sync' };
  }

  if (detailParts.length === 1) {
    const detail = detailParts[0];
    if (
      detail === 'callbacks' &&
      !stats.hasAwait &&
      stats.asyncFunctions === 0 &&
      !stats.hasPromises
    ) {
      return { value: 'callbacks', kind: 'callbacks' };
    }
    return { value: `async (${detail})`, kind: 'async' };
  }

  const ratioText = stats.asyncRatio > 0 ? ` [${stats.asyncRatio}% async]` : '';
  return {
    value: `mixed (${detailParts.join('+')})${ratioText}`,
    kind: 'mixed',
  };
}

/**
 * traverseAst
 *
 * Purpose: Perform a depth-first traversal of a Babel AST.
 * Parameters:
 * - {object} node: Root AST node.
 * - {Function} visitor: Callback invoked for each node.
 * Returns: void
 */
function traverseAst(node, visitor) {
  if (!node || typeof node.type !== 'string') {
    return;
  }
  visitor(node);
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (Array.isArray(value)) {
      value.forEach((child) => traverseAst(child, visitor));
    } else if (value && typeof value.type === 'string') {
      traverseAst(value, visitor);
    }
  }
}

main().catch((error) => {
  console.error('Execution context update failed:', error.message);
  process.exit(1);
});
