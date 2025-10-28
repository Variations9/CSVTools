// QUERIER1 - FEATURE-MODE COMPARISON TRAVERSER

// Regular expression to extract mode identifiers from query text
// Matches patterns like "mode A", "mode F", "mode default"
// Global and case-insensitive flags allow multiple mode extractions
const MODE_REGEX = /mode\s+([a-z0-9_-]+)/gi;

// ============================================================
// FEATURE EXTRACTION
// ============================================================

/**
 * Extracts feature identifier from query
 * 
 * Purpose: Determines which feature to analyze by checking query structure and fallback path
 * 
 * Extraction Strategy (priority order):
 * 1. JSON query with "feature" property: {"type":"feature-mode","feature":"N44"}
 * 2. Text pattern matching: "feature N44" or "feature grid-system"
 * 3. Fallback to file path: Strips extension from filename
 * 
 * Features:
 * - Supports structured JSON queries
 * - Supports natural language queries
 * - Falls back to context-based inference
 * - Removes file extensions from fallback values
 * 
 * @param {Object} query - Parsed query object (from parseQueryCell)
 * @param {string} fallback - Fallback path (usually current file path)
 * @returns {string} Extracted feature identifier or empty string
 */
function extractFeature(query, fallback) {
  // Check JSON query format first
  if (query.json?.feature) {
    return String(query.json.feature);
  }
  // Check text pattern: "feature <identifier>"
  const match = query.text.match(/feature\s+([a-z0-9_-]+)/i);
  if (match) {
    return match[1];
  }
  // Fall back to filename without extension
  if (fallback) {
    return fallback.replace(/\.[^.]+$/, '');
  }
  return '';
}

// ============================================================
// MODE EXTRACTION
// ============================================================

/**
 * Extracts all mode identifiers from query
 * 
 * Purpose: Identifies which modes to compare for the feature analysis
 * 
 * Extraction Strategy (priority order):
 * 1. JSON query with "modes" array: {"type":"feature-mode","modes":["A","F"]}
 * 2. Text pattern matching: Multiple "mode X" occurrences in query text
 * 
 * Features:
 * - Supports multiple mode extraction from single query
 * - Handles both JSON array and text patterns
 * - Returns array even for single mode (consistency)
 * - Resets regex state between uses to prevent position bugs
 * 
 * @param {Object} query - Parsed query object (from parseQueryCell)
 * @returns {Array<string>} Array of mode identifiers (may be empty)
 */
function extractModes(query) {
  // Check JSON query format first
  if (Array.isArray(query.json?.modes) && query.json.modes.length > 0) {
    return query.json.modes.map(String);
  }
  // Extract all mode patterns from text using regex
  const matches = [];
  let result;
  while ((result = MODE_REGEX.exec(query.text)) !== null) {
    matches.push(result[1]);
  }
  return matches;
}

// ============================================================
// TEXT COLLECTION
// ============================================================

/**
 * Collects and concatenates text from multiple CSV columns
 * 
 * Purpose: Gathers searchable text content from specified columns for pattern matching
 * 
 * Features:
 * - Handles null/undefined values gracefully
 * - Converts all values to lowercase for case-insensitive matching
 * - Joins multiple columns with space separator
 * - Returns single normalized string for easy searching
 * 
 * @param {Array} row - CSV row data array
 * @param {Array<number>} indices - Array of column indices to collect
 * @returns {string} Concatenated lowercase text from all specified columns
 */
function collectText(row, indices) {
  return indices
    .map((index) => ((row[index] ?? '').toString().toLowerCase()))
    .join(' ');
}

// ============================================================
// FEATURE-MODE TRAVERSER IMPLEMENTATION
// ============================================================

/**
 * Feature-Mode Comparison Traverser
 * 
 * Purpose: Compares how a feature behaves across different modes by scanning
 *          the codebase for files that reference both the feature and specific modes
 * 
 * Use Cases:
 * - Query: "feature N44 mode A mode F" - Compare N44 implementation in mode A vs mode F
 * - Query: {"type":"feature-mode","feature":"grid","modes":["default","custom"]}
 * 
 * Delegation Pattern:
 * - matches(context): Returns true if query contains both "feature" and "mode" keywords
 * - run(context): Executes feature-mode analysis and returns formatted results
 * 
 * Analysis Strategy:
 * 1. Extract feature identifier and mode list from query
 * 2. Scan all rows for files containing feature token
 * 3. Categorize files by which modes they reference
 * 4. Generate report showing file distribution across modes
 * 
 * Search Columns:
 * - SUMMARY: High-level file description
 * - FUNCTIONS: List of functions defined in file
 * - ORDER_OF_OPERATIONS: Call sequence documentation
 */
export default {
  // Traverser identifier for logging and debugging
  id: 'feature-mode',
  // Human-readable description of traverser purpose
  description: 'Compares how a feature behaves across different modes.',
  /**
   * Determines if this traverser should handle the query
   * 
   * Matching Logic:
   * - JSON queries with type="feature-mode"
   * - Text queries containing both "feature" and "mode" keywords
   * 
   * @param {Object} context - Query context with query object
   * @returns {boolean} True if traverser should handle query
   */
  matches(context) {
    // Check for explicit JSON type designation
    if (context.query.json?.type === 'feature-mode') {
      return true;
    }
    // Check for keyword presence in text query
    const text = context.query.text.toLowerCase();
    return text.includes('feature') && text.includes('mode');
  },
  /**
   * Executes feature-mode analysis and generates results
   * 
   * Workflow:
   * 1. Extract feature identifier (with fallback to current file path)
   * 2. Extract mode list (defaults to ["default"] if none specified)
   * 3. Identify searchable columns (SUMMARY, FUNCTIONS, ORDER_OF_OPERATIONS)
   * 4. Scan all rows for files containing feature token
   * 5. Categorize files into mode-specific buckets
   * 6. Track files that reference feature but no specific mode
   * 7. Generate formatted report with file counts and listings
   * 
   * Result Format:
   * - Header: Feature name and mode list
   * - Per-mode sections: File count and file list (up to 5 shown, rest counted)
   * - General references: Files mentioning feature without mode context
   * - Current row summary: SUMMARY column content for context
   * 
   * @param {Object} context - Complete query context with row data and helpers
   * @returns {string} Formatted multi-line report text
   */
  run(context) {
    const { query, rows, headers, row, getPath, getValue } = context;
    // Extract feature identifier with fallback to current file
    const feature = extractFeature(query, getPath(row));
    if (!feature) {
      return 'feature-mode: Provide a feature name (e.g., {"type":"feature-mode","feature":"N44","modes":["A","F"]}).';
    }
    // Extract mode list with default fallback
    const modes = extractModes(query);
    if (modes.length === 0) {
      modes.push('default');
    }
    // Prepare feature token for case-insensitive matching
    const featureToken = feature.toLowerCase();
    // Find indices of columns to search
    const summaryIndex = headers.findIndex((h) => h.trim().toUpperCase() === 'SUMMARY');
    const functionsIndex = headers.findIndex((h) => h.trim().toUpperCase() === 'FUNCTIONS');
    const orderIndex = headers.findIndex((h) => h.trim().toUpperCase() === 'ORDER_OF_OPERATIONS');
    const searchableIndices = [summaryIndex, functionsIndex, orderIndex].filter((index) => index >= 0);
    // Initialize data structures for categorization
    const buckets = new Map(); // mode -> array of file paths
    const otherMatches = [];    // files with feature but no mode reference
    // Scan all rows for feature and mode references
    rows.forEach((loopRow) => {
      // Collect searchable text from all relevant columns
      const content = collectText(loopRow, searchableIndices);
      // Skip rows that don't mention the feature
      if (!content.includes(featureToken)) {
        return;
      }
      // Get file path for this row
      const loopPath = context.buildRowPath(loopRow);
      let matchedAnyMode = false;
      // Check each mode for presence in content
      modes.forEach((mode) => {
        const modeToken = mode.toString().toLowerCase();
        if (content.includes(modeToken)) {
          matchedAnyMode = true;
          // Initialize bucket for this mode if needed
          if (!buckets.has(mode)) {
            buckets.set(mode, []);
          }
          buckets.get(mode).push(loopPath);
        }
      });
      // Track files that mention feature but no specific mode
      if (!matchedAnyMode) {
        otherMatches.push(loopPath);
      }
    });
    // Build formatted report
    const lines = [];
    lines.push(`Feature "${feature}" mode scan (${modes.join(', ')})`);
    // Add per-mode sections
    modes.forEach((mode) => {
      const list = buckets.get(mode) ?? [];
      if (list.length === 0) {
        lines.push(`- Mode ${mode}: no direct references found.`);
      } else {
        lines.push(`- Mode ${mode}: ${list.length} file(s)`);
        // Show up to 5 files, indicate if more exist
        list.slice(0, 5).forEach((file) => lines.push(`    • ${file}`));
        if (list.length > 5) {
          lines.push(`    • ... +${list.length - 5} more`);
        }
      }
    });
    // Add general references section if applicable
    if (otherMatches.length > 0) {
      lines.push(`- General references (mode not specified): ${otherMatches.length}`);
      otherMatches.slice(0, 5).forEach((file) => lines.push(`    • ${file}`));
    }
    // Add current row summary for context
    const rowSummary = getValue(row, 'SUMMARY').trim();
    if (rowSummary) {
      lines.push('');
      lines.push(`Row summary: ${rowSummary}`);
    }
    return lines.join('\n');
  },
};
