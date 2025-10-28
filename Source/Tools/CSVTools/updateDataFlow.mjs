
import fs from 'node:fs/promises';
import path from 'node:path';
import prettier from 'prettier';
import parserBabel from 'prettier/plugins/babel';
import { summarizeCSharpDataFlow } from './lib/csharp-analysis.mjs';
import { summarizePythonDataFlow } from './lib/python-analysis.mjs';

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

const BUILTIN_GLOBALS = new Set([
  'console',
  'document',
  'window',
  'globalThis',
  'Math',
  'JSON',
  'Array',
  'Object',
  'String',
  'Number',
  'Boolean',
  'Promise',
  'Set',
  'Map',
  'WeakMap',
  'WeakSet',
  'Date',
  'RegExp',
  'Intl',
  'Symbol',
  'Reflect',
  'localStorage',
  'sessionStorage',
  'fetch',
  'require',
  'module',
  'exports',
  '__dirname',
  '__filename',
  'process',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
]);

async function main() {
  console.log('============================================================');
  console.log('Data Flow & State Management Extraction');
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

  let dataFlowIndex = headers.findIndex(
    (header) => header.toUpperCase() === 'DATA FLOW / STATE MANAGEMENT'
  );

  if (dataFlowIndex === -1) {
    console.log('Adding DATA FLOW / STATE MANAGEMENT column.');
    const depsIndex = headers.findIndex(
      (header) => header.trim().toUpperCase() === 'DEPENDENCIES'
    );
    dataFlowIndex = depsIndex !== -1 ? depsIndex + 1 : headers.length;
    headers.splice(dataFlowIndex, 0, 'Data Flow / State Management');
    table[0] = headers;
    for (let rowIndex = 1; rowIndex < table.length; rowIndex += 1) {
      const row = table[rowIndex] ?? [];
      while (row.length < headers.length - 1) {
        row.push('');
      }
      row.splice(dataFlowIndex, 0, '');
      table[rowIndex] = row;
    }
  }

  const updatedEntries = [];

  console.log(`Scanning ${table.length - 1} rows for data flow details...\n`);

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
    const analysisSource =
      ext === '.py' ? source : sanitizeForParsing(source);
    const summary = await extractDataFlowSummary(analysisSource, absolutePath, ext);
    const nextValue = summary || '';
    const currentValue = (row[dataFlowIndex] ?? '').replace(/\r/g, '').trim();

    if (nextValue === currentValue) {
      continue;
    }

    row[dataFlowIndex] = nextValue;
    updatedEntries.push({ path: relativePath, summary: nextValue });
  }

  if (updatedEntries.length === 0) {
    console.log('No DATA FLOW / STATE MANAGEMENT updates were required.');
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

  console.log(
    `Updated DATA FLOW / STATE MANAGEMENT column for ${updatedEntries.length} file(s).`
  );
  updatedEntries.forEach((entry) => {
    const segments = entry.summary.split(' | ');
    const preview =
      segments.length > 3
        ? `${segments.slice(0, 3).join(' | ')} | ... (+${
            segments.length - 3
          } more)`
        : entry.summary;
    console.log(` - ${entry.path}: ${preview}`);
  });
}

async function extractDataFlowSummary(code, filePath, ext) {
  if (ext === '.css') {
    return summarizeCssDataFlow(code);
  }

  if (ext === '.json') {
    return summarizeJsonDataFlow(code);
  }

  if (ext === '.html') {
    return summarizeHtmlDataFlow(code);
  }

  if (ext === '.cs') {
    return summarizeCSharpDataFlow(code);
  }

  if (ext === '.py') {
    try {
      return await summarizePythonDataFlow(code, filePath);
    } catch (error) {
      console.warn(`Unable to analyze Python data flow for ${filePath}: ${error.message}`);
      return '';
    }
  }

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
    return '';
  }

  const context = createAnalysisContext();
  const programScope = createScope(null);

  walkNode(ast, null, programScope, context);

  return formatSummary(context);
}

function createAnalysisContext() {
  return {
    globalsWritten: new Set(),
    globalsRead: new Set(),
    domCreated: new Set(),
    domQueried: new Set(),
    domModified: new Set(),
    eventListeners: new Set(),
    storageOps: new Set(),
    sharedState: new Set(),
  };
}

function formatSummary(context) {
  const sections = [];

  if (context.globalsWritten.size || context.globalsRead.size) {
    const parts = [];
    if (context.globalsWritten.size) {
      parts.push(`write=[${Array.from(context.globalsWritten).join(', ')}]`);
    }
    if (context.globalsRead.size) {
      parts.push(`read=[${Array.from(context.globalsRead).join(', ')}]`);
    }
    sections.push(`Globals{${parts.join('; ')}}`);
  }

  if (context.domCreated.size || context.domQueried.size || context.domModified.size) {
    const parts = [];
    if (context.domCreated.size) {
      parts.push(`create=[${Array.from(context.domCreated).join(', ')}]`);
    }
    if (context.domQueried.size) {
      parts.push(`query=[${Array.from(context.domQueried).join(', ')}]`);
    }
    if (context.domModified.size) {
      parts.push(`modify=[${Array.from(context.domModified).join(', ')}]`);
    }
    sections.push(`DOM{${parts.join('; ')}}`);
  }

  if (context.eventListeners.size) {
    sections.push(`Events{${Array.from(context.eventListeners).join(', ')}}`);
  }

  if (context.storageOps.size) {
    sections.push(`Storage{${Array.from(context.storageOps).join(', ')}}`);
  }

  if (context.sharedState.size) {
    sections.push(`SharedState{${Array.from(context.sharedState).join(', ')}}`);
  }

  return sections.join(' | ');
}

function walkNode(node, parent, scope, context) {
  if (!node || typeof node.type !== 'string') {
    return;
  }

  switch (node.type) {
    case 'Program': {
      node.body.forEach((child) => walkNode(child, node, scope, context));
      return;
    }
    case 'BlockStatement': {
      node.body.forEach((child) => walkNode(child, node, scope, context));
      return;
    }
    case 'VariableDeclaration': {
      node.declarations.forEach((decl) => {
        const names = extractPatternNames(decl.id);
        names.forEach((name) => declare(scope, name));
        if (scope.parent === null) {
          names.forEach((name) => context.globalsWritten.add(name));
        }
        if (decl.init) {
          walkNode(decl.init, decl, scope, context);
        }
      });
      return;
    }
    case 'FunctionDeclaration': {
      if (node.id && node.id.name) {
        declare(scope, node.id.name);
      }
      const functionScope = createScope(scope);
      node.params.forEach((param) =>
        extractPatternNames(param).forEach((name) => declare(functionScope, name))
      );
      walkNode(node.body, node, functionScope, context);
      return;
    }
    case 'FunctionExpression':
    case 'ArrowFunctionExpression': {
      const functionScope = createScope(scope);
      if (node.id && node.id.name) {
        declare(functionScope, node.id.name);
      }
      node.params.forEach((param) =>
        extractPatternNames(param).forEach((name) => declare(functionScope, name))
      );
      walkNode(node.body, node, functionScope, context);
      return;
    }
    case 'ClassDeclaration': {
      if (node.id && node.id.name) {
        declare(scope, node.id.name);
        if (scope.parent === null) {
          context.globalsWritten.add(node.id.name);
        }
      }
      walkChildren(node, scope, context, ['body']);
      return;
    }
    case 'ImportDeclaration': {
      if (node.source && node.source.value) {
        context.sharedState.add(`import:${node.source.value}`);
      }
      node.specifiers.forEach((spec) => {
        if (spec.local && spec.local.name) {
          declare(scope, spec.local.name);
        }
      });
      return;
    }
    case 'ExportNamedDeclaration': {
      if (node.source && node.source.value) {
        context.sharedState.add(`export-from:${node.source.value}`);
      }
      node.specifiers.forEach((spec) => {
        if (spec.exported && spec.exported.name) {
          context.sharedState.add(`export:${spec.exported.name}`);
        }
      });
      if (node.declaration) {
        walkNode(node.declaration, node, scope, context);
      }
      return;
    }
    case 'ExportDefaultDeclaration': {
      context.sharedState.add('export:default');
      if (node.declaration) {
        walkNode(node.declaration, node, scope, context);
      }
      return;
    }
    case 'AssignmentExpression': {
      handleAssignmentExpression(node, scope, context);
      walkNode(node.left, node, scope, context);
      walkNode(node.right, node, scope, context);
      return;
    }
    case 'UpdateExpression': {
      handleUpdateExpression(node, scope, context);
      walkNode(node.argument, node, scope, context);
      return;
    }
    default:
      break;
  }

  if (node.type === 'CallExpression') {
    handleCallExpression(node, context);
  }

  if (node.type === 'Identifier') {
    handleIdentifier(node, parent, scope, context);
  }

  walkChildren(node, scope, context);
}

function walkChildren(node, scope, context, excludeKeys = []) {
  for (const key of Object.keys(node)) {
    if (
      key === 'loc' ||
      key === 'start' ||
      key === 'end' ||
      key === 'leadingComments' ||
      key === 'trailingComments' ||
      excludeKeys.includes(key)
    ) {
      continue;
    }

    const value = node[key];

    if (Array.isArray(value)) {
      value.forEach((child) => walkNode(child, node, scope, context));
      continue;
    }

    if (value && typeof value === 'object' && typeof value.type === 'string') {
      walkNode(value, node, scope, context);
    }
  }
}

function handleAssignmentExpression(node, scope, context) {
  const targets = extractAssignmentTargets(node.left);
  targets.forEach((name) => {
    if (!isDeclared(scope, name) && !BUILTIN_GLOBALS.has(name)) {
      context.globalsWritten.add(name);
    }
  });
}

function handleUpdateExpression(node, scope, context) {
  if (node.argument.type === 'Identifier') {
    const name = node.argument.name;
    if (!isDeclared(scope, name) && !BUILTIN_GLOBALS.has(name)) {
      context.globalsWritten.add(name);
    }
  }
}

function handleIdentifier(node, parent, scope, context) {
  if (!isReferenceIdentifier(node, parent)) {
    return;
  }

  const name = node.name;
  if (BUILTIN_GLOBALS.has(name) || isDeclared(scope, name)) {
    return;
  }

  context.globalsRead.add(name);
}

function handleCallExpression(node, context) {
  const callee = node.callee;

  // DOM creation: document.createElement('tag')
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'createElement' &&
    isIdentifierNamed(callee.object, 'document') &&
    node.arguments.length > 0 &&
    node.arguments[0].type === 'StringLiteral'
  ) {
    context.domCreated.add(`<${node.arguments[0].value}>`);
  }

  // DOM queries: document.getElementById / getElementsByClassName / querySelector / querySelectorAll
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    isIdentifierNamed(callee.object, 'document') &&
    node.arguments.length > 0 &&
    node.arguments[0].type === 'StringLiteral'
  ) {
    const selectorArg = node.arguments[0].value;
    switch (callee.property.name) {
      case 'getElementById':
        context.domQueried.add(`#${selectorArg}`);
        break;
      case 'getElementsByClassName':
        context.domQueried.add(`.${selectorArg}`);
        break;
      case 'querySelector':
      case 'querySelectorAll':
        context.domQueried.add(selectorArg);
        break;
      default:
        break;
    }
  }

  // DOM modifications via classList
  if (
    callee.type === 'MemberExpression' &&
    callee.object &&
    callee.object.type === 'MemberExpression' &&
    !callee.object.computed &&
    callee.object.property.type === 'Identifier' &&
    callee.object.property.name === 'classList' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    ['add', 'remove', 'toggle', 'replace'].includes(callee.property.name)
  ) {
    if (node.arguments.length > 0 && node.arguments[0].type === 'StringLiteral') {
      context.domModified.add(`${callee.property.name}:${node.arguments[0].value}`);
    } else {
      context.domModified.add(`${callee.property.name}:<dynamic>`);
    }
  }

  // Event listeners
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'addEventListener' &&
    node.arguments.length > 0
  ) {
    const targetName = getExpressionName(callee.object);
    const eventArg = node.arguments[0];
    const eventName =
      eventArg && eventArg.type === 'StringLiteral' ? eventArg.value : '<dynamic>';
    context.eventListeners.add(`${eventName}@${targetName}`);
  }

  // Storage operations
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier'
  ) {
    const objectName = getExpressionName(callee.object);
    if (objectName === 'localStorage' || objectName === 'sessionStorage') {
      context.storageOps.add(`${objectName}.${callee.property.name}`);
    }
  }
}

function createScope(parent) {
  return {
    declared: new Set(),
    parent,
  };
}

function declare(scope, name) {
  if (name) {
    scope.declared.add(name);
  }
}

function isDeclared(scope, name) {
  let current = scope;
  while (current) {
    if (current.declared.has(name)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function extractPatternNames(pattern) {
  const names = [];
  if (!pattern) {
    return names;
  }
  switch (pattern.type) {
    case 'Identifier':
      names.push(pattern.name);
      break;
    case 'ObjectPattern':
      pattern.properties.forEach((prop) => {
        if (prop.type === 'ObjectProperty') {
          names.push(...extractPatternNames(prop.value));
        } else if (prop.type === 'RestElement') {
          names.push(...extractPatternNames(prop.argument));
        }
      });
      break;
    case 'ArrayPattern':
      pattern.elements.forEach((element) => {
        if (element) {
          names.push(...extractPatternNames(element));
        }
      });
      break;
    case 'AssignmentPattern':
      names.push(...extractPatternNames(pattern.left));
      break;
    case 'RestElement':
      names.push(...extractPatternNames(pattern.argument));
      break;
    default:
      break;
  }
  return names;
}

function extractAssignmentTargets(left) {
  if (!left) {
    return [];
  }
  if (left.type === 'Identifier') {
    return [left.name];
  }
  if (left.type === 'ObjectPattern' || left.type === 'ArrayPattern') {
    return extractPatternNames(left);
  }
  if (left.type === 'AssignmentPattern') {
    return extractAssignmentTargets(left.left);
  }
  return [];
}

function isReferenceIdentifier(node, parent) {
  if (!parent) {
    return true;
  }

  switch (parent.type) {
    case 'VariableDeclarator':
      return parent.init === node;
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
      return parent.id !== node;
    case 'FunctionExpression':
    case 'ClassExpression':
      return parent.id !== node;
    case 'MemberExpression':
      if (!parent.computed && parent.property === node) {
        return false;
      }
      return parent.object === node;
    case 'Property':
    case 'ObjectProperty':
      return parent.value === node;
    case 'ArrayExpression':
    case 'ArrayPattern':
      return true;
    case 'CallExpression':
      return true;
    case 'AssignmentExpression':
      return parent.right === node;
    case 'UpdateExpression':
      return false;
    case 'BinaryExpression':
    case 'LogicalExpression':
    case 'ConditionalExpression':
    case 'TemplateLiteral':
    case 'ReturnStatement':
    case 'ExpressionStatement':
    case 'AwaitExpression':
    case 'ThrowStatement':
      return true;
    case 'ImportSpecifier':
    case 'ImportDefaultSpecifier':
    case 'ImportNamespaceSpecifier':
      return false;
    default:
      return true;
  }
}

function isIdentifierNamed(node, name) {
  return node && node.type === 'Identifier' && node.name === name;
}

function getExpressionName(node) {
  if (!node) {
    return '<unknown>';
  }
  switch (node.type) {
    case 'Identifier':
      return node.name;
    case 'ThisExpression':
      return 'this';
    case 'MemberExpression': {
      const objectName = getExpressionName(node.object);
      const propertyName = node.computed
        ? `[${getExpressionName(node.property)}]`
        : node.property.type === 'Identifier'
        ? node.property.name
        : getExpressionName(node.property);
      return `${objectName}.${propertyName}`;
    }
    case 'CallExpression':
      return getExpressionName(node.callee);
    default:
      return '<expression>';
  }
}

function summarizeCssDataFlow(code) {
  const imports = new Set();
  const urls = new Set();
  const customProps = new Set();

  const importRegex = /@import\s+(?:url\()?['"]([^'"]+)['"]\)?/gi;
  let match = null;
  while ((match = importRegex.exec(code))) {
    imports.add(match[1]);
  }

  const urlRegex = /url\(\s*['"]?([^)'"]+)['"]?\s*\)/gi;
  while ((match = urlRegex.exec(code))) {
    urls.add(match[1]);
  }

  const customPropRegex = /--([a-z0-9-_]+)/gi;
  while ((match = customPropRegex.exec(code))) {
    customProps.add(match[1]);
  }

  const ruleCount = (code.match(/{/g) || []).length;

  const parts = [];
  if (imports.size) {
    parts.push(`imports=[${Array.from(imports).join(', ')}]`);
  }
  if (urls.size) {
    parts.push(`assets=[${Array.from(urls).join(', ')}]`);
  }
  if (customProps.size) {
    parts.push(`customProps=[${Array.from(customProps).join(', ')}]`);
  }
  parts.push(`rules=${ruleCount}`);

  return `CSS{${parts.join('; ')}}`;
}

function summarizeJsonDataFlow(code) {
  try {
    const data = JSON.parse(code);
    const refs = new Set();
    collectJsonReferences(data, refs);

    const parts = [];
    parts.push(`root=${Array.isArray(data) ? 'array' : typeof data}`);

    if (!Array.isArray(data) && typeof data === 'object' && data) {
      const keys = Object.keys(data).slice(0, 6);
      if (keys.length) {
        parts.push(`keys=[${keys.join(', ')}]`);
      }
    }

    if (refs.size) {
      parts.push(`refs=[${Array.from(refs).join(', ')}]`);
    }

    return `JSON{${parts.join('; ')}}`;
  } catch (error) {
    return '';
  }
}

function summarizeHtmlDataFlow(code) {
  const ids = new Set();
  const classes = new Set();
  const scripts = new Set();
  const links = new Set();
  const events = new Set();

  let match = null;

  const idRegex = /id\s*=\s*["']([^"']+)["']/gi;
  while ((match = idRegex.exec(code))) {
    ids.add(match[1]);
  }

  const classRegex = /class\s*=\s*["']([^"']+)["']/gi;
  while ((match = classRegex.exec(code))) {
    match[1]
      .split(/\s+/)
      .filter(Boolean)
      .forEach((token) => classes.add(token));
  }

  const scriptRegex = /<script\b[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = scriptRegex.exec(code))) {
    scripts.add(match[1]);
  }

  const linkRegex = /<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = linkRegex.exec(code))) {
    links.add(match[1]);
  }

  const eventRegex = /\son([a-zA-Z]+)\s*=\s*["'][^"']*["']/gi;
  while ((match = eventRegex.exec(code))) {
    events.add(match[1].toLowerCase());
  }

  const parts = [];
  if (ids.size) {
    parts.push(`ids=[${Array.from(ids).join(', ')}]`);
  }
  if (classes.size) {
    parts.push(`classes=[${Array.from(classes).join(', ')}]`);
  }
  if (scripts.size) {
    parts.push(`scripts=[${Array.from(scripts).join(', ')}]`);
  }
  if (links.size) {
    parts.push(`assets=[${Array.from(links).join(', ')}]`);
  }
  if (events.size) {
    parts.push(`events=[${Array.from(events).join(', ')}]`);
  }

  if (parts.length === 0) {
    return 'HTML{}';
  }

  return `HTML{${parts.join('; ')}}`;
}

function collectJsonReferences(value, refs, depth = 0) {
  if (depth > 5) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonReferences(item, refs, depth + 1));
    return;
  }

  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectJsonReferences(item, refs, depth + 1));
    return;
  }

  if (typeof value === 'string' && isLikelyReference(value)) {
    refs.add(value);
  }
}

function isLikelyReference(str) {
  if (typeof str !== 'string') {
    return false;
  }
  if (/^(\.\/|\.\.\/|\/)/.test(str)) {
    return true;
  }
  if (/\.(js|jsx|mjs|cjs|json|css)$/i.test(str)) {
    return true;
  }
  if (str.startsWith('#') || str.startsWith('@')) {
    return true;
  }
  return false;
}

function sanitizeForParsing(source) {
  return source.replace(/^\s*#(target|include|includepath).*$/gim, '');
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

main().catch((error) => {
  console.error('Data flow extraction failed:', error.message);
  process.exit(1);
});

