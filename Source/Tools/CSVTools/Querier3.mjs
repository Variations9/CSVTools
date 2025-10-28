// ============================================================================
// STRUCTURE FINDER QUERY UTILITIES
// ============================================================================

// ============================================================================
// SECTION 1: TARGET KEY EXTRACTION
// ============================================================================
/**
 * extractKey
 *
 * Purpose: Resolves the key or category identifier that drives structure-focused lookups.
 *
 * Behavior:
 * - Prefers query.json.key when supplied via structured payloads
 * - Falls back to query.json.category for broader grouping requests
 * - Scans plain text for patterns like "key: value" or "key=value"
 * - Uses the fallback path (minus extension) when no explicit key is provided
 * - Returns an empty string when all sources are missing
 *
 * Parameters:
 * - query: { json?: { key?: unknown, category?: unknown }, text: string }
 * - fallback: string | undefined
 *
 * Returns: string containing the normalized key identifier (possibly empty)
 *
 * Key Features:
 * - Multi-source lookup: Supports structured JSON, loose text, and file path hints
 * - Regex capture: Extracts token-like identifiers without relying on full JSON parsing
 * - Defensive stringification: Safely converts values to strings before returning
 */
function extractKey(query, fallback) {
  if (query.json?.key) {
    return String(query.json.key);
  }
  if (query.json?.category) {
    return String(query.json.category);
  }
  const match = query.text.match(/key\s*[:=]\s*([a-z0-9_-]+)/i);
  if (match) {
    return match[1];
  }
  if (fallback) {
    return fallback.replace(/\.[^.]+$/, '');
  }
  return '';
}

// Ordered list of columns inspected for JSON-like snippets tied to data structures.
const STRUCTURE_COLUMNS = [
  'DATA FLOW / STATE MANAGEMENT',
  'INPUT SOURCES / OUTPUT DESTINATIONS',
  'QUERY RESULTS',
  'SIDE EFFECTS',
];

// ============================================================================
// SECTION 2: STRUCTURE FINDER MODULE
// ============================================================================
/**
 * structure-finder query module definition consumed by the CSV tooling runtime.
 *
 * Purpose: Detects JSON-like fragments across catalog rows to assist with data flow debugging.
 *
 * Key Features:
 * - Declares tool metadata (id and description)
 * - Provides activation logic via matches()
 * - Offers execution logic via run()
 */
export default {
  id: 'structure-finder',
  description: 'Surfaces JSON-like structures and schema hints for debugging data flow.',
  /**
   * matches
   *
   * Purpose: Determines whether the current query should be handled by the structure finder.
   *
   * Behavior:
   * - Activates when the JSON payload declares type === "structure"
   * - Recognizes free-form text requests mentioning "data structure" or "json"
   *
   * Parameters:
   * - context: { query: { json?: { type?: string }, text: string } }
   *
   * Returns: boolean indicating whether to execute the structure finder
   *
   * Key Features:
   * - Lightweight guard: Prevents unnecessary scans for unrelated queries
   * - Textual resilience: Supports plain-language requests outside JSON payloads
   */
  matches(context) {
    if (context.query.json?.type === 'structure') {
      return true;
    }
    const text = context.query.text.toLowerCase();
    return text.includes('data structure') || text.includes('json');
  },
  /**
   * run
   *
   * Purpose: Scans designated columns for JSON-like snippets matching the requested key and returns a summary report.
   *
   * Behavior:
   * - Resolves the target key using extractKey and normalizes to lowercase comparisons
   * - Confirms that the monitored columns exist within the CSV headers
   * - Iterates over each row and column to capture JSON-like content containing braces or brackets
   * - Filters snippets by the requested key when provided
   * - Limits the output to digestible snippet previews and indicates when additional results exist
   *
   * Parameters:
   * - context: {
   *     query: { json?: { key?: string, category?: string, type?: string }, text: string },
   *     rows: unknown[][],
   *     headers: string[],
   *     row: unknown[],
   *     getPath: (row: unknown[]) => string,
   *     getValue: (row: unknown[], header: string) => { trim: () => string },
   *     buildRowPath: (row: unknown[]) => string
   *   }
   *
   * Returns: string providing a formatted summary of matching snippets
   *
   * Key Features:
   * - Context-aware filtering: Honors requested keys without ignoring general structure scans
   * - Safe defaults: Handles missing columns and absent matches with actionable messaging
   * - Readable output: Produces structured lines suited for CLI consumption
   */
  run(context) {
    // Grab frequently used helpers and dataset references from the context.
    const { query, rows, headers, row, getPath, getValue } = context;
    // Resolve the target key or category, comparing everything in lowercase to simplify matching.
    const needle = extractKey(query, getPath(row)).toLowerCase();
    // Build the lookup table linking monitored column names to their index positions.
    const columnIndices = STRUCTURE_COLUMNS.map((name) => ({
      name,
      index: headers.findIndex((header) => header.trim().toUpperCase() === name),
    })).filter((entry) => entry.index >= 0);

    if (columnIndices.length === 0) {
      return 'structure-finder: The target columns are missing from the CSV.';
    }

    const matches = [];
    // Inspect every row and monitored column for JSON-like snippets referencing the key.
    rows.forEach((loopRow) => {
      columnIndices.forEach(({ name, index }) => {
        const value = (loopRow[index] ?? '').toString();
        if (!value.includes('{') && !value.includes('[')) {
          return;
        }
        if (needle && !value.toLowerCase().includes(needle)) {
          return;
        }
        matches.push({
          path: context.buildRowPath(loopRow),
          column: name,
          snippet: value.length > 160 ? `${value.slice(0, 157)}...` : value,
        });
      });
    });

    if (matches.length === 0) {
      return needle
        ? `structure-finder: No JSON-like snippets referencing "${needle}" were located.`
        : 'structure-finder: No JSON-like snippets were located in the monitored columns.';
    }

    // Compose the human-readable report summarizing discovered snippets.
    const lines = [];
    lines.push(
      `Structure scan${needle ? ` for "${needle}"` : ''} (${matches.length} snippet${
        matches.length === 1 ? '' : 's'
      })`
    );
    matches.slice(0, 6).forEach((entry) => {
      lines.push(`- ${entry.path} (${entry.column})`);
      lines.push(`    ${entry.snippet}`);
    });
    if (matches.length > 6) {
      lines.push(`- ... +${matches.length - 6} additional snippet(s)`);
    }

    const rowSummary = getValue(row, 'SUMMARY').trim();
    if (rowSummary) {
      // Surface the active row's summary for quick context.
      lines.push('');
      lines.push(`Row summary: ${rowSummary}`);
    }

    return lines.join('\n');
  },
};
