#!/bin/bash

# Uprise Bot Startup Script

echo "🚀 Starting Uprise Bot..."

# Install/update dependencies
echo "📦 Installing dependencies..."
npm install

# Deploy slash commands to Discord
echo "⚡ Deploying slash commands..."
node src/deploy-commands.js

# Start the bot
echo "✅ Starting bot..."
npm start
