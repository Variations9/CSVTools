#!/bin/bash

# Project Tools Deployment Script
# This script deploys the Tools folder to another project location

echo "========================================================"
echo "Project Tools Deployment"
echo "========================================================"

# Check if destination path is provided
if [ -z "$1" ]; then
    echo "Usage: ./deploy.sh <destination-path>"
    echo ""
    echo "Example:"
    echo "  ./deploy.sh /path/to/your/project/Tools"
    echo "  ./deploy.sh ~/Projects/MyApp/Tools"
    echo ""
    echo "This will copy the entire Tools folder to your destination"
    echo "and automatically install dependencies."
    exit 1
fi

DEST_PATH="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Validate destination path
if [[ ! "$DEST_PATH" = /* ]] && [[ ! "$DEST_PATH" =~ ^~.* ]]; then
    echo "⚠️  Warning: Relative path detected. Converting to absolute path..."
    DEST_PATH="$(cd "$(dirname "$DEST_PATH")" 2>/dev/null && pwd)/$(basename "$DEST_PATH")"
fi

# Expand tilde if present
DEST_PATH="${DEST_PATH/#\~/$HOME}"

echo "Source: $SCRIPT_DIR"
echo "Destination: $DEST_PATH"
echo ""

# Check if destination already exists
if [ -d "$DEST_PATH" ]; then
    read -p "⚠️  Destination already exists. Overwrite? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled."
        exit 0
    fi
    echo "Removing existing directory..."
    rm -rf "$DEST_PATH"
fi

# Create parent directory if it doesn't exist
PARENT_DIR="$(dirname "$DEST_PATH")"
if [ ! -d "$PARENT_DIR" ]; then
    echo "Creating parent directory: $PARENT_DIR"
    mkdir -p "$PARENT_DIR"
fi

# Copy the Tools folder
echo "Copying Tools folder..."
cp -r "$SCRIPT_DIR" "$DEST_PATH"

if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to copy files."
    exit 1
fi

echo "✓ Files copied successfully!"
echo ""

# Ask if user wants to install dependencies now
read -p "Install dependencies now? (Y/n): " -n 1 -r
echo

if [[ $REPLY =~ ^[Nn]$ ]]; then
    echo ""
    echo "========================================================"
    echo "✓ Deployment Complete!"
    echo "========================================================"
    echo ""
    echo "To install dependencies later, run:"
    echo "  cd $DEST_PATH"
    echo "  ./install.sh"
    echo ""
else
    echo "Installing dependencies..."
    cd "$DEST_PATH"

    if [ -f "./install.sh" ]; then
        ./install.sh
    else
        echo "Installing with npm..."
        npm install
    fi

    if [ $? -eq 0 ]; then
        echo ""
        echo "========================================================"
        echo "✓ Deployment Complete!"
        echo "========================================================"
        echo ""
        echo "Tools are ready to use at: $DEST_PATH"
        echo ""
    else
        echo ""
        echo "⚠️  Files copied but dependency installation failed."
        echo "Please navigate to $DEST_PATH and run ./install.sh manually."
    fi
fi
