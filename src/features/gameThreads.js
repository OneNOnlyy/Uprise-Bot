import cron from 'node-cron';
import { EmbedBuilder } from 'discord.js';
import { getBlazersGameToday, formatGameInfo } from '../utils/nbaApi.js';

/**
 * Get NBA team logo URL from ESPN CDN (PNG format for Discord compatibility)
 */
function getTeamLogoUrl(teamAbbreviation) {
  // ESPN provides reliable PNG logos that work well with Discord
  const teamMapping = {
    'ATL': 'atl',
    'BOS': 'bos',
    'BKN': 'bkn',
    'CHA': 'cha',
    'CHI': 'chi',
    'CLE': 'cle',
    'DAL': 'dal',
    'DEN': 'den',
    'DET': 'det',
    'GSW': 'gs',
    'HOU': 'hou',
    'IND': 'ind',
    'LAC': 'lac',
    'LAL': 'lal',
    'MEM': 'mem',
    'MIA': 'mia',
    'MIL': 'mil',
    'MIN': 'min',
    'NOP': 'no',
    'NYK': 'ny',
    'OKC': 'okc',
    'ORL': 'orl',
    'PHI': 'phi',
    'PHX': 'phx',
    'POR': 'por',
    'SAC': 'sac',
    'SAS': 'sa',
    'TOR': 'tor',
    'UTA': 'utah',
    'WAS': 'wsh'
  };
  
  const espnAbbr = teamMapping[teamAbbreviation];
  if (!espnAbbr) return null;
  
  return `https://a.espncdn.com/i/teamlogos/nba/500/${espnAbbr}.png`;
}

/**
 * Create a game thread in the specified channel (supports both Forum and Text channels)
 */
async function createGameThread(client, gameInfo) {
  try {
    const channelId = process.env.GAME_THREAD_CHANNEL_ID;
    if (!channelId) {
      console.error('GAME_THREAD_CHANNEL_ID not set in environment variables');
      return;
    }

    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      console.error('Could not find channel with ID:', channelId);
      return;
    }

    // Create thread title
    const threadTitle = `🏀 ${gameInfo.awayTeam} @ ${gameInfo.homeTeam} - ${gameInfo.gameDate}`;
    
    // Get opponent logo
    const opponentTeam = gameInfo.isHomeGame ? gameInfo.awayTeam : gameInfo.homeTeam;
    const opponentLogoUrl = getTeamLogoUrl(opponentTeam);
    
    // Create embed with opponent logo
    const embed = new EmbedBuilder()
      .setTitle(`${gameInfo.awayTeam} @ ${gameInfo.homeTeam}`)
      .setDescription(`**Rip City!** 🌹 Discuss the game here!`)
      .addFields(
        { name: '📅 Date', value: gameInfo.gameDate, inline: true },
        { name: '🕐 Tip-off', value: gameInfo.gameTime, inline: true },
        { name: '📍 Location', value: gameInfo.location, inline: true },
        { name: '🏟️ Opponent', value: gameInfo.opponent, inline: false }
      )
      .setColor(0xE03A3E); // Trail Blazers red
    
    if (opponentLogoUrl) {
      embed.setThumbnail(opponentLogoUrl);
    }

    let thread;
    
    // Check if the channel is a forum channel
    if (channel.isThreadOnly()) {
      // Forum channel - create a forum post with embed
      thread = await channel.threads.create({
        name: threadTitle,
        message: { embeds: [embed] },
        autoArchiveDuration: 1440, // 24 hours
        reason: 'Automated game thread creation'
      });
    } else {
      // Regular text channel - send embed and create thread
      const message = await channel.send({ embeds: [embed] });
      thread = await message.startThread({
        name: threadTitle,
        autoArchiveDuration: 1440, // 24 hours
        reason: 'Automated game thread creation'
      });
    }

    console.log(`✅ Created game thread: ${threadTitle}`);
    console.log(`📍 Thread ID: ${thread.id}`);
    
    // Announce in main chat that the game thread was created
    await announceGameThreadCreated(client, gameInfo, thread);
    
    return thread;
  } catch (error) {
    console.error('Error creating game thread:', error);
  }
}

/**
 * Announce in main chat that a game thread has been created
 */
async function announceGameThreadCreated(client, gameInfo, thread) {
  try {
    const mainChatId = process.env.MAIN_CHAT_CHANNEL_ID;
    if (!mainChatId) {
      console.log('ℹ️ MAIN_CHAT_CHANNEL_ID not set, skipping announcement');
      return;
    }

    const mainChat = await client.channels.fetch(mainChatId);
    if (!mainChat) {
      console.error('Could not find main chat channel');
      return;
    }

    const message = `🏀 **Game Thread Created!**\n\n` +
                   `**${gameInfo.awayTeam} @ ${gameInfo.homeTeam}**\n` +
                   `📅 ${gameInfo.gameDate} • 🕐 ${gameInfo.gameTime}\n\n` +
                   `Head over to <#${thread.id}> to discuss the game! 🔥`;

    await mainChat.send(message);
    console.log('✅ Announced game thread creation in main chat');
  } catch (error) {
    console.error('Error announcing game thread:', error);
  }
}

/**
 * Check if a game thread already exists for today's game
 */
async function gameThreadExists(channel, gameInfo) {
  try {
    if (!channel.isThreadOnly()) return false;
    
    // Fetch active threads
    const activeThreads = await channel.threads.fetchActive();
    
    // Check if a thread with matching teams already exists
    const exists = activeThreads.threads.some(thread => 
      thread.name.includes(gameInfo.awayTeam) && 
      thread.name.includes(gameInfo.homeTeam) &&
      thread.name.includes(gameInfo.gameDate)
    );
    
    return exists;
  } catch (error) {
    console.error('Error checking for existing thread:', error);
    return false;
  }
}

/**
 * Check for today's game and create thread if needed
 */
async function checkAndCreateGameThread(client) {
  console.log('🔍 Checking for Trail Blazers game today...');
  
  const game = await getBlazersGameToday();
  
  if (game) {
    const gameInfo = formatGameInfo(game);
    console.log(`🏀 Found game: ${gameInfo.awayTeam} @ ${gameInfo.homeTeam} at ${gameInfo.gameTime}`);
    
    // Check if thread already exists
    const channelId = process.env.GAME_THREAD_CHANNEL_ID;
    if (channelId) {
      const channel = await client.channels.fetch(channelId);
      const exists = await gameThreadExists(channel, gameInfo);
      
      if (exists) {
        console.log('ℹ️ Game thread already exists, skipping creation');
        return;
      }
    }
    
    await createGameThread(client, gameInfo);
  } else {
    console.log('ℹ️ No Trail Blazers game scheduled for today');
  }
}

/**
 * Schedule game thread creation checks
 * Runs every day at 8:00 AM Pacific Time
 */
export function scheduleGameThreads(client) {
  // Run immediately on startup
  checkAndCreateGameThread(client);
  
  // Schedule to run every day at 8:00 AM Pacific Time
  // Cron format: minute hour day month weekday
  cron.schedule('0 8 * * *', () => {
    console.log('\n⏰ Running scheduled game thread check...');
    checkAndCreateGameThread(client);
  }, {
    timezone: process.env.TIMEZONE || 'America/Los_Angeles'
  });
  
  console.log('📅 Game thread scheduler initialized (runs daily at 8:00 AM PT)');
}
