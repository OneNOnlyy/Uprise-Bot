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

# Check if git is available in PATH
if ! command -v git &> /dev/null; then
    echo "⚠️ Git not found in PATH, checking common locations..."
    # Try common git installation paths
    if [ -f "/usr/bin/git" ]; then
        export PATH="/usr/bin:$PATH"
    elif [ -f "/bin/git" ]; then
        export PATH="/bin:$PATH"
    elif [ -f "/usr/local/bin/git" ]; then
        export PATH="/usr/local/bin:$PATH"
    else
        echo "⚠️ Git not found, skipping auto-update..."
        echo "📦 Installing dependencies..."
        npm install
        echo "🚀 Starting Uprise Bot..."
        npm start
        exit 0
    fi
fi

# Verify git is now accessible
if ! command -v git &> /dev/null; then
    echo "⚠️ Could not locate git, skipping auto-update..."
    echo "📦 Installing dependencies..."
    npm install
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
    
    # Install/update dependencies
    echo "📦 Installing dependencies..."
    npm install
    
    # Deploy slash commands to Discord
    echo "⚡ Deploying slash commands..."
    node src/deploy-commands.js
else
    echo "⚠️ Not a git repository. Skipping update."
    echo "📦 Installing dependencies..."
    npm install
    
    # Deploy slash commands to Discord
    echo "⚡ Deploying slash commands..."
    node src/deploy-commands.js
fi

echo "🚀 Starting Uprise Bot..."
npm start
