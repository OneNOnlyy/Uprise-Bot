#!/bin/bash

# Uprise Bot Startup Script with Auto-Update from GitHub

echo "🔄 Checking for updates from GitHub..."

# Check if AUTO_UPDATE is disabled
if [ "$AUTO_UPDATE" = "0" ]; then
    echo "⏭️ Auto-update disabled"
else
    # Install git if not present
    if ! command -v git &> /dev/null; then
        echo "📦 Installing git..."
        if command -v apt-get &> /dev/null; then
            apt-get update -qq > /dev/null 2>&1
            apt-get install -y git -qq > /dev/null 2>&1
        elif command -v apk &> /dev/null; then
            apk add --no-cache git > /dev/null 2>&1
        fi
    fi
    
    # Set git command (try to find it)
    if command -v git &> /dev/null; then
        GIT="/usr/bin/git"
    elif [ -f "/usr/bin/git" ]; then
        GIT="/usr/bin/git"
    else
        GIT="git"
    fi
    
    # Initialize git repo if not present
    if [ ! -d ".git" ]; then
        echo "📦 Initializing git repository..."
        $GIT init > /dev/null 2>&1
        $GIT remote add origin https://github.com/OneNOnlyy/Uprise-Bot.git > /dev/null 2>&1
        $GIT fetch origin > /dev/null 2>&1
        $GIT checkout -b main > /dev/null 2>&1
        $GIT branch --set-upstream-to=origin/main main > /dev/null 2>&1
    fi
    
    # Pull latest changes
    echo "📥 Pulling latest changes from GitHub..."
    $GIT config pull.rebase false > /dev/null 2>&1
    $GIT remote set-url origin https://github.com/OneNOnlyy/Uprise-Bot.git > /dev/null 2>&1
    
    if $GIT pull origin main --force 2>&1 | grep -q "Already up to date\|Updating\|Fast-forward"; then
        echo "✅ Code updated from GitHub"
    else
        echo "⚠️ Update completed (may have conflicts, continuing anyway)"
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
