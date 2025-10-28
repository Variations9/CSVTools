# CSV Project Map Toolkit

**Automated Codebase Intelligence & Documentation System**

---

## Overview

The CSV Project Map Toolkit is a sophisticated Node.js-based system that automatically generates and maintains a comprehensive "living map" of your entire codebase. It scans your project, extracts rich metadata across 24 analytical dimensions, and produces a detailed CSV/spreadsheet that serves as both documentation and a powerful analysis tool.

**Developed by:** E. Harrison, Production & Technical Artist  
**Bloviations, Vibe Codes and a.i. Commenting:** Claude (Anthropic) & ChatGPT Codex

---

## Quick Start

### Prerequisites
- **Node.js** (v18 or higher recommended)
- **npm** package manager

### Installation

```bash
# Navigate to the tools directory
cd Source/Tools/CSVTools

# Install dependencies (Prettier for AST parsing)
npm install

# Return to workspace root
cd ../../..
```

### Basic Usage

```bash
# Full analysis workflow (recommended)
node Source/Tools/CSVTools/update-csv-workflow.mjs

# Preview changes without modifying files
node Source/Tools/CSVTools/preview-changes.mjs

# Sync file structure only
node Source/Tools/CSVTools/sync-filesystem-to-csv.mjs
```

---

## What This System Does

### Automated Project Intelligence

The toolkit performs **deep static analysis** on your codebase and generates a spreadsheet with 24 columns of metadata:

#### **File System Structure (Columns A-J)**
- **A-I:** Hierarchical folder structure (9 levels deep)
- **J:** File type classification (folder, .js, .py, .cs, .html, .css, .json, etc.)
- **FEATURES:** Auto-generated feature synopsis with tags
- **Summary:** Content descriptions
- **Notes:** Documentation and comments

#### **Code Analysis (Columns K-P)**
- **K - Functions:** All function declarations, methods, and callable entities
- **L - Order of Operations:** Execution flow and call chains
- **M - Dependencies:** Import/require/using statements with full paths
- **N - Data Flow/State Management:** Global variables, DOM interactions, event handlers, storage APIs
- **O - Lines of Code:** Per-file counts with project totals
- **P - Input Sources/Output Destinations:** Data flow mappings (files, network, database, user input)
- **Q - Side Effects:** File I/O, network calls, DOM manipulation, storage operations

#### **Quality Metrics (Columns R-X)**
- **R - Debugger Query:** Custom analysis prompts (JSON or natural language)
- **S - Query Results:** Automated analysis outputs
- **T-V - Saved Results:** Three slots for bookmarked analysis findings
- **W - Cyclomatic Complexity:** Code complexity scoring (Simple/Moderate/Complex/Very High)
- **X - Execution Context:** Runtime classification (Browser/Node/Mixed)
- **Y - Error Handling Coverage:** Try/catch analysis with risk assessment

---

## Architecture & Components

### Core Synchronization Engine

**`project-map-sync-core.mjs`**
- File system scanner with recursive traversal
- CSV parser/serializer with proper quote handling
- Diff engine for detecting changes (additions, deletions, type changes)
- Duplicate detection and conflict resolution

**`sync-filesystem-to-csv.mjs`**
- Orchestrates full project structure synchronization
- Creates timestamped snapshots while preserving original
- Filters excluded directories (node_modules, .git, etc.)

### Analysis Extractors

Each extractor focuses on a specific analytical dimension:

| Script | Column | Purpose |
|--------|--------|---------|
| `update-functions.mjs` | J | Extracts function declarations, methods, classes |
| `updateOrderOfOperations.mjs` | K | Maps execution flow and call chains |
| `updateDependencies.mjs` | L | Tracks all import/require statements |
| `updateDataFlow.mjs` | M | Analyzes state management patterns |
| `updateLinesOfCodeCounter.mjs` | N | Counts non-empty lines per file |
| `updateInputSourcesOutputDestinations.mjs` | O | Maps data sources and sinks |
| `updateSideEffects.mjs` | P | Identifies side-effect operations |
| `updateCyclomaticComplexity.mjs` | W | Calculates complexity metrics |
| `updateExecutionContext.mjs` | X | Classifies runtime environments |
| `updateErrorHandlingCoverage.mjs` | Y | Assesses error handling robustness |
| `updateFeatures.mjs` | FEATURES | Generates feature synopses with tags |

### Master Orchestrator

**`update-csv-workflow.mjs`**
- Runs all extractors in optimized sequence
- Passes timestamped snapshot between stages
- Environment variable propagation for path overrides
- Comprehensive error handling and progress reporting

### Query & Analysis System

**`Querier.mjs`** - Pluggable query engine with multiple strategies:
- **Querier1.mjs:** Feature-mode comparison queries
- **Querier2.mjs:** Linkage mapping and relationship analysis
- **Querier3.mjs:** Structure-finder pattern matching
- **traverserQuerier2.mjs:** Default row summarization (fallback)

**Query Workflow:**
1. Add queries to Column Q (DEBUGGER QUERY)
2. Run: `node Source/Tools/CSVTools/Querier.mjs`
3. Review results in Column R (QUERY RESULTS)
4. Save important findings: `node Source/Tools/CSVTools/SavedResult1.mjs`
5. Export results: `node Source/Tools/CSVTools/Results.mjs`

### Language-Specific Analyzers

**`csharp-analysis.mjs`**
- Parses C# files for methods, properties, using statements
- Extracts call order from method bodies
- Analyzes file I/O patterns, data flow, and side effects

**`python-analysis.mjs`**
- Parses Python files for functions, classes, decorators
- Maps import statements and dependencies
- Tracks file operations and side effects

**JavaScript/JSX/MJS/CJS**
- Uses Prettier with Babel plugin for AST parsing
- Full ES6+ support including async/await, destructuring
- React component analysis for JSX files

### Utility Tools

**`table-helpers.mjs`**
- CSV path resolution with environment overrides
- Column management (ensure, add, normalize)
- Value accessor factory for case-insensitive lookups
- Row path construction from hierarchical structure

**`preview-changes.mjs`**
- Dry-run comparison tool
- Shows additions, deletions, type changes
- No file modifications (safe preview mode)

**`generate-llm-dataset.mjs`**
- Exports project data for LLM training/fine-tuning
- Formats codebase knowledge for AI consumption

### Web-Based Tools

**`CSVEditor.html`**
- In-browser CSV editor with syntax highlighting
- Visual column management
- Export to Google Sheets format

**`FolderTreeCSVToGoogleSheetsConverter.html`**
- Converts CSV to Google Sheets-compatible format
- Handles quoted fields and special characters
- Copy-to-clipboard functionality

**`Folder-Tree-to-Spreadsheet-Converter.html`**
- Alternative conversion interface
- Batch processing support

---

## Supported File Types

| Language/Format | Extensions | Analysis Features |
|-----------------|------------|-------------------|
| **JavaScript** | .js, .mjs, .cjs, .jsx | Full AST parsing, async/await, ES6+ |
| **Python** | .py | Function/class extraction, imports, decorators |
| **C#** | .cs | Methods, properties, using statements |
| **CSS** | .css | Rule extraction, selectors |
| **HTML** | .html | Structure analysis, script detection |
| **JSON** | .json | Structure validation |
| **Markdown** | .md | Content tracking |

---

## Real-World Use Cases

### 1. **Onboarding New Developers**
- Instantly understand project structure
- See all functions and their dependencies
- Identify critical files by complexity/LOC

### 2. **Code Quality Audits**
```bash
# Find files with no error handling
# Query in Column Q: {"type":"linkage","target":"error_handling_none"}

# Identify high-complexity functions
# Query: complexity > 50

# Locate files with excessive side effects
# Query: side_effects contains "FILE" and "NETWORK"
```

### 3. **Refactoring Planning**
- Trace all dependencies before changing a module
- Identify circular dependencies
- Find all call sites of a function

### 4. **Technical Debt Assessment**
- Sort by Lines of Code to find bloated files
- Filter by Cyclomatic Complexity for refactoring targets
- Check Error Handling Coverage for risk areas

### 5. **Documentation Generation**
- Export CSV to Google Sheets for team sharing
- Generate architecture diagrams from dependency graphs
- Create API documentation from function signatures

### 6. **Security Audits**
- Find all network calls and file I/O operations
- Identify unsafe data flows (user input → database)
- Locate files with side effects but no error handling

---

## Advanced Features

### Environment Variable Overrides

```bash
# Use custom CSV location
export CSV_PROJECT_MAP_PATH=/path/to/custom.csv
node Source/Tools/CSVTools/update-functions.mjs

# Skip test execution during coverage analysis
export SKIP_TEST_RUN=true
node Source/Tools/CSVTools/updateTestCoverage.mjs

# Custom coverage arguments
export TEST_COVERAGE_ARGS="--reporter=lcov --reporter=html"
node Source/Tools/CSVTools/updateTestCoverage.mjs
```

### Workflow Logging

```bash
# Capture complete workflow output with timestamps
node Source/Tools/CSVTools/update-csv-workflow.mjs 2>&1 | \
  tee Source/Tools/logs/workflow-$(date +%Y%m%d-%H%M%S).log
```

### Git Integration

```bash
# View changes between snapshots
git diff Source/ProjectMap/SourceFolder-*.csv

# Track only the canonical CSV in version control
echo "Source/ProjectMap/SourceFolder-*.csv" >> .gitignore
git add Source/ProjectMap/SourceFolder.csv
```

### Custom Query Examples

**JSON Query (Column Q):**
```json
{"type":"linkage","target":"n44","mode":"dependencies"}
```

**Natural Language Query (Column Q):**
```
Find all functions that call the database and don't have error handling
```

**Pattern Matching Query:**
```
Files with LOC > 500 AND complexity > 30 AND error_coverage = "NONE"
```

---

## Performance Characteristics

| Project Size | Files | Processing Time | CSV Size |
|--------------|-------|-----------------|----------|
| Small | 10-100 | 5-15 seconds | <1 MB |
| Medium | 100-500 | 15-60 seconds | 1-5 MB |
| Large | 500-2000 | 1-5 minutes | 5-20 MB |
| Very Large | 2000+ | 5-15 minutes | 20+ MB |

**Optimization Tips:**
- Use `preview-changes.mjs` to check scope before full run
- Run individual extractors for targeted updates
- Exclude large binary/vendor directories in sync script
- Process incrementally during development

---

## Example Output

View live examples of generated spreadsheets:

**This Project's Map:**
https://docs.google.com/spreadsheets/d/1Q9vF2L3K6D2Ptg94kgfpupGikGkF27CcwyihWiLbhH8/edit?usp=sharing

**Larger Example Project:**
https://docs.google.com/spreadsheets/d/1Kwc429QBrfUCZzyB1BlzLp7wd16pyS14G42Fn7DgMm0/edit?usp=sharing

---

## Troubleshooting

### Common Issues

**"Unable to locate Type column"**
- Ensure CSV has proper headers
- Check for BOM or encoding issues
- Try regenerating from scratch

**"CSV file is empty"**
- Verify file path in resolveCsvPath()
- Check file permissions
- Ensure file exists at expected location

**Prettier parsing errors**
- Update to latest Prettier version
- Check for syntax errors in source files
- Review console warnings for specific files

**Memory issues on large projects**
- Increase Node.js heap size: `NODE_OPTIONS="--max-old-space-size=4096"`
- Process subdirectories separately
- Exclude node_modules and vendor directories

---

## Development & Extension

### Adding a New Column

1. **Create extractor script:**
   ```javascript
   // updateMyColumn.mjs
   import { loadCsvTable, writeCsvTable, ensureColumn } from './lib/table-helpers.mjs';
   
   async function main() {
     const { csvPath, headers, rows } = await loadCsvTable();
     const myColumnIndex = ensureColumn(headers, rows, 'MY COLUMN');
     
     rows.forEach(row => {
       // Your analysis logic here
       row[myColumnIndex] = computeValue(row);
     });
     
     await writeCsvTable(csvPath, headers, rows);
   }
   ```

2. **Add to workflow:**
   Edit `update-csv-workflow.mjs` to include your extractor

3. **Document in CSVToolsDocumentation.md**

### Adding a New Language Analyzer

1. Create `myLanguage-analysis.mjs` in `lib/`
2. Export functions: `extractFunctions`, `extractCallOrder`, `extractDependencies`
3. Import in relevant update scripts
4. Add file extension checks in `isSupportedScriptType`

---

## Technical Specifications

**Dependencies:**
- **prettier ^3.6.2** - JavaScript/JSX AST parsing
- **vitest ^3.2.4** - Testing framework (dev)
- **@vitest/coverage-v8** - Code coverage (dev)
- **jsdom** - DOM simulation for testing (dev)
- **ajv** - JSON schema validation (dev)

**Node.js Requirements:**
- ES Modules (type: "module")
- File system promises API
- Child process spawning
- Path manipulation

**CSV Format:**
- RFC 4180 compliant
- UTF-8 encoding
- Quoted fields for special characters
- Newline handling (CRLF/LF agnostic)

---

## Project Structure

```
Source/Tools/CSVTools/
├── update-csv-workflow.mjs          # Master orchestrator
├── sync-filesystem-to-csv.mjs       # Structure synchronization
├── preview-changes.mjs              # Dry-run comparison
├── update-functions.mjs             # Column J extractor
├── updateOrderOfOperations.mjs      # Column K extractor
├── updateDependencies.mjs           # Column L extractor
├── updateDataFlow.mjs               # Column M extractor
├── updateLinesOfCodeCounter.mjs     # Column N extractor
├── updateInputSourcesOutputDestinations.mjs  # Column O
├── updateSideEffects.mjs            # Column P extractor
├── updateCyclomaticComplexity.mjs   # Column W extractor
├── updateExecutionContext.mjs       # Column X extractor
├── updateErrorHandlingCoverage.mjs  # Column Y extractor
├── updateFeatures.mjs               # FEATURES column
├── Querier.mjs                      # Query engine
├── Querier1.mjs                     # Feature comparison
├── Querier2.mjs                     # Linkage mapping
├── Querier3.mjs                     # Structure finder
├── Results.mjs                      # Results exporter
├── SavedResult1.mjs                 # Saved results manager
├── SavedResult2.mjs                 # Saved results manager
├── SavedResult3.mjs                 # Saved results manager
├── generate-llm-dataset.mjs         # LLM training data export
├── lib/
│   ├── project-map-sync-core.mjs   # Core CSV operations
│   ├── table-helpers.mjs           # CSV utilities
│   ├── csharp-analysis.mjs         # C# language support
│   └── python-analysis.mjs         # Python language support
├── CSVEditor.html                   # Web-based CSV editor
├── FolderTreeCSVToGoogleSheetsConverter.html
├── Folder-Tree-to-Spreadsheet-Converter.html
└── package.json                     # npm configuration

Source/ProjectMap/
├── SourceFolder.csv                 # Canonical project map
└── SourceFolder-YYYY-MM-DD-*.csv   # Timestamped snapshots
```

---

## Contributing

This is a personal project, but suggestions and improvements are welcome!

**Contact:** E. Harrison  
**Location:** Port Townsend, Washington, US  
**Email/Phone:** Available upon request

---

## License

Copyright © E. Harrison  
All rights reserved.

---

## Acknowledgments

**AI Assistants:**
- Claude (Anthropic) - Architecture design, code generation, documentation
- ChatGPT Codex (OpenAI) - Initial prototyping and feature development

**Inspiration:**
The idea emerged from the need to maintain visibility into complex codebases during rapid development. Traditional documentation becomes stale quickly; automated extraction ensures the map always reflects reality.

---

## Future Roadmap

**Planned Features:**
- [ ] Visual dependency graph generation (D3.js/Graphviz)
- [ ] Interactive web dashboard with drill-down capabilities
- [ ] Real-time file watching and incremental updates
- [ ] Integration with popular IDEs (VS Code extension)
- [ ] Machine learning-based code quality predictions
- [ ] API server mode for programmatic access
- [ ] Support for TypeScript, Rust, Go, Java
- [ ] Test coverage integration with popular frameworks
- [ ] Git blame integration for code age metrics
- [ ] Performance profiling data correlation

**Experimental:**
- LLM-powered natural language queries
- Automated refactoring suggestions
- Code smell detection with severity scoring
- Security vulnerability pattern matching

---

## Version History

**v1.0.0** - Current Release
- Initial public version
- Support for JS, Python, C#, CSS, HTML, JSON
- 24 analytical columns
- Query engine with 4 traverser strategies
- HTML converter tools
- Comprehensive documentation

---

*"A living map of code is worth a thousand outdated documents."*