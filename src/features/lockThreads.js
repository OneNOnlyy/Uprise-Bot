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

    // Get recent games (including past games from last 7 days to catch finished games)
    const recentGames = await getUpcomingBlazersGames(7, true); // includePast = true
    
    console.log(`📋 Checking ${activeThreads.threads.size} active threads for locking...`);
    console.log(`📅 Found ${recentGames?.length || 0} recent games in API`);
    
    if (recentGames && recentGames.length > 0) {
      console.log('Recent games:');
      recentGames.forEach(game => {
        const homeTeam = game.home_team.abbreviation;
        const awayTeam = game.visitor_team.abbreviation;
        const gameDate = new Date(game.status);
        console.log(`  - ${awayTeam} @ ${homeTeam} on ${gameDate.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' })}`);
      });
    }
    
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
        
        // Check if the date is valid
        if (isNaN(gameTime.getTime())) {
          console.log(`⚠️ Invalid game time for thread: ${thread.name} (status: ${matchingGame.status})`);
          continue;
        }
        
        const hoursSinceGame = (now - gameTime) / (1000 * 60 * 60);

        console.log(`🏀 ${thread.name}: ${hoursSinceGame.toFixed(1)} hours since game time (${gameTime.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })})`);

        // Lock thread if 24 hours have passed since game time
        if (hoursSinceGame >= 24 && !thread.locked) {
          await thread.setLocked(true, 'Auto-lock: 24 hours after game time');
          await thread.setArchived(true, 'Auto-archive: 24 hours after game time');
          console.log(`🔒 Locked and archived game thread: ${thread.name}`);
        } else if (hoursSinceGame < 24) {
          const hoursRemaining = 24 - hoursSinceGame;
          console.log(`⏳ Thread will be locked in ${hoursRemaining.toFixed(1)} hours`);
        }
      } else {
        console.log(`⚠️ Could not find matching game for thread: ${thread.name}`);
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
