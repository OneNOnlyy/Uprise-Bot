import cron from 'node-cron';
import { getBlazersGameToday, formatGameInfo } from '../utils/nbaApi.js';

let activePingJobs = new Map(); // Track scheduled pings by game date

/**
 * Check for today's game and schedule a ping at game time
 */
async function checkAndScheduleGamePing(client) {
  try {
    console.log('🔍 [GAME PING] Running check...');
    const game = await getBlazersGameToday();
    
    if (!game) {
      console.log('ℹ️ [GAME PING] No game today');
      return;
    }

    console.log('✅ [GAME PING] Game found:', {
      id: game.id,
      home: game.home_team?.full_name,
      away: game.visitor_team?.full_name,
      status: game.status,
      statusType: typeof game.status
    });

    const gameTime = new Date(game.status);
    const gameKey = gameTime.toDateString(); // Use date as key to avoid duplicates
    
    console.log('📅 [GAME PING] Game time:', {
      gameTime: gameTime.toISOString(),
      gameKey,
      isPast: gameTime < new Date(),
      isValidDate: !isNaN(gameTime.getTime())
    });
    
    // Skip if we already scheduled a ping for this game
    if (activePingJobs.has(gameKey)) {
      console.log('⏭️ [GAME PING] Already scheduled for this game. Active jobs:', Array.from(activePingJobs.keys()));
      return;
    }

    // Calculate ping time (at game start, not 5 minutes before)
    const pingTime = new Date(gameTime.getTime());
    const now = new Date();
    
    // Only schedule if ping time is in the future
    if (pingTime > now) {
      const msUntilPing = pingTime.getTime() - now.getTime();
      
      // Schedule the ping as a one-time job
      const timeout = setTimeout(() => {
        console.log('🎯 [GAME PING] Executing game ping now!');
        sendGameStartingMessages(client, game);
        activePingJobs.delete(gameKey);
        console.log('✅ [GAME PING] Ping complete, removed from active jobs');
      }, msUntilPing);
      
      activePingJobs.set(gameKey, timeout);
      
      const timeUntilPing = Math.floor(msUntilPing / 60000);
      console.log(`✅ [GAME PING] Scheduled game ping for ${pingTime.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles' })} PT (in ${timeUntilPing} minutes)`);
      console.log('📋 [GAME PING] Active jobs:', Array.from(activePingJobs.keys()));
    } else {
      console.log(`⏰ [GAME PING] Game already started or passed (${Math.abs(Math.floor((pingTime - now) / 60000))} minutes ago)`);
    }
  } catch (error) {
    console.error('❌ [GAME PING] Error scheduling game ping:', error);
  }
}

/**
 * Send game starting messages to both game thread channel and main chat
 */
async function sendGameStartingMessages(client, game) {
  try {
    console.log('🚀 [GAME PING] Starting sendGameStartingMessages...');
    
    const gameThreadChannelId = process.env.GAME_THREAD_CHANNEL_ID;
    const mainChatId = process.env.MAIN_CHAT_CHANNEL_ID;
    const roleId = process.env.GAME_PING_ROLE_ID;
    
    console.log('📋 [GAME PING] Environment variables:', {
      gameThreadChannelId,
      mainChatId,
      roleId: roleId ? `${roleId.substring(0, 8)}...` : 'missing'
    });
    
    if (!gameThreadChannelId || !roleId) {
      console.error('❌ [GAME PING] Missing GAME_THREAD_CHANNEL_ID or GAME_PING_ROLE_ID');
      return;
    }

    const gameInfo = formatGameInfo(game);
    console.log('📊 [GAME PING] Game info:', {
      opponent: gameInfo?.opponent,
      location: gameInfo?.location,
      awayTeam: gameInfo?.awayTeam,
      homeTeam: gameInfo?.homeTeam
    });
    
    // Get Unix timestamp for Discord relative time
    const gameDate = new Date(game.status);
    const gameUnixTime = Math.floor(gameDate.getTime() / 1000);
    const gameTimestamp = `<t:${gameUnixTime}:R>`; // Relative time format (e.g., "in 5 minutes")
    
    // Try to find the game thread to send the ping there
    let gameThread = null;
    
    // Find the actual game thread
    try {
      console.log(`🔍 [GAME PING] Fetching game thread channel: ${gameThreadChannelId}`);
      const gameThreadChannel = await client.channels.fetch(gameThreadChannelId);
      console.log('📺 [GAME PING] Channel fetched:', {
        type: gameThreadChannel?.type,
        name: gameThreadChannel?.name,
        isThreadOnly: gameThreadChannel?.isThreadOnly?.()
      });
      
      if (gameThreadChannel && gameThreadChannel.isThreadOnly && gameThreadChannel.isThreadOnly()) {
        console.log('🧵 [GAME PING] Fetching active threads...');
        const threads = await gameThreadChannel.threads.fetchActive();
        console.log(`📑 [GAME PING] Found ${threads.threads.size} active threads`);
        
        threads.threads.forEach(thread => {
          console.log(`  - "${thread.name}"`);
        });
        
        const todayThread = threads.threads.find(thread => 
          thread.name.includes(gameInfo.awayTeam) || 
          thread.name.includes(gameInfo.homeTeam)
        );
        
        if (todayThread) {
          gameThread = todayThread;
          console.log(`✅ [GAME PING] Found game thread: "${todayThread.name}"`);
        } else {
          console.log(`⚠️ [GAME PING] No matching thread found for ${gameInfo.awayTeam} vs ${gameInfo.homeTeam}`);
        }
      }
      
      // Send ping in the game thread if found
      if (gameThread && gameThread.send) {
        const pingMessage = `<@&${roleId}> 🏀 **Game Starting Now!**\n\n` +
                           `Portland Trail Blazers vs ${gameInfo.opponent}\n` +
                           `${gameInfo.location} • Tip-off at ${gameTimestamp}!\n\n` +
                           `Let's go Blazers! 🔥`;
        
        console.log('📤 [GAME PING] Sending ping to game thread...');
        await gameThread.send(pingMessage);
        console.log('✅ [GAME PING] Sent game starting ping in game thread');
      } else {
        console.error('❌ [GAME PING] Game thread not found or cannot send, skipping ping');
      }
    } catch (channelError) {
      console.error('❌ [GAME PING] Error sending to game thread:', channelError.message);
      console.error(channelError);
    }
    
    // Optionally send announcement in main chat if game thread was found
    if (mainChatId && gameThread) {
      try {
        console.log(`📤 [GAME PING] Sending announcement to main chat: ${mainChatId}`);
        const mainChat = await client.channels.fetch(mainChatId);
        if (mainChat && mainChat.send) {
          const mainChatMessage = `🏀 **Game Starting Now!**\n\n` +
                                 `** ${gameInfo.awayTeam} @ ${gameInfo.homeTeam}**\n\n` +
                                 `Head to <#${gameThread.id}> for game discussion! 🔥`;
          
          await mainChat.send(mainChatMessage);
          console.log('✅ [GAME PING] Sent game announcement in main chat');
        }
      } catch (chatError) {
        console.error('❌ [GAME PING] Error sending to main chat:', chatError.message);
      }
    } else {
      if (!mainChatId) {
        console.log('ℹ️ [GAME PING] MAIN_CHAT_CHANNEL_ID not configured, skipping main chat announcement');
      }
      if (!gameThread) {
        console.log('ℹ️ [GAME PING] No game thread found, skipping main chat announcement');
      }
    }
  } catch (error) {
    console.error('❌ [GAME PING] Error sending game starting messages:', error);
  }
}

/**
 * Schedule game ping checks
 * Checks every 5 minutes for today's game and schedules a ping at game start time
 */
export function scheduleGamePings(client) {
  console.log('🚀 [GAME PING] Initializing game ping scheduler...');
  console.log(`⏰ [GAME PING] Cron schedule: */5 * * * * (every 5 minutes)`);
  console.log(`🌍 [GAME PING] Timezone: ${process.env.TIMEZONE || 'America/Los_Angeles'}`);
  
  // Check immediately on startup
  console.log('🔍 [GAME PING] Running initial check on startup...');
  checkAndScheduleGamePing(client);
  
  // Check every 5 minutes to see if we need to schedule a ping
  // This ensures we catch the game early enough to schedule the ping
  cron.schedule('*/5 * * * *', () => {
    console.log('⏰ [GAME PING] Cron triggered: Checking for today\'s game...');
    checkAndScheduleGamePing(client);
  }, {
    timezone: process.env.TIMEZONE || 'America/Los_Angeles'
  });
  
  console.log('✅ [GAME PING] Game ping scheduler initialized successfully!');
}

