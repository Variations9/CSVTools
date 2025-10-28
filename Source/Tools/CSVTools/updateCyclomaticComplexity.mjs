import fs from 'node:fs/promises';
import path from 'node:path';
import prettier from 'prettier';
import parserBabel from 'prettier/plugins/babel';
import {
  loadCsvTable,
  writeCsvTable,
  ensureColumn,
  resolveCsvPath,
} from './lib/table-helpers.mjs';

const workspaceRoot = process.cwd();
const csvOverride = process.env.CSV_PROJECT_MAP_PATH ?? '';
const SUPPORTED_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs']);

async function main() {
  console.log('============================================================');
  console.log('Cyclomatic Complexity Extraction (Column Y)');
  console.log('============================================================\n');

  const { csvPath, headers, rows } = await loadCsvTable(csvOverride || undefined);
  const typeIndex = headers.findIndex((header) => header.trim().toUpperCase() === 'TYPE');
  if (typeIndex === -1) {
    throw new Error('Unable to locate "Type" column in CSV header.');
  }

  const complexityIndex = ensureColumn(headers, rows, 'CYCLOMATIC COMPLEXITY');

  console.log(`Scanning ${rows.length} rows for supported source files...\n`);

  let processed = 0;
  let updated = 0;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const typeValue = (row[typeIndex] ?? '').trim().toLowerCase();
    if (!isSupportedType(typeValue)) {
      continue;
    }

    const relativePath = buildRelativePath(row, typeIndex);
    if (!relativePath) {
      continue;
    }

    const absolutePath = path.join(workspaceRoot, relativePath);
    processed += 1;

    let source;
    try {
      source = await fs.readFile(absolutePath, 'utf8');
    } catch (error) {
      console.warn(`Skipping ${relativePath}: ${error.message}`);
      continue;
    }

    const complexity = await calculateCyclomaticComplexity(source, absolutePath);
    if (complexity === null) {
      continue;
    }

    const nextValue = formatComplexityValue(complexity);
    const currentValue = (row[complexityIndex] ?? '').trim();

    if (currentValue === nextValue) {
      continue;
    }

    row[complexityIndex] = nextValue;
    updated += 1;
  }

  if (updated === 0) {
    console.log('No updates were required; Column Y already reflects current complexity values.');
    return;
  }

  await writeCsvTable(resolveCsvPath(csvOverride), headers, rows);
  console.log(`\nUpdated CYCLOMATIC COMPLEXITY for ${updated} file(s).`);
  console.log(`Files analyzed: ${processed}`);
}

function isSupportedType(typeValue) {
  if (!typeValue.endsWith('file')) {
    return false;
  }
  const ext = typeValue.split(' ')[0];
  return SUPPORTED_EXTENSIONS.has(ext);
}

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

async function calculateCyclomaticComplexity(code, filePath) {
  let ast;
  try {
    const parseResult = await prettier.__debug.parse(code, {
      filepath: filePath,
      parser: 'babel',
      plugins: [parserBabel],
    });
    ast = parseResult.ast;
  } catch (error) {
    console.warn(`Unable to parse ${path.relative(workspaceRoot, filePath)}: ${error.message}`);
    return null;
  }

  let complexity = 1;

  traverseAst(ast, (node) => {
    switch (node.type) {
      case 'IfStatement':
      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement':
      case 'WhileStatement':
      case 'DoWhileStatement':
      case 'ConditionalExpression':
      case 'CatchClause':
        complexity += 1;
        break;
      case 'LogicalExpression':
        if (node.operator === '&&' || node.operator === '||') {
          complexity += 1;
        }
        break;
      case 'SwitchCase':
        if (node.test) {
          complexity += 1;
        }
        break;
      default:
        break;
    }
  });

  return complexity;
}

function traverseAst(node, visitor) {
  if (!node || typeof node.type !== 'string') {
    return;
  }
  visitor(node);
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (Array.isArray(value)) {
      value.forEach((child) => traverseAst(child, visitor));
    } else if (value && typeof value.type === 'string') {
      traverseAst(value, visitor);
    }
  }
}

function formatComplexityValue(value) {
  return `${value} (${classifyComplexity(value)})`;
}

function classifyComplexity(value) {
  if (value <= 10) {
    return 'Simple';
  }
  if (value <= 20) {
    return 'Moderate';
  }
  if (value <= 50) {
    return 'Complex';
  }
  return 'Very High';
}

main().catch((error) => {
  console.error('Cyclomatic complexity update failed:', error.message);
  process.exit(1);
});
