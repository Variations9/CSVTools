# Project Tools - Deployment Guide

A unified package containing **HTMLTools** and **CSVTools** for project documentation and analysis.

## 📦 What's Included

### HTMLTools
Tools for exporting project code to formatted HTML documentation with syntax highlighting and styling options.

### CSVTools
Automated tools for synchronizing project structure with CSV documentation, analyzing code, and generating project maps.

## 🚀 Quick Start

### Option 1: Install in Current Location

```bash
cd Source/Tools
./install.sh
```

This will install all dependencies for both tools using npm workspaces.

### Option 2: Deploy to Another Project

```bash
cd Source/Tools
./deploy.sh /path/to/your/project/Tools
```

This will:
1. Copy the entire Tools folder to your destination
2. Optionally install all dependencies automatically

## 📋 Requirements

- **Node.js** (v14 or higher recommended)
- **npm** (v7 or higher for workspace support)

Check your versions:
```bash
node --version
npm --version
```

## 🛠️ Usage

### HTMLTools Commands

```bash
# Export project to HTML
npm run html:export

# Export with style1 preset
npm run html:export-style1
```

You can also navigate to the HTMLTools directory and run:
```bash
cd HTMLTools
npm run export
```

### CSVTools Commands

```bash
# Update CSV with project structure
npm run csv:update

# Sync filesystem to CSV
npm run csv:sync

# Preview changes before applying
npm run csv:preview

# Run the querier tool
npm run csv:querier

# Show full CSV tools help
npm run csv:help
```

You can also navigate to the CSVTools directory and run:
```bash
cd CSVTools
npm run update-csv
```

## 📁 Structure

```
Tools/
├── package.json          # Main workspace configuration
├── install.sh            # Installation script
├── deploy.sh             # Deployment script
├── README.md             # This file
├── HTMLTools/
│   ├── package.json
│   ├── export-project-direct-scan.cjs
│   ├── code-presenter-core.js
│   └── StylePresets/
└── CSVTools/
    ├── package.json
    ├── update-csv-workflow.mjs
    ├── sync-filesystem-to-csv.mjs
    └── [other tools...]
```

## 🔧 Deployment Scenarios

### Scenario 1: Add to Existing Project

```bash
# From this Tools directory
./deploy.sh ~/Projects/MyApp/Tools

# Navigate to your project
cd ~/Projects/MyApp/Tools

# Tools are ready to use!
npm run html:export
```

### Scenario 2: Manual Copy

If you prefer manual copying:

1. Copy the entire `Tools` folder to your destination
2. Navigate to the destination
3. Run: `./install.sh` or `npm install`

### Scenario 3: Update Existing Deployment

```bash
# Deploy will ask if you want to overwrite
./deploy.sh /path/to/existing/Tools
```

## 🎯 How It Works

### NPM Workspaces

This package uses npm workspaces to manage both HTMLTools and CSVTools as independent packages within a single parent package. This means:

- **Single installation**: One `npm install` installs dependencies for both tools
- **Independent packages**: Each tool maintains its own package.json and dependencies
- **Unified commands**: Run commands for either tool from the root level
- **Easy deployment**: The entire Tools folder is self-contained

### Dependencies

Both tools use:
- **Prettier**: For code formatting (versions may differ between tools)

Additional dependencies are managed independently by each tool.

## 🚨 Troubleshooting

### npm workspace errors

If you get workspace-related errors, ensure you have npm 7+:
```bash
npm install -g npm@latest
```

### Permission errors

If scripts aren't executable:
```bash
chmod +x install.sh deploy.sh
```

### Module not found errors

Make sure you've run the installation:
```bash
npm install
```

### Deployment fails

Check that:
1. Destination path is valid
2. You have write permissions
3. Parent directory exists or can be created

## 📝 Adding to .gitignore

When deploying to a project, consider adding to `.gitignore`:

```gitignore
# Tools dependencies
Tools/node_modules/
Tools/HTMLTools/node_modules/
Tools/CSVTools/node_modules/
Tools/package-lock.json
```

## 🔄 Updating Tools

To update tools in a deployed project:

1. Update the source Tools folder
2. Re-run the deployment script
3. Confirm overwrite when prompted

## 💡 Tips

- Run `npm run csv:help` for comprehensive CSVTools documentation
- Both tools can be run independently by navigating to their directories
- Use the workspace commands (e.g., `npm run html:export`) for convenience
- The tools are designed to be run from any project location

## 📄 License

MIT

---

**Need Help?**

- Check individual tool READMEs in HTMLTools/ and CSVTools/
- Run `npm run csv:help` for detailed CSV tools documentation
- Review the package.json files for available commands
