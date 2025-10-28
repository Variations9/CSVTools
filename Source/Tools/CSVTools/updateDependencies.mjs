import fs from 'node:fs/promises';
import path from 'node:path';
import prettier from 'prettier';
import parserBabel from 'prettier/plugins/babel';
import { extractCSharpDependencies } from './lib/csharp-analysis.mjs';
import { extractPythonDependencies } from './lib/python-analysis.mjs';

const workspaceRoot = process.cwd();
const csvOverride = process.env.CSV_PROJECT_MAP_PATH ?? '';
const csvPath = resolveCsvPath(csvOverride);
const SUPPORTED_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.json',
  '.html',
  '.cs',
  '.py'
]);

async function main() {
  console.log('============================================================');
  console.log('Dependencies Extraction');
  console.log('============================================================\n');

  const csvText = await fs.readFile(csvPath, 'utf8');
  const table = parseCsv(csvText);

  if (table.length === 0) {
    throw new Error('CSV file is empty.');
  }

  const headers = table[0].map((value) => value.replace(/\r/g, '').trim());
  const typeIndex = headers.findIndex((header) => header.toUpperCase() === 'TYPE');
  if (typeIndex === -1) {
    throw new Error('Unable to locate "Type" column in CSV header.');
  }

  let depsIndex = headers.findIndex(
    (header) => header.toUpperCase() === 'DEPENDENCIES'
  );

  if (depsIndex === -1) {
    console.log('Adding DEPENDENCIES column.');
    const orderIndex = headers.findIndex(
      (header) => header.trim().toUpperCase() === 'ORDER_OF_OPERATIONS'
    );
    depsIndex = orderIndex !== -1 ? orderIndex + 1 : headers.length;
    headers.splice(depsIndex, 0, 'DEPENDENCIES');
    table[0] = headers;
    for (let rowIndex = 1; rowIndex < table.length; rowIndex += 1) {
      const row = table[rowIndex] ?? [];
      while (row.length < headers.length - 1) {
        row.push('');
      }
      row.splice(depsIndex, 0, '');
      table[rowIndex] = row;
    }
  }

const updatedEntries = [];

  console.log(`Scanning ${table.length - 1} rows for script dependencies...\n`);

  for (let rowIndex = 1; rowIndex < table.length; rowIndex += 1) {
    const row = table[rowIndex];
    if (!row || row.length === 0) {
      continue;
    }

    const typeValue = (row[typeIndex] ?? '').trim().toLowerCase();
    if (!isSupportedScriptType(typeValue)) {
      continue;
    }

    const pathSegments = [];
    for (let columnIndex = 0; columnIndex < typeIndex; columnIndex += 1) {
      const segment = (row[columnIndex] ?? '').trim();
      if (segment) {
        pathSegments.push(segment);
      }
    }

    if (pathSegments.length === 0) {
      continue;
    }

    const relativePath = pathSegments.reduce((acc, segment) =>
      acc ? path.join(acc, segment) : segment
    , '');
    const absolutePath = path.join(workspaceRoot, relativePath);

    let source;
    try {
      source = await fs.readFile(absolutePath, 'utf8');
    } catch (error) {
      console.warn(`Skipping ${relativePath}: ${error.message}`);
      continue;
    }

    const ext = path.extname(relativePath).toLowerCase();
    const sanitizedSource = sanitizeForParsing(source);
    const dependencies = await extractDependenciesForExtension(
      sanitizedSource,
      absolutePath,
      ext
    );
    const sortedDeps = Array.from(dependencies).sort((a, b) =>
      a.localeCompare(b)
    );
    const nextValue = sortedDeps.join('; ');
    const currentValue = (row[depsIndex] ?? '').replace(/\r/g, '').trim();

    if (nextValue === currentValue) {
      continue;
    }

    row[depsIndex] = nextValue;
    updatedEntries.push({ path: relativePath, dependencies: sortedDeps });
  }

  if (updatedEntries.length === 0) {
    console.log('No DEPENDENCIES updates were required.');
    return;
  }

  const normalizedRows = table.map((row) => {
    const cells = [];
    for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
      cells.push(quoteForCsv(row[columnIndex] ?? ''));
    }
    return cells.join(',');
  });

  const updatedCsv = normalizedRows.join('\r\n') + '\r\n';
  await fs.writeFile(csvPath, updatedCsv, 'utf8');

  console.log(`Updated DEPENDENCIES column for ${updatedEntries.length} file(s).`);
  updatedEntries.forEach((entry) => {
    const limit = 25;
    const preview =
      entry.dependencies.length > limit
        ? `${entry.dependencies.slice(0, limit).join('; ')}; ... (+${
            entry.dependencies.length - limit
          } more)`
        : entry.dependencies.join('; ');
    console.log(` - ${entry.path}: ${preview}`);
  });
}

async function extractDependenciesForExtension(code, filePath, ext) {
  if (ext === '.css') {
    return extractCssDependencies(code);
  }

  if (ext === '.json') {
    return extractJsonDependencies(code);
  }

  if (ext === '.html') {
    return extractHtmlDependencies(code);
  }

  if (ext === '.cs') {
    return extractCSharpDependencies(code);
  }

  if (ext === '.py') {
    try {
      const deps = await extractPythonDependencies(code, filePath);
      return new Set(deps);
    } catch (error) {
      console.warn(`Unable to analyze Python dependencies for ${filePath}: ${error.message}`);
      return new Set();
    }
  }

  return extractJsDependencies(code, filePath);
}

async function extractJsDependencies(code, filePath) {
  let ast;
  try {
    const parseResult = await prettier.__debug.parse(code, {
      filepath: filePath,
      parser: 'babel',
      plugins: [parserBabel],
    });
    ast = parseResult.ast;
  } catch (error) {
    console.warn(`Unable to parse ${filePath}: ${error.message}`);
    return new Set();
  }

  const dependencies = new Set();

  traverseAst(ast, (node) => {
    switch (node.type) {
      case 'ImportDeclaration':
        if (node.source && node.source.value) {
          dependencies.add(String(node.source.value));
        }
        break;
      case 'ExportAllDeclaration':
      case 'ExportNamedDeclaration':
        if (node.source && node.source.value) {
          dependencies.add(String(node.source.value));
        }
        break;
      case 'CallExpression': {
        if (
          node.callee &&
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length === 1 &&
          node.arguments[0].type === 'StringLiteral'
        ) {
          dependencies.add(String(node.arguments[0].value));
        }
        break;
      }
      case 'ImportExpression': {
        const source = node.source;
        if (source && source.type === 'StringLiteral') {
          dependencies.add(String(source.value));
        }
        break;
      }
      default:
        break;
    }
  });

  return dependencies;
}

function traverseAst(node, visitor, parent = null) {
  if (!node || typeof node !== 'object') {
    return;
  }

  visitor(node, parent);

  for (const key of Object.keys(node)) {
    if (
      key === 'loc' ||
      key === 'start' ||
      key === 'end' ||
      key === 'leadingComments' ||
      key === 'trailingComments'
    ) {
      continue;
    }

    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && typeof child.type === 'string') {
          traverseAst(child, visitor, node);
        }
      }
      continue;
    }

    if (value && typeof value === 'object' && typeof value.type === 'string') {
      traverseAst(value, visitor, node);
    }
  }
}

function quoteForCsv(value) {
  const stringValue = String(value ?? '');
  const escaped = stringValue.replace(/"/g, '""');
  return `"${escaped}"`;
}

function parseCsv(text) {
  const records = [];
  let currentField = '';
  let currentRow = [];
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (insideQuotes) {
      if (char === '"') {
        const nextChar = text[index + 1];
        if (nextChar === '"') {
          currentField += '"';
          index += 1;
        } else {
          insideQuotes = false;
        }
      } else {
        currentField += char;
      }
      continue;
    }

    if (char === '"') {
      insideQuotes = true;
      continue;
    }

    if (char === ',') {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if (char === '\r') {
      const nextChar = text[index + 1];
      if (nextChar === '\n') {
        index += 1;
      }
      currentRow.push(currentField);
      records.push(currentRow);
      currentRow = [];
      currentField = '';
      continue;
    }

    if (char === '\n') {
      currentRow.push(currentField);
      records.push(currentRow);
      currentRow = [];
      currentField = '';
      continue;
    }

    currentField += char;
  }

  if (currentRow.length > 0 || currentField !== '') {
    currentRow.push(currentField);
    records.push(currentRow);
  }

  return records;
}

function resolveCsvPath(overridePath) {
  if (overridePath) {
    return path.isAbsolute(overridePath)
      ? overridePath
      : path.join(workspaceRoot, overridePath);
  }
  return path.join(workspaceRoot, 'Source/ProjectMap/SourceFolder.csv');
}

function isSupportedScriptType(typeValue) {
  if (!typeValue.endsWith(' file')) {
    return false;
  }
  return Array.from(SUPPORTED_EXTENSIONS).some((ext) =>
    typeValue.endsWith(`${ext} file`)
  );
}

function sanitizeForParsing(source) {
  return source.replace(/^\s*#(target|include|includepath).*$/gim, '');
}

function extractCssDependencies(code) {
  const results = new Set();
  const importRegex = /@import\s+(?:url\()?['"]([^'"]+)['"]\)?/gi;
  let match = null;
  while ((match = importRegex.exec(code))) {
    results.add(match[1]);
  }

  const urlRegex = /url\(\s*['"]?([^)'"]+)['"]?\s*\)/gi;
  while ((match = urlRegex.exec(code))) {
    const value = match[1];
    if (!value.startsWith('data:')) {
      results.add(value);
    }
  }

  return results;
}

function extractJsonDependencies(code) {
  const results = new Set();
  try {
    const json = JSON.parse(code);
    collectJsonStrings(json, results);
  } catch (error) {
    // Ignore invalid JSON
  }
  return results;
}

function extractHtmlDependencies(code) {
  const results = new Set();
  let match = null;

  const scriptRegex = /<script\b[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = scriptRegex.exec(code))) {
    results.add(match[1]);
  }

  const linkRegex = /<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = linkRegex.exec(code))) {
    results.add(match[1]);
  }

  const imgRegex = /<img\b[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = imgRegex.exec(code))) {
    results.add(match[1]);
  }

  const dataImportRegex = /data-(?:module|import)=\s*["']([^"']+)["']/gi;
  while ((match = dataImportRegex.exec(code))) {
    results.add(match[1]);
  }

  return results;
}

function collectJsonStrings(value, results, depth = 0) {
  if (depth > 5) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonStrings(item, results, depth + 1));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectJsonStrings(item, results, depth + 1));
    return;
  }
  if (typeof value === 'string' && isLikelyReference(value)) {
    results.add(value);
  }
}

function isLikelyReference(str) {
  if (typeof str !== 'string') {
    return false;
  }
  if (/^(\.\/|\.\.\/|\/)/.test(str)) {
    return true;
  }
  if (/\.(js|jsx|mjs|cjs|json|css|html)$/i.test(str)) {
    return true;
  }
  return false;
}

main().catch((error) => {
  console.error('Dependencies extraction failed:', error.message);
  process.exit(1);
});

