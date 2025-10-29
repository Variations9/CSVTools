# API Usage Tracker - Quick Start Guide

## 🚀 Get Started in 3 Steps

### Step 1: Copy the Script (30 seconds)

```bash
# Copy updateApiUsage.mjs to your CSV tools directory
cp updateApiUsage.mjs Source/Tools/CSVTools/
```

### Step 2: Run It (2-5 minutes)

```bash
# From workspace root
node Source/Tools/CSVTools/updateApiUsage.mjs
```

### Step 3: View Results

Open `Source/ProjectMap/SourceFolder.csv` and look for the new **"API USAGE"** column!

---

## 📊 Example Queries (Copy & Paste into Google Sheets)

### Query 1: Find All Files Making REST API Calls

```sql
=QUERY(A:Z, "SELECT A, B, C WHERE [API_USAGE_COLUMN] CONTAINS 'REST' ORDER BY A", 1)
```

**What it shows:** Every file that makes HTTP/REST requests

**Use case:** API inventory, migration planning

---

### Query 2: Security Audit - External API Calls

```sql
=QUERY(A:Z, "SELECT A, B, C, [API_USAGE_COLUMN], [ERROR_HANDLING_COLUMN] 
WHERE [API_USAGE_COLUMN] CONTAINS 'REST' 
AND [ERROR_HANDLING_COLUMN] = 'NONE'", 1)
```

**What it shows:** Files making API calls WITHOUT error handling (HIGH RISK!)

**Use case:** Identify security vulnerabilities

---

### Query 3: Find All Third-Party Integrations

```sql
=QUERY(A:Z, "SELECT A, B, C, [API_USAGE_COLUMN] 
WHERE [API_USAGE_COLUMN] CONTAINS 'ThirdParty'", 1)
```

**What it shows:** All files using external services (Stripe, AWS, Twilio, etc.)

**Use case:** Vendor risk assessment, cost analysis

---

### Query 4: Database Operation Inventory

```sql
=QUERY(A:Z, "SELECT A, B, C, [API_USAGE_COLUMN] 
WHERE [API_USAGE_COLUMN] CONTAINS 'Database'", 1)
```

**What it shows:** All database queries and operations

**Use case:** Database migration planning, query optimization

---

### Query 5: Files Using Multiple API Types

```sql
=QUERY(A:Z, "SELECT A, B, C, [API_USAGE_COLUMN] 
WHERE [API_USAGE_COLUMN] CONTAINS 'REST' 
AND [API_USAGE_COLUMN] CONTAINS 'Database'", 1)
```

**What it shows:** Complex files that touch both APIs AND databases

**Use case:** Identify transaction boundary issues

---

## 🎯 Real-World Scenarios

### Scenario 1: "Are we PCI compliant?"

**Question:** Which files handle payment data?

**Query:**
```sql
=QUERY(A:Z, "SELECT A, [API_USAGE_COLUMN], [SIDE_EFFECTS_COLUMN] 
WHERE [API_USAGE_COLUMN] CONTAINS 'Stripe' 
OR [API_USAGE_COLUMN] CONTAINS 'Payment'", 1)
```

**Action:** Review each file for:
- ✅ Error handling present?
- ✅ Logging excludes sensitive data?
- ✅ Uses HTTPS only?

---

### Scenario 2: "What happens if AWS goes down?"

**Question:** Which features depend on AWS?

**Query:**
```sql
=QUERY(A:Z, "SELECT A, [API_USAGE_COLUMN], [FEATURES_COLUMN] 
WHERE [API_USAGE_COLUMN] CONTAINS 'AWS'", 1)
```

**Action:** 
- Build fallback plan for each feature
- Add circuit breaker pattern
- Implement graceful degradation

---

### Scenario 3: "Reduce our API costs"

**Question:** Which files make the most API calls?

**Steps:**
1. Filter for REST API usage
2. Cross-reference with `ORDER_OF_OPERATIONS` column
3. Count API calls per file
4. Identify optimization opportunities

**Findings might show:**
- 5 files making redundant API calls
- No caching implemented
- **Potential savings:** 70% reduction in API calls

---

## 🔧 Integration with Existing Workflow

### Option A: Add to Master Workflow

Edit `update-csv-workflow.mjs`:

```javascript
// Add after line ~120 (after updateSideEffects.mjs)
const apiUsageScriptPath = path.join(__dirname, 'updateApiUsage.mjs');
await executeScript(apiUsageScriptPath, 'API Usage Extraction', {
  env: {
    CSV_PROJECT_MAP_PATH: snapshotPath,
  },
});
```

Update console output (around line 56):

```javascript
console.log('  8) Side effects extraction (Column P)');
console.log('  9) API usage extraction (Column API USAGE)');  // <-- ADD THIS
console.log(' 10) Cyclomatic complexity extraction (Column Y)');
```

**Result:** API Usage column updates automatically on every workflow run

---

### Option B: Run Independently

Keep it separate for on-demand analysis:

```bash
# Full workflow (structure + all columns except API Usage)
node Source/Tools/CSVTools/update-csv-workflow.mjs

# Then run API analysis separately when needed
node Source/Tools/CSVTools/updateApiUsage.mjs
```

**When to use:** API patterns change less frequently than code structure

---

## 📈 Sample Output Breakdown

### Example 1: E-commerce Checkout File

**File:** `src/checkout/payment.js`

**API USAGE Column:**
```
REST{POST → https://api.stripe.com/v1/charges [axios]} | ThirdParty{Stripe (Payment)} | Database{MongoDB → orders}
```

**Interpretation:**
- ✅ Makes POST request to Stripe
- ✅ Uses axios library
- ✅ Integrates with Stripe SDK
- ✅ Writes to MongoDB orders collection

**Action Items:**
- Verify error handling for all 3 operations
- Add transaction rollback logic
- Implement idempotency for retries

---

### Example 2: Real-time Chat Feature

**File:** `src/chat/socket.js`

**API USAGE Column:**
```
WebSocket{socket.emit; socket.on} | Database{MongoDB → messages; MongoDB → users} | ThirdParty{Firebase}
```

**Interpretation:**
- ✅ Uses Socket.io for real-time updates
- ✅ Reads/writes to 2 MongoDB collections
- ✅ Integrates with Firebase (possibly for auth)

**Action Items:**
- Check connection retry logic
- Verify database connection pooling
- Monitor Firebase quota usage

---

### Example 3: Data Sync Service

**File:** `src/services/sync.py`

**API USAGE Column:**
```
REST{GET → requests library; POST → requests library} | ThirdParty{AWS → boto3; SendGrid (Email)} | Database{SQLAlchemy}
```

**Interpretation:**
- ✅ Makes HTTP GET/POST requests
- ✅ Uses AWS SDK (probably S3 or SQS)
- ✅ Sends notification emails via SendGrid
- ✅ Database operations via SQLAlchemy

**Action Items:**
- Implement batch processing to reduce API calls
- Add email rate limiting
- Check AWS S3 lifecycle policies

---

## 🎨 Google Sheets Visualization Tips

### Color-Code API Types

1. Select the "API USAGE" column
2. Format → Conditional formatting
3. Add rules:
   - **RED** if contains "ThirdParty" (external dependencies)
   - **ORANGE** if contains "REST" (network calls)
   - **BLUE** if contains "Database" (data persistence)
   - **GREEN** if contains "WebSocket" (real-time features)

### Create Summary Dashboard

```
=COUNTIF(API_USAGE_COLUMN, "*REST*")           → REST API calls
=COUNTIF(API_USAGE_COLUMN, "*Database*")      → Database operations
=COUNTIF(API_USAGE_COLUMN, "*ThirdParty*")    → External services
=COUNTIF(API_USAGE_COLUMN, "*WebSocket*")     → Real-time connections
```

**Create a chart:**
- Insert → Chart → Pie chart
- Shows distribution of API types across your codebase

---

## 🐛 Troubleshooting

### "No updates detected" but I know we have API calls

**Check:**
1. Are files in supported formats? (.js, .py, .cs)
2. Is Prettier installed? `cd Source/Tools/CSVTools && npm list prettier`
3. Try running with debug logging (add console.log statements)

**Solution:**
```bash
# Reinstall dependencies
cd Source/Tools/CSVTools
rm -rf node_modules
npm install
```

---

### AST parsing errors for JavaScript files

**Symptom:** Console shows "AST parsing failed, using regex fallback"

**Causes:**
- Syntax errors in source files
- Unsupported JavaScript features
- Prettier version mismatch

**Solution:**
```bash
# Update Prettier to latest
cd Source/Tools/CSVTools
npm install prettier@latest

# Verify no syntax errors
node --check path/to/problematic-file.js
```

---

### Large projects take too long

**Problem:** 1000+ files taking 5+ minutes

**Optimizations:**
1. **Skip test files:**
   ```javascript
   if (rowPath.includes('/test/') || rowPath.endsWith('.test.js')) {
     continue;
   }
   ```

2. **Process in batches:**
   ```javascript
   // Process every 10th file for quick analysis
   if (rowIndex % 10 !== 0) continue;
   ```

3. **Use parallel processing (advanced):**
   ```javascript
   // Future enhancement - process files in parallel
   ```

---

## 📚 Advanced Use Cases

### Use Case 1: API Deprecation Planning

**Scenario:** Vendor is deprecating their v1 API, moving to v2

**Process:**
1. Query for all files using the old API:
   ```sql
   WHERE [API_USAGE_COLUMN] CONTAINS 'api.vendor.com/v1'
   ```

2. Create migration checklist:
   - [ ] Update URL to v2
   - [ ] Update request/response format
   - [ ] Test thoroughly
   - [ ] Deploy

3. Track progress in spreadsheet

**Result:** Smooth migration with no files left behind

---

### Use Case 2: Multi-Region Deployment

**Scenario:** Need to deploy to EU region with data residency requirements

**Query:**
```sql
WHERE [API_USAGE_COLUMN] CONTAINS 'us-east-1' 
OR [API_USAGE_COLUMN] CONTAINS 'us-west-2'
```

**Findings:**
- 12 files hardcode US regions
- Must update to support region configuration
- Add region-aware API routing

---

### Use Case 3: Rate Limit Management

**Scenario:** Getting rate-limited by third-party APIs

**Analysis:**
1. Find all files hitting the rate-limited service
2. Cross-reference with `ORDER_OF_OPERATIONS` to see call frequency
3. Cross-reference with `CYCLOMATIC COMPLEXITY` to find loops

**Query:**
```sql
WHERE [API_USAGE_COLUMN] CONTAINS 'ThirdParty{ServiceName}'
AND [CYCLOMATIC COMPLEXITY] > 20
```

**Solutions:**
- Add request caching
- Implement exponential backoff
- Use batch endpoints
- Add rate limiting middleware

---

## 🎓 Learning Resources

### Understanding Your Results

**REST{...}** = Outbound HTTP requests your app makes
- GET = Reading data from external source
- POST = Sending data to external service
- PUT/PATCH = Updating external resources
- DELETE = Removing external resources

**Database{...}** = Data persistence operations
- MongoDB = NoSQL document database
- SQL = Relational database queries
- ORM = Object-relational mapping (Entity Framework, Django)

**ThirdParty{...}** = External service integrations
- Payment processors (Stripe)
- Communication (Twilio, SendGrid)
- Cloud services (AWS, Firebase)
- Authentication (Auth0)

**WebSocket{...}** = Real-time bidirectional communication
- Chat applications
- Live updates
- Gaming
- Collaborative editing

---

## 🔮 What's Next?

### Planned Features (Future Versions)

1. **API Response Tracking**
   - Detect how responses are handled
   - Track error codes
   - Find missing validation

2. **Authentication Detection**
   - Identify API keys in code
   - Find auth headers
   - Detect OAuth flows

3. **Rate Limit Tracking**
   - Detect rate limiting code
   - Find retry logic
   - Calculate theoretical API usage

4. **Cost Calculator**
   - Estimate API costs based on usage
   - Track pricing tier thresholds
   - Alert on cost anomalies

5. **Dependency Graph**
   - Visualize API call chains
   - Show service dependencies
   - Identify single points of failure

---

## 💡 Pro Tips

### Tip 1: Combine with Other Columns

**Most Powerful Queries:**
```sql
-- High-risk files: API calls + no error handling + high complexity
WHERE [API_USAGE_COLUMN] CONTAINS 'REST' 
AND [ERROR_HANDLING_COVERAGE] = 'NONE'
AND [CYCLOMATIC_COMPLEXITY] > 30

-- External data flows: API → Database
WHERE [API_USAGE_COLUMN] CONTAINS 'REST' 
AND [API_USAGE_COLUMN] CONTAINS 'Database'
```

### Tip 2: Regular Audits

**Schedule monthly API audits:**
1. Run updateApiUsage.mjs
2. Review new API integrations
3. Check error handling coverage
4. Update documentation

### Tip 3: Share with Team

**Export filtered views:**
1. Create view: "Payment Processing Files"
2. Share with payment team
3. Everyone sees which files they own

---

## 📞 Support

**Questions?** 
- Check documentation: `updateApiUsage-DOCUMENTATION.md`
- Review examples above
- Contact: E. Harrison

**Found a bug?**
- Report with file path + error message
- Include sample code if possible

**Want to contribute?**
- Add detection for new APIs
- Improve existing patterns
- Share your use cases

---

## ✅ Checklist: First Run

- [ ] Script copied to `Source/Tools/CSVTools/`
- [ ] Dependencies installed (`npm install` in CSVTools directory)
- [ ] Ran script successfully (`node updateApiUsage.mjs`)
- [ ] Verified new "API USAGE" column exists
- [ ] Spot-checked a few entries for accuracy
- [ ] Opened CSV in Google Sheets
- [ ] Tried at least one example query
- [ ] Added to workflow (optional)

**All checked?** 🎉 You're ready to track your APIs!

---

*Last Updated: October 2025 | Version 1.0.0*
