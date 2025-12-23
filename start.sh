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
            echo "   Running: apt-get update && apt-get install -y git"
            apt-get update -qq && apt-get install -y git
        elif command -v apk &> /dev/null; then
            echo "   Running: apk add git"
            apk add --no-cache git
        fi
        
        # Refresh command cache after installation
        hash -r 2>/dev/null || true
        
        # Check if installation succeeded
        if command -v git &> /dev/null; then
            echo "   ✅ Git installed successfully"
        else
            echo "   ⚠️ Git installation may have failed or requires root permissions"
        fi
    fi
    
    # Find git executable (check multiple locations)
    GIT=""
    for path in "/usr/bin/git" "/usr/local/bin/git" "/bin/git" "$(which git 2>/dev/null)"; do
        if [ -n "$path" ] && [ -x "$path" ]; then
            GIT="$path"
            echo "🔍 Using git at: $GIT"
            break
        fi
    done
    
    # If still not found, try one more time with command
    if [ -z "$GIT" ]; then
        if command -v git &> /dev/null; then
            GIT=$(command -v git)
            echo "🔍 Using git at: $GIT"
        else
            echo "❌ Git not found after installation. Cannot proceed with auto-update."
            GIT=""
        fi
    fi
    
    # Only proceed if git was found
    if [ -n "$GIT" ]; then
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
        
        # Store current commit before pull
        OLD_COMMIT=$($GIT rev-parse HEAD 2>/dev/null || echo "none")
        
        # Pull with visible output
        $GIT pull origin main --force
        
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
