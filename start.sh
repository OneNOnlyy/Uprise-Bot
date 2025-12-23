#!/bin/bash

# Uprise Bot Startup Script with Auto-Update from GitHub

echo "🔄 Checking for updates from GitHub..."

# Ensure common binary paths are in PATH
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"

# Install git if not present
if ! command -v git &> /dev/null; then
    echo "📦 Git not found, installing..."
    if command -v apt-get &> /dev/null; then
        apt-get update -qq > /dev/null 2>&1
        apt-get install -y git -qq > /dev/null 2>&1
        echo "✅ Git installed"
    elif command -v apk &> /dev/null; then
        apk add --no-cache git > /dev/null 2>&1
        echo "✅ Git installed"
    else
        echo "⚠️ Cannot install git, skipping auto-update..."
        echo "📦 Installing dependencies..."
        npm install
        echo "⚡ Deploying slash commands..."
        node src/deploy-commands.js
        echo "🚀 Starting Uprise Bot..."
        npm start
        exit 0
    fi
fi

# Check if AUTO_UPDATE is disabled
if [ "$AUTO_UPDATE" = "0" ]; then
    echo "⏭️ Auto-update disabled, skipping git pull..."
    echo "📦 Installing dependencies..."
    npm install
    echo "⚡ Deploying slash commands..."
    node src/deploy-commands.js
    echo "🚀 Starting Uprise Bot..."
    npm start
    exit 0
fi

# Check if this is a git repository
if [ -d ".git" ]; then
    echo "📥 Pulling latest changes..."
    
    # Stash any local changes to avoid merge conflicts
    if [ -n "$(git status --porcelain)" ]; then
        echo "📦 Stashing local changes..."
        git stash
    fi
    
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
else
    echo "⚠️ Not a git repository. Skipping update."
fi

# Install/update dependencies
echo "📦 Installing dependencies..."
npm install

# Deploy slash commands to Discord
echo "⚡ Deploying slash commands..."
node src/deploy-commands.js

# Start the bot
echo "🚀 Starting Uprise Bot..."
npm start
