// UPDATE-FUNCTIONS.MJS - Function Name Extraction and CSV Update Script

import fs from 'node:fs/promises';
import path from 'node:path';
import prettier from 'prettier';
import parserBabel from 'prettier/plugins/babel';
import { extractCSharpMethodNames } from './lib/csharp-analysis.mjs';
import { extractPythonFunctionNames } from './lib/python-analysis.mjs';

// ============================================================================
// SECTION 1: GLOBAL CONFIGURATION
// ============================================================================

// Workspace root directory for resolving file paths
const workspaceRoot = process.cwd();
// Optional CSV path override from environment variable for testing/flexibility
const csvOverride = process.env.CSV_PROJECT_MAP_PATH ?? '';
// Resolved CSV file path - either from override or default location
const csvPath = resolveCsvPath(csvOverride);
// Read CSV file contents as text for parsing
const csvText = await fs.readFile(csvPath, 'utf8');
// Parse CSV into structured headers and data rows
const { headers, rows: dataRows } = parseCsv(csvText);
if (dataRows.length === 0) {
  throw new Error('SourceFolder.csv has no data rows.');
}
// Combine headers and data rows into complete table structure
const rows = [headers, ...dataRows];
const headerCount = headers.length;
// Locate the TYPE column which indicates file type (e.g., ".js file", "folder")
const typeColumnIndex = headers.findIndex((value) => value.trim().toUpperCase() === 'TYPE');
if (typeColumnIndex === -1) {
  throw new Error('Unable to locate "Type" column in CSV header.');
}
// Locate the FUNCTIONS column where extracted function names will be stored
const functionsColumnIndex = headers.findIndex(
  (value) => value.trim().toUpperCase() === 'FUNCTIONS'
);
if (functionsColumnIndex === -1) {
  throw new Error('Unable to locate "FUNCTIONS" column in CSV header.');
}

// ============================================================================
// SECTION 2: MAIN PROCESSING LOOP
// ============================================================================

// Track files that have been updated for reporting
const updatedEntries = [];
// Count of files actually processed (excluding unsupported types)
let processedCount = 0;
// Total number of data rows to process (excluding header)
const totalRows = rows.length - 1;
// Iterate through each row in the CSV to extract function names
for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
  const row = rows[rowIndex];
  if (!row || row.length === 0) {
    continue;
  }
  // Extract and normalize the file type value from TYPE column
  // Example: ".js file" -> ".js file"
  const typeRaw = (row[typeColumnIndex] ?? '').replace(/\r/g, '').trim().toLowerCase();
  // Skip rows that don't represent supported script file types
  if (!isSupportedScriptType(typeRaw)) {
    continue;
  }
  // Build file path by collecting all path segments before TYPE column
  // CSV structure: [PathSegment1, PathSegment2, ..., FileName, Type, ...]
  const pathSegments = [];
  for (let colIndex = 0; colIndex < typeColumnIndex; colIndex += 1) {
    const segment = (row[colIndex] ?? '').replace(/\r/g, '').trim();
    if (segment) {
      pathSegments.push(segment);
    }
  }
  if (pathSegments.length === 0) {
    continue;
  }
  // Combine path segments into relative file path
  const relativePath = pathSegments.reduce((acc, segment) => path.join(acc, segment));
  // Convert to absolute path for file system access
  const absolutePath = path.join(workspaceRoot, relativePath);
  // Extract file extension to determine analysis strategy
  const ext = path.extname(relativePath).toLowerCase();
  processedCount++;
  console.log(`[${processedCount}/${totalRows}] Processing: ${relativePath}`);
  // Read source file content for analysis
  let sourceText;
  try {
    sourceText = await fs.readFile(absolutePath, 'utf8');
  } catch (error) {
    console.warn(`Skipping ${relativePath}: ${error.message}`);
    continue;
  }
  // Get current function list from CSV for comparison
  const currentRaw = row[functionsColumnIndex] ?? '';
  const currentTrimmed = currentRaw.replace(/\r/g, '').trim();
  // Clear function entries for non-code file types (CSS, JSON, HTML)
  // These file types don't contain callable functions in the traditional sense
  if (ext === '.css' || ext === '.json' || ext === '.html') {
    if (currentTrimmed !== '') {
      row[functionsColumnIndex] = '';
      updatedEntries.push({ path: relativePath, functions: [] });
    }
    continue;
  }
  // Extract function names based on file extension
  let functionNames = [];
  if (ext === '.cs') {
    // C# file processing with timeout protection
    // C# analysis can hang on complex files, so we add a 10-second timeout
    try {
      functionNames = await Promise.race([
        Promise.resolve(extractCSharpMethodNames(sourceText)),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout: C# analysis took too long')), 10000)
        )
      ]);
      console.log(`  ✓ Found ${functionNames.length} functions`);
    } catch (error) {
      console.warn(`  ✗ Error analyzing ${relativePath}: ${error.message}`);
      console.warn(`     Skipping this file and continuing...`);
      // Keep existing value or leave empty if analysis fails
      continue;
    }
  } else if (ext === '.py') {
    // Python file processing using dedicated Python analyzer
    try {
      functionNames = await extractPythonFunctionNames(sourceText, absolutePath);
      console.log(`  ✓ Found ${functionNames.length} functions`);
    } catch (error) {
      console.warn(`  ✗ Error analyzing ${relativePath}: ${error.message}`);
      continue;
    }
  } else {
    // JavaScript/TypeScript file processing
    // Remove preprocessor directives (#target, #include) that break Babel parser
    try {
      const sanitizedSource = sanitizeForParsing(sourceText);
      functionNames = await extractFunctionNames(sanitizedSource, absolutePath);
      console.log(`  ✓ Found ${functionNames.length} functions`);
    } catch (error) {
      console.warn(`  ✗ Error analyzing ${relativePath}: ${error.message}`);
      continue;
    }
  }
  // Join function names with semicolon delimiter for CSV storage
  const nextValue = functionNames.length > 0 ? functionNames.join('; ') : '';
  // Skip update if function list hasn't changed
  if (nextValue === currentTrimmed) {
    console.log(`  = No changes needed`);
    continue;
  }
  // Update the FUNCTIONS column with new function list
  row[functionsColumnIndex] = nextValue;
  updatedEntries.push({ path: relativePath, functions: functionNames });
  console.log(`  ✓ Updated`);
}

// ============================================================================
// SECTION 3: CSV FILE WRITING
// ============================================================================

// Exit early if no updates are needed
if (updatedEntries.length === 0) {
  console.log('\n✓ No updates were required; FUNCTIONS column already matches detected functions.');
  process.exit(0);
}
// Rebuild CSV content with updated function data
// Each cell is properly quoted to handle commas and special characters
const updatedCsv = rows
  .map((row) => {
    const fields = [];
    for (let columnIndex = 0; columnIndex < headerCount; columnIndex += 1) {
      fields.push(quoteForCsv(row[columnIndex] ?? ''));
    }
    return fields.join(',');
  })
  .join('\r\n')
  .concat('\r\n');
// Write updated CSV back to file system
await fs.writeFile(csvPath, updatedCsv, 'utf8');
// Report summary of updates
console.log(`\n✓ Updated FUNCTIONS column for ${updatedEntries.length} file(s).`);
for (const entry of updatedEntries) {
  console.log(` - ${entry.path}: ${entry.functions.length} function(s)`);
}

// ============================================================================
// SECTION 4: CSV UTILITY FUNCTIONS
// ============================================================================

/**
 * Quotes and escapes a value for safe CSV storage
 * Purpose: Ensures special characters (quotes, commas, newlines) don't break CSV format
 * 
 * @param {string} value - The value to quote and escape
 * @returns {string} - Properly escaped and quoted CSV cell value
 * 
 * Key behaviors:
 * - Converts any value to string
 * - Doubles internal quote characters (CSV escaping standard)
 * - Wraps entire value in quotes
 * - Handles null/undefined by converting to empty string
 */
function quoteForCsv(value) {
  const stringValue = String(value ?? '');
  const escaped = stringValue.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Parses CSV text into structured table data
 * Purpose: Converts raw CSV string into usable headers and data rows
 * Implements: RFC 4180 CSV parsing with quote escaping support
 * 
 * @param {string} text - Raw CSV file content
 * @returns {Object} - Object with headers array and rows array
 * 
 * Key features:
 * - Handles quoted fields with embedded commas and newlines
 * - Supports quote escaping (doubled quotes)
 * - Normalizes line endings (CRLF, LF)
 * - Filters out completely empty rows
 * - Separates header row from data rows
 * 
 * Implementation details:
 * - Uses state machine with insideQuotes flag
 * - Processes character-by-character for accuracy
 * - Handles edge cases like trailing commas and final newlines
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
  if (records.length === 0) {
    return { headers: [], rows: [] };
  }
  // Separate header row and normalize carriage returns
  const headers = records[0].map((header) => header.replace(/\r/g, '').trim());
  // Filter out empty rows (rows where all cells are empty after trimming)
  const dataRows = records
    .slice(1)
    .filter((row) => row.some((cell) => (cell ?? '').trim() !== ''));
  return { headers, rows: dataRows };
}

// ============================================================================
// SECTION 5: FILE TYPE VALIDATION
// ============================================================================

/**
 * Determines if a CSV type value represents a supported script file
 * Purpose: Filter CSV rows to only process files we can analyze
 * 
 * @param {string} typeValue - Type column value from CSV (e.g., ".js file", "folder")
 * @returns {boolean} - True if file type is supported for function extraction
 * 
 * Supported file types:
 * - JavaScript: .js, .jsx, .mjs, .cjs
 * - Stylesheets: .css (returns false for function extraction but processed separately)
 * - Data: .json, .html (returns false for function extraction but processed separately)
 * - C#: .cs
 * - Python: .py
 * 
 * Key behavior:
 * - Type values must end with " file" suffix
 * - Extension is extracted from the beginning of type value
 */
function isSupportedScriptType(typeValue) {
  if (!typeValue.endsWith(' file')) {
    return false;
  }
  const supported = ['.js', '.jsx', '.mjs', '.cjs', '.css', '.json', '.html', '.cs', '.py'];
  return supported.some((ext) => typeValue.endsWith(`${ext} file`));
}

// ============================================================================
// SECTION 6: JAVASCRIPT FUNCTION EXTRACTION
// ============================================================================

/**
 * Extracts function names from JavaScript/TypeScript source code
 * Purpose: Discover all function declarations, expressions, and method definitions
 * Uses: Prettier + Babel parser for accurate AST generation
 * 
 * @param {string} code - JavaScript source code (preprocessor directives already removed)
 * @param {string} filePath - Absolute file path (used for parser error reporting)
 * @returns {Promise<Array<string>>} - Sorted array of unique function names
 * 
 * Extraction strategy:
 * - Parse code into AST using Babel parser (supports modern JS/TS syntax)
 * - Track all declared function names
 * - Track imported identifiers that might be functions
 * - Track which identifiers are actually called
 * - Include imports only if they're actually invoked (reduces noise)
 * 
 * Handles these function patterns:
 * - Named function declarations: function foo() {}
 * - Function expressions: const bar = function() {}
 * - Arrow functions: const baz = () => {}
 * - Object methods: { method() {} }
 * - Class methods: class X { method() {} }
 * - Object property functions: { prop: function() {} }
 * - Destructured require imports: const { func } = require('./module')
 * - Assignment expressions: obj.method = function() {}
 * 
 * Returns: Alphabetically sorted function names for consistent CSV output
 */
async function extractFunctionNames(code, filePath) {
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
  // Track definite function declarations
  const declaredNames = new Set();
  // Track imported identifiers that might be functions
  const importedCandidates = new Set();
  // Track which identifiers are called (to filter imports)
  const calledIdentifiers = new Set();
  // Traverse AST and collect function information
  traverseAst(ast, (node, parent) => {
    switch (node.type) {
      case 'FunctionDeclaration':
        if (node.id && node.id.name) {
          declaredNames.add(node.id.name);
        }
        break;
      case 'FunctionExpression':
        if (node.id && node.id.name) {
          declaredNames.add(node.id.name);
        }
        break;
      case 'VariableDeclarator':
        handleVariableDeclarator(node);
        break;
      case 'AssignmentExpression':
        handleAssignmentExpression(node);
        break;
      case 'ObjectProperty':
        handleObjectProperty(node);
        break;
      case 'ObjectMethod':
        handleObjectMethod(node);
        break;
      case 'ClassMethod':
        handleClassMethod(node);
        break;
      case 'ClassPrivateMethod':
        handleClassPrivateMethod(node);
        break;
      case 'ClassProperty':
      case 'PropertyDefinition':
        handleClassProperty(node);
        break;
      case 'CallExpression':
      case 'OptionalCallExpression':
        trackCalledIdentifier(node);
        break;
      case 'ExportNamedDeclaration':
        if (node.declaration && node.declaration.type === 'FunctionDeclaration') {
          const { id } = node.declaration;
          if (id && id.name) {
            declaredNames.add(id.name);
          }
        }
        break;
      default:
        break;
    }
  });
  // Add imported functions that are actually called (reduces false positives)
  for (const candidate of importedCandidates) {
    if (calledIdentifiers.has(candidate)) {
      declaredNames.add(candidate);
    }
  }
  // Return sorted function names for consistent CSV output
  return Array.from(declaredNames).sort((a, b) => a.localeCompare(b));
  /**
   * Processes variable declarator nodes to find function assignments
   * Purpose: Extract functions assigned to variables (const f = function(){})
   * 
   * Handles patterns:
   * - Simple: const func = function() {}
   * - Arrow: const func = () => {}
   * - Destructured requires: const { foo, bar } = require('./mod')
   * 
   * Special behavior for require destructuring:
   * - Extracts imported names but adds to importedCandidates
   * - Only included in final list if they're actually called
   */
  function handleVariableDeclarator(node) {
    const { id, init } = node;
    if (!id) {
      return;
    }
    if (id.type === 'Identifier' && isFunctionLike(init)) {
      declaredNames.add(id.name);
      return;
    }
    // Handle destructured require: const { func } = require('./module')
    if (id.type === 'ObjectPattern' && isRequireCall(init)) {
      for (const property of id.properties) {
        if (property.type === 'RestElement' && property.argument.type === 'Identifier') {
          declaredNames.add(property.argument.name);
          continue;
        }
        if (property.type === 'ObjectProperty') {
          const identifier = extractIdentifierFromProperty(property);
          if (identifier) {
            importedCandidates.add(identifier);
          }
        }
      }
    }
  }
  /**
   * Processes assignment expressions to find function assignments
   * Purpose: Detect functions assigned via = operator
   * 
   * Handles patterns:
   * - Member expressions: obj.method = function() {}
   * - Simple assignments: func = () => {}
   */
  function handleAssignmentExpression(node) {
    if (node.operator !== '=' || !node.left || !node.right) {
      return;
    }
    if (node.left.type === 'MemberExpression' && isFunctionLike(node.right)) {
      const name = extractNameFromMemberExpression(node.left);
      if (name) {
        declaredNames.add(name);
      }
      return;
    }
    if (node.left.type === 'Identifier' && isFunctionLike(node.right)) {
      declaredNames.add(node.left.name);
    }
  }
  /**
   * Processes object property nodes for function values
   * Purpose: Extract methods defined as object properties
   * Pattern: { methodName: function() {} }
   */
  function handleObjectProperty(node) {
    if (!node.key) {
      return;
    }
    if (isFunctionLike(node.value)) {
      const name = extractKeyName(node);
      if (name) {
        declaredNames.add(name);
      }
    }
  }
  /**
   * Processes object method shorthand syntax
   * Purpose: Extract ES6 shorthand methods
   * Pattern: { methodName() {} }
   */
  function handleObjectMethod(node) {
    const name = extractKeyName(node);
    if (name) {
      declaredNames.add(name);
    }
  }
  /**
   * Processes class method definitions
   * Purpose: Extract method names from classes
   * Pattern: class X { methodName() {} }
   * Skips: Constructor methods (not useful for function inventory)
   */
  function handleClassMethod(node) {
    if (node.kind === 'constructor') {
      return;
    }
    const name = extractKeyName(node);
    if (name) {
      declaredNames.add(name);
    }
  }
  /**
   * Processes private class methods
   * Purpose: Extract private method names from classes
   * Pattern: class X { #privateMethod() {} }
   * Prefixes: Private method names with # for clear identification
   */
  function handleClassPrivateMethod(node) {
    if (node.kind === 'constructor') {
      return;
    }
    if (node.key && node.key.id && node.key.id.name) {
      declaredNames.add(`#${node.key.id.name}`);
    }
  }
  /**
   * Processes class property definitions with function values
   * Purpose: Extract class fields assigned to functions
   * Pattern: class X { prop = () => {} }
   */
  function handleClassProperty(node) {
    if (!isFunctionLike(node.value)) {
      return;
    }
    const name = extractKeyName(node);
    if (name) {
      declaredNames.add(name);
    }
  }
  /**
   * Tracks which identifiers are used in call expressions
   * Purpose: Identify which imported names are actually invoked
   * Used for: Filtering importedCandidates to reduce false positives
   * Pattern: someFunction() -> tracks "someFunction"
   */
  function trackCalledIdentifier(node) {
    const callee = node.callee;
    if (!callee) {
      return;
    }
    if (callee.type === 'Identifier') {
      calledIdentifiers.add(callee.name);
    }
  }
}

// ============================================================================
// SECTION 7: SOURCE CODE PREPROCESSING
// ============================================================================

/**
 * Removes preprocessor directives that break JavaScript parsing
 * Purpose: Clean Adobe ExtendScript directives before Babel parsing
 * 
 * @param {string} source - Raw source code
 * @returns {string} - Sanitized source code safe for Babel parser
 * 
 * Removes directives:
 * - #target (ExtendScript target application)
 * - #include (ExtendScript file inclusion)
 * - #includepath (ExtendScript include search paths)
 * 
 * Why: These are valid in Adobe environments but break standard JS parsers
 */
function sanitizeForParsing(source) {
  return source.replace(/^\s*#(target|include|includepath).*$/gim, '');
}

// ============================================================================
// SECTION 8: AST TRAVERSAL
// ============================================================================

/**
 * Recursively traverses an Abstract Syntax Tree
 * Purpose: Visit every node in the AST for analysis
 * Pattern: Depth-first traversal with visitor callback
 * 
 * @param {Object} node - Current AST node being visited
 * @param {Function} visitor - Callback function invoked for each node
 * @param {Object} parent - Parent node (null for root)
 * 
 * Key features:
 * - Skips metadata properties (loc, start, end, comments)
 * - Handles both array children and single object children
 * - Maintains parent reference for context-aware analysis
 * - Guards against non-object values
 * 
 * Implementation notes:
 * - Uses type property to identify valid AST nodes
 * - Recursively processes all node properties
 * - Visitor receives (node, parent) for contextual decisions
 */
function traverseAst(node, visitor, parent = null) {
  if (!node || typeof node !== 'object') {
    return;
  }
  visitor(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'leadingComments' || key === 'trailingComments') {
      continue;
    }
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && typeof child.type === 'string') {
          traverseAst(child, visitor, node);
        }
      }
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      traverseAst(value, visitor, node);
    }
  }
}

// ============================================================================
// SECTION 9: AST NODE TYPE CHECKING
// ============================================================================

/**
 * Checks if a node represents a function-like construct
 * Purpose: Identify nodes that define executable functions
 * 
 * @param {Object} node - AST node to check
 * @returns {boolean} - True if node represents a function
 * 
 * Recognized function types:
 * - FunctionExpression: const f = function() {}
 * - ArrowFunctionExpression: const f = () => {}
 * - FunctionDeclaration: function f() {}
 */
function isFunctionLike(node) {
  if (!node) {
    return false;
  }
  return (
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionDeclaration'
  );
}

/**
 * Checks if a node is a CommonJS require() call
 * Purpose: Identify module imports for destructuring analysis
 * Pattern: require('./module') or require("module")
 * 
 * @param {Object} node - AST node to check
 * @returns {boolean} - True if node is a require call
 */
function isRequireCall(node) {
  return (
    node &&
    node.type === 'CallExpression' &&
    node.callee &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'require'
  );
}

// ============================================================================
// SECTION 10: NAME EXTRACTION UTILITIES
// ============================================================================

/**
 * Extracts identifier name from an object destructuring property
 * Purpose: Get imported function name from require destructuring
 * 
 * @param {Object} property - ObjectProperty or RestElement node
 * @returns {string|null} - Extracted identifier name or null
 * 
 * Handles patterns:
 * - Simple: { foo } -> "foo"
 * - With default: { foo = defaultValue } -> "foo"
 * - Computed: { ['key'] } -> "key" (if computed is false)
 * 
 * Returns null for:
 * - Nested destructuring patterns
 * - Computed property names
 * - Invalid structures
 */
function extractIdentifierFromProperty(property) {
  if (property.value && property.value.type === 'Identifier') {
    return property.value.name;
  }
  if (property.value && property.value.type === 'AssignmentPattern') {
    if (property.value.left.type === 'Identifier') {
      return property.value.left.name;
    }
  }
  if (!property.computed && property.key && property.key.type === 'Identifier') {
    return property.key.name;
  }
  return null;
}

/**
 * Extracts name from object key or class method key
 * Purpose: Get method/property name from various key types
 * 
 * @param {Object} node - Node with a 'key' property (ObjectProperty, ObjectMethod, etc.)
 * @returns {string|null} - Extracted name or null
 * 
 * Handles key types:
 * - Identifier (non-computed): { methodName } -> "methodName"
 * - StringLiteral: { "method-name" } -> "method-name"
 * - NumericLiteral: { 123 } -> "123"
 * - PrivateName: { #private } -> "#private"
 * 
 * Returns null for:
 * - Computed keys with dynamic expressions
 * - Symbol keys
 */
function extractKeyName(node) {
  const { key } = node;
  if (!key) {
    return null;
  }
  if (!node.computed && key.type === 'Identifier') {
    return key.name;
  }
  if (key.type === 'StringLiteral') {
    return key.value;
  }
  if (key.type === 'NumericLiteral') {
    return key.value.toString();
  }
  if (key.type === 'PrivateName' && key.id && key.id.name) {
    return `#${key.id.name}`;
  }
  return null;
}

/**
 * Extracts property name from member expression
 * Purpose: Get method name from assignment like obj.method = function(){}
 * 
 * @param {Object} node - MemberExpression node
 * @returns {string|null} - Property name or null
 * 
 * Handles patterns:
 * - Dot notation (non-computed): obj.method -> "method"
 * - Bracket with literal (computed): obj["method"] -> "method"
 * - Bracket with number (computed): obj[123] -> "123"
 * 
 * Returns null for:
 * - Dynamic computed properties: obj[variable]
 * - Symbol properties
 */
function extractNameFromMemberExpression(node) {
  if (!node) {
    return null;
  }
  if (!node.computed && node.property.type === 'Identifier') {
    return node.property.name;
  }
  if (node.computed) {
    if (node.property.type === 'StringLiteral') {
      return node.property.value;
    }
    if (node.property.type === 'NumericLiteral') {
      return node.property.value.toString();
    }
  }
  return null;
}

// ============================================================================
// SECTION 11: PATH RESOLUTION
// ============================================================================

/**
 * Resolves the CSV file path from override or default location
 * Purpose: Support flexible CSV locations via environment variable
 * 
 * @param {string} overridePath - Optional path from environment variable
 * @returns {string} - Absolute path to CSV file
 * 
 * Resolution logic:
 * 1. If override provided and absolute -> use as-is
 * 2. If override provided and relative -> resolve from workspace root
 * 3. If no override -> use default: Source/ProjectMap/SourceFolder.csv
 * 
 * Default location: workspaceRoot/Source/ProjectMap/SourceFolder.csv
 * Override via: CSV_PROJECT_MAP_PATH environment variable
 */
function resolveCsvPath(overridePath) {
  if (overridePath) {
    const candidate = path.isAbsolute(overridePath)
      ? overridePath
      : path.join(workspaceRoot, overridePath);
    return candidate;
  }
  return path.join(workspaceRoot, 'Source/ProjectMap/SourceFolder.csv');
}
