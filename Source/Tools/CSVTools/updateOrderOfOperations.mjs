// CSV PROJECT MAP - ORDER OF OPERATIONS EXTRACTION SCRIPT

// ============================================================================
// SECTION 1: DEPENDENCIES
// ============================================================================
import fs from 'node:fs/promises';
import path from 'node:path';
import prettier from 'prettier';
import parserBabel from 'prettier/plugins/babel';
import { extractCSharpCallOrder } from './lib/csharp-analysis.mjs';
import { extractPythonCallOrder } from './lib/python-analysis.mjs';

// ============================================================================
// SECTION 2: CONFIGURATION
// ============================================================================
/**
 * Workspace context and CSV target resolution
 *
 * Purpose: Establish shared paths used throughout the order extraction workflow.
 * Components:
 * - workspaceRoot: Root directory derived from the executing process.
 * - csvOverride: Optional environment override for the CSV location.
 * - csvPath: Absolute path produced by resolveCsvPath.
 */
const workspaceRoot = process.cwd();
const csvOverride = process.env.CSV_PROJECT_MAP_PATH ?? '';
const csvPath = resolveCsvPath(csvOverride);

// ============================================================================
// SECTION 3: WORKFLOW ORCHESTRATION
// ============================================================================
/**
 * main
 *
 * Purpose: Drive the CSV order-of-operations synchronization routine.
 * Behavior:
 * - Loads the project map, ensuring the ORDER_OF_OPERATIONS column exists.
 * - Iterates eligible file rows, summarizing invocation chains per language.
 * - Writes updates when differences are detected, emitting console diagnostics.
 * Delegation:
 * - parseCsv/quoteForCsv: CSV parsing and writing helpers.
 * - extractOrderOfOperations/extractCSharpCallOrder/extractPythonCallOrder: Language analyzers.
 * Parameters: None
 * Returns: Promise<void>
 * Key Features:
 * - Auto-inserts the column adjacent to FUNCTIONS when missing.
 * - Skips unsupported types and gracefully handles unreadable files.
 */
async function main() {
  console.log('============================================================');
  console.log('Order Of Operations Extraction');
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

  let orderIndex = headers.findIndex(
    (header) => header.toUpperCase() === 'ORDER_OF_OPERATIONS'
  );

  if (orderIndex === -1) {
    console.log('Adding ORDER_OF_OPERATIONS column.');
    const functionsIndex = headers.findIndex(
      (header) => header.trim().toUpperCase() === 'FUNCTIONS'
    );
    orderIndex = functionsIndex !== -1 ? functionsIndex + 1 : headers.length;
    headers.splice(orderIndex, 0, 'ORDER_OF_OPERATIONS');
    table[0] = headers;
    for (let rowIndex = 1; rowIndex < table.length; rowIndex += 1) {
      const row = table[rowIndex] ?? [];
      while (row.length < headers.length - 1) {
        row.push('');
      }
      row.splice(orderIndex, 0, '');
      table[rowIndex] = row;
    }
  }

  const updatedEntries = [];

  console.log(`Scanning ${table.length - 1} rows for JavaScript files...\n`);

  for (let rowIndex = 1; rowIndex < table.length; rowIndex += 1) {
    const row = table[rowIndex];
    if (!row || row.length === 0) {
      continue;
    }

    const typeValue = (row[typeIndex] ?? '').trim().toLowerCase();
    if (!isSupportedScriptType(typeValue)) {
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

    const relativePath = pathSegments.reduce((acc, segment) =>
      acc ? path.join(acc, segment) : segment
    , '');
    const absolutePath = path.join(workspaceRoot, relativePath);
    const ext = path.extname(relativePath).toLowerCase();

    let source;
    try {
      source = await fs.readFile(absolutePath, 'utf8');
    } catch (error) {
      console.warn(`Skipping ${relativePath}: ${error.message}`);
      continue;
    }

    const currentValue = (row[orderIndex] ?? '').replace(/\r/g, '').trim();

    if (ext === '.css' || ext === '.json' || ext === '.html') {
      if (currentValue) {
        row[orderIndex] = '';
        updatedEntries.push({ path: relativePath, order: [] });
      }
      continue;
    }

    let operations = [];
    if (ext === '.cs') {
      operations = extractCSharpCallOrder(source);
    } else if (ext === '.py') {
      try {
        operations = await extractPythonCallOrder(source, absolutePath);
      } catch (error) {
        console.warn(`Unable to analyze Python file ${relativePath}: ${error.message}`);
        operations = [];
      }
    } else {
      const sanitizedSource = sanitizeForParsing(source);
      operations = await extractOrderOfOperations(sanitizedSource, absolutePath);
    }
    const nextValue = operations.length > 0 ? operations.join(' -> ') : '';

    if (nextValue === currentValue) {
      continue;
    }

    row[orderIndex] = nextValue;
    updatedEntries.push({ path: relativePath, order: operations });
  }

  if (updatedEntries.length === 0) {
    console.log('No ORDER_OF_OPERATIONS updates were required.');
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

  console.log(`Updated ORDER_OF_OPERATIONS column for ${updatedEntries.length} file(s).`);
  updatedEntries.forEach((entry) => {
    const limit = 25;
    const preview =
      entry.order.length > limit
        ? `${entry.order.slice(0, limit).join(' -> ')} -> ... (+${
            entry.order.length - limit
          } more)`
        : entry.order.join(' -> ');
    console.log(` - ${entry.path}: ${preview}`);
  });
}

// ============================================================================
// SECTION 4: LANGUAGE-SPECIFIC ORDER EXTRACTION
// ============================================================================
/**
 * extractOrderOfOperations
 *
 * Purpose: Derive a sequential call list for JavaScript/TypeScript-family sources.
 * Behavior:
 * - Parses the file with Prettier's Babel parser.
 * - Traverses the AST to collect call and constructor expressions in encounter order.
 * Delegation:
 * - traverseAst: Depth-first iteration helper.
 * - stringifyCallee: Converts callee nodes to readable identifiers.
 * Parameters:
 * - {string} code: Sanitized source code.
 * - {string} filePath: Absolute path for parser diagnostics.
 * Returns: Promise<string[]>
 * Key Features:
 * - Emits warnings yet returns [] when parsing fails, keeping workflow resilient.
 */
async function extractOrderOfOperations(code, filePath) {
  let ast;
  try {
    const parseResult = await prettier.__debug.parse(code, {
      filepath: filePath,
      parser: 'babel',
      plugins: [parserBabel],
    });
    ast = parseResult.ast;
  } catch (error) {
    console.warn(`Unable to parse ${filePath}: ${error.message}`);
    return [];
  }

  const operations = [];

  traverseAst(ast, (node) => {
    if (node.type === 'CallExpression') {
      const name = stringifyCallee(node.callee);
      if (name) {
        operations.push(name);
      }
      return;
    }

    if (node.type === 'NewExpression') {
      const name = stringifyCallee(node.callee);
      if (name) {
        operations.push(`new ${name}`);
      }
    }
  });

  return operations;
}

/**
 * stringifyCallee
 *
 * Purpose: Produce a dot-delimited representation of the callee expression.
 * Behavior:
 * - Handles identifiers, nested member expressions, optional chaining, and anonymous functions.
 * Parameters:
 * - {import('@babel/types').Expression} node: Callee node.
 * Returns: string|null
 */
function stringifyCallee(node) {
  if (!node) {
    return null;
  }

  switch (node.type) {
    case 'Identifier':
      return node.name;
    case 'MemberExpression': {
      const objectName = stringifyCallee(node.object);
      const propertyName = stringifyProperty(node.property, node.computed);
      if (objectName && propertyName) {
        return `${objectName}.${propertyName}`;
      }
      return objectName || propertyName;
    }
    case 'OptionalMemberExpression': {
      const objectName = stringifyCallee(node.object);
      const propertyName = stringifyProperty(node.property, node.computed);
      if (objectName && propertyName) {
        return `${objectName}.${propertyName}`;
      }
      return objectName || propertyName;
    }
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      return '(anonymous)';
    default:
      return null;
  }
}

/**
 * stringifyProperty
 *
 * Purpose: Resolve member expression property names into string values when determinable.
 * Parameters:
 * - {import('@babel/types').Node} node: Property node to evaluate.
 * - {boolean} computed: Indicates bracket notation access.
 * Returns: string|null
 */
function stringifyProperty(node, computed) {
  if (!node) {
    return null;
  }

  if (!computed && node.type === 'Identifier') {
    return node.name;
  }

  if (
    node.type === 'StringLiteral' ||
    node.type === 'NumericLiteral' ||
    node.type === 'Literal'
  ) {
    return String(node.value);
  }

  return null;
}

// ============================================================================
// SECTION 5: AST UTILITIES
// ============================================================================
/**
 * traverseAst
 *
 * Purpose: Depth-first traversal helper for Babel AST nodes.
 * Behavior:
 * - Invokes visitor for each node with parent reference.
 * - Skips metadata keys and handles both arrays and singular child properties.
 * Parameters:
 * - {object} node: Current AST node.
 * - {(node: object, parent: object|null) => void} visitor: Callback executed per node.
 * - {object|null} parent: Parent node reference.
 * Returns: void
 */
function traverseAst(node, visitor, parent = null) {
  if (!node || typeof node !== 'object') {
    return;
  }

  visitor(node, parent);

  for (const key of Object.keys(node)) {
    if (
      key === 'loc' ||
      key === 'start' ||
      key === 'end' ||
      key === 'leadingComments' ||
      key === 'trailingComments'
    ) {
      continue;
    }

    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && typeof child.type === 'string') {
          traverseAst(child, visitor, node);
        }
      }
      continue;
    }

    if (value && typeof value === 'object' && typeof value.type === 'string') {
      traverseAst(value, visitor, node);
    }
  }
}

// ============================================================================
// SECTION 6: CSV HELPERS
// ============================================================================
/**
 * quoteForCsv
 *
 * Purpose: Escape and wrap values for CSV serialization.
 * Parameters:
 * - {unknown} value: Cell value.
 * Returns: string
 */
function quoteForCsv(value) {
  const stringValue = String(value ?? '');
  const escaped = stringValue.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * parseCsv
 *
 * Purpose: Convert CSV text into a 2D array while handling quotes and CRLF endings.
 * Parameters:
 * - {string} text: Raw CSV content.
 * Returns: string[][]
 */
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

// ============================================================================
// SECTION 7: SUPPORTING UTILITIES
// ============================================================================
/**
 * resolveCsvPath
 *
 * Purpose: Resolve the absolute CSV path, honoring optional overrides.
 * Behavior:
 * - Accepts absolute overrides directly.
 * - Joins relative overrides to workspaceRoot.
 * Parameters:
 * - {string} overridePath: Override path provided via CLI or environment.
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

/**
 * isSupportedScriptType
 *
 * Purpose: Filter CSV rows to extensions supported by the order extraction workflow.
 * Parameters:
 * - {string} typeValue: Lower-case file type descriptor.
 * Returns: boolean
 */
function isSupportedScriptType(typeValue) {
  if (!typeValue.endsWith(' file')) {
    return false;
  }
  const supported = ['.js', '.jsx', '.mjs', '.cjs', '.css', '.json', '.html', '.cs', '.py'];
  return supported.some((ext) => typeValue.endsWith(`${ext} file`));
}

/**
 * sanitizeForParsing
 *
 * Purpose: Strip directives that cause Babel parse failures prior to analysis.
 * Parameters:
 * - {string} source: Original source text.
 * Returns: string
 */
function sanitizeForParsing(source) {
  return source.replace(/^\s*#(target|include|includepath).*$/gim, '');
}

/**
 * Workflow bootstrap with fatal error handling.
 *
 * Purpose: Execute the main routine and exit non-zero when an exception occurs.
 */
main().catch((error) => {
  console.error('Order of Operations extraction failed:', error.message);
  process.exit(1);
});

