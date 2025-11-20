import cron from 'node-cron';

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

    console.log(`📋 Checking ${activeThreads.threads.size} active threads for locking...`);
    
    for (const thread of activeThreads.threads.values()) {
      // Check if this is a game thread (contains basketball emoji and date)
      if (!thread.name.includes('🏀')) continue;

      // Extract date from thread name (format: "🏀 TEAM @ TEAM - Mon DD, YYYY")
      const dateMatch = thread.name.match(/- (.+)$/);
      if (!dateMatch) {
        console.log(`⚠️ Could not parse date from thread name: ${thread.name}`);
        continue;
      }

      const dateString = dateMatch[1].trim();
      const gameDate = new Date(dateString + ' 23:59:59'); // Assume end of day if no time specified
      
      // Check if the date is valid
      if (isNaN(gameDate.getTime())) {
        console.log(`⚠️ Invalid date parsed from thread: ${thread.name} (parsed: "${dateString}")`);
        continue;
      }
      
      const hoursSinceDate = (now - gameDate) / (1000 * 60 * 60);

      console.log(`🏀 ${thread.name}`);
      console.log(`   Game date: ${gameDate.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`);
      console.log(`   Hours since: ${hoursSinceDate.toFixed(1)}`);

      // Lock thread if 24 hours have passed since end of game day
      // This ensures games have concluded before locking
      if (hoursSinceDate >= 24 && !thread.locked) {
        try {
          await thread.setLocked(true, 'Auto-lock: 24 hours after game date');
          await thread.setArchived(true, 'Auto-archive: 24 hours after game date');
          console.log(`   🔒 LOCKED and archived!`);
        } catch (lockError) {
          console.error(`   ❌ Failed to lock thread: ${lockError.message}`);
        }
      } else if (thread.locked) {
        console.log(`   🔒 Already locked`);
      } else if (hoursSinceDate < 24) {
        const hoursRemaining = 24 - hoursSinceDate;
        console.log(`   ⏳ Will lock in ${hoursRemaining.toFixed(1)} hours`);
      } else if (hoursSinceDate < 0) {
        console.log(`   📅 Future game - will not lock yet`);
      }
    }
    
    console.log('✅ Thread locking check complete');
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
