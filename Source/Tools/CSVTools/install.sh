#!/bin/bash

# CSVTools Installation Script
# This script sets up the CSVTools with all required dependencies

echo "================================================"
echo "Installing CSVTools..."
echo "================================================"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed."
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed."
    echo "Please install npm (it usually comes with Node.js)"
    exit 1
fi

echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"
echo ""

# Install dependencies
echo "Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo ""
    echo "================================================"
    echo "CSVTools installation complete!"
    echo "================================================"
    echo ""
    echo "Available commands:"
    echo "  npm run update-csv         - Update CSV with project structure"
    echo "  npm run sync-files         - Sync filesystem to CSV"
    echo "  npm run preview            - Preview changes before applying"
    echo "  npm run run-querier        - Run the querier tool"
    echo "  npm run help               - Show full help documentation"
    echo ""
    echo "For more information, run: npm run help"
else
    echo ""
    echo "Error: Installation failed."
    echo "Please check the error messages above."
    exit 1
fi
