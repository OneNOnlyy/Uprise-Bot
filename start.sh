#!/bin/bash

# Uprise Bot Startup Script with Auto-Update from GitHub

echo "🔄 Checking for updates from GitHub..."

# Check if AUTO_UPDATE is disabled
if [ "$AUTO_UPDATE" = "0" ]; then
    echo "⏭️ Auto-update disabled"
else
    # Only attempt auto-update if we have a .git directory AND git is available
    if [ -d ".git" ] && command -v git &> /dev/null; then
        echo "📥 Pulling latest changes..."
        
        # Stash any local changes to avoid merge conflicts
        if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
            echo "📦 Stashing local changes..."
            git stash
        fi
        
        # Configure git
        git config pull.ff only 2>/dev/null
        
        # Set remote URL (no authentication needed for public repo)
        git remote set-url origin https://github.com/OneNOnlyy/Uprise-Bot.git 2>/dev/null
        
        # Pull latest changes
        if git pull origin main 2>&1; then
            echo "✅ Successfully updated from GitHub"
        else
            echo "⚠️ Git pull failed, continuing with existing files..."
        fi
    else
        echo "💡 Auto-update skipped (hosting handles GitHub deployment)"
    fi
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
