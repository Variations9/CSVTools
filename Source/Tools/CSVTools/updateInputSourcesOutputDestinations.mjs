// CSV PROJECT MAP - INPUT SOURCES AND OUTPUT DESTINATIONS EXTRACTION

// ============================================================================
// SECTION 1: DEPENDENCIES
// ============================================================================
import fs from 'node:fs/promises';
import path from 'node:path';
import prettier from 'prettier';
import parserBabel from 'prettier/plugins/babel';
import { analyzeCSharpIO } from './lib/csharp-analysis.mjs';
import { analyzePythonIO } from './lib/python-analysis.mjs';

// ============================================================================
// SECTION 2: CONFIGURATION
// ============================================================================
/**
 * Workspace context and CSV resolution
 *
 * Purpose: Provide shared paths and overrides for the IO extraction workflow.
 * Components:
 * - workspaceRoot: Root directory derived from the current working directory.
 * - csvOverride: Optional CSV path override supplied through environment variable.
 * - csvPath: Absolute CSV location resolved via resolveCsvPath().
 */
const workspaceRoot = process.cwd();
const csvOverride = process.env.CSV_PROJECT_MAP_PATH ?? '';
const csvPath = resolveCsvPath(csvOverride);

// ============================================================================
// SECTION 3: ANALYSIS CONSTANTS
// ============================================================================
/**
 * Extension allowlist controlling which files enter the IO analysis pipeline.
 */
const SUPPORTED_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.json',
  '.html',
  '.cs',
  '.py',
]);

/**
 * Adobe-specific identifiers and properties used to categorise IO interactions when
 * running inside Creative Cloud environments.
 */
const ADOBE_IDENTIFIERS = new Set(['app', 'photoshop', 'core']);
const ADOBE_INPUT_PROPERTIES = new Set([
  'activeDocument',
  'documents',
  'layers',
  'selection',
  'foregroundColor',
  'backgroundColor',
  'preferences',
]);

/**
 * DOM read/write method registries that classify side-effectful IO patterns.
 */
const DOM_READ_METHODS = new Set([
  'querySelector',
  'querySelectorAll',
  'getElementById',
  'getElementsByClassName',
  'getElementsByTagName',
  'closest',
  'value',
]);

const DOM_WRITE_METHODS = new Set([
  'createElement',
  'createTextNode',
  'createDocumentFragment',
  'appendChild',
  'append',
  'prepend',
  'insertBefore',
  'replaceChild',
  'replaceChildren',
  'removeChild',
  'innerHTML',
  'innerText',
  'textContent',
  'classList.add',
  'classList.remove',
  'classList.toggle',
]);

// ============================================================================
// SECTION 4: WORKFLOW ORCHESTRATION
// ============================================================================
/**
 * main
 *
 * Purpose: Synchronize the "Input Sources / Output Destinations" column in the project map.
 * Behavior:
 * - Loads the CSV and adds the IO column when missing.
 * - Iterates supported files, invoking language-aware analyzers to build IO summaries.
 * - Writes updated CSV data when summaries change.
 * Delegation:
 * - parseCsv/quoteForCsv for CSV parsing and serialization.
 * - analyzeScriptIO/analyzeCssIO/analyzeJsonIO/analyzeHtmlIO and language helpers for analysis.
 * Parameters: None
 * Returns: Promise<void>
 */
async function main() {
  console.log('============================================================');
  console.log('Input Sources & Output Destinations Extraction');
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

  let ioIndex = headers.findIndex(
    (header) => header.toUpperCase() === 'INPUT SOURCES / OUTPUT DESTINATIONS'
  );

  if (ioIndex === -1) {
    console.log('Adding INPUT SOURCES / OUTPUT DESTINATIONS column.');
    const locIndex = headers.findIndex(
      (header) => header.trim().toUpperCase() === 'LINES OF CODE'
    );
    ioIndex = locIndex !== -1 ? locIndex + 1 : headers.length;
    headers.splice(ioIndex, 0, 'Input Sources / Output Destinations');
    table[0] = headers;
    for (let rowIndex = 1; rowIndex < table.length; rowIndex += 1) {
      const row = table[rowIndex] ?? [];
      while (row.length < headers.length - 1) {
        row.push('');
      }
      row.splice(ioIndex, 0, '');
      table[rowIndex] = row;
    }
  }

  let updates = 0;
  console.log(`Scanning ${table.length - 1} rows for input/output mappings...\n`);

  for (let rowIndex = 1; rowIndex < table.length; rowIndex += 1) {
    const row = table[rowIndex];
    if (!row) {
      continue;
    }

    const typeValue = (row[typeIndex] ?? '').trim().toLowerCase();
    if (!typeValue || typeValue === 'folder') {
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
    const ext = path.extname(relativePath).toLowerCase();

    let source;
    try {
      source = await fs.readFile(absolutePath, 'utf8');
    } catch (error) {
      console.warn(`Skipping ${relativePath}: ${error.message}`);
      continue;
    }

    let summary = '';
    if (ext === '.css') {
      summary = analyzeCssIO(source);
    } else if (ext === '.json') {
      summary = analyzeJsonIO(source);
    } else if (ext === '.html') {
      summary = analyzeHtmlIO(source);
    } else if (ext === '.cs') {
      const context = analyzeCSharpIO(source);
      summary = buildSummary(context);
    } else if (ext === '.py') {
      try {
        summary = await analyzePythonIO(source, absolutePath);
      } catch (error) {
        console.warn(`Unable to analyze Python IO for ${relativePath}: ${error.message}`);
        summary = '';
      }
    } else if (SUPPORTED_EXTENSIONS.has(ext)) {
      summary = await analyzeScriptIO(source, absolutePath);
    }

    const currentValue = (row[ioIndex] ?? '').replace(/\r/g, '').trim();
    if (summary === currentValue) {
      continue;
    }

    row[ioIndex] = summary;
    updates += 1;
  }

  if (updates === 0) {
    console.log('No INPUT SOURCES / OUTPUT DESTINATIONS updates were required.');
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

  console.log(
    `Updated INPUT SOURCES / OUTPUT DESTINATIONS column for ${updates} file(s).`
  );
}

// ============================================================================
// SECTION 5: SCRIPT ANALYSIS HELPERS
// ============================================================================
/**
 * analyzeScriptIO
 *
 * Purpose: Analyse JavaScript/TypeScript-like sources to identify input/output behaviour.
 * Behavior:
 * - Parses the source via Prettier's Babel parser with sanitation for preprocessor directives.
 * - Traverses the AST, recording inputs and outputs using createIoContext metadata.
 * Delegation:
 * - sanitizeForParsing: Pre-processing step for parser compatibility.
 * - traverseAst/analyzeNode: AST traversal and classification.
 * Parameters:
 * - {string} source: Raw script content.
 * - {string} filePath: Absolute path used for parser context and logging.
 * Returns: Promise<string>
 */
async function analyzeScriptIO(source, filePath) {
  const sanitized = sanitizeForParsing(source);
  let ast;

  try {
    const parsed = await prettier.__debug.parse(sanitized, {
      filepath: filePath,
      parser: 'babel',
      plugins: [parserBabel],
    });
    ast = parsed.ast;
  } catch (error) {
    console.warn(`Unable to parse ${filePath}: ${error.message}`);
    return '';
  }

  const context = createIoContext();
  traverseAst(ast, (node, parent) => analyzeNode(node, parent, context));
  return buildSummary(context);
}

/**
 * analyzeNode
 *
 * Purpose: Dispatch AST nodes to specialised handlers that capture IO interactions.
 * Behavior:
 * - Routes call/member/assignment expressions to dedicated handlers.
 * - Detects return statements containing object/array literals to mark outputs.
 * Parameters:
 * - {object} node: Current AST node.
 * - {object|null} parent: Parent AST node.
 * - {ReturnType<typeof createIoContext>} context: Mutable IO tracking context.
 * Returns: void
 */
function analyzeNode(node, parent, context) {
  if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
    handleCallExpression(node, context);
    return;
  }

  if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
    handleMemberExpression(node, parent, context);
    return;
  }

  if (node.type === 'AssignmentExpression') {
    handleAssignmentExpression(node, context);
    return;
  }

  if (node.type === 'ReturnStatement' && node.argument) {
    context.outputs.add('COMPONENT:return');
    return;
  }

  if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
    context.outputs.add('COMPONENT:export');
  }
}

/**
 * handleCallExpression
 *
 * Purpose: Categorise IO side effects triggered by call expressions (FS, network, DOM, Adobe APIs).
 * Behavior:
 * - Builds callee chains to inspect namespaces and method names.
 * - Captures inputs/outputs for storage, DOM, timers, randomness, and Adobe hosts.
 * Parameters:
 * - {import('@babel/types').CallExpression|OptionalCallExpression} node: Call expression node.
 * - {ReturnType<typeof createIoContext>} context: IO tracking context.
 * Returns: void
 */
function handleCallExpression(node, context) {
  const chain = getCalleeChain(node.callee);
  if (chain.length === 0) {
    return;
  }
  const name = chain.join('.');
  const last = chain[chain.length - 1];
  const first = chain[0];

  if (last === 'addEventListener' && node.arguments.length > 0) {
    const arg = node.arguments[0];
    const eventName = extractLiteralValue(arg) ?? 'event';
    context.inputs.add(`USER:addEventListener(${eventName})`);
  }

  if (
    first === 'document' &&
    DOM_READ_METHODS.has(last) &&
    !name.endsWith('.value')
  ) {
    context.inputs.add(`UI:${name}`);
  }

  if (
    first === 'document' &&
    (DOM_WRITE_METHODS.has(last) || DOM_WRITE_METHODS.has(`${last}`))
  ) {
    context.outputs.add(`UI:${name}`);
  }

  if (isFsReadCall(name)) {
    context.inputs.add(`FILE:${name}()`);
  }

  if (isFsWriteCall(name)) {
    context.outputs.add(`FILE:${name}()`);
  }

  if (first === 'fetch' || first === 'axios' || name.startsWith('axios.')) {
    context.inputs.add(`NETWORK:${name}`);
  }

  if (first === 'localStorage' && last === 'getItem') {
    context.inputs.add('STORAGE:localStorage.getItem');
  }

  if (first === 'sessionStorage' && last === 'getItem') {
    context.inputs.add('STORAGE:sessionStorage.getItem');
  }

  if (first === 'localStorage' && last === 'setItem') {
    context.outputs.add('STORAGE:localStorage.setItem');
  }

  if (first === 'sessionStorage' && last === 'setItem') {
    context.outputs.add('STORAGE:sessionStorage.setItem');
  }

  if (first === 'console' && ['log', 'info', 'warn', 'error', 'debug', 'trace'].includes(last)) {
    context.outputs.add(`LOG:console.${last}`);
  }

  if (first === 'process' && chain[1] === 'env') {
    context.inputs.add('CONFIG:process.env');
  }

  if (ADOBE_IDENTIFIERS.has(first)) {
    if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
      context.outputs.add(`ADOBE:${name}`);
    }
  }
}

/**
 * handleMemberExpression
 *
 * Purpose: Detect read/write access patterns on DOM, window, and configuration objects.
 * Behavior:
 * - Evaluates property chains to classify Adobe-specific reads, DOM queries, and configuration usage.
 * Parameters:
 * - {import('@babel/types').MemberExpression|OptionalMemberExpression} node: Member expression node.
 * - {object|null} parent: Parent AST node (used to distinguish read vs write contexts).
 * - {ReturnType<typeof createIoContext>} context: IO tracking context.
 * Returns: void
 */
function handleMemberExpression(node, parent, context) {
  const chain = getMemberChain(node);
  if (chain.length === 0) {
    return;
  }
  const name = chain.join('.');
  const first = chain[0];
  const last = chain[chain.length - 1];

  if (first === 'document' && DOM_READ_METHODS.has(last)) {
    context.inputs.add(`UI:${name}`);
  }

  if (ADOBE_IDENTIFIERS.has(first)) {
    if (parent && parent.type === 'CallExpression' && parent.callee === node) {
      context.outputs.add(`ADOBE:${name}()`);
    } else if (ADOBE_INPUT_PROPERTIES.has(last) || parent?.type !== 'AssignmentExpression') {
      context.inputs.add(`ADOBE:${name}`);
    }
  }
}

/**
 * handleAssignmentExpression
 *
 * Purpose: Record outputs when assignments modify known storage sinks.
 * Behavior:
 * - Identifies DOM mutations, local/session storage writes, module/global state changes, and Adobe APIs.
 * Parameters:
 * - {import('@babel/types').AssignmentExpression} node: Assignment expression node.
 * - {ReturnType<typeof createIoContext>} context: IO tracking context.
 * Returns: void
 */
function handleAssignmentExpression(node, context) {
  if (node.left.type === 'MemberExpression' || node.left.type === 'OptionalMemberExpression') {
    const chain = getMemberChain(node.left);
    if (chain.length === 0) {
      return;
    }
    const name = chain.join('.');
    const first = chain[0];

    if (first === 'document') {
      context.outputs.add(`UI:${name}`);
      return;
    }

    if (first === 'localStorage' || first === 'sessionStorage') {
      context.outputs.add(`STORAGE:${name}`);
      return;
    }

    if (first === 'module' && chain[1] === 'exports') {
      context.outputs.add('COMPONENT:module.exports');
      return;
    }

    if (first === 'exports') {
      context.outputs.add(`COMPONENT:${name}`);
    }
  }
}

// ============================================================================
// SECTION 6: NON-JS ANALYSIS ROUTINES
// ============================================================================
/**
 * analyzeCssIO
 *
 * Purpose: Identify IO interactions in CSS files (currently limited to URL usages).
 * Parameters:
 * - {string} code: CSS source text.
 * Returns: string
 */
function analyzeCssIO(code) {
  const inputs = new Set();
  const outputs = new Set();

  const importRegex = /@import\s+(?:url\()?['"]([^'"]+)['"]\)?/gi;
  let match = null;
  while ((match = importRegex.exec(code))) {
    inputs.add(`FILE:@import(${match[1]})`);
  }

  const urlRegex = /url\(\s*['"]?([^)"']+)['"]?\s*\)/gi;
  while ((match = urlRegex.exec(code))) {
    const value = match[1];
    if (!value.startsWith('data:')) {
      inputs.add(`FILE:url(${value})`);
    }
  }

  return buildSummary({ inputs, outputs });
}

/**
 * analyzeHtmlIO
 *
 * Purpose: Detect inline script and form interactions within HTML documents.
 * Parameters:
 * - {string} code: HTML source.
 * Returns: string
 */
function analyzeHtmlIO(code) {
  const inputs = new Set();
  const outputs = new Set();

  const formRegex = /<form\b[^>]*?(id|name)=["']([^"']+)["']/gi;
  let match = null;
  while ((match = formRegex.exec(code))) {
    inputs.add(`USER:form#${match[2]}`);
  }

  const inputRegex = /<input\b[^>]*?(type=["']([^"']+)["'])?/gi;
  while ((match = inputRegex.exec(code))) {
    const type = match[2] ?? 'text';
    inputs.add(`USER:input[type=${type}]`);
  }

  const buttonRegex = /<button\b[^>]*?(id|class)=["']([^"']+)["']/gi;
  while ((match = buttonRegex.exec(code))) {
    inputs.add(`USER:button(${match[2]})`);
  }

  const selectRegex = /<select\b[^>]*?(id|name)=["']([^"']+)["']/gi;
  while ((match = selectRegex.exec(code))) {
    inputs.add(`USER:select(${match[2]})`);
  }

  const uiRegex = /<(canvas|svg|video|sp-[a-z0-9-]+)\b/gi;
  while ((match = uiRegex.exec(code))) {
    outputs.add(`UI:<${match[1]}>`);
  }

  return buildSummary({ inputs, outputs });
}

/**
 * analyzeJsonIO
 *
 * Purpose: Summarise JSON structures by extracting top-level keys as inputs.
 * Parameters:
 * - {string} code: JSON string.
 * Returns: string
 */
function analyzeJsonIO(code) {
  const inputs = new Set();
  try {
    const data = JSON.parse(code);
    extractJsonKeys(data, inputs);
  } catch (error) {
    // ignore invalid JSON
  }
  return buildSummary({ inputs, outputs: new Set() });
}

/**
 * extractJsonKeys
 *
 * Purpose: Recursively enumerate JSON keys for IO reporting.
 * Parameters:
 * - {unknown} value: Current JSON node.
 * - {Set<string>} inputs: Aggregated key store.
 * - {number} depth: Current recursion depth used to limit traversal.
 * Returns: void
 */
function extractJsonKeys(value, inputs, depth = 0) {
  if (depth > 2) {
    return;
  }
  if (Array.isArray(value)) {
    inputs.add(`CONFIG:Array(length=${value.length})`);
    value.forEach((item) => extractJsonKeys(item, inputs, depth + 1));
    return;
  }
  if (value && typeof value === 'object') {
    Object.keys(value).forEach((key) => {
      inputs.add(`CONFIG:${key}`);
      extractJsonKeys(value[key], inputs, depth + 1);
    });
  }
}

/**
 * buildSummary
 *
 * Purpose: Format collected IO metadata into the `Inputs{...} | Outputs{...}` schema.
 * Parameters:
 * - {ReturnType<typeof createIoContext>} context: IO tracking data.
 * Returns: string
 */
function buildSummary(context) {
  const inputs = Array.from(context.inputs ?? []).sort();
  const outputs = Array.from(context.outputs ?? []).sort();
  const segments = [];
  if (inputs.length > 0) {
    segments.push(`Inputs{${inputs.join('; ')}}`);
  }
  if (outputs.length > 0) {
    segments.push(`Outputs{${outputs.join('; ')}}`);
  }
  return segments.join(' | ');
}

/**
 * createIoContext
 *
 * Purpose: Construct the mutable structure used to accumulate IO categories.
 * Returns: {
 *   inputs: Set<string>,
 *   outputs: Set<string>,
 *   adobe: Set<string>,
 *   domInputs: Set<string>,
 *   domOutputs: Set<string>,
 *   storageInputs: Set<string>,
 *   storageOutputs: Set<string>,
 *   network: Set<string>,
 *   fileInputs: Set<string>,
 *   fileOutputs: Set<string>
 * }
 */
function createIoContext() {
  return {
    inputs: new Set(),
    outputs: new Set(),
  };
}

// ============================================================================
// SECTION 7: CSV AND PARSING UTILITIES
// ============================================================================
/**
 * parseCsv
 *
 * Purpose: Convert CSV text into a 2D array while honouring quoted fields.
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

/**
 * quoteForCsv
 *
 * Purpose: Escape and wrap cell values for CSV serialization.
 * Parameters:
 * - {unknown} value: Cell content to serialize.
 * Returns: string
 */
function quoteForCsv(value) {
  const stringValue = String(value ?? '');
  const escaped = stringValue.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * resolveCsvPath
 *
 * Purpose: Determine the effective CSV path, honoring optional overrides.
 * Parameters:
 * - {string} overridePath: Absolute or relative path override.
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
 * sanitizeForParsing
 *
 * Purpose: Remove directives that cause Babel parsing failures.
 * Parameters:
 * - {string} source: Script source.
 * Returns: string
 */
function sanitizeForParsing(source) {
  return source.replace(/^\s*#(target|include|includepath).*$/gim, '');
}

// ============================================================================
// SECTION 8: AST HELPERS
// ============================================================================
/**
 * traverseAst
 *
 * Purpose: Perform a depth-first traversal of a Babel AST.
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
        if (child && typeof child.type === 'string') {
          traverseAst(child, visitor, node);
        }
      }
      continue;
    }

    if (value && typeof value.type === 'string') {
      traverseAst(value, visitor, node);
    }
  }
}

/**
 * getCalleeChain
 *
 * Purpose: Flatten nested callee expressions into an ordered identifier array.
 * Parameters:
 * - {import('@babel/types').Expression} node: Callee node.
 * Returns: string[]
 */
function getCalleeChain(node) {
  if (!node) {
    return [];
  }
  if (node.type === 'Identifier') {
    return [node.name];
  }
  if (node.type === 'ThisExpression') {
    return ['this'];
  }
  if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
    const objectChain = getCalleeChain(node.object);
    const propertyName = getPropertyName(node.property, node.computed);
    if (propertyName) {
      return [...objectChain, propertyName];
    }
    return objectChain;
  }
  return [];
}

/**
 * getMemberChain
 *
 * Purpose: Produce property chains for nested member expressions.
 * Parameters:
 * - {import('@babel/types').MemberExpression|OptionalMemberExpression} node: Member node.
 * Returns: string[]
 */
function getMemberChain(node) {
  if (!node || (node.type !== 'MemberExpression' && node.type !== 'OptionalMemberExpression')) {
    return [];
  }
  const base =
    node.object.type === 'MemberExpression' || node.object.type === 'OptionalMemberExpression'
      ? getMemberChain(node.object)
      : node.object.type === 'Identifier'
      ? [node.object.name]
      : node.object.type === 'ThisExpression'
      ? ['this']
      : [];

  const propertyName = getPropertyName(node.property, node.computed);
  if (!propertyName) {
    return base;
  }
  return [...base, propertyName];
}

/**
 * getPropertyName
 *
 * Purpose: Convert property nodes to string names when statically determinable.
 * Parameters:
 * - {import('@babel/types').Node} property: Property node.
 * - {boolean} computed: Indicates bracket notation usage.
 * Returns: string|null
 */
function getPropertyName(property, computed) {
  if (!property) {
    return null;
  }
  if (!computed && property.type === 'Identifier') {
    return property.name;
  }
  if (computed && property.type === 'StringLiteral') {
    return property.value;
  }
  if (computed && property.type === 'NumericLiteral') {
    return String(property.value);
  }
  return null;
}

/**
 * extractLiteralValue
 *
 * Purpose: Retrieve static string values from literal or template nodes.
 * Parameters:
 * - {import('@babel/types').Node} node: Literal node.
 * Returns: string|null
 */
function extractLiteralValue(node) {
  if (!node) {
    return null;
  }
  if (node.type === 'StringLiteral') {
    return node.value;
  }
  if (node.type === 'TemplateLiteral' && node.quasis.length === 1) {
    return node.quasis[0].value.cooked ?? node.quasis[0].value.raw;
  }
  return null;
}

/**
 * isFsReadCall
 *
 * Purpose: Identify file-system read method invocations.
 * Parameters:
 * - {string} name: Dot-delimited callee name.
 * Returns: boolean
 */
function isFsReadCall(name) {
  return (
    /^fs(\.promises)?\.read/i.test(name) ||
    /^fs(\.promises)?\.createReadStream/i.test(name) ||
    /^fsExtra\.read/i.test(name)
  );
}

/**
 * isFsWriteCall
 *
 * Purpose: Identify file-system write method invocations.
 * Parameters:
 * - {string} name: Dot-delimited callee name.
 * Returns: boolean
 */
function isFsWriteCall(name) {
  return (
    /^fs(\.promises)?\.write/i.test(name) ||
    /^fs(\.promises)?\.append/i.test(name) ||
    /^fs(\.promises)?\.createWriteStream/i.test(name) ||
    /^fsExtra\.write/i.test(name)
  );
}

/**
 * Workflow bootstrap with fatal error handling.
 *
 * Purpose: Execute the IO extraction workflow and signal failures via exit code.
 */
main().catch((error) => {
  console.error('Input/Output extraction failed:', error.message);
  process.exit(1);
});
