// C# ANALYSIS - Static code analysis utilities for C# source files

// ============================================================================
// SECTION 1: PATTERN DEFINITIONS - Keywords and API Patterns
// ============================================================================

// Control flow keywords that should be ignored when identifying method calls
// These are language constructs, not actual method invocations
const SKIP_CALL_NAMES = new Set([
  'if',
  'else',
  'for',
  'foreach',
  'while',
  'switch',
  'case',
  'default',
  'do',
  'try',
  'catch',
  'finally',
  'using',
  'lock',
  'checked',
  'unchecked',
  'fixed',
  'typeof',
  'nameof',
  'sizeof',
  'new',
]);

// File system read operations from System.IO namespace
// Used to detect file input operations in code
const FILE_READ_CALLS = [
  'File.ReadAllText',
  'File.ReadAllLines',
  'File.ReadAllBytes',
  'File.OpenRead',
  'File.OpenText',
  'File.Exists',
  'FileInfo.OpenRead',
  'FileStream.Read',
  'Directory.GetFiles',
  'Directory.GetDirectories',
  'Directory.EnumerateFiles',
  'Directory.EnumerateDirectories',
  'Directory.Exists',
];

// File system write operations from System.IO namespace
// Used to detect file output and modification operations
const FILE_WRITE_CALLS = [
  'File.WriteAllText',
  'File.WriteAllLines',
  'File.WriteAllBytes',
  'File.AppendAllText',
  'File.AppendAllLines',
  'File.AppendText',
  'File.OpenWrite',
  'File.Create',
  'File.CreateText',
  'File.Copy',
  'File.Move',
  'File.Delete',
  'FileStream.Write',
  'Directory.CreateDirectory',
  'Directory.Delete',
  'Directory.Move',
];

// Console input methods that indicate user interaction
const CONSOLE_INPUT_CALLS = ['Console.ReadLine', 'Console.ReadKey', 'Console.Read'];

// Logging and console output methods
// Used to detect log emission and console output operations
const LOG_CALLS = [
  'Console.WriteLine',
  'Console.Write',
  'Console.Error.WriteLine',
  'Console.Error.Write',
  'Debug.WriteLine',
  'Debug.Write',
  'Trace.WriteLine',
  'Trace.Write',
];

// Legacy WebClient read operations (pre-HttpClient)
const WEBCLIENT_READ_CALLS = [
  'WebClient.DownloadString',
  'WebClient.DownloadData',
  'WebClient.OpenRead',
];

// Legacy WebClient write operations (pre-HttpClient)
const WEBCLIENT_WRITE_CALLS = [
  'WebClient.UploadString',
  'WebClient.UploadData',
  'WebClient.UploadValues',
];

// Legacy HttpWebRequest operations
const HTTP_WEB_REQUEST_CALLS = ['HttpWebRequest.Create', 'HttpWebRequest.GetResponse'];

// Regex patterns for modern logging frameworks
// Each pattern has a regex and a label for categorization
const LOGGER_REGEXES = [
  { regex: /\bILogger\w*\s*\.\s*Log(?:Trace|Debug|Information|Warning|Error|Critical)?\s*\(/g, label: 'ILogger.Log' },
  { regex: /\blogger\s*\.\s*Log(?:Trace|Debug|Information|Warning|Error|Critical)\s*\(/gi, label: 'ILogger.Log' },
];

// Regex patterns for configuration access patterns
// Detects environment variables, ConfigurationManager, IConfiguration, and IOptions
const CONFIG_REGEXES = [
  { regex: /\bEnvironment\.GetEnvironmentVariable\s*\(/g, label: 'Environment.GetEnvironmentVariable' },
  { regex: /\bConfigurationManager\.[A-Za-z_][A-Za-z0-9_]*/g, label: 'ConfigurationManager' },
  { regex: /\bIConfiguration\s*\[/g, label: 'IConfiguration[indexer]' },
  { regex: /\bIOptions(?:Monitor|Snapshot)?<[A-Za-z_][A-Za-z0-9_<>,\s]*>\s*\./g, label: 'IOptions' },
];

// Pattern to detect static field declarations
// Captures field name from static field declarations (with or without readonly)
const STATIC_FIELD_REGEX =
  /\bstatic\s+(?:readonly\s+)?[A-Za-z_][A-Za-z0-9_<>,\[\]\s?]*\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|;)/g;

// Pattern to detect event subscriptions using += operator
// Captures the event name being subscribed to
const EVENT_SUBSCRIPTION_REGEX = /([A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*)\s*\+=/g;

// ============================================================================
// SECTION 2: CODE SANITIZATION
// ============================================================================

/**
 * Removes comments and optionally string literals from C# code.
 * 
 * Purpose: Prepares code for analysis by removing non-executable content
 * that could interfere with pattern matching.
 * 
 * Features:
 * - Removes single-line comments (//)
 * - Removes multi-line comments (slash-star ... star-slash) while preserving line breaks
 * - Handles string literals (both regular and verbatim @"" strings)
 * - Handles escape sequences in strings
 * - Optionally removes string content (replaced with spaces to preserve structure)
 * - Preserves line breaks for accurate line-based analysis
 * 
 * String handling:
 * - Regular strings: "text"
 * - Verbatim strings: @"text" or $@"text" or @$"text"
 * - Handles escaped quotes in verbatim strings ("")
 * - Handles escape sequences in regular strings (\n, \", etc.)
 * 
 * @param {string} code - C# source code to sanitize
 * @param {object} [options={}] - Configuration options
 * @param {boolean} [options.removeStrings=false] - If true, replace string contents with spaces
 * @returns {string} Sanitized code with comments removed
 */
export function sanitizeCSharpCode(code, options = {}) {
  const { removeStrings = false } = options;
  if (typeof code !== 'string' || code.length === 0) {
    return '';
  }
  let result = '';
  let i = 0;
  const length = code.length;
  let inString = false;
  let stringChar = '';
  let inVerbatim = false;
  while (i < length) {
    const char = code[i];
    const next = code[i + 1];
    if (!inString) {
      // Handle single-line comment
      if (char === '/' && next === '/') {
        i += 2;
        while (i < length && code[i] !== '\n' && code[i] !== '\r') {
          i += 1;
        }
        continue;
      }
      // Handle multi-line comment
      if (char === '/' && next === '*') {
        i += 2;
        while (i < length && !(code[i] === '*' && code[i + 1] === '/')) {
          // Preserve line breaks in result
          if (code[i] === '\n' || code[i] === '\r') {
            result += code[i];
            if (code[i] === '\r' && code[i + 1] === '\n') {
              result += '\n';
              i += 1;
            }
          }
          i += 1;
        }
        i += 2;
        continue;
      }
      // Detect start of string literal
      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
        const prev1 = code[i - 1];
        const prev2 = code[i - 2];
        // Detect verbatim string: @"", $@"", or @$""
        inVerbatim =
          char === '"' &&
          (prev1 === '@' || (prev1 === '$' && prev2 === '@') || (prev1 === '@' && prev2 === '$'));
        if (removeStrings) {
          if (char === '\n' || char === '\r') {
            result += char;
          } else {
            result += ' ';
          }
        } else {
          result += char;
        }
        i += 1;
        continue;
      }
      result += char;
      i += 1;
      continue;
    }
    // Inside a string literal
    if (!removeStrings) {
      result += char;
    } else if (char === '\n' || char === '\r') {
      result += char;
    } else {
      result += ' ';
    }
    // Handle verbatim string escape sequence (doubled quotes)
    if (inVerbatim) {
      if (char === '"' && code[i + 1] === '"') {
        if (!removeStrings) {
          result += '"';
        } else {
          result += ' ';
        }
        i += 2;
        continue;
      }
      // End of verbatim string
      if (char === '"') {
        inString = false;
        inVerbatim = false;
      }
      i += 1;
      continue;
    }
    // Handle escape sequences in regular strings
    if (char === '\\' && i + 1 < length) {
      if (!removeStrings) {
        result += code[i + 1];
      } else if (code[i + 1] === '\n' || code[i + 1] === '\r') {
        result += code[i + 1];
      } else {
        result += ' ';
      }
      i += 2;
      continue;
    }
    // End of regular string
    if (char === stringChar) {
      inString = false;
      inVerbatim = false;
    }
    i += 1;
  }
  return result;
}

// ============================================================================
// SECTION 3: METHOD EXTRACTION
// ============================================================================

/**
 * Extracts all method names defined in C# code.
 * 
 * Purpose: Identifies method declarations (not calls) for understanding
 * code structure and available functions.
 * 
 * Process:
 * 1. Sanitizes code to remove comments and strings
 * 2. Identifies class/struct/record names (for constructor detection)
 * 3. Processes code line-by-line to avoid catastrophic regex backtracking
 * 4. Matches method declaration patterns with modifiers
 * 5. Validates declarations by checking for opening brace or => arrow
 * 6. Identifies constructors by matching class names
 * 
 * Detection logic:
 * - Looks for access modifiers (public, private, etc.)
 * - Matches return type and method name
 * - Handles generic methods with type parameters
 * - Distinguishes declarations from calls by checking for { or =>
 * - Skips control flow keywords that look like method syntax
 * 
 * Performance:
 * - Processes line-by-line (max 500 chars per line) to prevent regex hangs
 * - Uses helper function to avoid deep recursion
 * - Safety limits on parenthesis matching depth
 * 
 * @param {string} code - C# source code to analyze
 * @returns {string[]} Sorted array of method names found in code
 */
export function extractCSharpMethodNames(code) {
  const sanitized = sanitizeCSharpCode(code);
  const methodNames = new Set();
  // First pass: identify all class/struct/record names for constructor detection
  const classNames = new Set();
  const classRegex = /\b(?:class|struct|record)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let classMatch = null;
  while ((classMatch = classRegex.exec(sanitized))) {
    classNames.add(classMatch[1]);
  }
  // Second pass: find method declarations line by line to avoid catastrophic backtracking
  const lines = sanitized.split(/\r?\n/);
  for (const line of lines) {
    // Skip very long lines that might cause issues (likely not method declarations)
    if (line.length > 500) {
      continue;
    }
    // Pattern matches: [modifiers] ReturnType MethodName(...) { or =>
    const methodPattern = /\b(?:public|protected|internal|private|static|virtual|override|sealed|async|partial|extern|unsafe|new)\b[\s\w<>,\[\]]*\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]{0,100}>)?\s*\(/g;
    let methodMatch = null;
    while ((methodMatch = methodPattern.exec(line))) {
      const candidateName = methodMatch[1];
      // Skip control flow keywords
      if (SKIP_CALL_NAMES.has(candidateName)) {
        continue;
      }
      // Check if the line looks like a method declaration (not a call)
      const afterMatch = line.substring(methodMatch.index + methodMatch[0].length);
      // Look for closing paren and then { or =>
      const closingParenIndex = findSimpleClosingParen(afterMatch);
      if (closingParenIndex !== -1) {
        const afterParen = afterMatch.substring(closingParenIndex + 1).trim();
        if (afterParen.startsWith('{') || afterParen.startsWith('=>')) {
          methodNames.add(candidateName);
        }
      }
    }
  }
  // Third pass: look for constructors (match class names)
  const constructorPattern = /\b(?:public|protected|internal|private)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let ctorMatch = null;
  while ((ctorMatch = constructorPattern.exec(sanitized))) {
    const name = ctorMatch[1];
    if (classNames.has(name)) {
      methodNames.add(name);
    }
  }
  return Array.from(methodNames).sort((a, b) => a.localeCompare(b));
}

/**
 * Helper: Finds the matching closing parenthesis with depth limiting.
 * 
 * Purpose: Safely locates closing paren without complex recursion.
 * 
 * Features:
 * - Tracks nesting depth of parentheses
 * - Limits maximum nesting depth to prevent issues with malformed code
 * - Limits search distance to prevent infinite loops
 * - Returns -1 if no valid closing paren found
 * 
 * Safety limits:
 * - maxDepth: 5 (prevents deeply nested structures)
 * - search range: 200 characters (prevents scanning entire files)
 * 
 * @param {string} text - Text to search (after opening paren)
 * @param {number} [maxDepth=5] - Maximum nesting depth allowed
 * @returns {number} Index of closing paren, or -1 if not found/too deep
 */
function findSimpleClosingParen(text, maxDepth = 5) {
  let depth = 1; // Start at 1 since we're after the opening paren
  let i = 0;
  while (i < text.length && i < 200) { // Limit search to prevent hangs
    const char = text[i];
    if (char === '(') {
      depth += 1;
      if (depth > maxDepth) return -1; // Too deeply nested
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
    i += 1;
  }
  return -1;
}

// ============================================================================
// SECTION 4: CALL ORDER EXTRACTION
// ============================================================================

/**
 * Extracts the sequence of method/function calls from C# code.
 * 
 * Purpose: Captures the order of function invocations for control flow
 * and dependency analysis.
 * 
 * Process:
 * 1. Sanitizes code with strings removed (prevents false matches in literals)
 * 2. Matches all patterns that look like method calls: Name(...)
 * 3. Filters out control flow keywords and property accessors
 * 4. Validates that calls are not actually method declarations
 * 5. Returns calls in the order they appear in source
 * 
 * Filtering logic:
 * - Skips control flow keywords (if, for, while, etc.)
 * - Skips method declarations (detected by {, =>, or 'where' clause)
 * - Skips indexer access (preceded by '[')
 * - Handles qualified names (Class.Method, obj.Method)
 * - Limits name segments to prevent runaway matching
 * 
 * Performance:
 * - Limits to 10,000 iterations to prevent infinite loops
 * - Limits name segments to 5 (prevents excessive backtracking)
 * - Limits generic type parameters to 100 chars
 * 
 * @param {string} code - C# source code to analyze
 * @returns {string[]} Array of method call names in order of appearance
 */
export function extractCSharpCallOrder(code) {
  const sanitized = sanitizeCSharpCode(code, { removeStrings: true });
  const calls = [];
  // Pattern matches: Name(...) or Qualified.Name(...) with optional generics
  const callRegex = /([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*){0,5})(?:<[^>]{0,100}>)?\s*\(/g;
  let match = null;
  let iterations = 0;
  const maxIterations = 10000; // Safety limit
  while ((match = callRegex.exec(sanitized)) && iterations < maxIterations) {
    iterations++;
    const fullName = match[1];
    const lastSegment = fullName.split('.').pop();
    // Skip control flow keywords
    if (!lastSegment || SKIP_CALL_NAMES.has(lastSegment)) {
      continue;
    }
    // Find the closing parenthesis of the call
    const openIndex = callRegex.lastIndex - 1;
    const closeIndex = findClosingParen(sanitized, openIndex);
    if (closeIndex === -1) {
      continue;
    }
    // Check what follows the closing paren to distinguish calls from declarations
    const afterIndex = skipWhitespace(sanitized, closeIndex + 1);
    if (afterIndex !== -1) {
      const nextChar = sanitized[afterIndex];
      const nextTwo = sanitized.slice(afterIndex, afterIndex + 2);
      const nextFive = sanitized.slice(afterIndex, afterIndex + 5).toLowerCase();
      // Skip if this is a method declaration (followed by {, =>, or 'where')
      if (nextChar === '{' || nextTwo === '=>' || nextFive.startsWith('where')) {
        continue;
      }
    }
    // Skip if this is an indexer access (preceded by '[')
    const beforeIndex = skipWhitespaceBackward(sanitized, match.index - 1);
    if (beforeIndex >= 0 && sanitized[beforeIndex] === '[') {
      continue;
    }
    calls.push(fullName);
  }
  return calls;
}

// ============================================================================
// SECTION 5: DEPENDENCY EXTRACTION
// ============================================================================

/**
 * Extracts namespace dependencies from C# using directives.
 * 
 * Purpose: Identifies external dependencies and imports used by the code.
 * 
 * Features:
 * - Detects standard using directives: using System.IO;
 * - Detects global using directives: global using System;
 * - Detects static using directives: using static System.Math;
 * - Detects using aliases: using File = System.IO.File;
 * 
 * Output format:
 * - Regular imports: "System.IO"
 * - Aliases: "File=System.IO.File"
 * 
 * Performance:
 * - Limits to 5,000 iterations to prevent infinite loops
 * 
 * @param {string} code - C# source code to analyze
 * @returns {Set<string>} Set of dependency strings (namespaces and aliases)
 */
export function extractCSharpDependencies(code) {
  const sanitized = sanitizeCSharpCode(code);
  const dependencies = new Set();
  // Pattern matches all forms of using directives
  const usingRegex =
    /^\s*(?:global\s+)?using\s+(?:static\s+)?(?:([A-Za-z_][A-Za-z0-9_]*)\s*=\s*)?([A-Za-z_][A-Za-z0-9_.]*)\s*;/gm;
  let match = null;
  let iterations = 0;
  const maxIterations = 5000;
  while ((match = usingRegex.exec(sanitized)) && iterations < maxIterations) {
    iterations++;
    const alias = match[1];
    const target = match[2];
    if (alias) {
      dependencies.add(`${alias}=${target}`);
    } else {
      dependencies.add(target);
    }
  }
  return dependencies;
}

// ============================================================================
// SECTION 6: DATA FLOW SUMMARIZATION
// ============================================================================

/**
 * Summarizes data flow characteristics of C# code.
 * 
 * Purpose: Provides high-level view of how code interacts with state,
 * storage, network, logging, and configuration.
 * 
 * Output format: "Category1{details} | Category2{details} | ..."
 * 
 * Categories detected:
 * - Globals: Static field declarations (writes to global state)
 * - Events: Event subscriptions using += operator
 * - Input: Console input operations
 * - Storage: File read/write operations
 * - Network: HTTP and WebClient operations
 * - Logs: Logging and console output
 * - Config: Configuration access (environment vars, IConfiguration, etc.)
 * - SharedState: Using directives (imported dependencies)
 * 
 * Delegation: Uses collectCSharpIoCategories and collectEventSubscriptions
 * 
 * @param {string} code - C# source code to analyze
 * @returns {string} Pipe-separated summary of data flow categories
 */
export function summarizeCSharpDataFlow(code) {
  const sanitized = sanitizeCSharpCode(code, { removeStrings: true });
  const globals = new Set();
  let staticMatch = null;
  let iterations = 0;
  const maxIterations = 5000;
  // Extract static field declarations (global state writes)
  STATIC_FIELD_REGEX.lastIndex = 0;
  while ((staticMatch = STATIC_FIELD_REGEX.exec(sanitized)) && iterations < maxIterations) {
    iterations++;
    globals.add(staticMatch[1]);
  }
  // Extract event subscriptions
  const events = collectEventSubscriptions(sanitized);
  // Categorize I/O operations
  const categories = collectCSharpIoCategories(sanitized);
  // Extract dependencies
  const dependencies = extractCSharpDependencies(code);
  const sharedState = new Set();
  dependencies.forEach((dep) => sharedState.add(`using:${dep}`));
  // Build summary segments
  const segments = [];
  if (globals.size) {
    segments.push(`Globals{write=[${Array.from(globals).sort().join(', ')}]}`);
  }
  if (events.size) {
    segments.push(`Events{subscribe=[${Array.from(events).sort().join(', ')}]}`);
  }
  if (categories.consoleRead.size) {
    segments.push(
      `Input{console=[${Array.from(categories.consoleRead).sort().join(', ')}]}`
    );
  }
  if (categories.fileRead.size || categories.fileWrite.size) {
    const parts = [];
    if (categories.fileRead.size) {
      parts.push(`read=[${Array.from(categories.fileRead).sort().join(', ')}]`);
    }
    if (categories.fileWrite.size) {
      parts.push(`write=[${Array.from(categories.fileWrite).sort().join(', ')}]`);
    }
    segments.push(`Storage{${parts.join('; ')}}`);
  }
  if (categories.networkRead.size || categories.networkWrite.size) {
    const parts = [];
    if (categories.networkRead.size) {
      parts.push(`read=[${Array.from(categories.networkRead).sort().join(', ')}]`);
    }
    if (categories.networkWrite.size) {
      parts.push(`write=[${Array.from(categories.networkWrite).sort().join(', ')}]`);
    }
    segments.push(`Network{${parts.join('; ')}}`);
  }
  if (categories.logs.size) {
    segments.push(`Logs{emit=[${Array.from(categories.logs).sort().join(', ')}]}`);
  }
  if (categories.configRead.size) {
    segments.push(`Config{read=[${Array.from(categories.configRead).sort().join(', ')}]}`);
  }
  if (sharedState.size) {
    segments.push(`SharedState{${Array.from(sharedState).sort().join(', ')}}`);
  }
  return segments.join(' | ');
}

// ============================================================================
// SECTION 7: I/O ANALYSIS
// ============================================================================

/**
 * Analyzes input/output operations in C# code.
 * 
 * Purpose: Categorizes all I/O operations as inputs or outputs with
 * specific type labels.
 * 
 * Output format:
 * - inputs: Set of "TYPE:operation" strings
 * - outputs: Set of "TYPE:operation" strings
 * 
 * Type prefixes:
 * - FILE: File system operations
 * - USER: Console/event user interactions
 * - LOG: Logging and console output
 * - NETWORK: HTTP and web operations
 * - CONFIG: Configuration reading
 * 
 * Delegation: Uses collectCSharpIoCategories and collectEventSubscriptions
 * 
 * @param {string} code - C# source code to analyze
 * @returns {{inputs: Set<string>, outputs: Set<string>}} Categorized I/O operations
 */
export function analyzeCSharpIO(code) {
  const sanitized = sanitizeCSharpCode(code, { removeStrings: true });
  const inputs = new Set();
  const outputs = new Set();
  // Collect all I/O categories
  const categories = collectCSharpIoCategories(sanitized);
  // Categorize as inputs or outputs with type prefixes
  categories.fileRead.forEach((name) => inputs.add(`FILE:${name}`));
  categories.fileWrite.forEach((name) => outputs.add(`FILE:${name}`));
  categories.consoleRead.forEach((name) => inputs.add(`USER:${name}`));
  categories.logs.forEach((name) => outputs.add(`LOG:${name}`));
  categories.networkRead.forEach((name) => inputs.add(`NETWORK:${name}`));
  categories.networkWrite.forEach((name) => outputs.add(`NETWORK:${name}`));
  categories.configRead.forEach((name) => inputs.add(`CONFIG:${name}`));
  // Event subscriptions are user inputs
  const events = collectEventSubscriptions(sanitized);
  events.forEach((evt) => inputs.add(`USER:${evt}`));
  return { inputs, outputs };
}

// ============================================================================
// SECTION 8: I/O CATEGORIZATION HELPERS
// ============================================================================

/**
 * Categorizes all I/O operations found in sanitized C# code.
 * 
 * Purpose: Internal helper that classifies I/O operations into specific
 * categories for data flow and I/O analysis.
 * 
 * Detection methods:
 * - Simple pattern matching for well-known API calls
 * - Regex matching for flexible patterns (loggers, config)
 * - Special handling for HttpClient (detects specific HTTP methods)
 * - Special handling for WebRequest patterns
 * 
 * Categories:
 * - fileRead: File.ReadAllText, Directory.GetFiles, etc.
 * - fileWrite: File.WriteAllText, Directory.CreateDirectory, etc.
 * - networkRead: WebClient.DownloadString, HttpClient.GetAsync, etc.
 * - networkWrite: WebClient.UploadData, HttpClient.PostAsync, etc.
 * - logs: Console.WriteLine, ILogger.Log, Debug.WriteLine, etc.
 * - configRead: Environment.GetEnvironmentVariable, IConfiguration, etc.
 * - consoleRead: Console.ReadLine, Console.ReadKey, etc.
 * 
 * @param {string} text - Sanitized C# code (comments and strings removed)
 * @returns {{
 *   fileRead: Set<string>,
 *   fileWrite: Set<string>,
 *   networkRead: Set<string>,
 *   networkWrite: Set<string>,
 *   logs: Set<string>,
 *   configRead: Set<string>,
 *   consoleRead: Set<string>
 * }} Categorized I/O operations
 */
function collectCSharpIoCategories(text) {
  const categories = {
    fileRead: new Set(),
    fileWrite: new Set(),
    networkRead: new Set(),
    networkWrite: new Set(),
    logs: new Set(),
    configRead: new Set(),
    consoleRead: new Set(),
  };
  // Collect simple API call patterns
  collectSimpleCalls(text, FILE_READ_CALLS, categories.fileRead);
  collectSimpleCalls(text, FILE_WRITE_CALLS, categories.fileWrite);
  collectSimpleCalls(text, CONSOLE_INPUT_CALLS, categories.consoleRead);
  collectSimpleCalls(text, LOG_CALLS, categories.logs);
  collectSimpleCalls(text, WEBCLIENT_READ_CALLS, categories.networkRead);
  collectSimpleCalls(text, WEBCLIENT_WRITE_CALLS, categories.networkWrite);
  collectSimpleCalls(text, HTTP_WEB_REQUEST_CALLS, categories.networkRead);
  // Collect regex-based patterns (flexible matching)
  collectRegexMatchesList(text, LOGGER_REGEXES, categories.logs);
  collectRegexMatchesList(text, CONFIG_REGEXES, categories.configRead);
  // Special handling for HttpClient (modern HTTP client)
  if (/\bHttpClient\b/.test(text) || /\bIHttpClientFactory\b/.test(text)) {
    if (/\.\s*GetAsync\s*\(/.test(text) || /\.\s*GetStringAsync\s*\(/.test(text)) {
      categories.networkRead.add('HttpClient.GetAsync');
    }
    if (/\.\s*PostAsync\s*\(/.test(text)) {
      categories.networkWrite.add('HttpClient.PostAsync');
    }
    if (/\.\s*PutAsync\s*\(/.test(text)) {
      categories.networkWrite.add('HttpClient.PutAsync');
    }
    if (/\.\s*DeleteAsync\s*\(/.test(text)) {
      categories.networkWrite.add('HttpClient.DeleteAsync');
    }
    if (/\.\s*SendAsync\s*\(/.test(text)) {
      categories.networkWrite.add('HttpClient.SendAsync');
    }
  }
  // Special handling for WebRequest (legacy HTTP)
  if (/\bWebRequest\b/.test(text) || /\bHttpWebRequest\b/.test(text)) {
    categories.networkRead.add('HttpWebRequest.Create');
  }
  return categories;
}

/**
 * Extracts event subscription patterns from C# code.
 * 
 * Purpose: Identifies event subscriptions using += operator, which
 * indicates user interaction points in GUI or event-driven code.
 * 
 * Pattern: object.EventName += handler
 * Extracts: "EventName"
 * 
 * Performance: Limits to 5,000 iterations to prevent infinite loops
 * 
 * @param {string} text - Sanitized C# code (comments and strings removed)
 * @returns {Set<string>} Set of event names being subscribed to
 */
function collectEventSubscriptions(text) {
  const events = new Set();
  let match = null;
  let iterations = 0;
  const maxIterations = 5000;
  EVENT_SUBSCRIPTION_REGEX.lastIndex = 0;
  while ((match = EVENT_SUBSCRIPTION_REGEX.exec(text)) && iterations < maxIterations) {
    iterations++;
    const full = match[1];
    const parts = full.split('.');
    const name = parts[parts.length - 1];
    if (name) {
      events.add(name);
    }
  }
  return events;
}

/**
 * Searches for exact API call patterns in code.
 * 
 * Purpose: Efficiently detects specific API calls by exact name matching.
 * 
 * Process:
 * - Escapes each pattern for use in regex
 * - Creates regex that matches pattern followed by opening paren
 * - Tests for presence and adds to target set if found
 * 
 * Example: "File.ReadAllText" → /\bFile\.ReadAllText\s*\(/
 * 
 * @param {string} text - Sanitized C# code (comments and strings removed)
 * @param {string[]} patterns - Array of exact API call patterns to find
 * @param {Set<string>} targetSet - Set to populate with found patterns
 * @returns {void}
 */
function collectSimpleCalls(text, patterns, targetSet) {
  patterns.forEach((pattern) => {
    const regex = new RegExp(`\\b${escapeRegex(pattern)}\\s*\\(`, 'g');
    if (regex.test(text)) {
      targetSet.add(pattern);
    }
  });
}

/**
 * Searches for flexible regex patterns in code.
 * 
 * Purpose: Detects API usage with flexible patterns that can match
 * variations (e.g., different logger method names).
 * 
 * Process:
 * - Tests each regex pattern against the code
 * - Adds the associated label (not the match) to target set
 * - Allows one pattern to represent multiple variations
 * 
 * Example: Logger pattern matches ILogger.LogInformation, ILogger.LogError, etc.
 * but all are labeled as "ILogger.Log"
 * 
 * @param {string} text - Sanitized C# code (comments and strings removed)
 * @param {Array<{regex: RegExp, label: string}>} descriptors - Pattern descriptors
 * @param {Set<string>} targetSet - Set to populate with labels of matched patterns
 * @returns {void}
 */
function collectRegexMatchesList(text, descriptors, targetSet) {
  descriptors.forEach(({ regex, label }) => {
    const tester = new RegExp(regex.source, regex.flags);
    if (tester.test(text)) {
      targetSet.add(label);
    }
  });
}

// ============================================================================
// SECTION 9: UTILITY HELPERS
// ============================================================================

/**
 * Escapes special regex characters in a string.
 * 
 * Purpose: Safely converts literal strings into regex patterns by escaping
 * all special regex metacharacters.
 * 
 * Escaped characters: . * + ? ^ $ { } ( ) | [ ] \
 * 
 * Example: "File.ReadAllText" → "File\\.ReadAllText"
 * 
 * @param {string} value - String to escape for regex use
 * @returns {string} Escaped string safe for use in regex pattern
 */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Skips forward over whitespace characters.
 * 
 * Purpose: Finds the next non-whitespace character position.
 * 
 * Behavior:
 * - Starts at given index
 * - Advances while encountering whitespace (\s)
 * - Returns index of first non-whitespace character
 * - Returns -1 if reached end of text
 * 
 * @param {string} text - Text to scan
 * @param {number} index - Starting position
 * @returns {number} Index of next non-whitespace char, or -1 if end reached
 */
function skipWhitespace(text, index) {
  let i = index;
  while (i < text.length && /\s/.test(text[i])) {
    i += 1;
  }
  return i >= text.length ? -1 : i;
}

/**
 * Skips backward over whitespace characters.
 * 
 * Purpose: Finds the previous non-whitespace character position.
 * 
 * Behavior:
 * - Starts at given index
 * - Moves backward while encountering whitespace (\s)
 * - Returns index of first non-whitespace character found
 * - Returns index unchanged if already at beginning
 * 
 * @param {string} text - Text to scan
 * @param {number} index - Starting position
 * @returns {number} Index of previous non-whitespace char
 */
function skipWhitespaceBackward(text, index) {
  let i = index;
  while (i >= 0 && /\s/.test(text[i])) {
    i -= 1;
  }
  return i;
}

/**
 * Finds the matching closing parenthesis with safety limits.
 * 
 * Purpose: Locates the closing paren for a given opening paren,
 * handling nested parentheses correctly.
 * 
 * Features:
 * - Tracks nesting depth
 * - Safety limit: stops after 50,000 iterations
 * - Returns -1 if no valid match found
 * 
 * Algorithm:
 * - Starts with depth 0 at opening paren
 * - Increments depth for each '('
 * - Decrements depth for each ')'
 * - Returns position when depth reaches 0
 * 
 * @param {string} text - Text to search
 * @param {number} openIndex - Position of opening parenthesis
 * @returns {number} Index of matching closing paren, or -1 if not found
 */
function findClosingParen(text, openIndex) {
  let depth = 0;
  let iterations = 0;
  const maxIterations = 50000; // Safety limit
  for (let i = openIndex; i < text.length && iterations < maxIterations; i += 1) {
    iterations++;
    const char = text[i];
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}
