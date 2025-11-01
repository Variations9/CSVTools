#!/bin/bash

# Project Tools Installation Script
# This script sets up both HTMLTools and CSVTools with all dependencies

echo "========================================================"
echo "Installing Project Tools (HTMLTools + CSVTools)"
echo "========================================================"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed."
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not installed."
    echo "Please install npm (it usually comes with Node.js)"
    exit 1
fi

echo "✓ Node.js version: $(node --version)"
echo "✓ npm version: $(npm --version)"
echo ""

# Check npm version for workspace support (requires npm 7+)
NPM_VERSION=$(npm --version | cut -d. -f1)
if [ "$NPM_VERSION" -lt 7 ]; then
    echo "⚠️  Warning: npm version 7 or higher is recommended for workspace support."
    echo "   Current version: $(npm --version)"
    echo "   Please consider upgrading: npm install -g npm@latest"
    echo ""
fi

# Install dependencies using workspaces
echo "Installing dependencies for both tools..."
echo ""
npm install

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================================"
    echo "✓ Installation Complete!"
    echo "========================================================"
    echo ""
    echo "📦 Both HTMLTools and CSVTools are ready to use!"
    echo ""
    echo "HTMLTools Commands:"
    echo "  npm run html:export           - Export project to HTML"
    echo "  npm run html:export-style1    - Export with style1 preset"
    echo ""
    echo "CSVTools Commands:"
    echo "  npm run csv:update            - Update CSV with project structure"
    echo "  npm run csv:sync              - Sync filesystem to CSV"
    echo "  npm run csv:preview           - Preview changes"
    echo "  npm run csv:querier           - Run querier tool"
    echo "  npm run csv:help              - Show CSV tools help"
    echo ""
    echo "For more commands, see package.json or run individual tools."
    echo ""
else
    echo ""
    echo "❌ Error: Installation failed."
    echo "Please check the error messages above."
    exit 1
fi
