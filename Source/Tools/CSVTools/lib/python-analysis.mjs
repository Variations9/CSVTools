// PYTHON CODE ANALYSIS MODULE
// Analyzes Python source code by spawning a Python interpreter and running an embedded AST analyzer

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

// =============================================================================
// SECTION 1: MODULE-LEVEL STATE AND CACHING
// =============================================================================

// Cache to store analysis results by file path
// Prevents redundant analysis of the same file
// Key format: absolute file path
// Value: complete analysis result object
const analysisCache = new Map();

// Singleton promise for Python executable resolution
// Ensures we only search for Python once, even with concurrent calls
// Null until first getPythonExecutable() call
let pythonExecutablePromise = null;

// =============================================================================
// SECTION 2: PUBLIC API - EXTRACTION FUNCTIONS
// =============================================================================

/**
 * Extract function names defined in Python source code.
 * 
 * Delegates to analyzePython() and returns the functions array.
 * Includes both top-level functions and methods (qualified with class names).
 * 
 * @param {string} source - Python source code to analyze
 * @param {string} filePath - Path to the Python file (for caching and error reporting)
 * @returns {Promise<string[]>} Array of function names (e.g., ["func1", "ClassName.method1"])
 */
export async function extractPythonFunctionNames(source, filePath) {
  const analysis = await analyzePython(source, filePath);
  return analysis.functions ?? [];
}

/**
 * Extract the order in which functions are called in Python source code.
 * 
 * Delegates to analyzePython() and returns the call_order array.
 * Records the sequence of function/method calls as they appear in the AST.
 * 
 * @param {string} source - Python source code to analyze
 * @param {string} filePath - Path to the Python file
 * @returns {Promise<string[]>} Array of called function names in order (e.g., ["print", "os.path.exists"])
 */
export async function extractPythonCallOrder(source, filePath) {
  const analysis = await analyzePython(source, filePath);
  return analysis.call_order ?? [];
}

/**
 * Extract import dependencies from Python source code.
 * 
 * Delegates to analyzePython() and returns the dependencies array.
 * Includes both module imports and from-imports with qualified names.
 * 
 * @param {string} source - Python source code to analyze
 * @param {string} filePath - Path to the Python file
 * @returns {Promise<string[]>} Array of dependency strings (e.g., ["os", "sys", "json.load"])
 */
export async function extractPythonDependencies(source, filePath) {
  const analysis = await analyzePython(source, filePath);
  return analysis.dependencies ?? [];
}

/**
 * Summarize data flow patterns in Python source code.
 * 
 * Delegates to analyzePython() and returns the data_flow summary string.
 * Describes global writes, storage operations, and shared state.
 * 
 * @param {string} source - Python source code to analyze
 * @param {string} filePath - Path to the Python file
 * @returns {Promise<string>} Data flow summary (e.g., "Globals{write=[x, y]} | Storage{read=[open]}")
 */
export async function summarizePythonDataFlow(source, filePath) {
  const analysis = await analyzePython(source, filePath);
  return analysis.data_flow ?? '';
}

/**
 * Analyze input/output operations in Python source code.
 * 
 * Delegates to analyzePython() and returns the io_summary string.
 * Categorizes I/O by type: FILE, NETWORK, CONFIG, USER, LOG.
 * 
 * @param {string} source - Python source code to analyze
 * @param {string} filePath - Path to the Python file
 * @returns {Promise<string>} I/O summary (e.g., "Inputs{FILE:open; USER:input} | Outputs{LOG:print}")
 */
export async function analyzePythonIO(source, filePath) {
  const analysis = await analyzePython(source, filePath);
  return analysis.io_summary ?? '';
}

/**
 * Summarize side effects in Python source code.
 * 
 * Delegates to analyzePython() and returns the side_effects summary string.
 * Returns "PURE" if no side effects detected, otherwise lists effect types.
 * Effect types: FILE:read, FILE:write, STATE:global, NETWORK, LOG, NON_DETERMINISTIC.
 * 
 * @param {string} source - Python source code to analyze
 * @param {string} filePath - Path to the Python file
 * @returns {Promise<string>} Side effects summary (e.g., "SideEffects{FILE:write; LOG:print}" or "PURE")
 */
export async function summarizePythonSideEffects(source, filePath) {
  const analysis = await analyzePython(source, filePath);
  return analysis.side_effects ?? '';
}

// =============================================================================
// SECTION 3: CORE ANALYSIS ORCHESTRATION
// =============================================================================

/**
 * Perform comprehensive analysis of Python source code.
 * 
 * Central function that coordinates the entire analysis process:
 * 1. Normalizes file path to absolute form
 * 2. Checks cache for previous analysis
 * 3. Reads source code from file if not provided
 * 4. Resolves Python executable
 * 5. Spawns Python process with embedded analyzer
 * 6. Caches and returns results
 * 
 * Features:
 * - Result caching by absolute file path
 * - Automatic file reading if source not provided
 * - Delegates to runPythonAnalyzer() for actual execution
 * 
 * @param {string} source - Python source code (null to read from file)
 * @param {string} filePath - Path to Python file (relative or absolute)
 * @returns {Promise<object>} Complete analysis object with all metrics
 */
async function analyzePython(source, filePath) {
  // Normalize to absolute path for consistent caching
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);
  const cacheKey = `${absolutePath}`;
  // Return cached result if available
  if (analysisCache.has(cacheKey)) {
    return analysisCache.get(cacheKey);
  }
  // Read source from file if not provided
  const code = source ?? (await fs.readFile(absolutePath, 'utf8'));
  // Ensure Python interpreter is available
  const python = await getPythonExecutable();
  // Run the analyzer and cache results
  const result = await runPythonAnalyzer(python, absolutePath, code);
  analysisCache.set(cacheKey, result);
  return result;
}

// =============================================================================
// SECTION 4: PYTHON EXECUTABLE RESOLUTION
// =============================================================================

/**
 * Get the Python executable command.
 * 
 * Singleton pattern: returns cached promise if already resolving/resolved.
 * On first call, initiates Python interpreter search.
 * Thread-safe for concurrent calls via promise reuse.
 * 
 * @returns {Promise<string>} Python command ('python3' or 'python')
 */
async function getPythonExecutable() {
  if (pythonExecutablePromise) {
    return pythonExecutablePromise;
  }
  pythonExecutablePromise = resolvePythonExecutable();
  return pythonExecutablePromise;
}

/**
 * Resolve which Python executable is available on the system.
 * 
 * Tries candidates in order of preference:
 * 1. 'python3' (preferred for modern systems)
 * 2. 'python' (fallback for systems without python3 symlink)
 * 
 * Validates each candidate by attempting to spawn it with a test import.
 * 
 * @returns {Promise<string>} First working Python command
 * @throws {Error} If no Python interpreter is found
 */
async function resolvePythonExecutable() {
  const candidates = ['python3', 'python'];
  for (const candidate of candidates) {
    try {
      await checkPythonExecutable(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }
  throw new Error(
    'Unable to locate a Python interpreter (python3 or python). Python support is required to analyze .py files.'
  );
}

/**
 * Check if a Python executable is available and working.
 * 
 * Spawns the command with a minimal test: 'import sys'
 * Success indicates a functional Python interpreter.
 * 
 * @param {string} command - Python command to test ('python3' or 'python')
 * @returns {Promise<void>} Resolves if command works, rejects otherwise
 */
function checkPythonExecutable(command) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, ['-c', 'import sys'], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    proc.once('error', reject);
    proc.once('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} returned ${code}`));
      }
    });
  });
}

// =============================================================================
// SECTION 5: PYTHON ANALYZER EXECUTION
// =============================================================================

/**
 * Run the embedded Python analyzer on source code.
 * 
 * Spawns a Python process that:
 * 1. Receives source code via stdin
 * 2. Executes the embedded analyzer script
 * 3. Parses the AST and extracts all metrics
 * 4. Returns JSON results via stdout
 * 
 * Process communication:
 * - stdin: Python source code to analyze
 * - stdout: JSON analysis results
 * - stderr: Error messages (if any)
 * 
 * Error handling:
 * - Process spawn errors
 * - Non-zero exit codes
 * - JSON parse failures
 * - Python parser errors (returned in JSON)
 * 
 * @param {string} pythonCommand - Python executable ('python3' or 'python')
 * @param {string} filePath - File path for error reporting
 * @param {string} code - Python source code to analyze
 * @returns {Promise<object>} Analysis results as JSON object
 */
async function runPythonAnalyzer(pythonCommand, filePath, code) {
  return new Promise((resolve, reject) => {
    // Spawn Python with embedded analyzer script
    // Args: ['-c', PYTHON_ANALYZER_SOURCE, filePath]
    const proc = spawn(
      pythonCommand,
      ['-c', PYTHON_ANALYZER_SOURCE, filePath],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );
    let stdout = '';
    let stderr = '';
    // Collect stdout (JSON results)
    proc.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    // Collect stderr (error messages)
    proc.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    // Handle process spawn errors
    proc.once('error', (error) => {
      reject(error);
    });
    // Handle process completion
    proc.once('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Python analyzer failed with exit code ${code}: ${stderr.trim()}`
          )
        );
        return;
      }
      try {
        // Parse JSON output
        const parsed = JSON.parse(stdout || '{}');
        // Check for Python-side errors
        if (parsed && parsed.error) {
          reject(new Error(parsed.error));
          return;
        }
        resolve(parsed);
      } catch (error) {
        reject(
          new Error(
            `Unable to parse Python analyzer output: ${error.message}\nOutput: ${stdout}\nErrors: ${stderr}`
          )
        );
      }
    });
    // Send source code to Python process via stdin
    proc.stdin.write(code ?? '');
    proc.stdin.end();
  });
}

// =============================================================================
// SECTION 6: EMBEDDED PYTHON ANALYZER SCRIPT
// =============================================================================

/**
 * Embedded Python analyzer script.
 * 
 * This is a complete Python program that performs AST-based code analysis.
 * It is executed via 'python -c SCRIPT_TEXT filepath' with source on stdin.
 * 
 * Analysis capabilities:
 * - Function/method discovery (with class qualification)
 * - Call order tracking (all function/method invocations)
 * - Dependency extraction (imports and from-imports)
 * - Data flow analysis (globals, storage operations, shared state)
 * - I/O pattern detection (file, network, user, config, logging)
 * - Side effect categorization (file ops, state mutations, network, etc.)
 * 
 * Architecture:
 * - Uses Python's ast module for parsing
 * - Custom NodeVisitor subclass traverses the AST
 * - Maintains sets/lists to track various code patterns
 * - Detects specific patterns via name matching and node types
 * 
 * I/O detection patterns:
 * - File operations: open(), os.path.*, pathlib.Path methods, json.load/loads
 * - Network: requests.*, urllib.*, http.client.*, aiohttp.*
 * - Random: random.*, secrets.*, uuid.* (marked as non-deterministic)
 * - Configuration: os.environ.*
 * - Logging: print(), *.print()
 * - User input: input(), *.input()
 * 
 * Output format (JSON):
 * {
 *   "functions": ["func1", "Class.method1", ...],
 *   "call_order": ["print", "os.path.exists", ...],
 *   "dependencies": ["os", "sys", "json.load", ...],
 *   "data_flow": "Globals{write=[x, y]} | Storage{read=[open]}",
 *   "io_summary": "Inputs{FILE:open; USER:input} | Outputs{LOG:print}",
 *   "side_effects": "SideEffects{FILE:write; LOG:print}" or "PURE",
 *   "error": "Parse error message" (only if parsing fails)
 * }
 * 
 * Note: This script is invoked as a string literal by Node.js and should
 * remain valid Python 3 code without external dependencies beyond stdlib.
 */
const PYTHON_ANALYZER_SOURCE = `
import ast
import json
import sys

filepath = sys.argv[1] if len(sys.argv) > 1 else "<stdin>"
source = sys.stdin.read()

result = {
    "functions": [],
    "call_order": [],
    "dependencies": [],
    "data_flow": "",
    "io_summary": "",
    "side_effects": "",
}

try:
    tree = ast.parse(source, filename=filepath)
except Exception as exc:
    result["error"] = f"Python parse error: {exc}"
    print(json.dumps(result))
    sys.exit(0)

functions = []
call_order = []
dependencies = set()
globals_written = set()
storage_reads = set()
storage_writes = set()
shared_state = set()
io_inputs = set()
io_outputs = set()
side_effects = set()

class_stack = []
scope_stack = []

FILE_READ_PREFIXES = (
    "os.path.exists",
    "os.path.isfile",
    "os.listdir",
    "pathlib.Path.read_text",
    "pathlib.Path.read_bytes",
    "json.load",
    "json.loads",
)

FILE_WRITE_PREFIXES = (
    "os.remove",
    "os.unlink",
    "os.rename",
    "os.replace",
    "os.rmdir",
    "os.makedirs",
    "os.mkdir",
    "shutil.copy",
    "shutil.copyfile",
    "shutil.move",
    "pathlib.Path.write_text",
    "pathlib.Path.write_bytes",
)

RANDOM_PREFIXES = ("random.", "secrets.", "uuid.")
NETWORK_PREFIXES = ("requests.", "urllib.", "http.client.", "aiohttp.")

def get_call_name(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        base = get_call_name(node.value)
        if base:
            return f"{base}.{node.attr}"
        return node.attr
    return None

def extract_names(target):
    names = []
    if isinstance(target, ast.Name):
        names.append(target.id)
    elif isinstance(target, (ast.Tuple, ast.List)):
        for item in target.elts:
            names.extend(extract_names(item))
    return names

def determine_open_mode(call_node):
    mode_value = None
    if len(call_node.args) >= 2:
        arg = call_node.args[1]
        if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
            mode_value = arg.value
    if mode_value is None:
        for keyword in call_node.keywords:
            if keyword.arg == "mode" and isinstance(keyword.value, ast.Constant) and isinstance(keyword.value.value, str):
                mode_value = keyword.value.value
                break
    return mode_value or "r"

def note_file_operation(name, call_node):
    lowered = name.lower()
    if lowered.endswith(".open") or name == "open":
        mode = determine_open_mode(call_node)
        if any(flag in mode for flag in ("w", "a", "x", "+")):
            storage_writes.add("open")
            io_outputs.add("FILE:open")
            side_effects.add("FILE:write")
        else:
            storage_reads.add("open")
            io_inputs.add("FILE:open")
            side_effects.add("FILE:read")
        return
    for prefix in FILE_READ_PREFIXES:
        if name.startswith(prefix):
            storage_reads.add(prefix.split(".")[-1])
            io_inputs.add(f"FILE:{prefix}")
            side_effects.add("FILE:read")
            return
    for prefix in FILE_WRITE_PREFIXES:
        if name.startswith(prefix):
            storage_writes.add(prefix.split(".")[-1])
            io_outputs.add(f"FILE:{prefix}")
            side_effects.add("FILE:write")
            return

class Analyzer(ast.NodeVisitor):
    def visit_ClassDef(self, node):
        class_stack.append(node.name)
        scope_stack.append(node.name)
        self.generic_visit(node)
        scope_stack.pop()
        class_stack.pop()
    def visit_FunctionDef(self, node):
        qualified = ".".join(class_stack + [node.name]) if class_stack else node.name
        if qualified not in functions:
            functions.append(qualified)
        scope_stack.append(node.name)
        self.generic_visit(node)
        scope_stack.pop()
    def visit_AsyncFunctionDef(self, node):
        self.visit_FunctionDef(node)
    def visit_Assign(self, node):
        if not scope_stack:
            for target in node.targets:
                for name in extract_names(target):
                    globals_written.add(name)
                    side_effects.add("STATE:global")
        self.generic_visit(node)
    def visit_AugAssign(self, node):
        if not scope_stack and isinstance(node.target, ast.Name):
            globals_written.add(node.target.id)
            side_effects.add("STATE:global")
        self.generic_visit(node)
    def visit_Global(self, node):
        for name in node.names:
            shared_state.add(name)
            side_effects.add("STATE:global")
    def visit_Import(self, node):
        for alias in node.names:
            dependencies.add(alias.name)
    def visit_ImportFrom(self, node):
        module = node.module or ""
        for alias in node.names:
            if module:
                dependencies.add(f"{module}.{alias.name}")
            else:
                dependencies.add(alias.name)
    def visit_Call(self, node):
        name = get_call_name(node.func)
        if name:
            call_order.append(name)
            note_file_operation(name, node)
            lowered = name.lower()
            if name.startswith(NETWORK_PREFIXES):
                io_inputs.add(f"NETWORK:{name}")
                side_effects.add("NETWORK")
            if lowered.startswith(RANDOM_PREFIXES):
                side_effects.add("NON_DETERMINISTIC")
            if name.startswith("os.environ"):
                io_inputs.add("CONFIG:os.environ")
            if name == "print" or lowered.endswith(".print"):
                io_outputs.add("LOG:print")
                side_effects.add("LOG:print")
            if name == "input" or lowered.endswith(".input"):
                io_inputs.add("USER:input")
        self.generic_visit(node)

analyzer = Analyzer()
analyzer.visit(tree)

functions_sorted = functions
dependencies_sorted = sorted(dependencies)

data_sections = []
if globals_written:
    writes = ", ".join(sorted(globals_written))
    data_sections.append(f"Globals{{write=[{writes}]}}")
if storage_reads or storage_writes:
    storage_parts = []
    if storage_reads:
        storage_parts.append(f"read=[{', '.join(sorted(storage_reads))}]")
    if storage_writes:
        storage_parts.append(f"write=[{', '.join(sorted(storage_writes))}]")
    data_sections.append(f"Storage{{{'; '.join(storage_parts)}}}")
if shared_state:
    shared = ", ".join(sorted(shared_state))
    data_sections.append(f"SharedState{{globals=[{shared}]}}")
data_flow_summary = " | ".join(data_sections)

io_segments = []
if io_inputs:
    io_segments.append(f"Inputs{{{'; '.join(sorted(io_inputs))}}}")
if io_outputs:
    io_segments.append(f"Outputs{{{'; '.join(sorted(io_outputs))}}}")
io_summary = " | ".join(io_segments)

if side_effects:
    side_effects_summary = f"SideEffects{{{'; '.join(sorted(side_effects))}}}"
else:
    side_effects_summary = "PURE"

result["functions"] = functions_sorted
result["call_order"] = call_order
result["dependencies"] = dependencies_sorted
result["data_flow"] = data_flow_summary
result["io_summary"] = io_summary
result["side_effects"] = side_effects_summary

print(json.dumps(result))
`;
