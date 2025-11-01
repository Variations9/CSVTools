# Tools Deployment - Quick Start Guide

## 🎯 The Simplest Way to Deploy

### Step 1: Navigate to Tools folder
```bash
cd Source/Tools
```

### Step 2: Deploy to your project
```bash
./deploy.sh /path/to/your/project/Tools
```

That's it! The script will:
- ✓ Copy all files
- ✓ Ask if you want to install dependencies
- ✓ Run installation automatically
- ✓ Display available commands

## 📦 Example Deployments

### Deploy to a specific project
```bash
./deploy.sh ~/Projects/WebApp/Tools
```

### Deploy to a relative path (from current directory)
```bash
./deploy.sh ../../OtherProject/Tools
```

### Deploy to Desktop for testing
```bash
./deploy.sh ~/Desktop/TestTools
```

## 🔧 Manual Installation (if needed)

If you prefer to copy manually or if the script doesn't work:

1. **Copy the Tools folder**
   ```bash
   cp -r Source/Tools /path/to/destination/
   ```

2. **Navigate and install**
   ```bash
   cd /path/to/destination/Tools
   ./install.sh
   ```

   Or simply:
   ```bash
   npm install
   ```

## ✅ Verify Installation

After deployment, test that it works:

```bash
cd /path/to/deployed/Tools

# Test HTMLTools
npm run html:export

# Test CSVTools
npm run csv:help
```

## 🎨 Using the Tools

Once deployed, you can run commands from the Tools directory:

```bash
# HTML Export
npm run html:export              # Basic export
npm run html:export-style1       # With style1 preset

# CSV Tools
npm run csv:update               # Update CSV
npm run csv:sync                 # Sync filesystem
npm run csv:preview              # Preview changes
npm run csv:querier              # Run querier
npm run csv:help                 # Full help
```

## 📂 What Gets Deployed

```
Tools/
├── package.json          # Workspace configuration
├── install.sh            # Installation script
├── deploy.sh             # This deployment script
├── README.md             # Full documentation
├── HTMLTools/           # HTML export tools
│   ├── package.json
│   └── [tool files...]
└── CSVTools/            # CSV analysis tools
    ├── package.json
    └── [tool files...]
```

After running `npm install`:
```
Tools/
├── node_modules/        # Shared dependencies
│   ├── prettier/
│   ├── csv-project-map-tools/  (symlink to CSVTools)
│   └── html-export-tools/      (symlink to HTMLTools)
└── [everything else...]
```

## 🔄 Update Existing Deployment

To update tools in a project that already has them:

```bash
./deploy.sh /path/to/existing/Tools
```

The script will ask if you want to overwrite. Choose `y` to update.

## 💡 Pro Tips

1. **Add to .gitignore** in your target project:
   ```
   Tools/node_modules/
   Tools/package-lock.json
   ```

2. **Run from anywhere**: After deployment, you can run commands from the Tools directory in any project

3. **Independent operation**: Each tool can also be run from its own subdirectory
   ```bash
   cd Tools/CSVTools
   npm run update-csv
   ```

4. **Check versions**: Ensure Node.js v14+ and npm v7+
   ```bash
   node --version
   npm --version
   ```

## ❓ Common Issues

**Q: "permission denied" when running deploy.sh**
A: Make it executable: `chmod +x deploy.sh`

**Q: "workspace" errors during install**
A: Update npm: `npm install -g npm@latest`

**Q: Can I deploy to multiple projects?**
A: Yes! Run the deploy script for each project location.

**Q: Do I need to keep the original source?**
A: No, each deployment is self-contained and independent.

## 📖 More Info

See [README.md](README.md) for complete documentation.
