import cron from 'node-cron';
import { getBlazersGameToday, formatGameInfo } from '../utils/nbaApi.js';

let scheduledPingJob = null; // Store the scheduled ping job
let scheduledGameTime = null; // Store the game time we scheduled for

/**
 * Check if a game is within 15 minutes and schedule a ping for 5 minutes before
 */
async function checkAndSchedulePing(client) {
  try {
    const game = await getBlazersGameToday();
    
    if (!game) {
      console.log('ℹ️ No game today to schedule ping for');
      return;
    }

    // Get game time
    const gameTime = new Date(game.status);
    const now = new Date();
    
    // Calculate time difference in minutes
    const timeDiff = Math.floor((gameTime - now) / (1000 * 60));
    
    // If we're within 15 minutes and haven't scheduled yet, queue up the ping
    if (timeDiff <= 15 && timeDiff > 0 && scheduledGameTime !== gameTime.getTime()) {
      // Calculate when to send the ping (5 minutes before game time)
      const pingTime = new Date(gameTime.getTime() - 5 * 60 * 1000);
      
      // Cancel any previously scheduled ping
      if (scheduledPingJob) {
        scheduledPingJob.stop();
        console.log('🛑 Cancelled previous scheduled ping');
      }
      
      // Schedule the ping for exactly 5 minutes before game time
      scheduledPingJob = cron.schedule('*', () => {
        const now = new Date();
        if (Math.abs(now.getTime() - pingTime.getTime()) < 1000) { // Within 1 second
          console.log('🎯 Executing scheduled game ping now!');
          sendGameStartingMessages(client, game);
          scheduledPingJob.stop();
          scheduledPingJob = null;
        }
      }, {
        timezone: process.env.TIMEZONE || 'America/Los_Angeles'
      });
      
      scheduledGameTime = gameTime.getTime();
      
      const timeUntilPing = Math.floor((pingTime - now) / 60000);
      console.log(`✅ Scheduled game ping for ${pingTime.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles' })} (in ${timeUntilPing} minutes)`);
    }
  } catch (error) {
    console.error('Error checking and scheduling game ping:', error);
  }
}

/**
 * Send game starting messages to both game thread channel and main chat
 */
async function sendGameStartingMessages(client, game) {
  try {
    const gameThreadChannelId = process.env.GAME_THREAD_CHANNEL_ID;
    const mainChatId = process.env.MAIN_CHAT_CHANNEL_ID;
    const roleId = process.env.GAME_PING_ROLE_ID;
    
    if (!gameThreadChannelId || !roleId) {
      console.error('Missing GAME_THREAD_CHANNEL_ID or GAME_PING_ROLE_ID');
      return;
    }

    const gameInfo = formatGameInfo(game);
    
    // Get Unix timestamp for Discord relative time
    const gameDate = new Date(game.status);
    const gameUnixTime = Math.floor(gameDate.getTime() / 1000);
    const gameTimestamp = `<t:${gameUnixTime}:R>`; // Relative time format (e.g., "in 5 minutes")
    
    // Try to find the game thread to link to it
    let threadMention = null;
    
    // Send ping in game thread channel
    const gameThreadChannel = await client.channels.fetch(gameThreadChannelId);
    if (gameThreadChannel) {
      // Search for the game thread first
      if (gameThreadChannel.isThreadOnly()) {
        const threads = await gameThreadChannel.threads.fetchActive();
        const todayThread = threads.threads.find(thread => 
          thread.name.includes(gameInfo.awayTeam) || 
          thread.name.includes(gameInfo.homeTeam)
        );
        
        if (todayThread) {
          threadMention = `<#${todayThread.id}>`;
        }
      }
      
      const pingMessage = `<@&${roleId}> 🏀 **Game Starting Soon**\n\n` +
                         `Portland Trail Blazers vs ${gameInfo.opponent}\n` +
                         `${gameInfo.location} • Tip-off at ${gameTimestamp}!\n\n` +
                         `Get ready for tip-off! 🔥`;
      
      await gameThreadChannel.send(pingMessage);
      console.log('✅ Sent game starting ping in game thread channel');
    }
    
    // Send announcement in main chat to move discussion to game thread
    if (mainChatId) {
      const mainChat = await client.channels.fetch(mainChatId);
      if (mainChat) {
        const gameThreadLink = threadMention || 'the game thread';
        
        const mainChatMessage = `🏀 **Game Time!**\n\n` +
                               `**${gameInfo.awayTeam} @ ${gameInfo.homeTeam}** is starting!\n\n` +
                               `Please move all game-related discussion to ${gameThreadLink}.`;
        
        await mainChat.send(mainChatMessage);
        console.log('✅ Sent game discussion reminder in main chat');
      }
    }
  } catch (error) {
    console.error('Error sending game starting messages:', error);
  }
}

/**
 * Schedule game ping checks
 * Checks every 15 minutes to see if a game is within 15 minutes
 * If found, schedules a precise ping for exactly 5 minutes before tip-off
 */
export function scheduleGamePings(client) {
  // Check immediately on startup
  checkAndSchedulePing(client);
  
  // Check every 15 minutes to see if we need to schedule a ping
  // Cron format: minute hour day month weekday
  cron.schedule('*/15 * * * *', () => {
    console.log('⏰ Checking if game is within 15 minutes...');
    checkAndSchedulePing(client);
  }, {
    timezone: process.env.TIMEZONE || 'America/Los_Angeles'
  });
  
  console.log('✅ Game ping scheduler initialized (checks every 15 minutes, queues precise ping 5 min before game)');
}
