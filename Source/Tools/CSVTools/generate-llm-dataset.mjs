// LLM Training Dataset Generator

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Import CSV loading utility from local library
import { loadCsvTable } from './lib/table-helpers.mjs';

// CONFIGURATION: Establish file paths and workspace root directory
// Convert module URL to filesystem path for directory resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Navigate up three levels from Source/Tools/CSVTools to reach workspace root
const workspaceRoot = path.resolve(__dirname, '../../../');

// SECTION 1: MAIN DATASET GENERATION ORCHESTRATOR
/**
 * Main orchestration function for LLM training dataset generation
 * 
 * Purpose:
 * - Loads project source files from CSV metadata inventory
 * - Extracts file content and metadata for each valid source file
 * - Generates a structured JSON dataset for LLM training purposes
 * 
 * Process Flow:
 * 1. Loads CSV containing file metadata from SourceFolder.csv
 * 2. Identifies and validates the "Type" column for file filtering
 * 3. Iterates through rows, processing only non-folder entries
 * 4. Constructs file paths from hierarchical folder structure (10 levels)
 * 5. Reads file content and packages with metadata
 * 6. Outputs consolidated dataset as JSON file
 * 
 * Error Handling:
 * - Gracefully skips unreadable files with warning messages
 * - Exits with error code 1 on critical failures
 * 
 * Output:
 * - Creates llm_training_dataset.json in Source/ProjectMap/
 * - Each entry contains: filePath (relative), metadata (all CSV columns), code (file content)
 */
async function main() {
  console.log('Starting LLM dataset generation...');
  try {
    // STEP 1: Load CSV data from SourceFolder inventory
    // Construct path to the CSV file containing all project file metadata
    const csvPath = path.resolve(workspaceRoot, 'Source', 'ProjectMap', 'SourceFolder.csv');
    // Load CSV and destructure into headers array and rows array
    const { headers, rows } = await loadCsvTable(csvPath);
    console.log(`Loaded ${rows.length} rows from CSV.`);
    // Locate the "Type" column which distinguishes files from folders
    // Case-insensitive search with whitespace trimming for robustness
    const typeColumnIndex = headers.findIndex(h => h.trim().toUpperCase() === 'TYPE');
    if (typeColumnIndex === -1) {
      throw new Error('Column "Type" not found in CSV.');
    }
    // Initialize dataset array to store all processed file entries
    const dataset = [];
    // STEP 2: Process each CSV row to extract file data
    for (const row of rows) {
      // Filter: Skip folder entries and invalid file types
      // Valid files must have Type starting with '.' (e.g., .js, .mjs, .json)
      const fileType = row[typeColumnIndex] || '';
      if (fileType.toLowerCase() === 'folder' || !fileType.startsWith('.')) {
        continue;
      }
      // Construct absolute file path from hierarchical folder structure
      // CSV columns 0-9 represent: Root Folder, Sub-Folder Level 1-10
      // Build path by concatenating non-empty folder segments
      const pathSegments = [];
      for (let i = 0; i < 10; i++) {
          if (row[i] && row[i].trim()) {
              pathSegments.push(row[i].trim());
          } else {
              break;
          }
      }
      // Join path segments to create relative path, then resolve to absolute
      const relativePath = path.join(...pathSegments);
      const absolutePath = path.resolve(workspaceRoot, relativePath);
      try {
        // STEP 3: Read file content as UTF-8 text
        const code = await fs.readFile(absolutePath, 'utf-8');
        // STEP 4: Create metadata object from all CSV columns
        // Transform headers into sanitized keys (lowercase, underscored)
        // Map each header to its corresponding row value
        const metadata = {};
        headers.forEach((header, index) => {
          const key = header.trim().replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
          metadata[key] = row[index] || '';
        });
        // STEP 5: Add complete file entry to dataset
        // Structure: relative path, full metadata object, source code content
        dataset.push({
          filePath: relativePath,
          metadata,
          code,
        });
      } catch (fileError) {
        // Gracefully handle files that cannot be read (missing, permission issues, etc.)
        console.warn(`Skipping file (not found or unreadable): ${relativePath}`);
      }
    }
    // STEP 6: Write consolidated dataset to JSON output file
    // Output location: Source/ProjectMap/llm_training_dataset.json
    const outputPath = path.resolve(workspaceRoot, 'Source/ProjectMap/llm_training_dataset.json');
    // Pretty-print JSON with 2-space indentation for readability
    await fs.writeFile(outputPath, JSON.stringify(dataset, null, 2));
    console.log(`\nSuccessfully generated dataset with ${dataset.length} entries.`);
    console.log(`Dataset saved to: ${path.relative(workspaceRoot, outputPath)}`);
  } catch (error) {
    // Handle critical errors that prevent dataset generation
    console.error('\nAn error occurred during dataset generation:');
    console.error(error);
    process.exit(1);
  }
}

// Execute main dataset generation function
main();
