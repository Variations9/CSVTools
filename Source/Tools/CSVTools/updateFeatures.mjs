// UPDATEFEATURES.MJS - Feature Synopsis Generator for CSV Project Map

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  loadCsvTable,
  writeCsvTable,
  ensureColumn,
  createValueAccessor,
} from './lib/table-helpers.mjs';

// ============================================================================
// SECTION 1: GLOBAL CONFIGURATION
// ============================================================================

// Optional CSV path override from environment variable for flexible file locations
const csvOverride = process.env.CSV_PROJECT_MAP_PATH ?? '';
// Workspace root directory for resolving relative file paths
const workspaceRoot = process.cwd();
const MAX_FILE_SIZE_BYTES =
  Number.isFinite(Number.parseInt(process.env.FEATURES_MAX_BYTES, 10)) &&
  Number.parseInt(process.env.FEATURES_MAX_BYTES, 10) > 0
    ? Number.parseInt(process.env.FEATURES_MAX_BYTES, 10)
    : 10 * 1024 * 1024; // 10MB cap to avoid loading giant/binary assets
const BINARY_EXTENSIONS = new Set(
  [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.bmp',
    '.tga',
    '.tif',
    '.tiff',
    '.psd',
    '.psb',
    '.exr',
    '.mp3',
    '.wav',
    '.ogg',
    '.mp4',
    '.mov',
    '.avi',
    '.mkv',
    '.flac',
    '.webm',
    '.zip',
    '.rar',
    '.7z',
    '.tar',
    '.gz',
    '.tgz',
    '.xz',
    '.dll',
    '.exe',
    '.so',
    '.dylib',
    '.lib',
    '.unitypackage',
    '.prefab',
    '.unity',
    '.asset',
    '.fbx',
    '.obj',
    '.mtl',
    '.blend',
    '.c4d',
  ].map((ext) => ext.toLowerCase())
);
const SKIP_PATH_SEGMENTS = new Set(
  ['library', 'temp', 'logs', 'obj', 'build', 'builds', 'binaries'].map((segment) =>
    segment.toLowerCase()
  )
);
const MAX_SKIP_LOGS_PER_REASON = 20;
const skipLogCounts = new Map(); // reason -> count
const PROGRESS_EVERY_ROWS = 5000;

// ============================================================================
// SECTION 2: MAIN PROCESSING LOGIC
// ============================================================================

/**
 * main
 *
 * Purpose: Generate refreshed feature synopses for each file entry tracked in the project map CSV.
 * Behavior:
 * - Loads the CSV, ensures the FEATURES column exists, and iterates over every file row.
 * - Collects SUMMARY, FUNCTIONS, DATA FLOW, IO, SIDE EFFECTS, and comment snippets to build descriptions.
 * - Writes the CSV back to disk when at least one synopsis differs from the stored value.
 * Delegation:
 * - loadCsvTable, writeCsvTable, ensureColumn, createValueAccessor manage CSV interactions.
 * - buildFeatureSynopsis converts collected metadata into the formatted output string.
 * Parameters: None
 * Returns: Promise<void>
 * Key Features:
 * - Produces summaries resembling `FeatureName -> Descriptor [Tag1, Tag2]`.
 * - Emits console diagnostics and skips redundant writes when no changes are detected.
 */
async function main() {
  console.log('============================================================');
  console.log('Feature Synopsis Extraction (Column FEATURES)');
  console.log('============================================================\n');
  // Load CSV data using helper function that handles parsing and column mapping
  const { csvPath, headers, rows } = await loadCsvTable(csvOverride || undefined);
  // Locate TYPE column which indicates if row is a file or folder
  const typeIndex = headers.findIndex((header) => header.trim().toUpperCase() === 'TYPE');
  if (typeIndex === -1) {
    throw new Error('Unable to locate "Type" column in CSV header.');
  }
  // Ensure FEATURES column exists, creating it if necessary
  const featuresIndex = ensureColumn(headers, rows, 'FEATURES');
  // Create accessor function for safely reading column values by name
  const getValue = createValueAccessor(headers);
  // Track number of rows that were actually updated
  let updated = 0;
  // Process each row in the CSV to generate feature synopses
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    if (rowIndex % PROGRESS_EVERY_ROWS === 0 && rowIndex !== 0) {
      console.log(`  ...processed ${rowIndex} of ${rows.length} rows`);
    }
    const row = rows[rowIndex];
    if (!row) {
      continue;
    }
    // Extract and normalize type value to determine if this is a file row
    const typeValue = (row[typeIndex] ?? '').trim().toLowerCase();
    // Skip folders and invalid rows - only process actual files
    if (!isFileRow(typeValue)) {
      continue;
    }
    // Build relative file path from CSV columns (path segments before TYPE column)
    const relativePath = buildRelativePath(row, typeIndex);
    if (!relativePath) {
      continue;
    }
    // Convert to absolute path for file system access
    const absolutePath = path.join(workspaceRoot, relativePath);
    // Extract file extension to determine comment syntax and tagging
    const fileExt = path.extname(relativePath).toLowerCase();
    // Skip binary/image files that don't contain useful feature information
    if (shouldSkipFeatureExtraction(fileExt)) {
      continue;
    }
    // Skip heavy/binary/ignored paths before reading
    const lowerSegments = relativePath.split(path.sep).map((segment) => segment.toLowerCase());
    const excludedSegment = lowerSegments.find((segment) => SKIP_PATH_SEGMENTS.has(segment));
    if (excludedSegment) {
      recordSkip(relativePath, `excluded folder "${excludedSegment}"`);
      continue;
    }
    if (BINARY_EXTENSIONS.has(fileExt)) {
      recordSkip(relativePath, `binary extension ${fileExt}`);
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

    // Extract comment snippet from source file for additional context
    // This captures file-level documentation that may not be in other columns
    const commentSnippet = await extractCommentSnippet(absolutePath, fileExt);
    // Gather all metadata from relevant CSV columns
    const featureName = extractFeatureName(row, typeIndex);
    const summary = getValue(row, 'SUMMARY').trim();
    const functionsCell = getValue(row, 'FUNCTIONS').trim();
    const dataFlow = getValue(row, 'DATA FLOW / STATE MANAGEMENT').trim();
    const ioSummary = getValue(row, 'INPUT SOURCES / OUTPUT DESTINATIONS').trim();
    const sideEffects = getValue(row, 'SIDE EFFECTS').trim();
    // Build comprehensive feature synopsis from all available metadata
    // Combines human-readable description with categorization tags
    const nextValue = buildFeatureSynopsis({
      featureName,
      summary,
      functionsCell,
      dataFlow,
      ioSummary,
      sideEffects,
      fileExt,
      commentSnippet,
    });
    // Check if synopsis has changed to avoid unnecessary writes
    const currentValue = (row[featuresIndex] ?? '').trim();
    if (currentValue === nextValue) {
      continue;
    }
    // Update row with new synopsis and increment counter
    row[featuresIndex] = nextValue;
    updated += 1;
  }
  // Exit early if no updates needed
  if (updated === 0) {
    console.log('No FEATURES updates were required; column already reflects current metadata.');
    emitSkipSummary();
    return;
  }
  // Write updated CSV back to disk with all synopses refreshed
  await writeCsvTable(csvPath, headers, rows);
  console.log(`Updated FEATURES column for ${updated} row(s).`);
  emitSkipSummary();
}

// ============================================================================
// SECTION 3: ROW TYPE VALIDATION
// ============================================================================

/**
 * isFileRow
 *
 * Purpose: Determine whether a CSV row represents a concrete file instead of a folder placeholder.
 * Behavior:
 * - Treats empty values and the literal word `folder` as non-file entries.
 * - Accepts values whose TYPE column ends with `file` (for example `.js file`).
 * Parameters:
 * - {string} typeValue: Normalised TYPE column value.
 * Returns: boolean
 * Key Features:
 * - Filters the CSV iteration so downstream logic only processes real source files.
 */
function isFileRow(typeValue) {
  if (!typeValue || typeValue === 'folder') {
    return false;
  }
  return typeValue.endsWith('file');
}

// ============================================================================
// SECTION 4: FEATURE NAME EXTRACTION
// ============================================================================

/**
 * extractFeatureName
 *
 * Purpose: Derive a human-readable feature name from the path segments stored in the CSV row.
 * Behavior:
 * - Scans backward from the TYPE column to locate the filename cell.
 * - Strips the file extension and converts the remainder to title case.
 * Parameters:
 * - {string[]} row: CSV row containing path segments.
 * - {number} typeIndex: Index of the TYPE column.
 * Returns: string
 * Key Features:
 * - Falls back to `Unnamed Feature` when no filename can be resolved.
 */
function extractFeatureName(row, typeIndex) {
  for (let index = typeIndex - 1; index >= 0; index -= 1) {
    const value = (row[index] ?? '').trim();
    if (value) {
      return toTitleCase(value.replace(/\.[^.]+$/, ''));
    }
  }
  return 'Unnamed Feature';
}

// ============================================================================
// SECTION 5: SYNOPSIS CONSTRUCTION
// ============================================================================

/**
 * Builds comprehensive feature synopsis from all available metadata
 * Purpose: Create human-readable description combining multiple data sources
 * 
 * @param {Object} params - Configuration object containing all metadata
 * @param {string} params.featureName - Title-cased feature name
 * @param {string} params.summary - Content from SUMMARY column
 * @param {string} params.functionsCell - Semicolon-separated function list
 * @param {string} params.dataFlow - Data flow analysis from column M
 * @param {string} params.ioSummary - Input/output analysis from column O
 * @param {string} params.sideEffects - Side effects analysis from column P
 * @param {string} params.fileExt - File extension for language-specific tagging
 * @param {string} params.commentSnippet - Extracted documentation comments
 * @returns {string} - Formatted feature synopsis
 * 
 * Output format: "FeatureName ΓÇö Descriptor [Tag1, Tag2]"
 * 
 * Descriptor priority (first available wins):
 * 1. SUMMARY column (first sentence, truncated to 180 chars)
 * 2. Function list from FUNCTIONS column (first 3 functions)
 * 3. Comment snippet with "Notes:" prefix
 * 
 * Tags generated from:
 * - DATA FLOW patterns (DOM, Globals ΓåÆ "Stateful")
 * - INPUT/OUTPUT patterns (Adobe, Network, File, Storage)
 * - SIDE EFFECTS patterns (state management, I/O operations)
 * - File extension (.py ΓåÆ "Python", .jsx ΓåÆ "UI Script")
 * 
 * Examples:
 * - "Grid Manager ΓÇö Manages dynamic grid layouts [DOM, Storage, Stateful]"
 * - "API Client ΓÇö Defines fetchData, postData, handleError [Network, Adobe]"
 * - "Utility Functions ΓÇö Notes: Helper functions for string manipulation"
 */
/**
 * buildFeatureSynopsis
 *
 * Purpose: Assemble the final feature synopsis string from collected metadata.
 * Behavior:
 * - Parses the FUNCTIONS cell, selects a descriptor, and generates contextual tags.
 * - Returns the feature name alone when neither descriptor nor tags are available.
 * Parameters:
 * - {object} options: Aggregated metadata used to build the synopsis.
 *   - {string} featureName
 *   - {string} summary
 *   - {string} functionsCell
 *   - {string} dataFlow
 *   - {string} ioSummary
 *   - {string} sideEffects
 *   - {string} fileExt
 *   - {string} commentSnippet
 * Returns: string
 * Key Features:
 * - Produces output formatted as `FeatureName -> Descriptor [Tag1, Tag2]` when data is present.
 */
function buildFeatureSynopsis({
  featureName,
  summary,
  functionsCell,
  dataFlow,
  ioSummary,
  sideEffects,
  fileExt,
  commentSnippet,
}) {
  // Parse semicolon-separated function list into array
  const functions = parseFunctions(functionsCell);
  // Build human-readable descriptor from available sources
  const descriptor = pickDescriptor(summary, functions, commentSnippet);
  // Generate categorization tags based on file characteristics
  const tags = buildTags({ dataFlow, ioSummary, sideEffects, fileExt });
  // Assemble final synopsis with optional descriptor and tags
  const parts = [];
  if (descriptor) {
    parts.push(descriptor);
  }
  if (tags.length > 0) {
    parts.push(`[${tags.join(', ')}]`);
  }
  // Return just feature name if no additional information available
  if (parts.length === 0) {
    return featureName;
  }
  // Format: "FeatureName ΓÇö Descriptor [Tags]"
  return `${featureName} ΓÇö ${parts.join(' ')}`;
}

// ============================================================================
// SECTION 6: FUNCTION LIST PARSING
// ============================================================================

/**
 * parseFunctions
 *
 * Purpose: Convert the FUNCTIONS column value into a trimmed array of function names.
 * Behavior:
 * - Splits the cell on semicolons, trims each token, and discards empty entries.
 * Parameters:
 * - {string} cell: Raw FUNCTIONS column text (for example `foo; bar; baz`).
 * Returns: string[]
 */
function parseFunctions(cell) {
  return cell
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

// ============================================================================
// SECTION 7: DESCRIPTOR SELECTION
// ============================================================================

/**
 * pickDescriptor
 *
 * Purpose: Select the most informative descriptor text for a feature synopsis.
 * Behavior:
 * - Prefers SUMMARY text, otherwise lists core functions, and optionally appends comment notes.
 * - Truncates long segments to keep the synopsis concise and joins multiple parts with ` | `.
 * Parameters:
 * - {string} summary: SUMMARY column contents.
 * - {string[]} functions: Parsed function names.
 * - {string} commentSnippet: Extracted documentation snippet.
 * Returns: string
 */
function pickDescriptor(summary, functions, commentSnippet) {
  const descriptorParts = [];
  // Normalize whitespace in summary and use first sentence
  const normalizedSummary = summary.replace(/\s+/g, ' ').trim();
  if (normalizedSummary) {
    descriptorParts.push(shortenText(extractFirstSentence(normalizedSummary), 180));
  } else if (functions.length > 0) {
    // Fallback to function list if no summary available
    const list = functions.slice(0, 3).join(', ');
    const suffix = functions.length > 3 ? 'ΓÇª' : '';
    descriptorParts.push(`Defines ${list}${suffix}`);
  }
  // Add comment snippet as supplementary information
  if (commentSnippet) {
    const prefix = descriptorParts.length === 0 ? '' : 'Notes: ';
    descriptorParts.push(`${prefix}${shortenText(commentSnippet, 160)}`);
  }
  return descriptorParts.join(' | ');
}

// ============================================================================
// SECTION 8: TEXT PROCESSING UTILITIES
// ============================================================================

/**
 * extractFirstSentence
 *
 * Purpose: Capture the opening sentence from a longer block of text for use in the synopsis.
 * Behavior:
 * - Searches for the first terminal punctuation mark (`.`, `!`, or `?`) followed by whitespace or EOS.
 * - Returns the full text when no terminal punctuation is found.
 * Parameters:
 * - {string} text: Input text that may contain multiple sentences.
 * Returns: string
 */
function extractFirstSentence(text) {
  const sentenceMatch = text.match(/^(.+?[.!?])(\s|$)/);
  if (sentenceMatch) {
    return sentenceMatch[1];
  }
  return text;
}

/**
 * shortenText
 *
 * Purpose: Enforce a character limit on descriptor text while preserving readability.
 * Behavior:
 * - Returns the original text when within the limit.
 * - Otherwise trims the tail, removes trailing whitespace, and appends a single ellipsis character.
 * Parameters:
 * - {string} text: Source text to constrain.
 * - {number} maxLength: Maximum allowed characters including the ellipsis.
 * Returns: string
 */
function shortenText(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1).trimEnd()}ΓÇª`;
}

// ============================================================================
// SECTION 9: TAG GENERATION
// ============================================================================

/**
 * buildTags
 *
 * Purpose: Derive quick-reference tags describing integration points and language characteristics.
 * Behavior:
 * - Scans DATA FLOW, IO, and SIDE EFFECTS metadata for known patterns.
 * - Adds language hints based on file extension and limits the result to four tags.
 * Parameters:
 * - {object} params: Metadata bundle.
 *   - {string} dataFlow
 *   - {string} ioSummary
 *   - {string} sideEffects
 *   - {string} fileExt
 * Returns: string[]
 */
function buildTags({ dataFlow, ioSummary, sideEffects, fileExt }) {
  const tags = new Set();
  // Convert to lowercase for case-insensitive matching
  const lcDataFlow = dataFlow.toLowerCase();
  const lcIo = ioSummary.toLowerCase();
  const lcSideEffects = sideEffects.toLowerCase();
  // Detect DOM manipulation patterns
  if (/\bdom\b/.test(lcDataFlow) || lcSideEffects.includes('dom:') || lcSideEffects.includes('ui:')) {
    tags.add('DOM');
  }
  // Detect Adobe API integration
  if (lcIo.includes('adobe:') || lcSideEffects.includes('adobe')) {
    tags.add('Adobe');
  }
  // Detect network operations
  if (lcIo.includes('network') || lcSideEffects.includes('network')) {
    tags.add('Network');
  }
  // Detect file system operations
  if (lcIo.includes('file:') || lcSideEffects.includes('file')) {
    tags.add('File IO');
  }
  // Detect storage API usage (localStorage, sessionStorage)
  if (lcIo.includes('storage') || lcSideEffects.includes('storage')) {
    tags.add('Storage');
  }
  // Detect global state usage
  if (lcDataFlow.includes('globals{') || lcSideEffects.includes('state:')) {
    tags.add('Stateful');
  }
  // Add language-specific tags based on file extension
  if (fileExt === '.py') {
    tags.add('Python');
  } else if (fileExt === '.cs') {
    tags.add('C#');
  } else if (fileExt === '.jsx' || fileExt === '.tsx') {
    tags.add('UI Script');
  }
  // Return first 4 tags to avoid cluttering synopsis
  return Array.from(tags).slice(0, 4);
}

// ============================================================================
// SECTION 10: STRING FORMATTING UTILITIES
// ============================================================================

/**
 * toTitleCase
 *
 * Purpose: Convert filename tokens into a human-readable feature name.
 * Behavior:
 * - Splits the input on hyphens, underscores, and whitespace, then capitalizes each segment.
 * Parameters:
 * - {string} value: Filename stem or raw identifier.
 * Returns: string
 */
function toTitleCase(value) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

// ============================================================================
// SECTION 11: PATH CONSTRUCTION
// ============================================================================

/**
 * buildRelativePath
 *
 * Purpose: Reconstruct a relative file path from distributed CSV columns.
 * Behavior:
 * - Collects non-empty segments preceding the TYPE column and folds them with `path.join`.
 * Parameters:
 * - {string[]} row: CSV row containing path segments.
 * - {number} typeIndex: Index of the TYPE column.
 * Returns: string
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
  return segments.reduce((acc, segment) => (acc ? path.join(acc, segment) : segment), '');
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

// ============================================================================
// SECTION 12: FILE FILTERING
// ============================================================================

/**
 * shouldSkipFeatureExtraction
 *
 * Purpose: Exclude binary and image assets from feature synopsis generation.
 * Behavior:
 * - Checks the file extension against a deny-list of non-code formats.
 * Parameters:
 * - {string} ext: File extension including the leading dot.
 * Returns: boolean
 */
function shouldSkipFeatureExtraction(ext) {
  const excluded = new Set(['.jpg', '.jpeg', '.png', '.gif', '.psd', '.pdb', '.bmp', '.tiff', '.tif', '.webp']);
  return excluded.has(ext);
}

// ============================================================================
// SECTION 13: COMMENT EXTRACTION
// ============================================================================

/**
 * extractCommentSnippet
 *
 * Purpose: Retrieve a concise documentation snippet from the head of a source file.
 * Behavior:
 * - Reads the file, extracts a language-appropriate comment block, cleans it, and truncates to 160 characters.
 * - Returns an empty string when the file is unreadable or lacks comments.
 * Parameters:
 * - {string} filePath: Absolute path to the source file.
 * - {string} ext: File extension used to select comment patterns.
 * Returns: Promise<string>
 */
async function extractCommentSnippet(filePath, ext) {
  try {
    const source = await fs.readFile(filePath, 'utf8');
    const rawSnippet = extractCommentSnippetFromSource(source, ext);
    return rawSnippet ? shortenText(rawSnippet, 160) : '';
  } catch {
    return '';
  }
}

/**
 * extractCommentSnippetFromSource
 *
 * Purpose: Isolate the most representative comment block from in-memory source text.
 * Behavior:
 * - Removes any leading BOM, inspects the first 5 KB, and tests pattern variants in priority order.
 * - Cleans the first matching comment and returns an empty string when none are found.
 * Parameters:
 * - {string} source: Full source text.
 * - {string} ext: File extension for language awareness.
 * Returns: string
 */
function extractCommentSnippetFromSource(source, ext) {
  // Remove UTF-8 Byte Order Mark if present
  const trimmed = source.replace(/^\uFEFF/, '');
  // Only examine first 5KB for performance
  const head = trimmed.slice(0, 5000);
  // Get language-specific comment patterns
  const patterns = buildCommentPatterns(ext);
  for (const pattern of patterns) {
    const match = head.match(pattern);
    if (match && match[0]) {
      return cleanComment(match[0]);
    }
  }
  return '';
}

/**
 * buildCommentPatterns
 *
 * Purpose: Provide ordered regex patterns suited to the comment syntax of a given language.
 * Behavior:
 * - Returns language-specific pattern sets prioritising leading block and line comments before fallbacks.
 * Parameters:
 * - {string} ext: File extension (for example `.js`, `.py`).
 * Returns: RegExp[]
 */
function buildCommentPatterns(ext) {
  const jsLike = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.cs', '.css'];
  if (jsLike.includes(ext)) {
    return [
      /^\s*\/\*\*?[\s\S]*?\*\//,
      /^\s*(?:\/\/[^\n]*\n?){1,8}/,
      /\/\*\*?[\s\S]*?\*\//,
      /\/\/[^\n]+/,
    ];
  }
  if (ext === '.py') {
    return [
      /^\s*(?:'''[\s\S]*?'''|"""[\s\S]*?""")/,
      /^\s*(?:#[^\n]*\n?){1,12}/,
      /'''[\s\S]*?'''/,
      /"""[\s\S]*?"""/,
      /#[^\n]+/,
    ];
  }
  if (ext === '.html' || ext === '.htm' || ext === '.xml') {
    return [/^\s*<!--[\s\S]*?-->/, /<!--[\s\S]*?-->/];
  }
  return [
    /^\s*\/\*\*?[\s\S]*?\*\//,
    /^\s*(?:\/\/[^\n]*\n?){1,6}/,
    /^\s*(?:#[^\n]*\n?){1,6}/,
    /\/\*[\s\S]*?\*\//,
    /\/\/[^\n]+/,
    /#[^\n]+/,
  ];
}

/**
 * cleanComment
 *
 * Purpose: Normalise raw comment text into synopsis-friendly prose.
 * Behavior:
 * - Strips comment delimiters, removes decorative borders, trims lines, and collapses whitespace.
 * Parameters:
 * - {string} raw: Comment text including delimiters.
 * Returns: string
 */
function cleanComment(raw) {
  let text = raw;
  // Remove block comment delimiters
  text = text.replace(/^\/\*\*?/, '').replace(/\*\/$/, '');
  text = text.replace(/^<!--/, '').replace(/-->$/, '');
  text = text.replace(/^['"]{3}/, '').replace(/['"]{3}$/, '');
  // Remove line comment prefixes
  text = text.replace(/^\s*\/\/ ?/gm, '');
  text = text.replace(/^\s*# ?/gm, '');
  text = text.replace(/^\s*\* ?/gm, '');
  // Process each line to remove decoration
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) =>
      line
        .replace(/^[=\-_*#~]{3,}/, '')
        .replace(/[=\-_*#~]{3,}$/, '')
        .trim()
    );
  // Filter out empty lines and pure decoration
  const filtered = lines.filter((line) => {
    if (line.length === 0) {
      return false;
    }
    if (/^([=\-_*#~]{3,})$/.test(line)) {
      return false;
    }
    return true;
  });
  // Join lines and normalize whitespace
  return filtered.join(' ').replace(/\s+/g, ' ').trim();
}

// ============================================================================
// SECTION 14: SCRIPT EXECUTION
// ============================================================================

// Execute main function and handle any errors
// Errors are logged and cause process exit with code 1
main().catch((error) => {
  console.error('Feature synopsis extraction failed:', error.message);
  process.exit(1);
});
