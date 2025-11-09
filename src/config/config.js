export const config = {
  // Discord Configuration
  token: process.env.DISCORD_TOKEN,
  guildId: process.env.GUILD_ID,
  gameThreadChannelId: process.env.GAME_THREAD_CHANNEL_ID,
  
  // NBA Configuration
  teamId: process.env.TEAM_ID || '1610612757', // Portland Trail Blazers
  teamName: 'Portland Trail Blazers',
  teamAbbr: 'POR',
  
  // Bot Settings
  timezone: process.env.TIMEZONE || 'America/Los_Angeles',
  threadCheckTime: '8:00', // Daily check time (8:00 AM)
  threadAutoArchiveDuration: 1440, // 24 hours in minutes
  
  // Feature Flags
  features: {
    gameThreads: true,
  }
};

export default config;
