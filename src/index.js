import { Client, GatewayIntentBits, Events, Collection } from 'discord.js';
import dotenv from 'dotenv';
import { initializeCache, startInjuryReportUpdates } from './utils/dataCache.js';
import { scheduleGameThreads } from './features/gameThreads.js';
import { scheduleGamePings } from './features/gamePing.js';
import { scheduleThreadLocking } from './features/lockThreads.js';
import { scheduleGameResultChecking } from './features/checkGameResults.js';
import { scheduleTransactionFeed } from './features/transactionFeed.js';
import { initGameWarnings } from './features/gameWarnings.js';
import { initInjuryTracking, subscribeToInjuries, unsubscribeFromInjuries, isSubscribed } from './features/injuryTracking.js';
import { loadScheduledSessions, scheduleSessionJobs, addScheduledSession } from './utils/sessionScheduler.js';
import { initializeSeasonAutoScheduler } from './utils/patsSeasons.js';
import { getESPNGamesForDate } from './utils/oddsApi.js';
import * as gamethreadCommand from './commands/gamethread.js';
import * as testpingCommand from './commands/testping.js';
import * as sendgamepingCommand from './commands/sendgameping.js';
import * as configCommand from './commands/config.js';
import * as makepickCommand from './commands/makepick.js';
import * as patsCommand from './commands/pats.js';
import * as mockCommand from './commands/mock.js';
import { showSettingsMenu, handleToggle } from './utils/userPreferences.js';
import { ensureUser } from './utils/patsData.js';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers, // Required for fetching server members
  ],
});

// Setup commands collection
client.commands = new Collection();
client.commands.set(gamethreadCommand.data.name, gamethreadCommand);
client.commands.set(testpingCommand.data.name, testpingCommand);
client.commands.set(sendgamepingCommand.data.name, sendgamepingCommand);
client.commands.set(configCommand.data.name, configCommand);
client.commands.set(patsCommand.data.name, patsCommand);
client.commands.set(mockCommand.data.name, mockCommand);

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ Uprise Bot is ready! Logged in as ${readyClient.user.tag}`);
  console.log(`🏀 Monitoring Portland Trail Blazers games...`);
  console.log(`⚡ Slash commands loaded: ${client.commands.size}`);
  
  // Initialize data cache system
  initializeCache();
  
  // Start automated injury report updates
  startInjuryReportUpdates();
  
  // Start the game thread scheduler
  scheduleGameThreads(client);
  
  // Start the game ping scheduler
  scheduleGamePings(client);
  
  // Start the thread locking scheduler
  scheduleThreadLocking(client);
  
  // Start the PATS game result checker
  scheduleGameResultChecking();
  
  // Initialize game warnings system
  initGameWarnings(client);
  
  // Initialize injury tracking system
  await initInjuryTracking(client);
  
  // Check if there's an active PATS session and start injury monitoring
  const { getActiveSession } = await import('./utils/patsData.js');
  const activeSession = getActiveSession();
  if (activeSession) {
    console.log('[Startup] Active PATS session found, starting injury monitoring...');
    const { startSessionInjuryMonitoring } = await import('./utils/dataCache.js');
    await startSessionInjuryMonitoring();
  }
  
  // Initialize scheduled PATS sessions
  initializeScheduledSessions(client);
  
  // Initialize season auto-scheduler
  initializeSeasonAutoScheduler(
    client,
    getESPNGamesForDate,
    addScheduledSession,
    scheduleSessionJobs,
    createSchedulerHandlers(client)
  );
  
  // Start the NBA transaction feed
  scheduleTransactionFeed(client);
  
  // One-time fix for snapshot participants (can be removed after running once)
  setTimeout(async () => {
    try {
      const { fixSnapshotParticipants, rebuildSnapshotIndex } = await import('./utils/sessionSnapshot.js');
      
      // First, rebuild the snapshot index if it's empty
      console.log('[STARTUP] Checking snapshot index...');
      const rebuiltCount = rebuildSnapshotIndex();
      if (rebuiltCount > 0) {
        console.log(`[STARTUP] Rebuilt snapshot index with ${rebuiltCount} sessions`);
      }
      
      // Then fix participant lists
      console.log('[STARTUP] Running snapshot participant fix...');
      const fixed = fixSnapshotParticipants();
      console.log(`[STARTUP] Fixed ${fixed} snapshot(s)`);
    } catch (error) {
      console.error('[STARTUP] Error with snapshots:', error);
    }
  }, 10000); // Run 10 seconds after startup
});

/**
 * Initialize scheduled PATS sessions
 */
function initializeScheduledSessions(client) {
  console.log('⏰ Initializing scheduled PATS sessions...');
  
  // Load sessions from file
  const data = loadScheduledSessions();
  const sessions = data.sessions || [];
  
  if (sessions.length === 0) {
    console.log('   No scheduled sessions found.');
    return;
  }
  
  // Schedule cron jobs for each session
  sessions.forEach(session => {
    try {
      // Create notification handlers
      const handlers = {
        sendAnnouncement: async () => {
          await sendSessionAnnouncement(client, session);
          // Start the PATS session when announcement is sent
          await startScheduledSession(client, session);
        },
        sendReminders: async () => {
          await sendSessionReminder(client, session);
        },
        sendWarnings: async () => {
          // Session warnings disabled - we use individual game warnings instead
          console.log(`[Scheduler] Session warning skipped for ${session.id} (using game warnings instead)`);
        },
        startSession: async () => {
          // Session already started at announcement time - no action needed
          console.log(`[Scheduler] First game time reached for session ${session.id} (already started at announcement)`);
        }
      };
      
      scheduleSessionJobs(session, handlers);
      console.log(`   ✅ Scheduled session ${session.id} for ${new Date(session.firstGameTime).toLocaleString()}`);
    } catch (error) {
      console.error(`   ❌ Failed to schedule session ${session.id}:`, error);
    }
  });
  
  console.log(`   Initialized ${sessions.length} scheduled session(s)`);
}

/**
 * Create notification handlers for the scheduler
 * @param {Client} client - Discord client
 * @returns {object} Handlers object
 */
function createSchedulerHandlers(client) {
  return {
    sendAnnouncement: async (session) => {
      await sendSessionAnnouncement(client, session);
      // Start the PATS session when announcement is sent
      await startScheduledSession(client, session);
      // Clean up the scheduled session after it has started
      const { deleteScheduledSession } = await import('./utils/sessionScheduler.js');
      deleteScheduledSession(session.id);
      console.log(`[Scheduler] Cleaned up scheduled session ${session.id} after starting`);
    },
    sendReminders: async (session) => {
      await sendSessionReminder(client, session);
    },
    sendWarnings: async (session) => {
      // Session warnings disabled - we use individual game warnings instead
      console.log(`[Scheduler] Session warning skipped for ${session.id} (using game warnings instead)`);
    },
    startSession: async (session) => {
      // Session already started at announcement time - no action needed
      console.log(`[Scheduler] First game time reached for session ${session.id} (already started at announcement)`);
    },
    endSession: async (session) => {
      // Auto-end the PATS session
      console.log(`[Scheduler] Auto-ending session ${session.id}`);
      const { endActiveSession } = await import('./utils/patsData.js');
      const result = endActiveSession();
      if (result) {
        const channel = await client.channels.fetch(session.channelId);
        if (channel) {
          await channel.send(`⏰ **Session Auto-Ended**\n\nThe PATS session has been automatically ended ${session.autoEnd.hoursAfterLastGame} hours after the last game.\n\nUse \`/pats leaderboard\` to view the final results!`);
        }
        console.log(`[Scheduler] ✅ Session ${session.id} auto-ended successfully`);
      } else {
        console.log(`[Scheduler] ⚠️ Failed to auto-end session ${session.id} (no active session found)`);
      }
    }
  };
}

/**
 * Handle tracking injuries for a game
 */
async function handleTrackInjuries(interaction) {
  try {
    const gameId = interaction.customId.replace('pats_track_injuries_', '');
    const { getActiveSession } = await import('./utils/patsData.js');
    const { getCachedMatchupInfo } = await import('./utils/dataCache.js');
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
    const { formatInjuries } = await import('./utils/espnApi.js');
    
    const session = getActiveSession();
    if (!session) {
      await interaction.reply({
        content: '❌ No active PATS session found.',
        ephemeral: true
      });
      return;
    }
    
    const game = session.games.find(g => g.id === gameId);
    if (!game) {
      await interaction.reply({
        content: '❌ Game not found.',
        ephemeral: true
      });
      return;
    }
    
    // Get current injury snapshot - force refresh to ensure accurate baseline
    const matchupInfo = await getCachedMatchupInfo(game.homeTeam, game.awayTeam, game.id, true);
    const initialSnapshot = {
      home: matchupInfo.home.injuries || [],
      away: matchupInfo.away.injuries || []
    };
    
    // Subscribe user to injury tracking
    subscribeToInjuries(
      interaction.user.id,
      gameId,
      game.homeTeam,
      game.awayTeam,
      initialSnapshot
    );
    
    // Rebuild the matchup embed with updated button
    const embed = new EmbedBuilder()
      .setTitle(`📊 Full Matchup Info: ${game.awayTeam} @ ${game.homeTeam}`)
      .setColor(0x1D42A2);

    const awayInfo = matchupInfo.away;
    const homeInfo = matchupInfo.home;

    embed.addFields({
      name: `✈️ ${game.awayTeam}`,
      value: `**Record:** ${awayInfo.record}\n**Spread:** ${game.spreadDisplay.away}\n**Injuries:**\n${formatInjuries(awayInfo.injuries)}`,
      inline: false
    });

    embed.addFields({
      name: `🏠 ${game.homeTeam}`,
      value: `**Record:** ${homeInfo.record}\n**Spread:** ${game.spreadDisplay.home}\n**Injuries:**\n${formatInjuries(homeInfo.injuries)}`,
      inline: false
    });

    const homeSpread = game.homeSpread !== undefined ? game.homeSpread : 0;
    const awaySpread = game.awaySpread !== undefined ? game.awaySpread : 0;
    const favoredTeam = game.favored === 'home' ? game.homeTeam : game.awayTeam;
    const favoredSpread = game.favored === 'home' ? homeSpread : awaySpread;
    
    embed.addFields({
      name: '📈 Spread Breakdown',
      value: `**${favoredTeam}** is favored by **${Math.abs(favoredSpread)} points**`,
      inline: false
    });

    const backButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`pats_view_roster_${gameId}`)
        .setLabel('View Active Roster')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('👥'),
      new ButtonBuilder()
        .setCustomId(`pats_back_to_game_${gameId}`)
        .setLabel('Back to Game')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('◀️')
    );

    const trackingButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`pats_untrack_injuries_${gameId}`)
        .setLabel('Stop Tracking Injuries')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔕'),
      new ButtonBuilder()
        .setCustomId(`pats_refresh_injuries_${gameId}`)
        .setLabel('Refresh Injuries')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄')
    );

    await interaction.update({
      embeds: [embed],
      components: [backButton, trackingButton]
    });
    
    await interaction.followUp({
      content: `🔔 You are now tracking injuries for **${game.awayTeam} @ ${game.homeTeam}**\n\nYou'll receive a DM whenever there are changes to the injury report for this game.`,
      ephemeral: true
    });
    
  } catch (error) {
    console.error('Error tracking injuries:', error);
    const errorMessage = {
      content: '❌ Error setting up injury tracking.',
      ephemeral: true
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
}

/**
 * Handle untracking injuries for a game
 */
async function handleUntrackInjuries(interaction) {
  try {
    const gameId = interaction.customId.replace('pats_untrack_injuries_', '');
    const { getActiveSession } = await import('./utils/patsData.js');
    const { getCachedMatchupInfo } = await import('./utils/dataCache.js');
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
    const { formatInjuries } = await import('./utils/espnApi.js');
    
    const session = getActiveSession();
    if (!session) {
      await interaction.reply({
        content: '❌ No active PATS session found.',
        ephemeral: true
      });
      return;
    }
    
    const game = session.games.find(g => g.id === gameId);
    if (!game) {
      await interaction.reply({
        content: '❌ Game not found.',
        ephemeral: true
      });
      return;
    }
    
    // Unsubscribe user from injury tracking
    unsubscribeFromInjuries(interaction.user.id, gameId);
    
    // Rebuild the matchup embed with updated button - force refresh for accuracy
    const matchupInfo = await getCachedMatchupInfo(game.homeTeam, game.awayTeam, game.id, true);
    
    const embed = new EmbedBuilder()
      .setTitle(`📊 Full Matchup Info: ${game.awayTeam} @ ${game.homeTeam}`)
      .setColor(0x1D42A2);

    const awayInfo = matchupInfo.away;
    const homeInfo = matchupInfo.home;

    embed.addFields({
      name: `✈️ ${game.awayTeam}`,
      value: `**Record:** ${awayInfo.record}\n**Spread:** ${game.spreadDisplay.away}\n**Injuries:**\n${formatInjuries(awayInfo.injuries)}`,
      inline: false
    });

    embed.addFields({
      name: `🏠 ${game.homeTeam}`,
      value: `**Record:** ${homeInfo.record}\n**Spread:** ${game.spreadDisplay.home}\n**Injuries:**\n${formatInjuries(homeInfo.injuries)}`,
      inline: false
    });

    const homeSpread = game.homeSpread !== undefined ? game.homeSpread : 0;
    const awaySpread = game.awaySpread !== undefined ? game.awaySpread : 0;
    const favoredTeam = game.favored === 'home' ? game.homeTeam : game.awayTeam;
    const favoredSpread = game.favored === 'home' ? homeSpread : awaySpread;
    
    embed.addFields({
      name: '📈 Spread Breakdown',
      value: `**${favoredTeam}** is favored by **${Math.abs(favoredSpread)} points**`,
      inline: false
    });

    const backButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`pats_view_roster_${gameId}`)
        .setLabel('View Active Roster')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('👥'),
      new ButtonBuilder()
        .setCustomId(`pats_back_to_game_${gameId}`)
        .setLabel('Back to Game')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('◀️')
    );

    const trackingButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`pats_track_injuries_${gameId}`)
        .setLabel('Track Injuries')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🔔'),
      new ButtonBuilder()
        .setCustomId(`pats_refresh_injuries_${gameId}`)
        .setLabel('Refresh Injuries')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄')
    );

    await interaction.update({
      embeds: [embed],
      components: [backButton, trackingButton]
    });
    
    await interaction.followUp({
      content: '🔕 You have stopped tracking injuries for this game.',
      ephemeral: true
    });
    
  } catch (error) {
    console.error('Error untracking injuries:', error);
    const errorMessage = {
      content: '❌ Error removing injury tracking.',
      ephemeral: true
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
}

/**
 * Handle refreshing injuries for a game
 */
async function handleRefreshInjuries(interaction) {
  try {
    await interaction.deferUpdate();
    
    const gameId = interaction.customId.replace('pats_refresh_injuries_', '');
    const { getActiveSession } = await import('./utils/patsData.js');
    const { getCachedMatchupInfo } = await import('./utils/dataCache.js');
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
    const { formatInjuries } = await import('./utils/espnApi.js');
    const { isSubscribed } = await import('./features/injuryTracking.js');
    
    const session = getActiveSession();
    if (!session) {
      await interaction.followUp({
        content: '❌ No active PATS session.',
        ephemeral: true
      });
      return;
    }
    
    const game = session.games.find(g => g.id === gameId);
    if (!game) {
      await interaction.followUp({
        content: '❌ Game not found.',
        ephemeral: true
      });
      return;
    }
    
    console.log(`🔄 Refreshing injuries for ${game.awayTeam} @ ${game.homeTeam}...`);
    
    // Force fresh fetch by passing forceRefresh=true
    const matchupInfo = await getCachedMatchupInfo(game.homeTeam, game.awayTeam, game.id, true);
    
    if (!matchupInfo) {
      await interaction.followUp({
        content: '❌ Could not fetch updated injury information.',
        ephemeral: true
      });
      return;
    }
    
    // Use the same formatting as Full Matchup view
    const embed = new EmbedBuilder()
      .setTitle(`📊 Full Matchup:  ${game.awayTeam} @ ${game.homeTeam}`)
      .setColor(0x0099FF)
      .setTimestamp();

    const gameTime = new Date(game.commenceTime);
    const formattedDate = gameTime.toLocaleDateString('en-US', {
      timeZone: 'America/Los_Angeles',
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
    const formattedTime = gameTime.toLocaleTimeString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      minute: '2-digit'
    });
    
    embed.addFields({
      name: '🕐 Tip-Off',
      value: `${formattedDate} at ${formattedTime} PT`,
      inline: false
    });

    // Fix spreads display
    const fixZeroSpreads = (g) => {
      let homeSpread = g.homeSpread !== undefined ? g.homeSpread : 0;
      let awaySpread = g.awaySpread !== undefined ? g.awaySpread : 0;
      
      if (homeSpread !== 0 && awaySpread === 0) {
        awaySpread = -homeSpread;
      } else if (awaySpread !== 0 && homeSpread === 0) {
        homeSpread = -awaySpread;
      }
      
      return { homeSpread, awaySpread };
    };

    const fixedSpreads = fixZeroSpreads(game);
    const spreadDisplay = {
      home: fixedSpreads.homeSpread >= 0 ? `+${fixedSpreads.homeSpread}` : fixedSpreads.homeSpread.toString(),
      away: fixedSpreads.awaySpread >= 0 ? `+${fixedSpreads.awaySpread}` : fixedSpreads.awaySpread.toString()
    };

    // Away team full info
    if (matchupInfo?.away) {
      const awayInfo = matchupInfo.away;
      embed.addFields({
        name: `🛫 ${game.awayTeam}`,
        value: `**Record:** ${awayInfo.record}\n**Spread:** ${spreadDisplay.away}\n**Injuries:**\n${formatInjuries(awayInfo.injuries)}`,
        inline: false
      });
    }

    // Home team full info
    if (matchupInfo?.home) {
      const homeInfo = matchupInfo.home;
      embed.addFields({
        name: `🏠 ${game.homeTeam}`,
        value: `**Record:** ${homeInfo.record}\n**Spread:** ${spreadDisplay.home}\n**Injuries:**\n${formatInjuries(homeInfo.injuries)}`,
        inline: false
      });
    }

    // Spread explanation
    const favoredTeam = game.favored === 'home' ? game.homeTeam : game.awayTeam;
    const favoredSpread = game.favored === 'home' ? fixedSpreads.homeSpread : fixedSpreads.awaySpread;
    
    embed.addFields({
      name: '📈 Spread Breakdown',
      value: `**${favoredTeam}** is favored by **${Math.abs(favoredSpread)} points**`,
      inline: false
    });
    
    const backButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`pats_view_roster_${gameId}`)
        .setLabel('View Active Roster')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('👥'),
      new ButtonBuilder()
        .setCustomId(`pats_back_to_game_${gameId}`)
        .setLabel('Back to Game')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('◀️')
    );
    
    const userIsTracking = isSubscribed(interaction.user.id, gameId);
    const trackingButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`pats_${userIsTracking ? 'untrack' : 'track'}_injuries_${gameId}`)
        .setLabel(userIsTracking ? 'Stop Tracking Injuries' : 'Track Injuries')
        .setStyle(userIsTracking ? ButtonStyle.Danger : ButtonStyle.Success)
        .setEmoji(userIsTracking ? '🔕' : '🔔'),
      new ButtonBuilder()
        .setCustomId(`pats_refresh_injuries_${gameId}`)
        .setLabel('Refresh Injuries')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄')
    );
    
    await interaction.editReply({
      embeds: [embed],
      components: [backButton, trackingButton]
    });
    
  } catch (error) {
    console.error('Error refreshing injuries:', error);
    const errorMessage = {
      content: '❌ Error refreshing matchup information.',
      ephemeral: true
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
}

/**
 * Send session announcement to channel
 */
async function sendSessionAnnouncement(client, session) {
  try {
    const channel = await client.channels.fetch(session.channelId);
    if (!channel) return;
    
    const firstGameTime = new Date(session.firstGameTime);
    const { EmbedBuilder } = await import('discord.js');
    
    const embed = new EmbedBuilder()
      .setTitle('🏀 PATS is Now Open!')
      .setColor(0xE03A3E)
      .addFields(
        {
          name: '📅 Today\'s Games',
          value: session.gameDetails.map(g => `• ${g.matchup}`).join('\n')
        },
        {
          name: '📋 How to Play',
          value: '1️⃣ Use `/pats dashboard` to see games and odds\n2️⃣ Pick teams you think will cover the spread\n3️⃣ Make all picks before each game starts!'
        },
        {
          name: '⏰ First Game',
          value: firstGameTime.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles', timeZoneName: 'short' })
        }
      );
    
    // Build mention content
    let mentions = [];
    if (session.roleIds && session.roleIds.length > 0) {
      mentions.push(...session.roleIds.map(id => `<@&${id}>`));
    }
    if (session.userIds && session.userIds.length > 0) {
      mentions.push(...session.userIds.map(id => `<@${id}>`));
    }
    const content = mentions.length > 0 ? `${mentions.join(' ')} PATS is now open!` : null;
    
    await channel.send({
      content: content,
      embeds: [embed]
    });
    
    console.log(`📢 Sent announcement for session ${session.id}`);
  } catch (error) {
    console.error(`Error sending announcement for session ${session.id}:`, error);
  }
}

/**
 * Send reminder DMs to participants
 */
async function sendSessionReminder(client, session) {
  try {
    // Check if there's already an active session - if so, don't send reminders
    const { getActiveSession } = await import('./utils/patsData.js');
    const activeSession = getActiveSession();
    if (activeSession) {
      console.log(`[Scheduler] Skipping reminder for ${session.id} - active session already running`);
      return;
    }
    
    const { getUserPreferences } = await import('./utils/userPreferences.js');
    const { EmbedBuilder } = await import('discord.js');
    
    let userIds = new Set();
    
    // Get users from roles
    if (session.roleIds && session.roleIds.length > 0) {
      const guild = await client.guilds.fetch(session.guildId);
      for (const roleId of session.roleIds) {
        try {
          const role = await guild.roles.fetch(roleId);
          if (role) {
            role.members.forEach(m => userIds.add(m.id));
          }
        } catch (err) {
          console.error(`Failed to fetch role ${roleId}:`, err.message);
        }
      }
    }
    
    // Add specific users
    if (session.userIds && session.userIds.length > 0) {
      session.userIds.forEach(id => userIds.add(id));
    }
    
    userIds = Array.from(userIds);
    
    const firstGameTime = new Date(session.firstGameTime);
    
    for (const userId of userIds) {
      try {
        const prefs = getUserPreferences(userId);
        if (!prefs.dmNotifications.reminders) continue;
        
        const user = await client.users.fetch(userId);
        
        const embed = new EmbedBuilder()
          .setTitle('⏰ PATS Session Reminder')
          .setDescription(`Your scheduled PATS session starts in **${session.notifications.reminder.minutesBefore} minutes**!`)
          .setColor('#FFA500')
          .addFields(
            {
              name: '📅 Games',
              value: session.gameDetails.map(g => `• ${g.matchup}`).join('\n')
            },
            {
              name: '⏰ Start Time',
              value: firstGameTime.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles', timeZoneName: 'short' })
            }
          );
        
        await user.send({ embeds: [embed] });
      } catch (err) {
        console.error(`Failed to send reminder to user ${userId}:`, err.message);
      }
    }
    
    console.log(`⏰ Sent reminders for session ${session.id}`);
  } catch (error) {
    console.error(`Error sending reminders for session ${session.id}:`, error);
  }
}

/**
 * Send warning DMs to participants
 */
async function sendSessionWarning(client, session) {
  try {
    const { getUserPreferences } = await import('./utils/userPreferences.js');
    const { EmbedBuilder } = await import('discord.js');
    
    let userIds = new Set();
    
    // Get users from roles
    if (session.roleIds && session.roleIds.length > 0) {
      const guild = await client.guilds.fetch(session.guildId);
      for (const roleId of session.roleIds) {
        try {
          const role = await guild.roles.fetch(roleId);
          if (role) {
            role.members.forEach(m => userIds.add(m.id));
          }
        } catch (err) {
          console.error(`Failed to fetch role ${roleId}:`, err.message);
        }
      }
    }
    
    // Add specific users
    if (session.userIds && session.userIds.length > 0) {
      session.userIds.forEach(id => userIds.add(id));
    }
    
    userIds = Array.from(userIds);
    
    const firstGameTime = new Date(session.firstGameTime);
    
    for (const userId of userIds) {
      try {
        const prefs = getUserPreferences(userId);
        if (!prefs.dmNotifications.warnings) continue;
        
        const user = await client.users.fetch(userId);
        
        const embed = new EmbedBuilder()
          .setTitle('⚠️ PATS Session Starting Soon!')
          .setDescription(`Your scheduled PATS session starts in **${session.notifications.warning.minutesBefore} minutes**!`)
          .setColor('#FF0000')
          .addFields(
            {
              name: '📅 Games',
              value: session.gameDetails.map(g => `• ${g.matchup}`).join('\n')
            },
            {
              name: '⏰ Start Time',
              value: firstGameTime.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles', timeZoneName: 'short' })
            }
          );
        
        await user.send({ embeds: [embed] });
      } catch (err) {
        console.error(`Failed to send warning to user ${userId}:`, err.message);
      }
    }
    
    console.log(`⚠️ Sent warnings for session ${session.id}`);
  } catch (error) {
    console.error(`Error sending warnings for session ${session.id}:`, error);
  }
}

/**
 * Automatically start the PATS session
 */
async function startScheduledSession(client, session) {
  try {
    const channel = await client.channels.fetch(session.channelId);
    if (!channel) {
      console.error(`Channel ${session.channelId} not found for session ${session.id}`);
      return;
    }
    
    const guild = await client.guilds.fetch(session.guildId);
    if (!guild) {
      console.error(`Guild ${session.guildId} not found for session ${session.id}`);
      return;
    }
    
    // Get the date for this session (use scheduledDate to avoid timezone conversion issues)
    const dateStr = session.scheduledDate; // Already in YYYY-MM-DD format
    
    // Import the patsstart command
    const patsstartCommand = await import('./commands/patsstart.js');
    
    // Create a mock interaction object that patsstart expects
    const mockInteraction = {
      user: { id: client.user.id, username: 'Uprise Bot' },
      member: null, // Scheduled sessions don't have a member
      guild: guild,
      guildId: session.guildId,
      channelId: session.channelId,
      channel: channel,
      client: client,
      isScheduled: true, // Flag to indicate this is a scheduled session
      options: {
        getString: (name) => {
          if (name === 'date') return dateStr;
          return null;
        },
        getRole: (name) => {
          // Return the role if this is a role-based session
          if (name === 'participant_role' && session.participantType === 'role' && session.roleId) {
            return guild.roles.cache.get(session.roleId) || null;
          }
          return null;
        }
      },
      replied: false,
      deferred: false,
      ephemeral: false,
      deferReply: async (options = {}) => {
        // Mock defer - just mark as deferred
        mockInteraction.deferred = true;
        if (options.ephemeral !== undefined) {
          mockInteraction.ephemeral = options.ephemeral;
        }
        return Promise.resolve();
      },
      reply: async (options) => {
        // For scheduled sessions, don't send the announcement embed to channel
        // since we already sent one via sendSessionAnnouncement
        mockInteraction.replied = true;
      },
      editReply: async (options) => {
        // For scheduled sessions, log the message (since it's ephemeral in normal case)
        // but also send success/error to channel
        if (typeof options === 'string' || options.content) {
          const content = typeof options === 'string' ? options : options.content;
          console.log(`[Scheduled Session] ${content}`);
          
          // If it's an error, send to channel
          if (content.includes('❌')) {
            await channel.send({ content });
          } else if (content.includes('✅')) {
            // Success message - log but don't spam channel
            console.log(`✅ Session ${session.id} started successfully`);
          }
        }
      },
      followUp: async (options) => {
        // Don't send follow-ups for scheduled sessions (DMs are handled separately)
        console.log(`[Scheduled Session] Skipping followUp:`, options.content || 'embed');
      }
    };
    
    console.log(`🏀 Starting scheduled PATS session ${session.id} for ${dateStr}...`);
    
    // Pass warning minutes from scheduled session to patsstart
    const warningMinutes = session.notifications?.warning?.minutesBefore || 30;
    mockInteraction.warningMinutes = warningMinutes;
    
    // Execute the patsstart command
    await patsstartCommand.execute(mockInteraction);
    
    console.log(`✅ Scheduled PATS session ${session.id} completed`);
  } catch (error) {
    console.error(`❌ Error starting scheduled session ${session.id}:`, error);
    console.error(error.stack);
    
    // Try to send error to channel
    try {
      const channel = await client.channels.fetch(session.channelId);
      await channel.send({
        content: `❌ Failed to start scheduled PATS session. Please start manually with \`/patsstart\`.\nError: ${error.message}`
      });
    } catch (channelError) {
      console.error('Could not send error to channel:', channelError);
    }
  }
}

// Handle slash commands and interactions
client.on(Events.InteractionCreate, async (interaction) => {
  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error('Error executing command:', error);
      const errorMessage = { 
        content: '❌ There was an error executing this command!', 
        ephemeral: true 
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  }
  
  // Handle config menu interactions (select menus, buttons, modals)
  if (interaction.customId && interaction.customId.startsWith('config_')) {
    try {
      await configCommand.handleConfigInteraction(interaction);
    } catch (error) {
      console.error('Error handling config interaction:', error);
    }
  }
  
  // Handle PATS interactions (select menus, buttons)
  if (interaction.customId && interaction.customId.startsWith('pats_')) {
    try {
      // Update username on every interaction
      if (interaction.user) {
        const data = await import('./utils/patsData.js').then(m => m.loadPATSData());
        ensureUser(data, interaction.user.id, interaction.user.username);
        await import('./utils/patsData.js').then(m => m.savePATSData(data));
      }
      
      // Handle settings toggle buttons
      if (interaction.customId.startsWith('pats_toggle_') || interaction.customId === 'pats_settings_back') {
        if (interaction.customId === 'pats_settings_back') {
          await interaction.deferUpdate();
          // Import showHelpSettingsMenu to go back to submenu
          const patsModule = await import('./commands/pats.js');
          // Call via exported function if exists, otherwise use internal method
          if (patsModule.showHelpSettingsMenu) {
            await patsModule.showHelpSettingsMenu(interaction);
          } else {
            // Fallback: show dashboard if function not exported
            await patsCommand.showDashboard(interaction);
          }
        } else {
          await handleToggle(interaction);
        }
      }
      // Handle customization menus
      else if (interaction.customId === 'pats_customize_reminders') {
        const { showReminderCustomization } = await import('./utils/userPreferences.js');
        await showReminderCustomization(interaction);
      }
      else if (interaction.customId === 'pats_customize_warnings') {
        const { showWarningCustomization } = await import('./utils/userPreferences.js');
        await showWarningCustomization(interaction);
      }
      // Handle reminder customization actions
      else if (interaction.customId === 'pats_reminder_times_select') {
        const { setReminderTimes } = await import('./utils/userPreferences.js');
        const selectedValues = interaction.values; // Array of selected time strings
        
        if (selectedValues.length === 0) {
          // No selections = use session default
          setReminderTimes(interaction.user.id, null);
        } else if (selectedValues.length === 1) {
          // Single selection = store as single number
          setReminderTimes(interaction.user.id, parseInt(selectedValues[0]));
        } else {
          // Multiple selections = store as array
          const times = selectedValues.map(v => parseInt(v));
          setReminderTimes(interaction.user.id, times);
        }
        
        await interaction.deferUpdate();
        await showSettingsMenu(interaction);
      }
      else if (interaction.customId === 'pats_reminder_back') {
        await interaction.deferUpdate();
        await showSettingsMenu(interaction);
      }
      // Handle warning customization actions
      else if (interaction.customId === 'pats_warning_times_select') {
        const { setWarningTimes } = await import('./utils/userPreferences.js');
        const selectedValues = interaction.values; // Array of selected time strings
        
        if (selectedValues.length === 0) {
          // No selections = use session default
          setWarningTimes(interaction.user.id, null);
        } else if (selectedValues.length === 1) {
          // Single selection = store as single number
          setWarningTimes(interaction.user.id, parseInt(selectedValues[0]));
        } else {
          // Multiple selections = store as array
          const times = selectedValues.map(v => parseInt(v));
          setWarningTimes(interaction.user.id, times);
        }
        
        await interaction.deferUpdate();
        await showSettingsMenu(interaction);
      }
      else if (interaction.customId === 'pats_warning_back') {
        await interaction.deferUpdate();
        await showSettingsMenu(interaction);
      }
      // Handle settings menu buttons
      else if (interaction.customId === 'pats_dashboard_settings' || interaction.customId === 'pats_no_session_settings') {
        await interaction.deferUpdate();
        await showSettingsMenu(interaction);
      }
      // Handle dashboard buttons (including stats)
      else if (interaction.customId.startsWith('pats_dashboard_') || 
          interaction.customId.startsWith('pats_stats_') ||
          interaction.customId.startsWith('pats_help_') ||
          interaction.customId.startsWith('pats_no_session_') ||
          interaction.customId.startsWith('pats_leaderboard_') ||
          interaction.customId === 'pats_search_player' ||
          interaction.customId === 'pats_player_selection_back' ||
          interaction.customId === 'pats_past_sessions_back' ||
          interaction.customId.startsWith('pats_view_historical_') ||
          interaction.customId.startsWith('pats_historical_') ||
          interaction.customId.startsWith('pats_back_to_historical_') ||
          interaction.customId.startsWith('pats_view_player_')) {
        await patsCommand.handleDashboardButton(interaction);
      }
      // Handle player selection dropdown and past session selection
      else if (interaction.customId === 'pats_player_select' || 
               interaction.customId === 'pats_select_past_session' ||
               interaction.customId === 'pats_select_historical_game_detail') {
        await patsCommand.handlePlayerSelection(interaction);
      }
      // Handle everyone's picks navigation
      else if (interaction.customId.startsWith('pats_everyone_picks_nav_')) {
        await patsCommand.handleEveryonePicksNavigation(interaction);
      }
      // Handle game selection dropdown
      else if (interaction.customId === 'pats_game_select') {
        await makepickCommand.handleGameSelection(interaction);
      }
      // Handle pick submission buttons
      else if (interaction.customId.startsWith('pats_pick_')) {
        await makepickCommand.handlePickSubmission(interaction);
      }
      // Handle double-down toggle
      else if (interaction.customId.startsWith('pats_doubledown_')) {
        await makepickCommand.handleDoubleDownToggle(interaction);
      }
      // Handle set double-down button
      else if (interaction.customId.startsWith('pats_set_doubledown_')) {
        await makepickCommand.handleSetDoubleDown(interaction);
      }
      // Handle remove double-down button
      else if (interaction.customId.startsWith('pats_remove_doubledown_')) {
        await makepickCommand.handleRemoveDoubleDown(interaction);
      }
      // Handle view matchup button
      else if (interaction.customId.startsWith('pats_matchup_')) {
        await makepickCommand.handleViewMatchup(interaction);
      }
      // Handle injury tracking buttons
      else if (interaction.customId.startsWith('pats_track_injuries_')) {
        await handleTrackInjuries(interaction);
      }
      else if (interaction.customId.startsWith('pats_untrack_injuries_')) {
        await handleUntrackInjuries(interaction);
      }
      else if (interaction.customId.startsWith('pats_refresh_injuries_')) {
        await handleRefreshInjuries(interaction);
      }
      // Handle view roster button
      else if (interaction.customId.startsWith('pats_view_roster_')) {
        await makepickCommand.handleViewRoster(interaction);
      }
      // Handle view injuries button (from roster view)
      else if (interaction.customId.startsWith('pats_view_injuries_')) {
        await makepickCommand.handleViewInjuries(interaction);
      }
      // Handle back to game button
      else if (interaction.customId.startsWith('pats_back_to_game_')) {
        await makepickCommand.handleBackToGame(interaction);
      }
      // Handle back to menu button
      else if (interaction.customId === 'pats_back_to_menu') {
        await makepickCommand.handleBackToMenu(interaction);
      }
      // Handle back to dashboard button
      else if (interaction.customId === 'pats_back_to_dashboard') {
        await makepickCommand.handleBackToDashboard(interaction);
      }
      // Handle navigation to specific game (previous/next)
      else if (interaction.customId.startsWith('pats_nav_game_')) {
        // Defer immediately to prevent timeout
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferUpdate();
        }
        await makepickCommand.handleGameNavigation(interaction);
      }
      // Handle back to overview (dashboard) button
      else if (interaction.customId === 'pats_back_to_overview') {
        await makepickCommand.handleBackToOverview(interaction);
      }
      // Handle view my picks button
      else if (interaction.customId === 'pats_view_my_picks') {
        await makepickCommand.handleViewMyPicks(interaction);
      }
    } catch (error) {
      console.error('Error handling PATS interaction:', error);
      const errorMessage = { 
        content: '❌ There was an error processing your pick!', 
        ephemeral: true 
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  }
  
  // Handle PATS assign picks interactions (admin)
  if (interaction.customId && interaction.customId.startsWith('pats_assign_')) {
    try {
      const patsassignpicksCommand = await import('./commands/patsassignpicks.js');
      
      if (interaction.customId.startsWith('pats_assign_select_game_')) {
        const targetUserId = interaction.customId.replace('pats_assign_select_game_', '');
        const gameId = interaction.values[0];
        await interaction.deferUpdate();
        await patsassignpicksCommand.showTeamSelection(interaction, targetUserId, gameId);
      }
      else if (interaction.customId.startsWith('pats_assign_pick_')) {
        const parts = interaction.customId.replace('pats_assign_pick_', '').split('_');
        const targetUserId = parts[0];
        const gameId = parts[1];
        const team = parts[2]; // 'away' or 'home'
        await interaction.deferUpdate();
        await patsassignpicksCommand.assignPick(interaction, targetUserId, gameId, team);
      }
      else if (interaction.customId.startsWith('pats_assign_back_')) {
        const targetUserId = interaction.customId.replace('pats_assign_back_', '');
        const targetUser = await interaction.guild.members.fetch(targetUserId);
        await interaction.deferUpdate();
        await patsassignpicksCommand.showGameSelection(interaction, targetUser.user);
      }
      else if (interaction.customId === 'pats_assign_cancel') {
        await interaction.deferUpdate();
        await interaction.editReply({
          content: '❌ Pick assignment cancelled.',
          embeds: [],
          components: []
        });
      }
    } catch (error) {
      console.error('Error handling PATS assign interaction:', error);
      const errorMessage = { 
        content: '❌ There was an error assigning the pick!', 
        ephemeral: true 
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  }
  
  // Handle PATS history interactions (admin)
  if (interaction.customId && interaction.customId.startsWith('history_')) {
    // Dynamic import for history command functions
    const patshistoryCommand = await import('./commands/patshistory.js');
    
    try {
      if (interaction.customId === 'history_overview') {
        await patshistoryCommand.handleHistoryButton(interaction);
      } else if (interaction.customId.startsWith('history_session_')) {
        await patshistoryCommand.handleHistoryButton(interaction);
      } else if (interaction.customId.startsWith('history_user_')) {
        await patshistoryCommand.handleHistoryButton(interaction);
      } else if (interaction.customId.startsWith('history_game_')) {
        await patshistoryCommand.handleHistoryButton(interaction);
      } else if (interaction.customId === 'history_session_select') {
        await patshistoryCommand.handleSessionSelect(interaction);
      } else if (interaction.customId === 'history_user_select') {
        await patshistoryCommand.handleUserSelect(interaction);
      } else if (interaction.customId === 'history_game_select') {
        await patshistoryCommand.handleGameSelect(interaction);
      }
    } catch (error) {
      console.error('Error handling history interaction:', error);
      const errorMessage = { 
        content: '❌ There was an error processing your request!', 
        ephemeral: true 
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  }
  
  // Handle schedule interactions
  if (interaction.customId && interaction.customId.startsWith('schedule_')) {
    // Dynamic import for schedule command functions
    const patsscheduleCommand = await import('./commands/patsschedule.js');
    
    try {
      if (interaction.customId === 'schedule_new_session') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showDateSelection(interaction);
      }
      // Auto-schedule menu and handlers
      else if (interaction.customId === 'schedule_auto_menu') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showAutoScheduleMenu(interaction);
      }
      else if (interaction.customId === 'schedule_auto_toggle') {
        await interaction.deferUpdate();
        await patsscheduleCommand.toggleAutoSchedule(interaction);
      }
      else if (interaction.customId === 'schedule_auto_configure') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showAutoScheduleConfig(interaction);
      }
      else if (interaction.customId === 'schedule_auto_preview') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showAutoSchedulePreview(interaction);
      }
      else if (interaction.customId === 'schedule_auto_run_now') {
        await interaction.deferUpdate();
        await patsscheduleCommand.runAutoSchedulerNow(interaction);
      }
      else if (interaction.customId === 'schedule_auto_clear') {
        await interaction.deferUpdate();
        await patsscheduleCommand.clearAutoScheduledSessions(interaction);
      }
      else if (interaction.customId === 'schedule_auto_days') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showAutoScheduleDaysSelector(interaction);
      }
      else if (interaction.customId === 'schedule_auto_mingames') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showAutoScheduleMinGamesSelector(interaction);
      }
      else if (interaction.customId === 'schedule_auto_channel') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showAutoScheduleChannelSelector(interaction);
      }
      else if (interaction.customId === 'schedule_auto_participants') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showAutoScheduleParticipantsMenu(interaction);
      }
      else if (interaction.customId === 'schedule_auto_participants_roles') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showAutoScheduleRoleSelector(interaction);
      }
      else if (interaction.customId === 'schedule_auto_participants_users') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showAutoScheduleUserSelector(interaction);
      }
      else if (interaction.customId === 'schedule_auto_participants_clear') {
        await interaction.deferUpdate();
        const config = patsscheduleCommand.getAutoScheduleEditConfig(interaction.user.id);
        config.roleIds = [];
        config.userIds = [];
        await patsscheduleCommand.showAutoScheduleParticipantsMenu(interaction);
      }
      else if (interaction.customId === 'schedule_auto_notifications') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showAutoScheduleNotifications(interaction);
      }
      else if (interaction.customId === 'schedule_auto_notif_announcement') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showAutoScheduleAnnouncementSelector(interaction);
      }
      else if (interaction.customId === 'schedule_auto_notif_reminder') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showAutoScheduleReminderSelector(interaction);
      }
      else if (interaction.customId === 'schedule_auto_notif_warning') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showAutoScheduleWarningSelector(interaction);
      }
      else if (interaction.customId === 'schedule_auto_autoend') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showAutoScheduleAutoEnd(interaction);
      }
      else if (interaction.customId === 'schedule_auto_autoend_toggle') {
        await interaction.deferUpdate();
        const config = patsscheduleCommand.getAutoScheduleEditConfig(interaction.user.id);
        config.autoEnd = config.autoEnd || { enabled: false, hoursAfterLastGame: 6 };
        config.autoEnd.enabled = !config.autoEnd.enabled;
        await patsscheduleCommand.showAutoScheduleAutoEnd(interaction);
      }
      else if (interaction.customId === 'schedule_auto_announcement_toggle') {
        await interaction.deferUpdate();
        const config = patsscheduleCommand.getAutoScheduleEditConfig(interaction.user.id);
        config.notifications = config.notifications || {};
        config.notifications.announcement = config.notifications.announcement || { enabled: true, hoursBefore: 9 };
        config.notifications.announcement.enabled = !config.notifications.announcement.enabled;
        await patsscheduleCommand.showAutoScheduleAnnouncementSelector(interaction);
      }
      else if (interaction.customId === 'schedule_auto_reminder_toggle') {
        await interaction.deferUpdate();
        const config = patsscheduleCommand.getAutoScheduleEditConfig(interaction.user.id);
        config.notifications = config.notifications || {};
        config.notifications.reminder = config.notifications.reminder || { enabled: true, minutesBefore: 60 };
        config.notifications.reminder.enabled = !config.notifications.reminder.enabled;
        await patsscheduleCommand.showAutoScheduleReminderSelector(interaction);
      }
      else if (interaction.customId === 'schedule_auto_warning_toggle') {
        await interaction.deferUpdate();
        const config = patsscheduleCommand.getAutoScheduleEditConfig(interaction.user.id);
        config.notifications = config.notifications || {};
        config.notifications.warning = config.notifications.warning || { enabled: true, minutesBefore: 15 };
        config.notifications.warning.enabled = !config.notifications.warning.enabled;
        await patsscheduleCommand.showAutoScheduleWarningSelector(interaction);
      }
      else if (interaction.customId === 'schedule_auto_save') {
        await interaction.deferUpdate();
        await patsscheduleCommand.saveAutoScheduleConfiguration(interaction);
      }
      else if (interaction.customId === 'schedule_main_menu') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showMainMenu(interaction);
      }
      else if (interaction.customId.startsWith('schedule_date_')) {
        const selectedDate = interaction.customId.replace('schedule_date_', '');
        await interaction.deferUpdate();
        await patsscheduleCommand.showGameSelection(interaction, selectedDate);
      }
      else if (interaction.customId.startsWith('schedule_toggle_game_')) {
        // Toggle game selection
        const parts = interaction.customId.replace('schedule_toggle_game_', '').split('_');
        const selectedDate = parts.slice(0, -1).join('_');
        const gameIndex = parseInt(parts[parts.length - 1]);
        
        patsscheduleCommand.toggleGameSelection(interaction.user.id, selectedDate, gameIndex);
        
        await interaction.deferUpdate();
        await patsscheduleCommand.showGameSelection(interaction, selectedDate);
      }
      else if (interaction.customId.startsWith('schedule_selectall_')) {
        const selectedDate = interaction.customId.replace('schedule_selectall_', '');
        patsscheduleCommand.selectAllGames(interaction.user.id);
        
        await interaction.deferUpdate();
        await patsscheduleCommand.showGameSelection(interaction, selectedDate);
      }
      else if (interaction.customId.startsWith('schedule_deselectall_')) {
        const selectedDate = interaction.customId.replace('schedule_deselectall_', '');
        patsscheduleCommand.deselectAllGames(interaction.user.id);
        
        await interaction.deferUpdate();
        await patsscheduleCommand.showGameSelection(interaction, selectedDate);
      }
      else if (interaction.customId.startsWith('schedule_continue_config_')) {
        await interaction.deferUpdate();
        await patsscheduleCommand.showConfigurationMenu(interaction);
      }
      else if (interaction.customId === 'schedule_config_channel') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showChannelSelection(interaction);
      }
      else if (interaction.customId === 'schedule_config_participants') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showParticipantTypeSelection(interaction);
      }
      else if (interaction.customId === 'schedule_participants_done') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showConfigurationMenu(interaction);
      }
      else if (interaction.customId === 'schedule_select_channel') {
        const channelId = interaction.values[0];
        patsscheduleCommand.setChannel(interaction.user.id, channelId);
        await interaction.deferUpdate();
        await patsscheduleCommand.showConfigurationMenu(interaction);
      }
      else if (interaction.customId === 'schedule_select_roles') {
        const roleIds = interaction.values;
        patsscheduleCommand.setRoles(interaction.user.id, roleIds);
        await interaction.deferUpdate();
        await patsscheduleCommand.showParticipantTypeSelection(interaction);
      }
      else if (interaction.customId === 'schedule_select_users') {
        const userIds = interaction.values;
        patsscheduleCommand.setUsers(interaction.user.id, userIds);
        await interaction.deferUpdate();
        await patsscheduleCommand.showParticipantTypeSelection(interaction);
      }
      else if (interaction.customId === 'schedule_back_to_config') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showConfigurationMenu(interaction);
      }
      else if (interaction.customId.startsWith('schedule_config_')) {
        await interaction.deferUpdate();
        const type = interaction.customId.replace('schedule_config_', '');
        
        if (type === 'announcement') {
          await patsscheduleCommand.showAnnouncementEditor(interaction);
        } else if (type === 'reminder') {
          await patsscheduleCommand.showReminderEditor(interaction);
        } else if (type === 'warning') {
          await patsscheduleCommand.showWarningEditor(interaction);
        }
      }
      // Handle notification time selection
      else if (interaction.customId === 'schedule_set_announcement') {
        await interaction.deferUpdate();
        const hours = interaction.values[0];
        patsscheduleCommand.setAnnouncementTime(interaction.user.id, hours);
        await patsscheduleCommand.showConfigurationMenu(interaction);
      }
      else if (interaction.customId === 'schedule_set_reminder') {
        await interaction.deferUpdate();
        const minutes = interaction.values[0];
        patsscheduleCommand.setReminderTime(interaction.user.id, minutes);
        await patsscheduleCommand.showConfigurationMenu(interaction);
      }
      else if (interaction.customId === 'schedule_set_warning') {
        await interaction.deferUpdate();
        const minutes = interaction.values[0];
        patsscheduleCommand.setWarningTime(interaction.user.id, minutes);
        await patsscheduleCommand.showConfigurationMenu(interaction);
      }
      // Handle updating existing session notifications
      else if (interaction.customId === 'schedule_update_announcement') {
        await interaction.deferUpdate();
        const [hours, sessionId] = interaction.values[0].split('|');
        await patsscheduleCommand.updateSessionAnnouncement(interaction, hours, sessionId);
      }
      else if (interaction.customId === 'schedule_update_reminder') {
        await interaction.deferUpdate();
        const [minutes, sessionId] = interaction.values[0].split('|');
        await patsscheduleCommand.updateSessionReminder(interaction, minutes, sessionId);
      }
      else if (interaction.customId === 'schedule_update_warning') {
        await interaction.deferUpdate();
        const [minutes, sessionId] = interaction.values[0].split('|');
        await patsscheduleCommand.updateSessionWarning(interaction, minutes, sessionId);
      }
      else if (interaction.customId.startsWith('schedule_update_channel_')) {
        const sessionId = interaction.customId.replace('schedule_update_channel_', '');
        await interaction.deferUpdate();
        const channelId = interaction.values[0];
        await patsscheduleCommand.updateSessionChannel(interaction, channelId, sessionId);
      }
      else if (interaction.customId === 'schedule_create_session') {
        await interaction.deferUpdate();
        await patsscheduleCommand.createScheduledSession(interaction);
      }
      else if (interaction.customId === 'schedule_view_sessions') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showScheduledSessions(interaction);
      }
      else if (interaction.customId === 'schedule_new_session') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showDateSelection(interaction);
      }
      else if (interaction.customId === 'schedule_templates') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showTemplatesMenu(interaction);
      }
      else if (interaction.customId === 'schedule_back_main') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showMainMenu(interaction);
      }
      else if (interaction.customId === 'schedule_cancel') {
        await interaction.deferUpdate();
        await patsscheduleCommand.cancelMenu(interaction);
      }
      else if (interaction.customId === 'schedule_dismiss') {
        await interaction.deferUpdate();
        await patsscheduleCommand.dismissMenu(interaction);
      }
      else if (interaction.customId.startsWith('schedule_start_now_')) {
        const sessionId = interaction.customId.replace('schedule_start_now_', '');
        await interaction.deferUpdate();
        await patsscheduleCommand.startSessionNow(interaction, sessionId);
      }
      else if (interaction.customId.startsWith('schedule_manage_')) {
        const sessionId = interaction.customId.replace('schedule_manage_', '');
        await interaction.deferUpdate();
        await patsscheduleCommand.showSessionManager(interaction, sessionId);
      }
      else if (interaction.customId.startsWith('schedule_edit_channel_')) {
        const sessionId = interaction.customId.replace('schedule_edit_channel_', '');
        await interaction.deferUpdate();
        await patsscheduleCommand.showSessionChannelEditor(interaction, sessionId);
      }
      else if (interaction.customId.startsWith('schedule_edit_participants_')) {
        const sessionId = interaction.customId.replace('schedule_edit_participants_', '');
        await interaction.deferUpdate();
        await patsscheduleCommand.showSessionParticipantEditor(interaction, sessionId);
      }
      else if (interaction.customId.startsWith('schedule_edit_announcement_')) {
        const sessionId = interaction.customId.replace('schedule_edit_announcement_', '');
        await interaction.deferUpdate();
        await patsscheduleCommand.showSessionAnnouncementEditor(interaction, sessionId);
      }
      else if (interaction.customId.startsWith('schedule_edit_reminder_')) {
        const sessionId = interaction.customId.replace('schedule_edit_reminder_', '');
        await interaction.deferUpdate();
        await patsscheduleCommand.showSessionReminderEditor(interaction, sessionId);
      }
      else if (interaction.customId.startsWith('schedule_edit_warning_')) {
        const sessionId = interaction.customId.replace('schedule_edit_warning_', '');
        await interaction.deferUpdate();
        await patsscheduleCommand.showSessionWarningEditor(interaction, sessionId);
      }
      else if (interaction.customId.startsWith('schedule_edit_') && !interaction.customId.includes('_channel_') && !interaction.customId.includes('_participants_') && !interaction.customId.includes('_announcement_') && !interaction.customId.includes('_reminder_') && !interaction.customId.includes('_warning_')) {
        // This is the general edit button (schedule_edit_{sessionId})
        const sessionId = interaction.customId.replace('schedule_edit_', '');
        await interaction.deferUpdate();
        await patsscheduleCommand.showSessionEditor(interaction, sessionId);
      }
      else if (interaction.customId.startsWith('schedule_update_participant_roles_')) {
        const sessionId = interaction.customId.replace('schedule_update_participant_roles_', '');
        await interaction.deferUpdate();
        const roleIds = interaction.values;
        await patsscheduleCommand.updateSessionParticipantRoles(interaction, roleIds, sessionId);
      }
      else if (interaction.customId.startsWith('schedule_update_participant_users_')) {
        const sessionId = interaction.customId.replace('schedule_update_participant_users_', '');
        await interaction.deferUpdate();
        const userIds = interaction.values;
        await patsscheduleCommand.updateSessionParticipantUsers(interaction, userIds, sessionId);
      }
      else if (interaction.customId.startsWith('schedule_delete_')) {
        const sessionId = interaction.customId.replace('schedule_delete_', '');
        await interaction.deferUpdate();
        const { getScheduledSession, deleteScheduledSession } = await import('./utils/sessionScheduler.js');
        const session = getScheduledSession(sessionId);
        
        // Safety check: Don't allow deletion of season sessions from /patsschedule
        if (session && session.seasonId) {
          await interaction.editReply({
            content: '❌ Season sessions are managed automatically. Use `/patsseason` to manage season sessions.',
            embeds: [],
            components: []
          });
          return;
        }
        
        deleteScheduledSession(sessionId);
        await interaction.editReply({
          content: '✅ Session deleted successfully!',
          embeds: [],
          components: []
        });
      }
      // Auto-schedule select menu handlers
      else if (interaction.customId === 'schedule_auto_days_select') {
        await interaction.deferUpdate();
        const days = parseInt(interaction.values[0]);
        const config = patsscheduleCommand.getAutoScheduleEditConfig(interaction.user.id);
        config.daysAhead = days;
        await patsscheduleCommand.showAutoScheduleConfig(interaction);
      }
      else if (interaction.customId === 'schedule_auto_mingames_select') {
        await interaction.deferUpdate();
        const minGames = parseInt(interaction.values[0]);
        const config = patsscheduleCommand.getAutoScheduleEditConfig(interaction.user.id);
        config.minGames = minGames;
        await patsscheduleCommand.showAutoScheduleConfig(interaction);
      }
      else if (interaction.customId === 'schedule_auto_channel_select') {
        await interaction.deferUpdate();
        const channelId = interaction.values[0];
        const config = patsscheduleCommand.getAutoScheduleEditConfig(interaction.user.id);
        config.channelId = channelId;
        config.guildId = interaction.guild.id;
        await patsscheduleCommand.showAutoScheduleConfig(interaction);
      }
      else if (interaction.customId === 'schedule_auto_roles_select') {
        await interaction.deferUpdate();
        const roleIds = interaction.values;
        const config = patsscheduleCommand.getAutoScheduleEditConfig(interaction.user.id);
        config.roleIds = roleIds;
        await patsscheduleCommand.showAutoScheduleParticipantsMenu(interaction);
      }
      else if (interaction.customId === 'schedule_auto_users_select') {
        await interaction.deferUpdate();
        const userIds = interaction.values;
        const config = patsscheduleCommand.getAutoScheduleEditConfig(interaction.user.id);
        config.userIds = userIds;
        await patsscheduleCommand.showAutoScheduleParticipantsMenu(interaction);
      }
      else if (interaction.customId === 'schedule_auto_announcement_select') {
        await interaction.deferUpdate();
        const hours = parseInt(interaction.values[0]);
        const config = patsscheduleCommand.getAutoScheduleEditConfig(interaction.user.id);
        config.notifications = config.notifications || {};
        config.notifications.announcement = config.notifications.announcement || { enabled: true };
        config.notifications.announcement.hoursBefore = hours;
        await patsscheduleCommand.showAutoScheduleNotifications(interaction);
      }
      else if (interaction.customId === 'schedule_auto_reminder_select') {
        await interaction.deferUpdate();
        const minutes = parseInt(interaction.values[0]);
        const config = patsscheduleCommand.getAutoScheduleEditConfig(interaction.user.id);
        config.notifications = config.notifications || {};
        config.notifications.reminder = config.notifications.reminder || { enabled: true };
        config.notifications.reminder.minutesBefore = minutes;
        await patsscheduleCommand.showAutoScheduleNotifications(interaction);
      }
      else if (interaction.customId === 'schedule_auto_warning_select') {
        await interaction.deferUpdate();
        const minutes = parseInt(interaction.values[0]);
        const config = patsscheduleCommand.getAutoScheduleEditConfig(interaction.user.id);
        config.notifications = config.notifications || {};
        config.notifications.warning = config.notifications.warning || { enabled: true };
        config.notifications.warning.minutesBefore = minutes;
        await patsscheduleCommand.showAutoScheduleNotifications(interaction);
      }
      else if (interaction.customId === 'schedule_auto_autoend_select') {
        await interaction.deferUpdate();
        const hours = parseInt(interaction.values[0]);
        const config = patsscheduleCommand.getAutoScheduleEditConfig(interaction.user.id);
        config.autoEnd = config.autoEnd || { enabled: false };
        config.autoEnd.hoursAfterLastGame = hours;
        await patsscheduleCommand.showAutoScheduleAutoEnd(interaction);
      }
    } catch (error) {
      console.error('Error handling schedule interaction:', error);
      const errorMessage = { 
        content: '❌ There was an error processing your request!', 
        ephemeral: true 
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  }
  
  // Handle PATS Season interactions
  if (interaction.customId && interaction.customId.startsWith('pats_season_')) {
    try {
      const patsseasonCommand = await import('./commands/patsseason.js');
      
      if (interaction.isButton()) {
        await patsseasonCommand.handleButton(interaction);
      }
      else if (interaction.isStringSelectMenu() || interaction.isUserSelectMenu() || interaction.isChannelSelectMenu()) {
        await patsseasonCommand.handleSelectMenu(interaction);
      }
      else if (interaction.isModalSubmit()) {
        await patsseasonCommand.handleModal(interaction);
      }
    } catch (error) {
      console.error('Error handling PATS season interaction:', error);
      const errorMessage = { 
        content: '❌ There was an error processing your request!', 
        ephemeral: true 
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  }
  
  // Handle Mock Offseason interactions (buttons, select menus, modals)
  if (interaction.customId && interaction.customId.startsWith('mock_')) {
    try {
      const mockCommand = await import('./commands/mock.js');
      
      if (interaction.isButton()) {
        await mockCommand.handleButtonInteraction(interaction);
      }
      else if (interaction.isStringSelectMenu()) {
        await mockCommand.handleSelectMenuInteraction(interaction);
      }
      else if (interaction.isModalSubmit()) {
        await mockCommand.handleModalSubmitInteraction(interaction);
      }
    } catch (error) {
      console.error('Error handling Mock Offseason interaction:', error);
      const errorMessage = { 
        content: '❌ There was an error processing your request!', 
        ephemeral: true 
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  }
  
  // Handle modal submissions for scheduling
  if (interaction.isModalSubmit() && interaction.customId.startsWith('schedule_')) {
    try {
      // Modal handlers removed - now using native select menus
    } catch (error) {
      console.error('Error handling schedule modal:', error);
      const errorMessage = { 
        content: '❌ There was an error processing your input!', 
        ephemeral: true 
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  }
  
  // Handle reminder/warning customization modals
  
  // Handle user select menu for viewing player stats
  if (interaction.isUserSelectMenu() && interaction.customId === 'pats_select_player_stats') {
    try {
      await interaction.deferUpdate();
      const selectedUserId = interaction.values[0];
      const patsCommand = await import('./commands/pats.js');
      await patsCommand.showUserStatsFromSelect(interaction, selectedUserId);
    } catch (error) {
      console.error('Error handling player select menu:', error);
      const errorMessage = { 
        content: '❌ There was an error loading that player\'s stats!', 
        ephemeral: true 
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  }
});

client.on(Events.Error, (error) => {
  console.error('Discord client error:', error);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error('Failed to login:', error);
  process.exit(1);
});
