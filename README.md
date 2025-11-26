# 🏀 Uprise Bot

A comprehensive Discord bot for NBA fans featuring **PATS (Picks Against The Spread)** - an interactive daily game where users compete by picking NBA games against the spread, plus automatic game threads, transaction feeds, and more.

## 🎯 Core Features

### PATS (Picks Against The Spread)
The main feature - a daily competition system where users pick NBA games against the spread:
- **Interactive Dashboard**: Real-time tracking of picks with live game updates
- **Double Down System**: Stake 2 points on your most confident pick
- **Live Score Updates**: See 📈/📉 indicators showing if you're winning or losing in real-time
- **Session Scheduling**: Automated PATS sessions with customizable notifications
- **Comprehensive Stats**: Track win rates, streaks, best picks, and leaderboards
- **Pick History**: Review past sessions and performance over time

### Automated Features
- **Game Threads**: Automatic discussion threads for Portland Trail Blazers games
- **Transaction Feed**: Real-time NBA transactions (trades, signings, waivers, injuries, fines)
- **Injury Reports**: Updated every 2 minutes from CBS Sports with multi-source fallback
- **Game Result Checking**: Automatic score fetching and winner calculation
- **Thread Locking**: Auto-locks game threads 24 hours after games end

### User Experience
- **Injury & Roster Viewing**: Check team injuries and active rosters before picking
- **Matchup Information**: Detailed game info with team records and spreads
- **Everyone's Picks**: See what other users picked for each game
- **User Preferences**: Customizable notification settings
- **Help System**: Built-in tutorials and emoji legend

## 📋 Prerequisites

- **Node.js** v18 or higher
- **Discord Bot Token** ([Create one here](https://discord.com/developers/applications))
- **The Odds API Key** ([Get free tier here](https://the-odds-api.com/))
- Discord server with admin permissions

## 🚀 Setup Instructions

### 1. Clone and Install

```bash
git clone https://github.com/OneNOnlyy/Uprise-Bot.git
cd Uprise-Bot
npm install
```

### 2. Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and name it "Uprise Bot"
3. Go to the "Bot" section and click "Add Bot"
4. Under "Privileged Gateway Intents", enable:
   - ✅ Server Members Intent
   - ✅ Message Content Intent
   - ✅ Presence Intent
5. Copy your bot token (keep it secret!)

### 3. Get API Keys

**The Odds API** (for NBA spreads):
1. Visit [The Odds API](https://the-odds-api.com/)
2. Sign up for a free account (500 requests/month)
3. Copy your API key

### 4. Invite Bot to Your Server

1. In the Discord Developer Portal, go to "OAuth2" > "URL Generator"
2. Select scopes:
   - ✅ `bot`
   - ✅ `applications.commands`
3. Select bot permissions:
   - ✅ Send Messages
   - ✅ Send Messages in Threads
   - ✅ Create Public Threads
   - ✅ Manage Threads
   - ✅ Embed Links
   - ✅ Read Message History
   - ✅ Use Slash Commands
4. Copy the generated URL and open it in your browser to invite the bot

### 5. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# Discord Configuration
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_application_id_here
GUILD_ID=your_server_id_here

# Channel IDs
GAME_THREAD_CHANNEL_ID=your_game_thread_channel_id
TRANSACTION_CHANNEL_ID=your_transaction_channel_id

# API Keys
ODDS_API_KEY=your_odds_api_key_here

# Team Configuration (Portland Trail Blazers by default)
TEAM_ID=1610612757
TEAM_ABBREVIATION=POR

# Feature Flags (true/false)
ENABLE_GAME_THREADS=true
ENABLE_TRANSACTIONS=true
ENABLE_GAME_PING=true
```

**How to get Discord IDs:**
- Enable Developer Mode in Discord (Settings > Advanced > Developer Mode)
- Right-click on your server → Copy Server ID (for `GUILD_ID`)
- Right-click on desired channels → Copy Channel ID

### 6. Deploy Slash Commands

Before running the bot for the first time:

```bash
node src/deploy-commands.js
```

This registers all slash commands with Discord.

### 7. Run the Bot

**Development mode** (with auto-restart):
```bash
npm run dev
```

**Production mode**:
```bash
npm start
```

## 🎮 Commands

### PATS Commands
- `/pats` - Open your PATS dashboard
- `/patsstart <date>` - Start a new PATS session (Admin only)
- `/patsend` - End the current PATS session (Admin only)
- `/patsschedule` - Schedule PATS sessions in advance with notifications
- `/patshistory` - View past session results (Admin only)
- `/patsleaderboard` - View all-time leaderboard
- `/patsrefreshspreads` - Manually refresh spreads (Admin only)
- `/patsreopen` - Reopen a closed session (Admin only)

### Player Management (Admin Only)
- `/patsaddplayer <user> <username>` - Add a player to PATS system
- `/patsdeleteplayer <user>` - Remove a player from PATS system
- `/patsviewplayer <user>` - View player information
- `/patseditplayer <user>` - Edit player stats and information

### Other Commands
- `/config` - View or change bot configuration
- `/gamethread` - Manually create a game thread
- `/sendgameping` - Send a game notification ping
- `/testping` - Test the notification system

## 📊 How PATS Works

1. **Session Start**: Admin runs `/patsstart` or a scheduled session begins
2. **Make Picks**: Users pick games against the spread using the interactive menu
3. **Double Down**: Optionally stake 2 points on one game (before it starts)
4. **Games Play**: Bot fetches live scores every minute during NBA hours
5. **Results**: Winners determined by comparing final scores + spreads
6. **Leaderboard**: Stats tracked across all sessions for rankings

### Scoring
- **Win**: +1 point (or +2 if doubled down)
- **Loss**: -1 point (or -2 if doubled down)
- **Push**: 0 points (ties are refunded, never doubled)

## 🗂️ Project Structure

```
Uprise-Bot/
├── src/
│   ├── index.js                    # Main bot entry point
│   ├── deploy-commands.js          # Slash command registration
│   ├── commands/                   # Slash command handlers
│   │   ├── pats.js                 # Main PATS dashboard
│   │   ├── makepick.js             # Pick submission system
│   │   ├── patsstart.js            # Session management
│   │   ├── patsschedule.js         # Scheduling system
│   │   ├── patsleaderboard.js      # Leaderboard display
│   │   ├── patshistory.js          # Historical data
│   │   └── [player management].js  # Admin tools
│   ├── config/
│   │   └── config.js               # Bot configuration
│   ├── features/                   # Automated features
│   │   ├── gameThreads.js          # Game thread creation
│   │   ├── transactionFeed.js      # NBA transactions
│   │   ├── gamePing.js             # Game notifications
│   │   ├── checkGameResults.js     # Score checking
│   │   └── lockThreads.js          # Thread management
│   └── utils/                      # Utility modules
│       ├── patsData.js             # PATS data management
│       ├── oddsApi.js              # The Odds API + ESPN
│       ├── nbaApi.js               # ESPN API (injuries)
│       ├── transactionsApi.js      # ESPN transactions
│       ├── dataCache.js            # Caching system
│       ├── sessionScheduler.js     # Session scheduling
│       └── userPreferences.js      # User settings
├── data/
│   ├── pats.json                   # PATS session data
│   ├── scheduled-sessions.json     # Scheduled sessions
│   └── manual-spreads.json         # Manual spread overrides
├── .env                            # Environment variables
└── package.json                    # Dependencies
```

## 🔧 Configuration

### API Rate Limits
- **The Odds API**: 500 calls/month (free tier)
  - Bot conserves calls by fetching spreads only once per session
  - Cached for entire session duration
- **ESPN API**: No rate limits (publicly available)
  - Used for live scores, injuries, and transactions
- **CBS Sports**: Web scraping for injury reports (fallback)

### Automated Schedules
- **Game Threads**: Daily at 8:00 AM PT
- **Transaction Feed**: Every 2 minutes (24/7)
- **Game Results**: Every 1 minute during NBA hours (8 AM - 11 PM PT)
- **Injury Reports**: Every 2 minutes
- **Thread Locking**: Checks every hour
- **Game Pings**: At game start time

### Customization

**Change team tracking** (for game threads):
Edit `.env`:
```env
TEAM_ID=1610612747  # Lakers
TEAM_ABBREVIATION=LAL
```

**Adjust session scheduling**:
Use `/patsschedule` to configure:
- Announcement time (hours before first game)
- Reminder notifications (minutes before)
- Warning notifications (minutes before)

## 🐛 Troubleshooting

### Bot Issues
- **Bot won't start**: Check `DISCORD_TOKEN` and Node.js version
- **Commands not appearing**: Run `node src/deploy-commands.js`
- **Missing permissions**: Verify bot has all required permissions in channels

### PATS Issues
- **No spreads loading**: Check `ODDS_API_KEY` and monthly quota (500 calls)
- **Scores not updating**: ESPN API may be delayed (scores fetch every minute during games)
- **Dashboard expired**: Discord interactions expire after 15 minutes - run `/pats` again

### Game Thread Issues
- **Threads not creating**: Check `GAME_THREAD_CHANNEL_ID` and bot permissions
- **Wrong team games**: Verify `TEAM_ID` in `.env`

### Data Issues
- **Lost data**: Data stored in `data/pats.json` - back up regularly
- **Corrupted stats**: Contact admin to use `/patseditplayer` for corrections

## 📈 Data Management

### Backups
Important files to backup:
- `data/pats.json` - All PATS data (sessions, users, picks, stats)
- `data/scheduled-sessions.json` - Scheduled sessions
- `.env` - Configuration (keep private!)

### Manual Spread Corrections
Edit `data/manual-spreads.json` to override incorrect spreads:
```json
{
  "gameId": {
    "homeSpread": -5.5,
    "awaySpread": 5.5
  }
}
```

## 🔐 Security

- **Never commit** `.env` or `data/` folder to public repos
- **API keys** should be kept private
- **Bot token** can control your entire bot - keep it secret
- **Admin commands** are restricted to users with admin permissions

## 🤝 Contributing

This is a private bot for specific Discord servers. To use:
1. Fork the repository
2. Set up your own bot instance
3. Configure for your server

## � License

This project is private and not licensed for redistribution.

## 🆘 Support

For issues:
1. Check bot console logs for detailed error messages
2. Verify all configuration in `.env`
3. Check API quotas and rate limits
4. Review Discord bot permissions

## 🎉 Credits

Built for NBA fans who want to make game watching more interactive!

**Data Sources:**
- The Odds API (spreads)
- ESPN API (scores, transactions, rosters)
- CBS Sports (injury reports)

---

**Go Blazers!** 🌹 **Rip City!**
