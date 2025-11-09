import cron from 'node-cron';
import { getUpcomingBlazersGames } from '../utils/nbaApi.js';

/**
 * Check for game threads that should be locked (24 hours after game time)
 */
async function checkAndLockGameThreads(client) {
  try {
    const channelId = process.env.GAME_THREAD_CHANNEL_ID;
    if (!channelId) {
      console.log('ℹ️ GAME_THREAD_CHANNEL_ID not set');
      return;
    }

    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isThreadOnly()) {
      console.log('ℹ️ Channel is not a forum channel');
      return;
    }

    // Get active threads
    const activeThreads = await channel.threads.fetchActive();
    const now = new Date();

    // Get recent games to check which threads correspond to finished games
    const recentGames = await getUpcomingBlazersGames(14); // Get games from past 14 days
    
    for (const thread of activeThreads.threads.values()) {
      // Check if this is a game thread (contains team names and date)
      if (!thread.name.includes('🏀')) continue;

      // Try to find matching game
      const matchingGame = recentGames?.find(game => {
        const homeTeam = game.home_team.abbreviation;
        const awayTeam = game.visitor_team.abbreviation;
        return thread.name.includes(homeTeam) && thread.name.includes(awayTeam);
      });

      if (matchingGame) {
        const gameTime = new Date(matchingGame.status);
        const hoursSinceGame = (now - gameTime) / (1000 * 60 * 60);

        // Lock thread if 24 hours have passed since game time
        if (hoursSinceGame >= 24 && !thread.locked) {
          await thread.setLocked(true, 'Auto-lock: 24 hours after game time');
          await thread.setArchived(true, 'Auto-archive: 24 hours after game time');
          console.log(`🔒 Locked and archived game thread: ${thread.name}`);
        }
      }
    }
  } catch (error) {
    console.error('Error checking/locking game threads:', error);
  }
}

/**
 * Schedule game thread locking checks
 * Runs every hour to check for threads that should be locked
 */
export function scheduleThreadLocking(client) {
  // Check immediately on startup
  checkAndLockGameThreads(client);
  
  // Check every hour
  // Cron format: minute hour day month weekday
  cron.schedule('0 * * * *', () => {
    console.log('⏰ Checking for game threads to lock...');
    checkAndLockGameThreads(client);
  }, {
    timezone: process.env.TIMEZONE || 'America/Los_Angeles'
  });
  
  console.log('🔒 Thread locking scheduler initialized (checks every hour)');
}
