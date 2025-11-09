#!/bin/bash

# Uprise Bot Startup Script with Auto-Update from GitHub

echo "🔄 Checking for updates from GitHub..."

# Check if this is a git repository
if [ -d ".git" ]; then
    echo "📥 Pulling latest changes..."
    
    # Configure git to use fast-forward only for pulls
    git config pull.ff only
    
    # Use token from .env if AUTO_UPDATE is enabled
    if [ "$AUTO_UPDATE" = "1" ] && [ ! -z "$GITHUB_TOKEN" ]; then
        git remote set-url origin https://${GITHUB_TOKEN}@github.com/OneNOnlyy/Uprise-Bot.git
    fi
    
    git pull origin main 2>&1
    
    if [ $? -eq 0 ]; then
        echo "✅ Successfully updated from GitHub"
    else
        echo "⚠️ Git pull failed, continuing with existing files..."
    fi
    
    # Install/update dependencies if package.json changed
    echo "📦 Installing dependencies..."
    npm install
else
    echo "⚠️ Not a git repository. Skipping update."
    echo "📦 Installing dependencies..."
    npm install
fi

echo "🚀 Starting Uprise Bot..."
npm start
