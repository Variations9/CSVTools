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
const SUPPORTED_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);

async function main() {
  console.log('============================================================');
  console.log('Error Handling Coverage Extraction (Column X)');
  console.log('============================================================\n');

  const { headers, rows } = await loadCsvTable(csvOverride || undefined);
  const csvPath = resolveCsvPath(csvOverride);

  const typeIndex = headers.findIndex(
    (header) => header.trim().toUpperCase() === 'TYPE'
  );
  if (typeIndex === -1) {
    throw new Error('Unable to locate "Type" column in CSV header.');
  }

  const locIndex = headers.findIndex(
    (header) => header.trim().toUpperCase() === 'LINES OF CODE'
  );
  const execIndex = ensureColumn(headers, rows, 'EXECUTION CONTEXT');
  const errorIndex = ensureColumn(headers, rows, 'ERROR HANDLING COVERAGE');
  const complexityIndex = headers.findIndex(
    (header) => header.trim().toUpperCase() === 'CYCLOMATIC COMPLEXITY'
  );
  const ioIndex = headers.findIndex(
    (header) => header.trim().toUpperCase() === 'INPUT SOURCES / OUTPUT DESTINATIONS'
  );
  const sideEffectsIndex = headers.findIndex(
    (header) => header.trim().toUpperCase() === 'SIDE EFFECTS'
  );

  let processed = 0;
  let updated = 0;
  const summary = {
    categoryCounts: {
      NONE: 0,
      minimal: 0,
      basic: 0,
      good: 0,
      comprehensive: 0,
    },
    riskCounts: {
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    },
    errors: 0,
  };
  const highRiskCandidates = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const typeValue = (row[typeIndex] ?? '').trim().toLowerCase();
    const currentValue = (row[errorIndex] ?? '').trim();

    if (!isSupportedType(typeValue)) {
      if (currentValue !== 'N/A') {
        row[errorIndex] = 'N/A';
        updated += 1;
      }
      continue;
    }

    const relativePath = buildRelativePath(row, typeIndex);
    if (!relativePath) {
      continue;
    }

    const absolutePath = path.join(workspaceRoot, relativePath);
    let source;
    try {
      source = await fs.readFile(absolutePath, 'utf8');
    } catch (error) {
      console.warn(`Skipping ${relativePath}: ${error.message}`);
      if (currentValue !== 'MISSING') {
        row[errorIndex] = 'MISSING';
        updated += 1;
      }
      summary.errors += 1;
      continue;
    }

    const stats = await analyzeErrorHandling(source, absolutePath);
    if (!stats) {
      if (currentValue !== 'ERROR') {
        row[errorIndex] = 'ERROR';
        updated += 1;
      }
      summary.errors += 1;
      continue;
    }

    const locValue =
      locIndex === -1 ? 0 : parseInt((row[locIndex] ?? '').replace(/[^\d]/g, ''), 10) || 0;
    const execValue = (row[execIndex] ?? '').toLowerCase();
    const result = categorizeErrorHandling(stats, execValue, locValue);

    summary.categoryCounts[result.category] += 1;
    summary.riskCounts[result.risk] += 1;
    processed += 1;

    if (result.risk === 'HIGH') {
      const loc = locValue || 0;
      const complexity = parseInt(
        (complexityIndex === -1 ? '' : row[complexityIndex] ?? '').split(' ')[0],
        10
      );
      highRiskCandidates.push({
        file: relativePath,
        context: row[execIndex] ?? '',
        complexity: Number.isNaN(complexity) ? 0 : complexity,
        loc,
      });
    }

    const formatted = formatErrorHandling(result);
    if (currentValue === formatted) {
      continue;
    }

    row[errorIndex] = formatted;
    updated += 1;
  }

  if (updated === 0) {
    console.log('No updates were required; Column X already reflects current error handling coverage.');
  } else {
    await writeCsvTable(csvPath, headers, rows);
    console.log(`Updated ERROR HANDLING COVERAGE for ${updated} file(s).`);
  }

  console.log(`Files analyzed: ${processed}`);
  console.log('\n      Error Handling by Category:');
  Object.entries(summary.categoryCounts).forEach(([category, count]) => {
    const pct = processed === 0 ? 0 : ((count / processed) * 100).toFixed(1);
    console.log(`        ${category.padEnd(15)} ${count.toString().padStart(4)} (${pct}%)`);
  });

  console.log('\n      Risk Distribution:');
  Object.entries(summary.riskCounts).forEach(([risk, count]) => {
    const pct = processed === 0 ? 0 : ((count / processed) * 100).toFixed(1);
    const icon = risk === 'HIGH' ? '🔴' : risk === 'MEDIUM' ? '🟡' : '🟢';
    console.log(`        ${icon} ${risk.padEnd(8)} ${count.toString().padStart(4)} (${pct}%)`);
  });

  if (summary.errors > 0) {
    console.log(`\n      Entries skipped due to read/parse errors: ${summary.errors}`);
  }

  console.log('\n[4/5] Identifying critical risks...');
  const adobeNoError = countMatches(rows, ioIndex, errorIndex, (ioValue, errorValue) =>
    ioValue.toUpperCase().includes('ADOBE:') && errorValue.toUpperCase().startsWith('NONE')
  );
  const asyncNoError = countMatches(
    rows,
    execIndex,
    errorIndex,
    (execValue, errorValue) =>
      execValue.toLowerCase().includes('async') && errorValue.toUpperCase().startsWith('NONE')
  );
  const stateNoError = countMatches(
    rows,
    sideEffectsIndex,
    errorIndex,
    (sideValue, errorValue) =>
      sideValue.toUpperCase().includes('STATE:') && errorValue.toUpperCase().startsWith('NONE')
  );

  console.log(`      Adobe API without error handling: ${adobeNoError} files ⚠️`);
  console.log(`      Async code without error handling: ${asyncNoError} files ⚠️`);
  console.log(`      State mutations without error handling: ${stateNoError} files ⚠️`);

  console.log('\nTop 10 high-risk files:');
  highRiskCandidates
    .sort((a, b) => {
      const scoreA = (a.complexity || 1) * (a.loc || 1);
      const scoreB = (b.complexity || 1) * (b.loc || 1);
      return scoreB - scoreA;
    })
    .slice(0, 10)
    .forEach((item, index) => {
      console.log(
        `  ${index + 1}. ${item.file} | Context: ${item.context || 'unknown'} | Complexity: ${
          item.complexity || 'N/A'
        } | LOC: ${item.loc || 'N/A'}`
      );
    });
}

function countMatches(rows, valueIndex, errorIndex, predicate) {
  if (valueIndex === -1) {
    return 0;
  }
  return rows.reduce((acc, row) => {
    const value = (row[valueIndex] ?? '');
    const errorValue = (row[errorIndex] ?? '');
    if (value && predicate(value, errorValue)) {
      return acc + 1;
    }
    return acc;
  }, 0);
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
  for (let i = 0; i < typeIndex; i += 1) {
    const value = (row[i] ?? '').trim();
    if (value) {
      segments.push(value);
    }
  }
  if (segments.length === 0) {
    return '';
  }
  return segments.reduce((acc, segment) => (acc ? path.join(acc, segment) : segment), '');
}

async function analyzeErrorHandling(source, filePath) {
  let ast;
  try {
    const parseResult = await prettier.__debug.parse(source, {
      filepath: filePath,
      parser: 'babel',
      plugins: [parserBabel],
    });
    ast = parseResult.ast;
  } catch (error) {
    console.warn(
      `Unable to parse ${path.relative(workspaceRoot, filePath)}: ${error.message}`
    );
    return null;
  }

  const stats = {
    tryCatch: 0,
    promiseCatch: 0,
    errorCallbacks: 0,
    throwStatements: 0,
    errorClasses: 0,
    asyncTryCatch: 0,
    finallyBlocks: 0,
  };

  traverseAst(ast, (node) => {
    if (node.type === 'TryStatement') {
      if (node.handler) {
        stats.tryCatch += 1;
        if (containsAwait(node.block)) {
          stats.asyncTryCatch += 1;
        }
      }
      if (node.finalizer) {
        stats.finallyBlocks += 1;
      }
      return;
    }

    if (node.type === 'CallExpression') {
      if (isMemberExpressionNamed(node.callee, 'catch')) {
        stats.promiseCatch += 1;
      }
      stats.errorCallbacks += countErrorCallbackArgs(node.arguments);
      return;
    }

    if (node.type === 'ThrowStatement') {
      stats.throwStatements += 1;
      return;
    }

    if (
      node.type === 'ClassDeclaration' ||
      node.type === 'ClassExpression'
    ) {
      if (extendsError(node.superClass)) {
        stats.errorClasses += 1;
      }
    }
  });

  return stats;
}

function containsAwait(node) {
  if (!node || typeof node.type !== 'string') {
    return false;
  }
  if (node.type === 'AwaitExpression') {
    return true;
  }
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (containsAwait(child)) {
          return true;
        }
      }
    } else if (value && typeof value.type === 'string') {
      if (containsAwait(value)) {
        return true;
      }
    }
  }
  return false;
}

function countErrorCallbackArgs(args) {
  let total = 0;
  args.forEach((arg) => {
    if (
      arg &&
      (arg.type === 'FunctionExpression' || arg.type === 'ArrowFunctionExpression')
    ) {
      const firstParam = arg.params?.[0];
      if (isErrorParameter(firstParam)) {
        total += 1;
      }
    }
  });
  return total;
}

function isErrorParameter(param) {
  if (!param) {
    return false;
  }
  if (param.type === 'Identifier') {
    return /^(err|error|e)$/i.test(param.name);
  }
  if (param.type === 'ObjectPattern') {
    return param.properties.some((prop) => {
      if (!prop || !prop.key) {
        return false;
      }
      if (prop.key.type === 'Identifier') {
        return /error/i.test(prop.key.name);
      }
      return false;
    });
  }
  return false;
}

function extendsError(superClass) {
  if (!superClass) {
    return false;
  }
  if (superClass.type === 'Identifier') {
    return /Error$/.test(superClass.name);
  }
  if (
    superClass.type === 'MemberExpression' &&
    !superClass.computed &&
    superClass.property.type === 'Identifier'
  ) {
    return /Error$/.test(superClass.property.name);
  }
  return false;
}

function isMemberExpressionNamed(node, propertyName) {
  return (
    node &&
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property.type === 'Identifier' &&
    node.property.name === propertyName
  );
}

function categorizeErrorHandling(patterns, execValue, loc) {
  const totalHandlers =
    patterns.tryCatch + patterns.promiseCatch + patterns.errorCallbacks;

  if (totalHandlers === 0) {
    return {
      category: 'NONE',
      risk: 'HIGH',
      details: 'No error handling detected',
      ratio: 0,
      score: 0,
    };
  }

  let score = totalHandlers;
  if (patterns.asyncTryCatch > 0) {
    score += patterns.asyncTryCatch * 0.5;
  }
  score += patterns.finallyBlocks * 0.3;
  score += patterns.errorClasses * 2;

  let category = 'minimal';
  if (score >= 10) {
    category = 'comprehensive';
  } else if (score >= 5) {
    category = 'good';
  } else if (score >= 2) {
    category = 'basic';
  }

  let risk = category === 'good' || category === 'comprehensive' ? 'LOW' : 'MEDIUM';
  if (category === 'minimal') {
    risk = 'HIGH';
  }

  const isAsyncContext =
    typeof execValue === 'string' &&
    (execValue.includes('async') || execValue.includes('mixed'));
  const hasAsyncHandling = patterns.asyncTryCatch > 0 || patterns.promiseCatch > 0;

  if (isAsyncContext && !hasAsyncHandling) {
    risk = totalHandlers > 0 ? 'MEDIUM' : 'HIGH';
  }

  const ratio = loc > 0 ? ((totalHandlers / loc) * 100).toFixed(1) : '0.0';

  const detailParts = [];
  if (patterns.tryCatch > 0) {
    detailParts.push(`${patterns.tryCatch}×try/catch`);
  }
  if (patterns.promiseCatch > 0) {
    detailParts.push(`${patterns.promiseCatch}×.catch()`);
  }
  if (patterns.errorCallbacks > 0) {
    detailParts.push(`${patterns.errorCallbacks}×callbacks`);
  }
  if (patterns.errorClasses > 0) {
    detailParts.push(`${patterns.errorClasses}×custom`);
  }

  return {
    category,
    risk,
    details: detailParts.join(', '),
    ratio,
    score: score.toFixed(1),
  };
}

function formatErrorHandling(result) {
  if (result.category === 'NONE') {
    return `NONE [${result.risk} RISK]`;
  }

  const detailText = result.details ? `(${result.details}) ` : '';
  return `${result.category} ${detailText}[${result.risk}]`.trim();
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

main().catch((error) => {
  console.error('Error handling coverage update failed:', error.message);
  process.exit(1);
});
