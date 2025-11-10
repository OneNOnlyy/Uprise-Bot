import cron from 'node-cron';
import { getBlazersGameToday, formatGameInfo } from '../utils/nbaApi.js';

let activePingJobs = new Map(); // Track scheduled pings by game date

/**
 * Check for today's game and schedule a ping 5 minutes before tip-off
 */
async function checkAndScheduleGamePing(client) {
  try {
    const game = await getBlazersGameToday();
    
    if (!game) {
      console.log('ℹ️ No game today');
      return;
    }

    const gameTime = new Date(game.status);
    const gameKey = gameTime.toDateString(); // Use date as key to avoid duplicates
    
    // Skip if we already scheduled a ping for this game
    if (activePingJobs.has(gameKey)) {
      return;
    }

    // Calculate ping time (5 minutes before game)
    const pingTime = new Date(gameTime.getTime() - 5 * 60 * 1000);
    const now = new Date();
    
    // Only schedule if ping time is in the future
    if (pingTime > now) {
      const msUntilPing = pingTime.getTime() - now.getTime();
      
      // Schedule the ping as a one-time job
      const timeout = setTimeout(() => {
        console.log('🎯 Executing game ping now!');
        sendGameStartingMessages(client, game);
        activePingJobs.delete(gameKey);
      }, msUntilPing);
      
      activePingJobs.set(gameKey, timeout);
      
      const timeUntilPing = Math.floor(msUntilPing / 60000);
      console.log(`✅ Scheduled game ping for ${pingTime.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles' })} PT (in ${timeUntilPing} minutes)`);
    }
  } catch (error) {
    console.error('Error scheduling game ping:', error);
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
    try {
      const gameThreadChannel = await client.channels.fetch(gameThreadChannelId);
      if (gameThreadChannel && gameThreadChannel.send) {
        // Search for the game thread first
        if (gameThreadChannel.isThreadOnly && gameThreadChannel.isThreadOnly()) {
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
      } else {
        console.error('Game thread channel not found or is not a valid text channel');
      }
    } catch (channelError) {
      console.error('Error sending to game thread channel:', channelError.message);
    }
    
    // Send announcement in main chat to move discussion to game thread
    if (mainChatId) {
      try {
        const mainChat = await client.channels.fetch(mainChatId);
        if (mainChat && mainChat.send) {
          const gameThreadLink = threadMention || 'the game thread';
          
          const mainChatMessage = `🏀 **Game Time!**\n\n` +
                                 `**${gameInfo.awayTeam} @ ${gameInfo.homeTeam}** is starting!\n\n` +
                                 `Please move all game-related discussion to ${gameThreadLink}.`;
          
          await mainChat.send(mainChatMessage);
          console.log('✅ Sent game discussion reminder in main chat');
        } else {
          console.error('Main chat channel not found or is not a valid text channel');
        }
      } catch (chatError) {
        console.error('Error sending to main chat:', chatError.message);
      }
    }
  } catch (error) {
    console.error('Error sending game starting messages:', error);
  }
}

/**
 * Schedule game ping checks
 * Checks every 5 minutes for today's game and schedules a ping 5 minutes before tip-off
 */
export function scheduleGamePings(client) {
  // Check immediately on startup
  checkAndScheduleGamePing(client);
  
  // Check every 5 minutes to see if we need to schedule a ping
  // This ensures we catch the game early enough to schedule the 5-minute ping
  cron.schedule('*/5 * * * *', () => {
    console.log('⏰ Checking for today\'s game...');
    checkAndScheduleGamePing(client);
  }, {
    timezone: process.env.TIMEZONE || 'America/Los_Angeles'
  });
  
  console.log('✅ Game ping scheduler initialized (checks every 5 minutes)');
}
