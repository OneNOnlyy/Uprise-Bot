#!/bin/bash

# Uprise Bot Startup Script with Auto-Update from GitHub

echo "🔄 Checking for updates from GitHub..."

# Ensure common binary paths are in PATH
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"

# Check if AUTO_UPDATE is disabled
if [ "$AUTO_UPDATE" = "0" ]; then
    echo "⏭️ Auto-update disabled, skipping git pull..."
    echo "📦 Installing dependencies..."
    npm install
    echo "🚀 Starting Uprise Bot..."
    npm start
    exit 0
fi

# Check if git is available
GIT_CMD=""
echo "🔍 Debugging git detection..."
echo "   PATH: $PATH"
command -v git && echo "   command -v git: found" || echo "   command -v git: not found"
[ -x "/usr/bin/git" ] && echo "   /usr/bin/git executable: yes" || echo "   /usr/bin/git executable: no"
[ -f "/usr/bin/git" ] && echo "   /usr/bin/git exists: yes" || echo "   /usr/bin/git exists: no"
/usr/bin/git --version 2>&1 && echo "   /usr/bin/git runs: yes" || echo "   /usr/bin/git runs: no"

if command -v git &> /dev/null; then
    GIT_CMD="git"
    echo "✅ Git found in PATH"
elif [ -x "/usr/bin/git" ]; then
    GIT_CMD="/usr/bin/git"
    echo "✅ Git found at /usr/bin/git"
elif /usr/bin/git --version &> /dev/null; then
    GIT_CMD="/usr/bin/git"
    echo "✅ Git runs at /usr/bin/git (forcing use)"
else
    echo "⚠️ Git not found, skipping auto-update..."
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
    if [ -n "$($GIT_CMD status --porcelain)" ]; then
        echo "📦 Stashing local changes..."
        $GIT_CMD stash
    fi
    
    # Configure git
    $GIT_CMD config pull.ff only
    
    # Set remote URL (no authentication needed for public repo)
    $GIT_CMD remote set-url origin https://github.com/OneNOnlyy/Uprise-Bot.git
    
    # Add timeout to git pull (30 seconds)
    timeout 30s $GIT_CMD pull origin main 2>&1
    
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
