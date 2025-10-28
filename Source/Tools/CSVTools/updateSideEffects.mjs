// CSV PROJECT MAP - SIDE EFFECTS EXTRACTION SCRIPT

// ============================================================================
// SECTION 1: DEPENDENCIES
// ============================================================================
import fs from 'node:fs/promises';
import path from 'node:path';
import prettier from 'prettier';
import parserBabel from 'prettier/plugins/babel';
import {
  analyzeCSharpIO,
  summarizeCSharpDataFlow,
} from './lib/csharp-analysis.mjs';
import { summarizePythonSideEffects } from './lib/python-analysis.mjs';

// ============================================================================
// SECTION 2: CONFIGURATION AND CLASSIFICATION SETS
// ============================================================================
/**
 * Workspace resolution and CSV source control
 *
 * Purpose: Capture CLI overrides and compute absolute paths needed throughout
 * the extraction process.
 * Components:
 * - workspaceRoot: Root directory anchoring all relative lookups.
 * - csvOverride: Optional override injected via environment variable.
 * - csvPath: Final CSV location resolved via resolveCsvPath.
 */
const workspaceRoot = process.cwd();
const csvOverride = process.env.CSV_PROJECT_MAP_PATH ?? '';
const csvPath = resolveCsvPath(csvOverride);

/**
 * File extension allowlist used when deciding whether to analyse a source entry.
 * Includes JavaScript variants, styling assets, markup, and selected backend languages.
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
 * DOM interaction vocabularies for classifying call expressions.
 * - DOM_WRITE_METHODS: Mutating operations that modify structure or text.
 * - DOM_READ_METHODS: Non-mutating DOM queries used for read effects.
 */
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
  'write',
  'writeln',
]);

const DOM_READ_METHODS = new Set([
  'querySelector',
  'querySelectorAll',
  'getElementById',
  'getElementsByClassName',
  'getElementsByTagName',
  'closest',
]);

/**
 * Side-effect category presets covering timers, randomness, and monotonic clocks.
 */
const TIMER_FUNCTIONS = new Set([
  'setTimeout',
  'setInterval',
  'setImmediate',
  'clearTimeout',
  'clearInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
]);

const RANDOM_FUNCTIONS = new Set([
  'Math.random',
  'crypto.getRandomValues',
  'crypto.randomUUID',
]);

const TIME_FUNCTIONS = new Set([
  'Date.now',
  'performance.now',
  'process.hrtime',
  'process.hrtime.bigint',
]);

// ============================================================================
// SECTION 3: WORKFLOW ORCHESTRATION
// ============================================================================
/**
 * main
 *
 * Purpose: Coordinate the CSV side-effects extraction workflow from loading data
 * to updating the SIDE EFFECTS column.
 * Behavior:
 * - Reads the project map CSV and ensures the SIDE EFFECTS column exists.
 * - Iterates each file-backed row, sourcing file contents and running analysis.
 * - Records updated summaries and persists them back to disk when changes occur.
 * Delegation:
 * - parseCsv/quoteForCsv: CSV parsing and serialization helpers.
 * - summarizeSideEffects: Language-aware side-effects summary generator.
 * - fs.readFile/writeFile: Disk access for CSV and source files.
 * Parameters: None
 * Returns: Promise<void>
 * Key Features:
 * - Automatically inserts the SIDE EFFECTS column if originally absent.
 * - Filters unsupported file types before spending analysis cycles.
 */
async function main() {
  console.log('============================================================');
  console.log('Side Effects Extraction');
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

  let sideEffectsIndex = headers.findIndex(
    (header) => header.toUpperCase() === 'SIDE EFFECTS'
  );

  if (sideEffectsIndex === -1) {
    console.log('Adding SIDE EFFECTS column.');
    const ioIndex = headers.findIndex(
      (header) =>
        header.trim().toUpperCase() === 'INPUT SOURCES / OUTPUT DESTINATIONS'
    );
    sideEffectsIndex = ioIndex !== -1 ? ioIndex + 1 : headers.length;
    headers.splice(sideEffectsIndex, 0, 'Side Effects');
    table[0] = headers;
    for (let rowIndex = 1; rowIndex < table.length; rowIndex += 1) {
      const row = table[rowIndex] ?? [];
      while (row.length < headers.length - 1) {
        row.push('');
      }
      row.splice(sideEffectsIndex, 0, '');
      table[rowIndex] = row;
    }
  }

  const updatedEntries = [];

  console.log(`Scanning ${table.length - 1} rows for side effects...\n`);

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

    const currentValue = (row[sideEffectsIndex] ?? '')
      .replace(/\r/g, '')
      .trim();

    const nextValue = await summarizeSideEffects(source, absolutePath, ext);
    if (nextValue === currentValue) {
      continue;
    }

    row[sideEffectsIndex] = nextValue;
    updatedEntries.push({ path: relativePath, summary: nextValue });
  }

  if (updatedEntries.length === 0) {
    console.log('No SIDE EFFECTS updates were required.');
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

  console.log(`Updated SIDE EFFECTS column for ${updatedEntries.length} file(s).`);
  updatedEntries.forEach((entry) => {
    console.log(` - ${entry.path}: ${entry.summary || 'PURE'}`);
  });
}

// ============================================================================
// SECTION 4: LANGUAGE-SPECIFIC ANALYSIS
// ============================================================================
/**
 * summarizeSideEffects
 *
 * Purpose: Produce a side-effects descriptor for a given source file based on its
 * extension and content.
 * Behavior:
 * - Short-circuits known pure asset types (CSS/JSON).
 * - Applies heuristic checks for HTML, C#, Python, and JavaScript-family files.
 * - Uses AST traversal for JS-like languages to capture mutations and I/O.
 * Delegation:
 * - analyzeCSharpIO/summarizeCSharpDataFlow for .cs files.
 * - summarizePythonSideEffects for .py files.
 * - prettier.__debug.parse combined with traverseAst for JS/HTML.
 * Parameters:
 * - {string} code: File contents to analyse.
 * - {string} filePath: Absolute path for context in logging.
 * - {string} ext: Lower-case file extension, including dot.
 * Returns: Promise<string>
 * Key Features:
 * - Returns 'PURE' when no side effects detected to maintain consistency with CSV format.
 * - Gracefully logs and skips files that fail to parse.
 */
async function summarizeSideEffects(code, filePath, ext) {
  if (ext === '.css' || ext === '.json') {
    return '';
  }

  if (ext === '.html') {
    const categories = new Set();
    if (/\bon(load|error|submit|click|change|keydown|keyup)\s*=/i.test(code)) {
      categories.add('DOM:event-handlers');
    }
    if (/<script\b/i.test(code)) {
      categories.add('DOM:script');
    }
    if (categories.size === 0) {
      return '';
    }
    return buildSummary(categories);
  }

  if (ext === '.cs') {
    const { inputs, outputs } = analyzeCSharpIO(code);
    const categories = new Set();
    const processEntry = (entry) => {
      const [prefix, value] = entry.split(':');
      if (!prefix) {
        return;
      }
      switch (prefix) {
        case 'FILE':
          if (value && value.includes('Read')) {
            categories.add('FILE:read');
          } else if (value) {
            categories.add('FILE:write');
          } else {
            categories.add('FILE');
          }
          break;
        case 'NETWORK':
          categories.add('NETWORK');
          break;
        case 'LOG':
          categories.add('LOG');
          break;
        case 'STORAGE':
          categories.add('STORAGE');
          break;
        case 'CONFIG':
          categories.add('CONFIG');
          break;
        case 'USER':
          categories.add('EVENT:user');
          break;
        default:
          categories.add(prefix);
      }
    };
    inputs.forEach(processEntry);
    outputs.forEach(processEntry);

    const dataFlow = summarizeCSharpDataFlow(code);
    if (dataFlow.includes('Globals{')) {
      categories.add('STATE:global');
    }
    if (categories.size === 0) {
      return 'PURE';
    }
    return buildSummary(categories);
  }

  if (ext === '.py') {
    try {
      return await summarizePythonSideEffects(code, filePath);
    } catch (error) {
      console.warn(`Unable to analyze Python side effects for ${filePath}: ${error.message}`);
      return '';
    }
  }

  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    return '';
  }

  const sanitized = sanitizeForParsing(code);
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

  const categories = new Set();
  traverseAst(ast, (node, parent) => {
    if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
      handleCallExpression(node, categories);
      return;
    }

    if (node.type === 'NewExpression') {
      handleNewExpression(node, categories);
      return;
    }

    if (node.type === 'AssignmentExpression') {
      handleAssignmentExpression(node, categories);
      return;
    }

    if (node.type === 'UpdateExpression') {
      handleUpdateExpression(node, categories);
    }
  });

  if (categories.size === 0) {
    return 'PURE';
  }
  return buildSummary(categories);
}

// ============================================================================
// SECTION 5: AST SIDE-EFFECT DETECTORS
// ============================================================================
/**
 * handleCallExpression
 *
 * Purpose: Categorize side effects triggered by call expressions encountered in the AST.
 * Behavior:
 * - Builds a call chain and matches against known DOM, storage, timer, and I/O signatures.
 * - Adds matching categories into the provided Set for downstream summarization.
 * Delegation:
 * - getCalleeChain to flatten the callee structure.
 * - isFsReadCall/isFsWriteCall/isNetworkCall for specialized detection cases.
 * Parameters:
 * - {import('@babel/types').CallExpression|OptionalCallExpression} node: Call node under inspection.
 * - {Set<string>} categories: Mutable category accumulator.
 * Returns: void
 */
function handleCallExpression(node, categories) {
  const chain = getCalleeChain(node.callee);
  if (chain.length === 0) {
    return;
  }

  const name = chain.join('.');
  const first = chain[0];
  const last = chain[chain.length - 1];

  if (isFsReadCall(name)) {
    categories.add('FILE:read');
  }

  if (isFsWriteCall(name)) {
    categories.add('FILE:write');
  }

  if (isNetworkCall(name)) {
    categories.add('NETWORK');
  }

  if (first === 'localStorage' || first === 'sessionStorage') {
    if (last === 'getItem' || last === 'get') {
      categories.add('STORAGE:read');
    } else if (last === 'setItem' || last === 'set' || last === 'removeItem') {
      categories.add('STORAGE:write');
    }
  }

  if (first === 'process' && chain[1] === 'env') {
    categories.add('CONFIG:process.env');
  }

  if (first === 'console' && ['log', 'info', 'warn', 'error', 'debug', 'trace'].includes(last)) {
    categories.add('LOG:console');
  }

  if (first === 'document') {
    if (DOM_WRITE_METHODS.has(last) || name === 'document.body.appendChild') {
      categories.add('DOM:mutate');
    } else if (DOM_READ_METHODS.has(last)) {
      categories.add('DOM:read');
    }
  }

  if (first === 'window' && ['alert', 'confirm', 'prompt', 'open', 'close'].includes(last)) {
    categories.add('UI:window');
  }

  if (chain.includes('emit') || last === 'dispatchEvent') {
    categories.add('EVENT:emit');
  }

  if (chain.includes('setState') || chain.includes('forceUpdate')) {
    categories.add('STATE:component');
  }

  if (TIMER_FUNCTIONS.has(name)) {
    categories.add('TIMER');
  }

  if (RANDOM_FUNCTIONS.has(name) || TIME_FUNCTIONS.has(name)) {
    categories.add('NON_DETERMINISTIC');
  }
}

/**
 * handleAssignmentExpression
 *
 * Purpose: Detect side effects produced by assignment expressions, such as module,
 * instance, or global state writes.
 * Behavior:
 * - Extracts the left-hand member chain to identify storage targets.
 * - Classifies assignments into storage, DOM, module export, config, or instance/global state.
 * Delegation:
 * - getMemberChain for constructing property chains.
 * Parameters:
 * - {import('@babel/types').AssignmentExpression} node: Assignment node.
 * - {Set<string>} categories: Category accumulator.
 * Returns: void
 */
function handleAssignmentExpression(node, categories) {
  const leftChain = getMemberChain(node.left);
  if (leftChain.length === 0) {
    if (node.left.type === 'Identifier') {
      categories.add('STATE:module');
    }
    return;
  }

  const first = leftChain[0];
  const last = leftChain[leftChain.length - 1];

  if (first === 'localStorage' || first === 'sessionStorage') {
    categories.add('STORAGE:write');
    return;
  }

  if (first === 'document') {
    categories.add('DOM:mutate');
    return;
  }

  if (first === 'window' || first === 'global' || first === 'globalThis') {
    categories.add('STATE:global');
    return;
  }

  if (first === 'module' && last === 'exports') {
    categories.add('MODULE:export');
    return;
  }

  if (first === 'exports') {
    categories.add('MODULE:export');
    return;
  }

  if (first === 'process' && last === 'env') {
    categories.add('CONFIG:process.env');
    return;
  }

  if (leftChain[0] === 'this') {
    categories.add('STATE:instance');
  }
}

/**
 * handleUpdateExpression
 *
 * Purpose: Record state mutations caused by prefix/postfix increment and decrement expressions.
 * Behavior:
 * - Examines the argument to determine whether instance, global, or module scoped state is touched.
 * Parameters:
 * - {import('@babel/types').UpdateExpression} node: Update node.
 * - {Set<string>} categories: Category accumulator.
 * Returns: void
 */
function handleUpdateExpression(node, categories) {
  if (node.argument.type === 'MemberExpression' || node.argument.type === 'OptionalMemberExpression') {
    const chain = getMemberChain(node.argument);
    if (chain[0] === 'this') {
      categories.add('STATE:instance');
    } else if (chain[0] === 'window' || chain[0] === 'global' || chain[0] === 'globalThis') {
      categories.add('STATE:global');
    }
  } else if (node.argument.type === 'Identifier') {
    categories.add('STATE:module');
  }
}

/**
 * handleNewExpression
 *
 * Purpose: Identify non-deterministic constructions such as `new Date()`.
 * Behavior:
 * - Adds NON_DETERMINISTIC when constructors like Date are instantiated.
 * Parameters:
 * - {import('@babel/types').NewExpression} node: Constructor invocation.
 * - {Set<string>} categories: Category accumulator.
 * Returns: void
 */
function handleNewExpression(node, categories) {
  if (!node.callee) {
    return;
  }
  if (node.callee.type === 'Identifier' && node.callee.name === 'Date') {
    categories.add('NON_DETERMINISTIC');
  }
}

/**
 * isSupportedScriptType
 *
 * Purpose: Guard CSV rows by inspecting the Type column to ensure only supported file
 * extensions enter the side-effects analysis workflow.
 * Parameters:
 * - {string} typeValue: Lower-cased cell content from the Type column.
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
 * buildSummary
 *
 * Purpose: Convert the collected category Set into a deterministic CSV-friendly string.
 * Behavior:
 * - Sorts categories alphabetically to stabilize output across runs.
 * - Returns 'PURE' when no categories are present.
 * Parameters:
 * - {Set<string>} categories: Detected side-effect labels.
 * Returns: string
 */
function buildSummary(categories) {
  if (categories.size === 0) {
    return 'PURE';
  }
  const items = Array.from(categories).sort();
  return `SideEffects{${items.join('; ')}}`;
}

/**
 * getCalleeChain
 *
 * Purpose: Flatten nested callee expressions into an array representing the call path.
 * Behavior:
 * - Resolves identifiers, member expressions, and optional chaining segments recursively.
 * Parameters:
 * - {import('@babel/types').Expression} node: Callee node to normalise.
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
  if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
    return getCalleeChain(node.callee);
  }
  return [];
}

/**
 * getMemberChain
 *
 * Purpose: Produce an ordered list of property names from a member expression.
 * Behavior:
 * - Traverses identifiers, `this`, and nested member expressions.
 * - Omits computed properties that cannot be resolved statically.
 * Parameters:
 * - {import('@babel/types').Expression} node: Member expression node.
 * Returns: string[]
 */
function getMemberChain(node) {
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
    const objectChain = getMemberChain(node.object);
    const propertyName = getPropertyName(node.property, node.computed);
    if (propertyName) {
      return [...objectChain, propertyName];
    }
    return objectChain;
  }
  return [];
}

/**
 * getPropertyName
 *
 * Purpose: Resolve a property node to a string when possible.
 * Behavior:
 * - Supports identifiers and literal keys when not computed.
 * Parameters:
 * - {import('@babel/types').Node} node: Property node.
 * - {boolean} computed: Whether dot/bracket notation used.
 * Returns: string|null
 */
function getPropertyName(node, computed) {
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

/**
 * isFsReadCall
 *
 * Purpose: Detect file-system read operations from call chain strings.
 * Parameters:
 * - {string} name: Dot-joined call chain.
 * Returns: boolean
 */
function isFsReadCall(name) {
  return (
    name === 'fs.readFile' ||
    name === 'fs.readFileSync' ||
    name === 'fs.promises.readFile' ||
    name === 'fs.createReadStream' ||
    name.endsWith('.readFile') ||
    name.endsWith('.readFileSync') ||
    name.endsWith('.createReadStream')
  );
}

/**
 * isFsWriteCall
 *
 * Purpose: Detect file-system write operations from call chain strings.
 * Parameters:
 * - {string} name: Dot-joined call chain.
 * Returns: boolean
 */
function isFsWriteCall(name) {
  return (
    name === 'fs.writeFile' ||
    name === 'fs.writeFileSync' ||
    name === 'fs.promises.writeFile' ||
    name === 'fs.appendFile' ||
    name === 'fs.appendFileSync' ||
    name === 'fs.promises.appendFile' ||
    name === 'fs.createWriteStream' ||
    name.endsWith('.writeFile') ||
    name.endsWith('.writeFileSync') ||
    name.endsWith('.createWriteStream') ||
    name.endsWith('.appendFile') ||
    name.endsWith('.appendFileSync')
  );
}

/**
 * isNetworkCall
 *
 * Purpose: Identify typical network APIs invoked from application code.
 * Parameters:
 * - {string} name: Dot-joined call chain.
 * Returns: boolean
 */
function isNetworkCall(name) {
  if (name === 'fetch') {
    return true;
  }
  if (name.startsWith('axios.')) {
    return true;
  }
  if (name === 'axios') {
    return true;
  }
  if (name.startsWith('http.') || name.startsWith('https.')) {
    return true;
  }
  if (name.startsWith('XMLHttpRequest') || name.startsWith('navigator.sendBeacon')) {
    return true;
  }
  return false;
}

// ============================================================================
// SECTION 6: AST TRAVERSAL UTILITIES
// ============================================================================
/**
 * traverseAst
 *
 * Purpose: Depth-first traversal utility that visits every node in a Babel AST.
 * Behavior:
 * - Invokes the supplied visitor for each node along with its parent.
 * - Skips location/comment metadata to reduce recursion overhead.
 * - Supports arrays of child nodes and nested expressions.
 * Parameters:
 * - {object} node: Current AST node.
 * - {(node: object, parent: object|null) => void} visitor: Callback executed per node.
 * - {object|null} parent: Parent node reference, defaulting to null at the root.
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
 * sanitizeForParsing
 *
 * Purpose: Remove directives incompatible with the Babel parser before analysis.
 * Behavior:
 * - Strips C#/TypeScript style `#include`/`#target` pragmas that may appear in snippets.
 * Parameters:
 * - {string} source: Raw source text.
 * Returns: string
 */
function sanitizeForParsing(source) {
  return source.replace(/^\s*#(target|include|includepath).*$/gim, '');
}

// ============================================================================
// SECTION 7: CSV HELPERS
// ============================================================================
/**
 * parseCsv
 *
 * Purpose: Parse project map CSV text into a 2D array representation.
 * Behavior:
 * - Implements basic CSV parsing with quote escaping and CRLF handling.
 * - Preserves empty cells so column alignment remains intact.
 * Parameters:
 * - {string} text: CSV document content.
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
 * Purpose: Escape and wrap cell values with quotes for CSV serialization.
 * Parameters:
 * - {unknown} value: Cell content.
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
 * Purpose: Determine the project map CSV path, respecting optional overrides.
 * Behavior:
 * - Handles absolute override paths directly.
 * - Joins relative overrides against the workspace root.
 * - Falls back to the default Source/ProjectMap location.
 * Parameters:
 * - {string} overridePath: Optional override supplied by callers or env vars.
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
 * Workflow bootstrap with fatal error handling.
 *
 * Purpose: Execute the side-effects extraction and exit with a non-zero status on failure.
 */
main().catch((error) => {
  console.error('\nSide effects extraction failed.');
  console.error(error.stack || error.message);
  process.exit(1);
});
