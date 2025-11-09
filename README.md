# 🏀 Uprise Bot

A Discord bot for Portland Trail Blazers fans that automatically creates game threads on game days.

## Features

- **🎮 Automatic Game Threads**: Creates discussion threads for every Trail Blazers game
- **📅 Daily Schedule Check**: Checks for games daily at 8:00 AM Pacific Time
- **🔄 Real-time Game Info**: Fetches game data from the NBA API
- **🏟️ Game Details**: Displays opponent, location (home/away), and tip-off time

## Prerequisites

- Node.js v18 or higher
- A Discord bot token ([Create one here](https://discord.com/developers/applications))
- A Discord server where you have admin permissions

## Setup Instructions

### 1. Clone and Install

```bash
cd "H:\grant\IntellJ Imports\Uprise Bot"
npm install
```

### 2. Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and name it "Uprise Bot"
3. Go to the "Bot" section and click "Add Bot"
4. Under "Privileged Gateway Intents", enable:
   - ✅ Server Members Intent
   - ✅ Message Content Intent
5. Copy your bot token (keep it secret!)

### 3. Invite Bot to Your Server

1. In the Discord Developer Portal, go to "OAuth2" > "URL Generator"
2. Select scopes:
   - ✅ `bot`
3. Select bot permissions:
   - ✅ Send Messages
   - ✅ Create Public Threads
   - ✅ Send Messages in Threads
4. Copy the generated URL and open it in your browser to invite the bot

### 4. Configure Environment Variables

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Edit `.env` and fill in your values:
```env
DISCORD_TOKEN=your_bot_token_here
GUILD_ID=your_server_id_here
GAME_THREAD_CHANNEL_ID=your_channel_id_here
```

**How to get IDs:**
- Enable Developer Mode in Discord (Settings > Advanced > Developer Mode)
- Right-click on your server → Copy Server ID (for `GUILD_ID`)
- Right-click on the channel where you want game threads → Copy Channel ID (for `GAME_THREAD_CHANNEL_ID`)

### 5. Run the Bot

**Development mode (auto-restart on file changes):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

## How It Works

1. **Daily Check**: Every day at 8:00 AM Pacific Time, the bot checks the NBA schedule
2. **Game Detection**: If the Trail Blazers have a game that day, it creates a thread
3. **Thread Creation**: A new thread is posted in your configured channel with:
   - Game matchup (e.g., "LAL @ POR")
   - Home/Away indicator
   - Tip-off time
   - Discussion space for fans

## Project Structure

```
Uprise Bot/
├── src/
│   ├── index.js              # Main bot entry point
│   ├── config/
│   │   └── config.js         # Configuration settings
│   ├── features/
│   │   └── gameThreads.js    # Game thread creation logic
│   └── utils/
│       └── nbaApi.js         # NBA API integration
├── .env                      # Your environment variables (not committed)
├── .env.example              # Example environment file
├── package.json              # Project dependencies
└── README.md                 # This file
```

## Customization

### Change Check Time
Edit `src/features/gameThreads.js` and modify the cron schedule:
```javascript
cron.schedule('0 8 * * *', ... // Change '8' to your preferred hour (24-hour format)
```

### Customize Thread Message
Edit `src/features/gameThreads.js` in the `createGameThread` function to modify the thread content.

### Change Team
To track a different NBA team:
1. Find the team ID from [NBA Stats](https://stats.nba.com/)
2. Update `TEAM_ID` in your `.env` file

## Troubleshooting

**Bot won't start:**
- Make sure your `DISCORD_TOKEN` is correct
- Check that Node.js v18+ is installed: `node --version`

**Game threads not appearing:**
- Verify `GAME_THREAD_CHANNEL_ID` is correct
- Ensure the bot has permissions in that channel
- Check the bot logs for errors

**No games detected:**
- The NBA API may be down or have changed
- Check console logs for API errors

## Future Features

- 📊 Live score updates during games
- 🎯 Post-game stats and highlights
- 📢 Pre-game notifications
- 🗳️ Game predictions and polls

## Support

For issues or questions, check the bot logs or review the error messages in the console.

---

**Rip City!** 🌹 Go Blazers!
