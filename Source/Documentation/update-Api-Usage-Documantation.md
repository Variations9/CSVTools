# API Usage Extractor Documentation

## Overview

The **updateApiUsage.mjs** script analyzes your codebase to identify and categorize all external API calls, database operations, and third-party service integrations. This is invaluable for security audits, dependency mapping, API migration planning, and understanding your application's external touchpoints.

---

## What It Detects

### 1. **REST/HTTP APIs**
- `fetch()` calls with URLs
- Axios methods (get, post, put, delete, patch)
- jQuery AJAX operations
- XMLHttpRequest usage
- Python `requests` library
- C# HttpClient/WebClient

**Example Output:**
```
REST{GET → https://api.example.com/users [axios]; fetch → /api/products}
```

### 2. **GraphQL**
- useQuery/useMutation hooks (React)
- GraphQL client operations
- Tagged template queries (gql`...`)

**Example Output:**
```
GraphQL{query → GetUsers; mutation → CreatePost}
```

### 3. **Database Operations**
- MongoDB operations (find, insertOne, updateOne, etc.)
- SQL queries (SELECT, INSERT, UPDATE, DELETE)
- Entity Framework (C# LINQ)
- Django ORM (Python)
- SQLAlchemy (Python)
- ADO.NET (C#)

**Example Output:**
```
Database{MongoDB → users; SQL → tagged template}
```

### 4. **Third-Party Services**
- **Payment:** Stripe
- **Communication:** Twilio (SMS), SendGrid (Email)
- **Cloud:** AWS SDK, Google Cloud, Azure, Firebase
- **Auth:** Auth0
- **Marketing:** Mailchimp
- **Collaboration:** Slack API

**Example Output:**
```
ThirdParty{Stripe (Payment); AWS; Firebase}
```

### 5. **Real-Time Communication**
- WebSocket connections
- Socket.io
- SignalR (C#)

**Example Output:**
```
WebSocket{WebSocket → wss://example.com; socket.emit}
```

---

## Installation & Usage

### Step 1: Copy Script to Project

```bash
# Copy to your CSV tools directory
cp updateApiUsage.mjs /path/to/your/project/Source/Tools/CSVTools/
```

### Step 2: Run Standalone

```bash
# From your workspace root
node Source/Tools/CSVTools/updateApiUsage.mjs
```

**Output:**
```
============================================================
API Usage Extraction
============================================================

Analyzing files for API usage patterns...

============================================================
API Usage Extraction Complete
============================================================
Files analyzed:    247
Files updated:     83
Files skipped:     164
CSV file updated:  Source/ProjectMap/SourceFolder.csv

Sample updated entries:
  Source/api/users.js
    → REST{GET → /api/users [axios]; POST → /api/users [axios]} | Database{MongoDB → users}
  Source/services/payment.js
    → ThirdParty{Stripe (Payment)} | REST{POST → /api/charges}
  Source/realtime/socket.js
    → WebSocket{socket.emit; socket.on}
  ... and 80 more
```

### Step 3: Integrate with Workflow

Edit `update-csv-workflow.mjs` to include the API usage extractor:

```javascript
// Add after other extractors
const apiUsageScriptPath = path.join(__dirname, 'updateApiUsage.mjs');
await executeScript(apiUsageScriptPath, 'API Usage Extraction', {
  env: {
    CSV_PROJECT_MAP_PATH: snapshotPath,
  },
});
```

Update the workflow header:

```javascript
console.log('This workflow runs:');
console.log('  1) File system to CSV synchronization');
// ... existing steps
console.log('  9) Side effects extraction (Column P)');
console.log(' 10) API usage extraction (Column API USAGE)');  // <-- Add this
console.log(' 11) Cyclomatic complexity extraction (Column Y)');
// ... rest of steps
```

---

## Example Outputs by File Type

### JavaScript/TypeScript Example

**Input file (api/users.js):**
```javascript
import axios from 'axios';

export async function getUsers() {
  const response = await fetch('/api/users');
  return response.json();
}

export async function createUser(data) {
  return axios.post('https://api.example.com/users', data);
}

export async function getUserById(id) {
  const user = await db.collection('users').findOne({ _id: id });
  return user;
}
```

**CSV Column Output:**
```
REST{fetch → /api/users; POST → https://api.example.com/users [axios]} | Database{MongoDB → users}
```

---

### Python Example

**Input file (services/email.py):**
```python
import requests
from sendgrid import SendGridAPIClient
from twilio.rest import Client

def send_email(to, subject, body):
    sg = SendGridAPIClient(api_key=os.environ.get('SENDGRID_API_KEY'))
    sg.send(...)

def send_sms(to, message):
    client = Client(account_sid, auth_token)
    client.messages.create(to=to, body=message)

def notify_slack(webhook_url, message):
    requests.post(webhook_url, json={'text': message})
```

**CSV Column Output:**
```
ThirdParty{SendGrid (Email); Twilio (SMS)} | REST{POST → requests library}
```

---

### C# Example

**Input file (Controllers/PaymentController.cs):**
```csharp
using Stripe;
using Microsoft.EntityFrameworkCore;

public class PaymentController {
    public async Task<IActionResult> CreateCharge() {
        var service = new ChargeService();
        var charge = await service.CreateAsync(...);
        
        var payment = await _context.Payments
            .Where(p => p.Status == "pending")
            .FirstOrDefaultAsync();
            
        return Ok(payment);
    }
}
```

**CSV Column Output:**
```
ThirdParty{Stripe (Payment)} | Database{Entity Framework (LINQ)}
```

---

## Use Cases

### 1. Security Audit

**Query the CSV to find:**
```sql
-- Files making external network calls
SELECT File, `API USAGE` 
WHERE `API USAGE` LIKE '%REST%' 
ORDER BY File

-- Files using third-party services
SELECT File, `API USAGE`
WHERE `API USAGE` LIKE '%ThirdParty%'

-- Files with database operations but no error handling
SELECT File, `API USAGE`, `ERROR HANDLING COVERAGE`
WHERE `API USAGE` LIKE '%Database%' 
  AND `ERROR HANDLING COVERAGE` = 'NONE'
```

**Findings:**
- Identify all external API endpoints for penetration testing
- List all third-party services for compliance review
- Find unsafe database operations

---

### 2. API Migration Planning

**Scenario:** Migrating from REST to GraphQL

**Query:**
```sql
SELECT File, `API USAGE`
WHERE `API USAGE` LIKE '%REST%fetch%'
ORDER BY `LINES OF CODE` DESC
```

**Results:**
- 23 files use REST APIs
- Prioritize by LOC (largest files first)
- Track migration progress in spreadsheet

---

### 3. Dependency Analysis

**Scenario:** Which files depend on Stripe?

**Query:**
```sql
SELECT File, `API USAGE`, `SIDE EFFECTS`
WHERE `API USAGE` LIKE '%Stripe%'
```

**Results:**
- 5 files integrate with Stripe
- All files have network side effects
- 2 files missing error handling (HIGH RISK)

---

### 4. Cost Optimization

**Scenario:** Find all files making AWS S3 calls

**Query:**
```sql
SELECT File, `API USAGE`, `ORDER_OF_OPERATIONS`
WHERE `API USAGE` LIKE '%AWS%'
```

**Results:**
- Identify redundant API calls
- Optimize file upload sequences
- Cache frequently accessed objects

---

### 5. API Rate Limit Tracking

**Scenario:** Which files might hit rate limits?

**Cross-reference with other columns:**
```sql
SELECT File, `API USAGE`, `ORDER_OF_OPERATIONS`, `CYCLOMATIC COMPLEXITY`
WHERE `API USAGE` LIKE '%REST%'
  AND `CYCLOMATIC COMPLEXITY` > 20
```

**Insight:**
- High complexity + many API calls = potential rate limit issues
- Add retry logic or request throttling

---

## Output Format Details

The script generates structured output in this format:

```
Category1{details} | Category2{details} | Category3{details}
```

### Categories:

| Category | Description | Example |
|----------|-------------|---------|
| **REST** | HTTP/REST API calls | `REST{GET → /api/users; POST → /api/products [axios]}` |
| **GraphQL** | GraphQL operations | `GraphQL{query → GetUsers; mutation → CreatePost}` |
| **Database** | Database operations | `Database{MongoDB → users; SQL → tagged template}` |
| **ThirdParty** | Third-party SDKs | `ThirdParty{Stripe (Payment); AWS; Firebase}` |
| **WebSocket** | Real-time connections | `WebSocket{socket.emit; WebSocket → wss://...}` |

### Truncation Rules:

- Each category shows up to 3 items
- If more exist, shows count: `(+5 more)`
- Total output truncated to 500 characters max

---

## Detection Methods

### JavaScript/TypeScript (AST-based)

**Advantages:**
- ✅ Accurate detection via Abstract Syntax Tree parsing
- ✅ Handles complex expressions
- ✅ Extracts actual URLs and method names

**Process:**
1. Parse code using Prettier + Babel
2. Traverse AST for CallExpression nodes
3. Identify patterns (fetch, axios, db operations)
4. Extract arguments (URLs, query names)

### Python/C# (Regex-based)

**Advantages:**
- ✅ Fast pattern matching
- ✅ No external parsing libraries needed
- ✅ Handles most common patterns

**Limitations:**
- ⚠️ May miss complex dynamic calls
- ⚠️ Less accurate than AST parsing

**Fallback:**
If AST parsing fails for JavaScript, script falls back to regex detection.

---

## Advanced Configuration

### Customize API Patterns

Edit the `API_PATTERNS` object to add custom detection:

```javascript
const API_PATTERNS = {
  // Add your custom patterns
  CUSTOM_API: /\bcustomApi\.(get|post)\s*\(/g,
  INTERNAL_SERVICE: /\binternalService\./g,
  
  // Existing patterns...
  FETCH: /\bfetch\s*\(/g,
  AXIOS: /\baxios\s*\.\s*(get|post|put|delete)\s*\(/g,
};
```

### Add New Third-Party Services

Edit `detectThirdPartyService()`:

```javascript
const services = {
  // Add custom services
  'yourSdk': 'YourSDK (Custom)',
  'internalApi': 'Internal API Gateway',
  
  // Existing services...
  stripe: 'Stripe (Payment)',
  twilio: 'Twilio (SMS)',
};
```

### Exclude Certain Files

Add filtering in the main loop:

```javascript
// Skip test files
if (rowPath.includes('/test/') || rowPath.includes('.test.')) {
  continue;
}

// Skip mock/stub files
if (rowPath.includes('/mocks/') || rowPath.includes('.mock.')) {
  continue;
}
```

---

## Troubleshooting

### Issue: "Unable to analyze [file]"

**Causes:**
- File contains syntax errors
- File encoding is not UTF-8
- File is too large (>1MB)

**Solutions:**
1. Check file for syntax errors
2. Convert file to UTF-8 encoding
3. Script will skip and continue with other files

---

### Issue: AST parsing fails frequently

**Symptom:** Console shows "AST parsing failed, using regex fallback"

**Causes:**
- Unsupported JavaScript syntax
- Prettier version mismatch

**Solutions:**
```bash
# Update Prettier to latest version
cd Source/Tools/CSVTools
npm install prettier@latest
```

---

### Issue: API calls not detected

**Debugging:**
1. Check if file extension is in `SUPPORTED_EXTENSIONS`
2. Verify pattern exists in detection logic
3. Add console logging to see what's being extracted:

```javascript
// Temporary debugging
console.log('Analyzing:', rowPath);
console.log('Detected APIs:', apiUsage);
```

---

## Integration with Other Columns

### Cross-Reference Examples

**1. API Usage + Side Effects**
```sql
SELECT File, `API USAGE`, `SIDE EFFECTS`
WHERE `API USAGE` LIKE '%REST%'
  AND `SIDE EFFECTS` NOT LIKE '%NETWORK%'
```
→ Inconsistency: File has REST calls but no network side effect recorded

**2. API Usage + Error Handling**
```sql
SELECT File, `API USAGE`, `ERROR HANDLING COVERAGE`
WHERE `API USAGE` LIKE '%Database%'
ORDER BY `ERROR HANDLING COVERAGE` ASC
```
→ Find database operations lacking error handling

**3. API Usage + Dependencies**
```sql
SELECT File, `API USAGE`, `DEPENDENCIES`
WHERE `API USAGE` LIKE '%axios%'
  AND `DEPENDENCIES` NOT LIKE '%axios%'
```
→ Inconsistency: Using axios but not importing it (may be global)

---

## Performance

### Benchmarks

| Project Size | Files | Processing Time |
|--------------|-------|-----------------|
| Small | 50 files | 3-5 seconds |
| Medium | 250 files | 15-25 seconds |
| Large | 1000 files | 60-90 seconds |

### Optimization Tips

**1. Skip unnecessary files:**
```javascript
// Skip documentation and config files
if (['.md', '.json', '.yaml', '.yml'].includes(ext)) {
  continue;
}
```

**2. Cache AST parsing results (future enhancement)**

**3. Parallel processing (future enhancement)**

---

## Future Enhancements

### Planned Features

- [ ] **URL Parameter Extraction** - Capture query params and path variables
- [ ] **Authentication Detection** - Identify API keys, tokens in code
- [ ] **API Version Tracking** - Detect versioned endpoints (v1, v2, etc.)
- [ ] **Rate Limit Annotations** - Detect rate limiting logic
- [ ] **Response Handling** - Track how API responses are processed
- [ ] **Caching Detection** - Identify API result caching
- [ ] **Retry Logic Detection** - Find exponential backoff patterns

### Community Contributions Welcome

To contribute:
1. Add detection patterns for new APIs/services
2. Improve accuracy of existing detections
3. Add language support (Java, Ruby, Go, etc.)

---

## Examples: Before & After

### Before API Usage Column

**Challenge:** Answer "Which files call our payment API?"

**Manual Process:**
1. Search codebase for "payment" (100+ results)
2. Manually review each file
3. Check if it's actually an API call
4. Document findings in wiki
5. **Time:** 2-3 hours

### After API Usage Column

**Query:**
```sql
SELECT File FROM ProjectMap 
WHERE `API USAGE` LIKE '%payment%' OR `API USAGE` LIKE '%Stripe%'
```

**Results:** Instant list of 7 files  
**Time:** 10 seconds

---

## License & Support

**License:** Same as parent CSV Project Map Toolkit

**Support:**
- GitHub Issues (if available)
- Email: E. Harrison

**Version:** 1.0.0  
**Last Updated:** October 2025

---

## Appendix: Complete Detection List

### JavaScript/TypeScript APIs
- ✅ fetch() 
- ✅ axios (all methods)
- ✅ XMLHttpRequest
- ✅ jQuery $.ajax()
- ✅ Superagent
- ✅ GraphQL (Apollo, urql)
- ✅ Socket.io
- ✅ WebSocket

### Python APIs
- ✅ requests library
- ✅ urllib
- ✅ Django ORM
- ✅ SQLAlchemy
- ✅ boto3 (AWS)
- ✅ httpx
- ✅ aiohttp

### C# APIs
- ✅ HttpClient
- ✅ WebClient
- ✅ Entity Framework
- ✅ ADO.NET
- ✅ SignalR
- ✅ RestSharp

### Third-Party Services (All Languages)
- ✅ Stripe (Payment)
- ✅ Twilio (SMS/Voice)
- ✅ SendGrid (Email)
- ✅ Mailchimp (Email Marketing)
- ✅ AWS SDK (S3, DynamoDB, Lambda, etc.)
- ✅ Google Cloud SDK
- ✅ Azure SDK
- ✅ Firebase
- ✅ Auth0
- ✅ Slack API
- ✅ And more...

---

**Ready to track your API usage? Run the script now! 🚀**
