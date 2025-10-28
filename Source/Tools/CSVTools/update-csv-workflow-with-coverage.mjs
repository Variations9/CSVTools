import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = process.cwd();

function executeScript(scriptPath, label, options = {}) {
  const { env: extraEnv } = options;

  return new Promise((resolve, reject) => {
    console.log(`\n>>> ${label}`);
    console.log('-'.repeat(60));

    const child = spawn('node', [scriptPath], {
      cwd: workspaceRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...extraEnv,
      },
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log('-'.repeat(60));
        console.log(`${label} completed successfully.`);
        resolve();
      } else {
        reject(new Error(`${label} exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to launch ${label}: ${error.message}`));
    });
  });
}

async function main() {
  console.clear();
  console.log('='.repeat(60));
  console.log('CSV PROJECT MAP - FULL WORKFLOW + COVERAGE');
  console.log('='.repeat(60));
  console.log('This workflow runs the core CSV update plus Column V test coverage.');
  console.log('='.repeat(60));

  const startTime = Date.now();

  try {
    const coreWorkflowPath = path.join(__dirname, 'update-csv-workflow.mjs');
    await executeScript(coreWorkflowPath, 'Core CSV Workflow');

    const snapshotPath = await findLatestSnapshot();
    if (!snapshotPath) {
      throw new Error('Unable to locate CSV snapshot after core workflow.');
    }
    console.log(`\nLatest snapshot for coverage: ${snapshotPath}`);

    const coverageScriptPath = path.join(__dirname, 'updateTestCoverage.mjs');
    await executeScript(coverageScriptPath, 'Test Coverage Extraction', {
      env: {
        CSV_PROJECT_MAP_PATH: snapshotPath,
      },
    });

    const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n' + '='.repeat(60));
    console.log('FULL WORKFLOW + COVERAGE COMPLETE');
    console.log('='.repeat(60));
    console.log(`Duration: ${durationSeconds} seconds`);
    console.log(
      'Columns refreshed: FUNCTIONS (J), ORDER_OF_OPERATIONS (K), DEPENDENCIES (L), DATA FLOW (M), LINES OF CODE (N), INPUT SOURCES / OUTPUT DESTINATIONS (O), SIDE EFFECTS (P), TEST COVERAGE (V), EXECUTION CONTEXT (W), ERROR HANDLING COVERAGE (X), CYCLOMATIC COMPLEXITY (Y).'
    );
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('FULL WORKFLOW + COVERAGE FAILED');
    console.error('='.repeat(60));
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\nFatal error while running workflow + coverage.');
  console.error(error.stack || error.message);
  process.exit(1);
});

async function findLatestSnapshot() {
  const snapshotDir = path.join(workspaceRoot, 'Source/ProjectMap');
  let entries;
  try {
    entries = await fs.readdir(snapshotDir, { withFileTypes: true });
  } catch (error) {
    console.warn(`Unable to read snapshot directory: ${error.message}`);
    return null;
  }

  const candidates = entries
    .filter((entry) => entry.isFile() && isSnapshotFilename(entry.name))
    .map((entry) => entry.name);

  if (candidates.length === 0) {
    return null;
  }

  let latestPath = null;
  let latestTime = -Infinity;

  await Promise.all(
    candidates.map(async (name) => {
      const absolutePath = path.join(snapshotDir, name);
      const stats = await fs.stat(absolutePath);
      const modifiedMs = stats.mtimeMs ?? stats.mtime.getTime();
      if (modifiedMs > latestTime) {
        latestTime = modifiedMs;
        latestPath = absolutePath;
      }
    })
  );

  return latestPath;
}

function isSnapshotFilename(name) {
  return (
    /^SourceFolder-[A-Za-z]{3}-\d{2}-\d{4}-\d{2}-\d{2}-(am|pm)-and-\d{2}-seconds\.csv$/i.test(
      name
    ) ||
    /^FolderStructure_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.csv$/i.test(name)
  );
}
