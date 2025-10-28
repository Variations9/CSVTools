// UPDATE API USAGE - Track API calls and external service integrations

// ============================================================================
// SECTION 1: DEPENDENCIES
// ============================================================================
import fs from 'node:fs/promises';
import path from 'node:path';
import prettier from 'prettier';
import parserBabel from 'prettier/plugins/babel';
import {
  loadCsvTable,
  writeCsvTable,
  ensureColumn,
  createValueAccessor,
  buildRowPath,
} from './lib/table-helpers.mjs';

// ============================================================================
// SECTION 2: CONFIGURATION
// ============================================================================
const workspaceRoot = process.cwd();
const csvOverride = process.env.CSV_PROJECT_MAP_PATH ?? '';

// API call patterns to detect
const API_PATTERNS = {
  // HTTP/REST APIs
  FETCH: /\bfetch\s*\(/g,
  AXIOS: /\baxios\s*\.\s*(get|post|put|delete|patch|request)\s*\(/g,
  JQUERY_AJAX: /\$\s*\.\s*ajax\s*\(/g,
  XHR: /new\s+XMLHttpRequest\s*\(/g,
  
  // GraphQL
  GRAPHQL_QUERY: /\b(useQuery|useMutation|query|mutation)\s*\(/g,
  
  // Database patterns
  SQL_QUERY: /\b(SELECT|INSERT|UPDATE|DELETE|EXEC|EXECUTE)\s+/gi,
  MONGODB: /\b(find|findOne|insertOne|updateOne|deleteOne|aggregate)\s*\(/g,
  
  // Third-party services
  STRIPE: /\bstripe\s*\./gi,
  TWILIO: /\btwilio\s*\./gi,
  AWS_SDK: /\b(AWS|S3|DynamoDB|Lambda)\s*\./g,
  FIREBASE: /\bfirebase\s*\./gi,
  
  // WebSockets
  WEBSOCKET: /new\s+WebSocket\s*\(/g,
  SOCKET_IO: /\bio\s*\(/g,
};

// Supported file extensions for API analysis
const SUPPORTED_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.jsx',
  '.ts', '.tsx',
  '.py',
  '.cs',
]);

// ============================================================================
// SECTION 3: MAIN WORKFLOW ORCHESTRATION
// ============================================================================

/**
 * main
 * 
 * Purpose: Orchestrate the API usage extraction workflow
 * Behavior:
 * - Loads CSV table and ensures API USAGE column exists
 * - Iterates through all code files
 * - Analyzes each file for API calls
 * - Updates CSV with categorized API usage information
 * - Writes updated CSV if changes detected
 * 
 * @returns {Promise<void>}
 */
async function main() {
  console.log('============================================================');
  console.log('API Usage Extraction');
  console.log('============================================================\n');
  
  const { csvPath, headers, rows } = await loadCsvTable(csvOverride || undefined);
  
  // Ensure required columns exist
  const apiUsageIndex = ensureColumn(headers, rows, 'API USAGE');
  const getValue = createValueAccessor(headers);
  const typeIndex = headers.findIndex(h => h.trim().toUpperCase() === 'TYPE');
  
  if (typeIndex === -1) {
    throw new Error('Unable to locate "Type" column in CSV header.');
  }
  
  console.log(`Analyzing files for API usage patterns...\n`);
  
  const updatedEntries = [];
  let analyzedCount = 0;
  let skippedCount = 0;
  
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const type = getValue(row, 'Type', '').toLowerCase().trim();
    
    // Skip folders
    if (type === 'folder') {
      continue;
    }
    
    // Check if file type is supported
    if (!isSupportedFileType(type)) {
      skippedCount++;
      continue;
    }
    
    // Build file path
    const rowPath = buildRowPath(row, typeIndex);
    const fullPath = path.join(workspaceRoot, rowPath);
    
    try {
      // Read and analyze file
      const fileContent = await fs.readFile(fullPath, 'utf8');
      const apiUsage = await analyzeApiUsage(fileContent, type, fullPath);
      
      // Update row if API usage differs from existing value
      const currentValue = (row[apiUsageIndex] ?? '').trim();
      if (apiUsage !== currentValue) {
        row[apiUsageIndex] = apiUsage;
        updatedEntries.push({
          path: rowPath,
          apiUsage: apiUsage.substring(0, 100) + (apiUsage.length > 100 ? '...' : ''),
        });
      }
      
      analyzedCount++;
    } catch (error) {
      console.warn(`Unable to analyze ${rowPath}: ${error.message}`);
      skippedCount++;
    }
  }
  
  // Write updated CSV if changes detected
  if (updatedEntries.length > 0) {
    await writeCsvTable(csvPath, headers, rows);
    console.log(`\n${'='.repeat(60)}`);
    console.log('API Usage Extraction Complete');
    console.log(`${'='.repeat(60)}`);
    console.log(`Files analyzed:    ${analyzedCount}`);
    console.log(`Files updated:     ${updatedEntries.length}`);
    console.log(`Files skipped:     ${skippedCount}`);
    console.log(`CSV file updated:  ${csvPath}\n`);
    
    // Show sample of updated entries
    if (updatedEntries.length > 0) {
      console.log('Sample updated entries:');
      updatedEntries.slice(0, 5).forEach(entry => {
        console.log(`  ${entry.path}`);
        console.log(`    → ${entry.apiUsage}`);
      });
      if (updatedEntries.length > 5) {
        console.log(`  ... and ${updatedEntries.length - 5} more`);
      }
      console.log();
    }
  } else {
    console.log('\nNo API usage changes detected.');
    console.log(`Files analyzed: ${analyzedCount}, Files skipped: ${skippedCount}\n`);
  }
}

// ============================================================================
// SECTION 4: FILE TYPE CHECKING
// ============================================================================

/**
 * isSupportedFileType
 * 
 * Purpose: Check if file type is supported for API analysis
 * 
 * @param {string} type - File type from CSV (e.g., ".js file")
 * @returns {boolean} True if file type is supported
 */
function isSupportedFileType(type) {
  return Array.from(SUPPORTED_EXTENSIONS).some(ext => 
    type.includes(ext)
  );
}

// ============================================================================
// SECTION 5: API USAGE ANALYSIS - DISPATCHER
// ============================================================================

/**
 * analyzeApiUsage
 * 
 * Purpose: Analyze file content for API calls and categorize them
 * Behavior:
 * - Routes to language-specific analyzer based on file type
 * - Detects various API patterns (REST, GraphQL, Database, etc.)
 * - Returns formatted summary of API usage
 * 
 * @param {string} content - File content to analyze
 * @param {string} type - File type (e.g., ".js file")
 * @param {string} filePath - Full file path for context
 * @returns {Promise<string>} Formatted API usage summary
 */
async function analyzeApiUsage(content, type, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  if (['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx'].includes(ext)) {
    return await analyzeJavaScriptApiUsage(content);
  } else if (ext === '.py') {
    return analyzePythonApiUsage(content);
  } else if (ext === '.cs') {
    return analyzeCSharpApiUsage(content);
  }
  
  return '';
}

// ============================================================================
// SECTION 6: JAVASCRIPT/TYPESCRIPT API ANALYSIS
// ============================================================================

/**
 * analyzeJavaScriptApiUsage
 * 
 * Purpose: Analyze JavaScript/TypeScript files for API calls using AST parsing
 * Features:
 * - Detects fetch() calls with URLs
 * - Identifies axios methods (get, post, put, delete)
 * - Finds GraphQL queries/mutations
 * - Detects third-party SDK usage (Stripe, AWS, Firebase, etc.)
 * - Tracks WebSocket connections
 * - Identifies database operations
 * 
 * @param {string} content - JavaScript/TypeScript source code
 * @returns {Promise<string>} Formatted API usage summary
 */
async function analyzeJavaScriptApiUsage(content) {
  const apiCalls = {
    rest: new Set(),
    graphql: new Set(),
    database: new Set(),
    thirdParty: new Set(),
    websocket: new Set(),
  };
  
  try {
    // Parse JavaScript/TypeScript using Prettier
    const ast = await prettier.__debug.parse(content, {
      parser: 'babel',
      plugins: [parserBabel],
    });
    
    // Traverse AST to find API calls
    traverseAst(ast, {
      CallExpression: (node) => {
        handleCallExpression(node, apiCalls);
      },
      NewExpression: (node) => {
        handleNewExpression(node, apiCalls);
      },
      TaggedTemplateExpression: (node) => {
        handleTaggedTemplate(node, apiCalls);
      },
    });
    
  } catch (error) {
    // Fallback to regex-based detection if AST parsing fails
    console.warn(`AST parsing failed, using regex fallback`);
    return regexBasedApiDetection(content);
  }
  
  return formatApiUsage(apiCalls);
}

/**
 * handleCallExpression
 * 
 * Purpose: Process function call expressions to detect API usage
 * Patterns detected:
 * - fetch(url, options)
 * - axios.get/post/put/delete(url)
 * - db.collection.find()
 * - stripe.charges.create()
 * - socket.emit()
 * 
 * @param {Object} node - AST node for CallExpression
 * @param {Object} apiCalls - Accumulator object for API calls
 */
function handleCallExpression(node, apiCalls) {
  const calleeName = getCalleeName(node.callee);
  
  // Detect fetch() calls
  if (calleeName === 'fetch' && node.arguments.length > 0) {
    const url = extractStringValue(node.arguments[0]);
    if (url) {
      apiCalls.rest.add(`fetch → ${url}`);
    }
  }
  
  // Detect axios calls
  if (calleeName.startsWith('axios.')) {
    const method = calleeName.split('.')[1]?.toUpperCase();
    const url = extractStringValue(node.arguments[0]);
    if (url && method) {
      apiCalls.rest.add(`${method} → ${url} [axios]`);
    }
  }
  
  // Detect jQuery AJAX
  if (calleeName === '$.ajax' || calleeName === 'jQuery.ajax') {
    apiCalls.rest.add('AJAX → jQuery');
  }
  
  // Detect GraphQL
  if (['useQuery', 'useMutation', 'query', 'mutation'].includes(calleeName)) {
    const queryName = extractQueryName(node);
    apiCalls.graphql.add(`GraphQL → ${queryName || 'query'}`);
  }
  
  // Detect MongoDB operations
  const mongoOps = ['find', 'findOne', 'insertOne', 'updateOne', 'deleteOne', 'aggregate'];
  if (mongoOps.some(op => calleeName.endsWith(`.${op}`))) {
    const collection = extractCollectionName(calleeName);
    apiCalls.database.add(`MongoDB → ${collection}`);
  }
  
  // Detect third-party services
  detectThirdPartyService(calleeName, apiCalls);
  
  // Detect WebSocket operations
  if (calleeName.includes('socket.') || calleeName === 'io') {
    apiCalls.websocket.add(`WebSocket → ${calleeName}`);
  }
}

/**
 * handleNewExpression
 * 
 * Purpose: Process 'new' expressions to detect API clients
 * Patterns detected:
 * - new XMLHttpRequest()
 * - new WebSocket(url)
 * - new AWS.S3()
 * 
 * @param {Object} node - AST node for NewExpression
 * @param {Object} apiCalls - Accumulator object for API calls
 */
function handleNewExpression(node, apiCalls) {
  const className = getCalleeName(node.callee);
  
  if (className === 'XMLHttpRequest') {
    apiCalls.rest.add('XMLHttpRequest → XHR');
  }
  
  if (className === 'WebSocket') {
    const url = extractStringValue(node.arguments[0]);
    apiCalls.websocket.add(`WebSocket → ${url || 'connection'}`);
  }
  
  // AWS SDK
  if (className.startsWith('AWS.')) {
    const service = className.split('.')[1];
    apiCalls.thirdParty.add(`AWS → ${service}`);
  }
}

/**
 * handleTaggedTemplate
 * 
 * Purpose: Process tagged template literals (GraphQL queries)
 * Pattern: gql`query { ... }`
 * 
 * @param {Object} node - AST node for TaggedTemplateExpression
 * @param {Object} apiCalls - Accumulator object for API calls
 */
function handleTaggedTemplate(node, apiCalls) {
  const tagName = getCalleeName(node.tag);
  
  if (tagName === 'gql' || tagName === 'graphql') {
    apiCalls.graphql.add('GraphQL → gql template');
  }
  
  if (tagName === 'sql' || tagName === 'SQL') {
    apiCalls.database.add('SQL → tagged template');
  }
}

/**
 * detectThirdPartyService
 * 
 * Purpose: Identify calls to third-party service SDKs
 * Services detected:
 * - Stripe (payment processing)
 * - Twilio (SMS/Voice)
 * - SendGrid (email)
 * - Firebase (backend services)
 * - Auth0 (authentication)
 * 
 * @param {string} calleeName - Name of the called function
 * @param {Object} apiCalls - Accumulator object for API calls
 */
function detectThirdPartyService(calleeName, apiCalls) {
  const services = {
    stripe: 'Stripe (Payment)',
    twilio: 'Twilio (SMS)',
    sendgrid: 'SendGrid (Email)',
    firebase: 'Firebase',
    auth0: 'Auth0 (Auth)',
    aws: 'AWS',
    google: 'Google Cloud',
    azure: 'Azure',
    mailchimp: 'Mailchimp',
    slack: 'Slack API',
  };
  
  const lowerCallee = calleeName.toLowerCase();
  
  for (const [key, label] of Object.entries(services)) {
    if (lowerCallee.includes(key)) {
      apiCalls.thirdParty.add(label);
      break;
    }
  }
}

// ============================================================================
// SECTION 7: PYTHON API ANALYSIS
// ============================================================================

/**
 * analyzePythonApiUsage
 * 
 * Purpose: Analyze Python files for API calls using regex patterns
 * Patterns detected:
 * - requests.get/post/put/delete
 * - urllib.request
 * - Django ORM queries
 * - SQLAlchemy operations
 * - Third-party SDKs (boto3, twilio, stripe, etc.)
 * 
 * @param {string} content - Python source code
 * @returns {string} Formatted API usage summary
 */
function analyzePythonApiUsage(content) {
  const apiCalls = {
    rest: new Set(),
    graphql: new Set(),
    database: new Set(),
    thirdParty: new Set(),
    websocket: new Set(),
  };
  
  // Detect requests library
  const requestsPattern = /requests\.(get|post|put|delete|patch)\s*\(/gi;
  let match;
  while ((match = requestsPattern.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    apiCalls.rest.add(`${method} → requests library`);
  }
  
  // Detect urllib
  if (content.includes('urllib.request')) {
    apiCalls.rest.add('HTTP → urllib');
  }
  
  // Detect Django ORM
  if (content.match(/\.objects\.(get|filter|create|update|delete)\(/)) {
    apiCalls.database.add('Django ORM');
  }
  
  // Detect SQLAlchemy
  if (content.includes('session.query') || content.includes('session.add')) {
    apiCalls.database.add('SQLAlchemy');
  }
  
  // Detect boto3 (AWS SDK for Python)
  if (content.includes('boto3.client') || content.includes('boto3.resource')) {
    apiCalls.thirdParty.add('AWS → boto3');
  }
  
  // Detect other Python SDKs
  const pythonSdks = {
    'stripe.': 'Stripe (Payment)',
    'twilio.': 'Twilio (SMS)',
    'sendgrid.': 'SendGrid (Email)',
    'firebase_admin.': 'Firebase',
  };
  
  for (const [pattern, label] of Object.entries(pythonSdks)) {
    if (content.includes(pattern)) {
      apiCalls.thirdParty.add(label);
    }
  }
  
  // Detect GraphQL
  if (content.includes('graphql') || content.includes('GraphQLClient')) {
    apiCalls.graphql.add('GraphQL → Python client');
  }
  
  return formatApiUsage(apiCalls);
}

// ============================================================================
// SECTION 8: C# API ANALYSIS
// ============================================================================

/**
 * analyzeCSharpApiUsage
 * 
 * Purpose: Analyze C# files for API calls using regex patterns
 * Patterns detected:
 * - HttpClient methods (GetAsync, PostAsync, etc.)
 * - WebClient usage
 * - Entity Framework queries
 * - ADO.NET database operations
 * - Third-party SDKs
 * 
 * @param {string} content - C# source code
 * @returns {string} Formatted API usage summary
 */
function analyzeCSharpApiUsage(content) {
  const apiCalls = {
    rest: new Set(),
    graphql: new Set(),
    database: new Set(),
    thirdParty: new Set(),
    websocket: new Set(),
  };
  
  // Detect HttpClient
  const httpClientPattern = /(GetAsync|PostAsync|PutAsync|DeleteAsync|SendAsync)\s*\(/g;
  if (httpClientPattern.test(content)) {
    apiCalls.rest.add('HTTP → HttpClient');
  }
  
  // Detect WebClient
  if (content.includes('new WebClient') || content.includes('WebClient.')) {
    apiCalls.rest.add('HTTP → WebClient');
  }
  
  // Detect Entity Framework
  if (content.match(/\.Where\(|\.FirstOrDefault\(|\.ToList\(/)) {
    apiCalls.database.add('Entity Framework (LINQ)');
  }
  
  // Detect ADO.NET
  if (content.includes('SqlCommand') || content.includes('SqlConnection')) {
    apiCalls.database.add('ADO.NET → SQL Server');
  }
  
  // Detect SignalR (WebSocket)
  if (content.includes('HubConnection') || content.includes('SignalR')) {
    apiCalls.websocket.add('SignalR → Real-time');
  }
  
  // Detect third-party SDKs
  const csharpSdks = {
    'Stripe.': 'Stripe (Payment)',
    'Twilio.': 'Twilio (SMS)',
    'SendGrid.': 'SendGrid (Email)',
    'FirebaseAdmin.': 'Firebase',
    'Amazon.': 'AWS SDK',
  };
  
  for (const [pattern, label] of Object.entries(csharpSdks)) {
    if (content.includes(pattern)) {
      apiCalls.thirdParty.add(label);
    }
  }
  
  return formatApiUsage(apiCalls);
}

// ============================================================================
// SECTION 9: REGEX-BASED FALLBACK
// ============================================================================

/**
 * regexBasedApiDetection
 * 
 * Purpose: Fallback API detection using regex when AST parsing fails
 * 
 * @param {string} content - Source code content
 * @returns {string} Formatted API usage summary
 */
function regexBasedApiDetection(content) {
  const detected = [];
  
  for (const [key, pattern] of Object.entries(API_PATTERNS)) {
    if (pattern.test(content)) {
      detected.push(key.replace(/_/g, ' '));
    }
  }
  
  return detected.length > 0 ? detected.join('; ') : '';
}

// ============================================================================
// SECTION 10: UTILITY FUNCTIONS
// ============================================================================

/**
 * getCalleeName
 * 
 * Purpose: Extract full callee name from AST node
 * Examples:
 * - fetch → "fetch"
 * - axios.get → "axios.get"
 * - db.users.find → "db.users.find"
 * 
 * @param {Object} callee - AST callee node
 * @returns {string} Full callee name with dots
 */
function getCalleeName(callee) {
  if (!callee) return '';
  
  if (callee.type === 'Identifier') {
    return callee.name || '';
  }
  
  if (callee.type === 'MemberExpression') {
    const object = getCalleeName(callee.object);
    const property = callee.property?.name || '';
    return object ? `${object}.${property}` : property;
  }
  
  return '';
}

/**
 * extractStringValue
 * 
 * Purpose: Extract string value from AST node
 * Handles:
 * - String literals: "https://api.example.com"
 * - Template literals: `https://${domain}/api`
 * 
 * @param {Object} node - AST node
 * @returns {string|null} Extracted string value or null
 */
function extractStringValue(node) {
  if (!node) return null;
  
  if (node.type === 'StringLiteral' || node.type === 'Literal') {
    return node.value;
  }
  
  if (node.type === 'TemplateLiteral') {
    // Extract template literal parts
    const parts = node.quasis?.map(q => q.value?.cooked || '') || [];
    return parts.join('${...}');
  }
  
  return null;
}

/**
 * extractQueryName
 * 
 * Purpose: Extract GraphQL query/mutation name from AST node
 * 
 * @param {Object} node - CallExpression node
 * @returns {string|null} Query name or null
 */
function extractQueryName(node) {
  // Try to extract from first argument if it's a tagged template
  if (node.arguments[0]?.type === 'TaggedTemplateExpression') {
    const template = node.arguments[0].quasi?.quasis?.[0]?.value?.raw || '';
    const match = template.match(/(query|mutation)\s+(\w+)/);
    return match ? match[2] : null;
  }
  
  return null;
}

/**
 * extractCollectionName
 * 
 * Purpose: Extract database collection/table name from method chain
 * Example: "db.users.find" → "users"
 * 
 * @param {string} calleeName - Full callee name
 * @returns {string} Collection name
 */
function extractCollectionName(calleeName) {
  const parts = calleeName.split('.');
  return parts.length > 2 ? parts[parts.length - 2] : 'collection';
}

/**
 * formatApiUsage
 * 
 * Purpose: Format API calls into readable summary string
 * Format: "REST{method → url}; GraphQL{query}; Database{type}; ThirdParty{service}"
 * 
 * @param {Object} apiCalls - Categorized API calls
 * @returns {string} Formatted summary
 */
function formatApiUsage(apiCalls) {
  const sections = [];
  
  if (apiCalls.rest.size > 0) {
    const calls = Array.from(apiCalls.rest).slice(0, 3).join('; ');
    const more = apiCalls.rest.size > 3 ? ` (+${apiCalls.rest.size - 3} more)` : '';
    sections.push(`REST{${calls}${more}}`);
  }
  
  if (apiCalls.graphql.size > 0) {
    const calls = Array.from(apiCalls.graphql).slice(0, 2).join('; ');
    sections.push(`GraphQL{${calls}}`);
  }
  
  if (apiCalls.database.size > 0) {
    const calls = Array.from(apiCalls.database).slice(0, 2).join('; ');
    sections.push(`Database{${calls}}`);
  }
  
  if (apiCalls.thirdParty.size > 0) {
    const calls = Array.from(apiCalls.thirdParty).join('; ');
    sections.push(`ThirdParty{${calls}}`);
  }
  
  if (apiCalls.websocket.size > 0) {
    const calls = Array.from(apiCalls.websocket).slice(0, 2).join('; ');
    sections.push(`WebSocket{${calls}}`);
  }
  
  return sections.join(' | ');
}

/**
 * traverseAst
 * 
 * Purpose: Recursively traverse AST and apply visitor functions
 * 
 * @param {Object} node - Current AST node
 * @param {Object} visitor - Visitor object with handler functions
 */
function traverseAst(node, visitor) {
  if (!node || typeof node !== 'object') return;
  
  // Apply visitor to current node type
  if (node.type && visitor[node.type]) {
    visitor[node.type](node);
  }
  
  // Recurse into child nodes
  Object.keys(node).forEach(key => {
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach(item => traverseAst(item, visitor));
    } else if (child && typeof child === 'object') {
      traverseAst(child, visitor);
    }
  });
}

// ============================================================================
// SECTION 11: EXECUTION
// ============================================================================

main().catch(error => {
  console.error('\n❌ Fatal error during API usage extraction:');
  console.error(error.message);
  console.error(error.stack);
  process.exit(1);
});
