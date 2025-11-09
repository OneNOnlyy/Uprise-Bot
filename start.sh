#!/bin/bash

# Uprise Bot Startup Script with Auto-Update from GitHub

echo "🔄 Checking for updates from GitHub..."

# Check if AUTO_UPDATE is disabled
if [ "$AUTO_UPDATE" = "0" ]; then
    echo "⏭️ Auto-update disabled, skipping git pull..."
    echo "📦 Installing dependencies..."
    npm install
    echo "🚀 Starting Uprise Bot..."
    npm start
    exit 0
fi

# Check if this is a git repository
if [ -d ".git" ]; then
    echo "📥 Pulling latest changes..."
    
    # Configure git
    git config pull.ff only
    
    # Set remote URL (no authentication needed for public repo)
    git remote set-url origin https://github.com/OneNOnlyy/Uprise-Bot.git
    
    # Add timeout to git pull (30 seconds)
    timeout 30s git pull origin main 2>&1
    
    PULL_EXIT_CODE=$?
    
    if [ $PULL_EXIT_CODE -eq 0 ]; then
        echo "✅ Successfully updated from GitHub"
    elif [ $PULL_EXIT_CODE -eq 124 ]; then
        echo "⚠️ Git pull timed out after 30 seconds, continuing with existing files..."
    else
        echo "⚠️ Git pull failed (exit code: $PULL_EXIT_CODE), continuing with existing files..."
    fi
    
    # Install/update dependencies
    echo "📦 Installing dependencies..."
    npm install
else
    echo "⚠️ Not a git repository. Skipping update."
    echo "📦 Installing dependencies..."
    npm install
fi

echo "🚀 Starting Uprise Bot..."
npm start
