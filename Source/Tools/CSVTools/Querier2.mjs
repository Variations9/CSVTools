// ============================================================================
// LINKAGE QUERY UTILITIES
// ============================================================================

// ============================================================================
// SECTION 1: TARGET RESOLUTION HELPERS
// ============================================================================
/**
 * extractTarget
 *
 * Purpose: Derives the canonical lookup identifier from the inbound query or fallback path.
 *
 * Behavior:
 * - Prefers query.json.target when present
 * - Falls back to query.json.feature before scanning raw query text
 * - Searches free-form text for node identifiers shaped like "n###"
 * - Uses fallback file path (minus extension) when no explicit target is provided
 * - Ensures the final target is always coerced to a string
 *
 * Parameters:
 * - query: { json?: { target?: unknown, feature?: unknown }, text: string }
 * - fallback: string | undefined
 *
 * Returns: string representing the resolved target identifier (may be empty when unavailable)
 *
 * Key Features:
 * - Multi-source resolution: Supports JSON payloads, textual hints, and file paths
 * - Safe string coercion: Converts any supplied value to a string before returning
 * - Defensive search: Regex fallback covers unstructured commands like "link n44"
 */
function extractTarget(query, fallback) {
  if (query.json?.target) {
    return String(query.json.target);
  }
  if (query.json?.feature) {
    return String(query.json.feature);
  }
  const match = query.text.match(/n\d+/i);
  if (match) {
    return match[0];
  }
  if (fallback) {
    return fallback.replace(/\.[^.]+$/, '');
  }
  return '';
}

// Ordered list of column labels scanned for potential linkage evidence.
const COLUMN_NAMES = [
  'DEPENDENCIES',
  'INPUT SOURCES / OUTPUT DESTINATIONS',
  'SIDE EFFECTS',
  'DATA FLOW / STATE MANAGEMENT',
  'FUNCTIONS',
  'ORDER_OF_OPERATIONS',
  'SUMMARY',
];

// ============================================================================
// SECTION 2: TOKENIZATION AND DATA QUALITY HELPERS
// ============================================================================
/**
 * buildTokenSet
 *
 * Purpose: Builds a normalized token registry used to detect linkage references across CSV columns.
 *
 * Behavior:
 * - Seeds the token set with the resolved target identifier
 * - Incorporates any explicit tokens supplied with the original query payload
 * - Inspects query text and file paths to infer grid-related keywords
 * - Augments the token set with a specialized grid vocabulary when appropriate
 * - Stores tokens in lowercase to ensure case-insensitive matching
 *
 * Parameters:
 * - query: { json?: { tokens?: unknown[] }, text: string }
 * - target: string
 * - fallbackPath: string | undefined
 *
 * Returns: Set<string> containing lowercase tokens to match against column data
 *
 * Key Features:
 * - Context-aware enrichment: Automatically extends matches for grid/layout-centric nodes
 * - Duplicate prevention: Utilizes Set semantics to eliminate repeated tokens
 * - Flexible ingestion: Accepts arbitrary token input and gracefully ignores falsy entries
 */
function buildTokenSet(query, target, fallbackPath) {
  const tokens = new Set();
  const push = (value) => {
    if (value) {
      tokens.add(value.toLowerCase());
    }
  };

  push(target);
  if (query.json?.tokens) {
    query.json.tokens.forEach((token) => push(String(token)));
  }

  const queryText = query.text.toLowerCase();
  const pathLower = (fallbackPath || '').toLowerCase();
  const looksLikeGrid =
    (target && target.toLowerCase().includes('grid')) ||
    queryText.includes('grid') ||
    queryText.includes('layout') ||
    pathLower.includes('grid');

  if (looksLikeGrid) {
    [
      'grid',
      'grid-system',
      'gridstate',
      'gridstatelog',
      'layout',
      'layoutbuilder',
      'uxpmenu',
      'uxpmenumanager',
      'customize',
      'dynamic-grid',
    ].forEach(push);
  }

  return tokens;
}

/**
 * collectColumnValue
 *
 * Purpose: Aggregates the text content of multiple CSV columns into a single normalized string.
 *
 * Behavior:
 * - Iterates through the column indices provided by the caller
 * - Extracts cell values from the supplied row, defaulting to empty strings when missing
 * - Coerces each value to lowercase string form
 * - Concatenates the normalized values using a space separator
 *
 * Parameters:
 * - row: unknown[]
 * - indices: Array<{ index: number }>
 *
 * Returns: string representing the combined lowercase column contents
 *
 * Key Features:
 * - Ready-to-match payload: Produces text that can be directly scanned by token sets
 * - Null-safe reads: Avoids runtime errors when columns are undefined
 * - Reusable helper: Intended for future CSV query modules needing multi-column comparison
 */
function collectColumnValue(row, indices) {
  return indices
    .map(({ index }) => (row[index] ?? '').toString().toLowerCase())
    .join(' ');
}

/**
 * analyzeMissingData
 *
 * Purpose: Flags metadata gaps in key documentation columns to surface follow-up actions.
 *
 * Behavior:
 * - Locates ORDER_OF_OPERATIONS, DATA FLOW, and SIDE EFFECTS column positions
 * - Checks each targeted column for missing or whitespace-only entries
 * - Compiles human-readable warnings describing the absent metadata
 *
 * Parameters:
 * - row: unknown[]
 * - headers: string[]
 *
 * Returns: string[] containing standardized descriptions of missing column data
 *
 * Key Features:
 * - Audit support: Highlights incomplete catalog rows while scanning for linkages
 * - Header-driven logic: Uses header text to avoid coupling to column order
 * - Modular design: Reusable in other CSV-powered diagnostics
 */
function analyzeMissingData(row, headers) {
  const problems = [];
  const orderIndex = headers.findIndex(
    (header) => header.trim().toUpperCase() === 'ORDER_OF_OPERATIONS'
  );
  const dataFlowIndex = headers.findIndex(
    (header) => header.trim().toUpperCase() === 'DATA FLOW / STATE MANAGEMENT'
  );
  const sideEffectsIndex = headers.findIndex(
    (header) => header.trim().toUpperCase() === 'SIDE EFFECTS'
  );

  if (orderIndex >= 0 && !(row[orderIndex] ?? '').trim()) {
    problems.push('missing ORDER_OF_OPERATIONS');
  }
  if (dataFlowIndex >= 0 && !(row[dataFlowIndex] ?? '').trim()) {
    problems.push('missing DATA FLOW summary');
  }
  if (sideEffectsIndex >= 0 && !(row[sideEffectsIndex] ?? '').trim()) {
    problems.push('missing SIDE EFFECTS flag');
  }
  return problems;
}

// ============================================================================
// SECTION 3: LINKAGE QUERY EXECUTION
// ============================================================================
/**
 * Exported linkage query definition consumed by the CSV tooling runtime.
 *
 * Purpose: Provides identification, matching, and execution logic for cross-row linkage scans.
 *
 * Key Features:
 * - Declares unique solver ID and textual description
 * - Supplies a match predicate to activate the solver on demand
 * - Implements the run routine that aggregates linkage insights and suggestions
 */
export default {
  id: 'linkage',
  description: 'Maps all rows that reference a target feature or identifier.',
  /**
   * matches
   *
   * Purpose: Determines whether the current query context should route to the linkage solver.
   *
   * Behavior:
   * - Accepts explicit type === "linkage" requests
   * - Inspects free-form text for the keyword "linkage" or node identifiers like "n44"
   *
   * Parameters:
   * - context: { query: { json?: { type?: string }, text: string } }
   *
   * Returns: boolean indicating solver eligibility
   *
   * Key Features:
   * - Lightweight gatekeeper: Avoids unnecessary scanning work for unrelated queries
   * - Regex support: Captures short node references embedded in plain text
   */
  matches(context) {
    if (context.query.json?.type === 'linkage') {
      return true;
    }
    const text = context.query.text.toLowerCase();
    return text.includes('linkage') || /n\d+/i.test(text);
  },
  /**
   * run
   *
   * Purpose: Executes the linkage scan, correlating CSV rows that reference a target node and surfacing actionable insights.
   *
   * Behavior:
   * - Resolves the target identifier from query metadata or the active row path
   * - Constructs a context-aware token set to match against relevant CSV columns
   * - Iterates through every row to compile matched columns, dependency hints, and metadata gaps
   * - Summarizes findings, including dependency lists, missing documentation, and suggested follow-up tasks
   * - Includes the source row's SUMMARY field when available
   *
   * Parameters:
   * - context: {
   *     query: { json?: { type?: string, target?: string, tokens?: unknown[] }, text: string },
   *     rows: unknown[][],
   *     headers: string[],
   *     row: unknown[],
   *     getPath: (row: unknown[]) => string,
   *     getValue: (row: unknown[], header: string) => { trim: () => string },
   *     buildRowPath: (row: unknown[]) => string
   *   }
   *
   * Returns: string containing a multi-line human-readable report
   *
   * Key Features:
   * - Comprehensive reporting: Combines match counts, dependency coverage, and remediation tips
   * - Defensive fallbacks: Provides instructions when no target is supplied or no matches are found
   * - Scoped output: Trims long lists for concise CLI presentation while hinting at additional data
   */
  run(context) {
    // Extract frequently used helpers and data from the execution context.
    const { query, rows, headers, row, getPath, getValue } = context;
    // Resolve the main linkage target; abort with guidance when unavailable.
    const target = extractTarget(query, getPath(row));
    if (!target) {
      return 'linkage: Provide a target (e.g., {"type":"linkage","target":"n44"}).';
    }
    // Build the token inventory that will drive column-level fuzzy matching.
    const tokens = buildTokenSet(query, target, getPath(row));
    // Map each monitored column name to its index for fast lookup during the scan.
    const columnIndices = COLUMN_NAMES.map((name) => ({
      name,
      index: headers.findIndex((header) => header.trim().toUpperCase() === name),
    })).filter((entry) => entry.index >= 0);

    // Accumulate linkage hits, dependencies, and metadata issues for downstream reporting.
    const matches = [];
    const dependencyIndex = headers.findIndex(
      (header) => header.trim().toUpperCase() === 'DEPENDENCIES'
    );
    const dependencySet = new Set();

    const problemMap = new Map();
    // Walk every catalog row to capture columns referencing the target or related tokens.
    rows.forEach((loopRow) => {
      let matchedColumns = [];
      columnIndices.forEach(({ name, index }) => {
        const value = (loopRow[index] ?? '').toString();
        const lower = value.toLowerCase();
        const matchesToken = Array.from(tokens).some((token) =>
          lower.includes(token)
        );
        if (matchesToken) {
          matchedColumns.push(name);
        }
      });
      if (matchedColumns.length === 0) {
        return;
      }
      const loopPath = context.buildRowPath(loopRow);
      matches.push({ path: loopPath, columns: matchedColumns });
      const problems = analyzeMissingData(loopRow, headers);
      if (problems.length > 0) {
        problemMap.set(loopPath, problems);
      }
      if (dependencyIndex >= 0) {
        const dependencies = (loopRow[dependencyIndex] ?? '').split(/\s*;\s*/);
        dependencies
          .filter(Boolean)
          .forEach((entry) => dependencySet.add(entry.trim()));
      }
    });

    if (matches.length === 0) {
      return `linkage: No references to "${target}" were detected across the monitored columns.`;
    }

    // Assemble the human-readable report that will be returned to the CLI.
    const lines = [];
    lines.push(
      `Linkage scan for "${target}" (${matches.length} file(s)); tokens: ${Array.from(
        tokens
      ).join(', ')}`
    );
    matches.slice(0, 8).forEach((entry) => {
      lines.push(`- ${entry.path}`);
      lines.push(`    columns: ${entry.columns.join(', ')}`);
    });
    if (matches.length > 8) {
      lines.push(`- ... +${matches.length - 8} additional file(s)`);
    }

    if (dependencySet.size > 0) {
      // Enumerate related dependencies so downstream tooling can verify cross-file integrity.
      lines.push('');
      lines.push('Related dependencies:');
      Array.from(dependencySet)
        .slice(0, 10)
        .forEach((dependency) => lines.push(`    - ${dependency}`));
      if (dependencySet.size > 10) {
        lines.push(`    - ... +${dependencySet.size - 10} more`);
      }
    }

    const problemEntries = Array.from(problemMap.entries());
    if (problemEntries.length > 0) {
      // Highlight rows that are missing required catalog metadata.
      lines.push('');
      lines.push('Potential gaps:');
      problemEntries.slice(0, 6).forEach(([pathLabel, issues]) => {
        lines.push(`- ${pathLabel}: ${issues.join(', ')}`);
      });
      if (problemEntries.length > 6) {
        lines.push(`- ... +${problemEntries.length - 6} additional file(s) with missing metadata`);
      }
    }

    const suggestions = [];
    const gridMatches = matches.filter((entry) =>
      /grid|layout|customize|uxpmenu/i.test(entry.path)
    );
    if (gridMatches.length > 0) {
      suggestions.push(
        `Grid/Layout coverage spans ${gridMatches.length} file(s); ensure their ORDER and DATA FLOW columns are filled so the automation can trace execution.`
      );
    }
    if (dependencySet.has('./gridStateLog.json')) {
      suggestions.push(
        'gridStateLog.json is referenced; confirm it stays in sync with Customize/UXPMenuManager modules.'
      );
    }
    if (problemEntries.some(([, list]) => list.includes('missing SIDE EFFECTS flag'))) {
      suggestions.push(
        'One or more nodes lack SIDE EFFECTS metadata. Run `updateSideEffects.mjs` to flag risky IO that might affect the dynamic grid.'
      );
    }
    if (suggestions.length > 0) {
      lines.push('');
      lines.push('Suggested next steps:');
      suggestions.forEach((tip) => lines.push(`- ${tip}`));
    }

    const rowSummary = getValue(row, 'SUMMARY').trim();
    if (rowSummary) {
      // Provide quick visibility into the current row's summary for context.
      lines.push('');
      lines.push(`Row summary: ${rowSummary}`);
    }

    return lines.join('\n');
  },
};
