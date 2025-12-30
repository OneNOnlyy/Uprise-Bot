#!/bin/bash

# Uprise Bot Startup Script with Auto-Update from GitHub

echo "🔄 Checking for updates from GitHub..."

# Check if AUTO_UPDATE is disabled
if [ "$AUTO_UPDATE" = "0" ]; then
    echo "⏭️ Auto-update disabled"
else
    # Check if git is available
    if ! command -v git &> /dev/null; then
        echo "⚠️ Git not found - auto-update disabled"
        echo "   To enable auto-update, install git in your container image"
    else
        # Find git executable
        GIT=$(command -v git)
        echo "🔍 Using git at: $GIT"
        
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
        
        # Backup start.sh before pulling (we don't want it overwritten)
        if [ -f "start.sh" ]; then
            cp start.sh start.sh.backup
        fi
        
        # Store current commit before pull
        OLD_COMMIT=$($GIT rev-parse HEAD 2>/dev/null || echo "none")
        
        # Force reset to match remote (discard local changes except start.sh backup)
        $GIT fetch origin main > /dev/null 2>&1
        $GIT reset --hard origin/main
        
        # Restore start.sh from backup (never let it be overwritten)
        if [ -f "start.sh.backup" ]; then
            mv start.sh.backup start.sh
        fi
        
        # Check if anything changed
        NEW_COMMIT=$($GIT rev-parse HEAD 2>/dev/null || echo "none")
        
        if [ "$OLD_COMMIT" != "$NEW_COMMIT" ] && [ "$NEW_COMMIT" != "none" ]; then
            echo ""
            echo "📝 Changes pulled:"
            $GIT log $OLD_COMMIT..$NEW_COMMIT --oneline --decorate 2>/dev/null || echo "  (commit log unavailable)"
            echo ""
            echo "✅ Code updated from GitHub"
        elif $GIT status 2>&1 | grep -q "up to date\|up-to-date"; then
            echo "✅ Already up to date"
        else
            echo "✅ Update completed"
        fi
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
