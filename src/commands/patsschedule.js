import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { getAllScheduledSessions, getScheduledSession, deleteScheduledSession, getAllTemplates, getTemplate, deleteTemplate, addScheduledSession, saveTemplate, updateScheduledSession, scheduleSessionJobs, getAutoScheduleConfig, saveAutoScheduleConfig, deleteAutoScheduledSessions, hasAutoScheduledSessionForDate } from '../utils/sessionScheduler.js';
import { getESPNGamesForDate } from '../utils/oddsApi.js';

// Store in-progress session configurations (userId -> config)
const sessionConfigs = new Map();

/**
 * Get or create session config for user
 */
function getSessionConfig(userId) {
  if (!sessionConfigs.has(userId)) {
    sessionConfigs.set(userId, {
      selectedDate: null,
      games: [],
      selectedGameIndices: [], // Which games are selected
      channelId: null,
      roleIds: [], // Multiple roles can participate
      userIds: [], // Multiple users can participate
      notifications: {
        announcement: { enabled: true, hoursBefore: 9 },
        reminder: { enabled: true, minutesBefore: 60 },
        warning: { enabled: true, minutesBefore: 15 }
      }
    });
  }
  
  // Migrate old configs to new format
  const config = sessionConfigs.get(userId);
  if (!config.roleIds) {
    config.roleIds = [];
  }
  if (!config.userIds) {
    config.userIds = [];
  }
  
  return config;
}

/**
 * Format participant list for display (supports both new and legacy formats)
 */
function formatParticipants(session) {
  const parts = [];
  
  // New format: roleIds and userIds arrays
  if (session.roleIds && session.roleIds.length > 0) {
    parts.push(`Roles: ${session.roleIds.map(id => `<@&${id}>`).join(', ')}`);
  }
  if (session.userIds && session.userIds.length > 0) {
    parts.push(`Users: ${session.userIds.map(id => `<@${id}>`).join(', ')}`);
  }
  
  // Legacy format support
  if (parts.length === 0) {
    if (session.participantType === 'role' && session.roleId) {
      parts.push(`<@&${session.roleId}>`);
    } else if (session.participantType === 'users' && session.specificUsers && session.specificUsers.length > 0) {
      parts.push(`${session.specificUsers.length} user${session.specificUsers.length === 1 ? '' : 's'}`);
    }
  }
  
  return parts.length > 0 ? parts.join(' | ') : 'No participants specified';
}

/**
 * Clear session config for user
 */
function clearSessionConfig(userId) {
  sessionConfigs.delete(userId);
}

export const data = new SlashCommandBuilder()
  .setName('patsschedule')
  .setDescription('Schedule PATS sessions in advance with automatic notifications');

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    await showMainMenu(interaction);
  } catch (error) {
    console.error('Error in patsschedule execute:', error);
    await interaction.editReply({
      content: '❌ An error occurred. Please try again.',
      embeds: [],
      components: []
    });
  }
}

/**
 * Show main menu
 */
export async function showMainMenu(interaction) {
  const autoConfig = getAutoScheduleConfig();
  const autoStatus = autoConfig.enabled ? '✅' : '❌';
  
  const embed = new EmbedBuilder()
    .setTitle('📅 Schedule PATS Session')
    .setDescription(
      'Choose an option to schedule and manage PATS sessions.\n\n' +
      `**Auto-Schedule:** ${autoStatus} ${autoConfig.enabled ? 'Enabled' : 'Disabled'}`
    )
    .setColor('#5865F2')
    .setFooter({ text: 'Use the buttons below to navigate' });
  
  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_new_session')
        .setLabel('Schedule New Session')
        .setEmoji('📆')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('schedule_auto_menu')
        .setLabel('Auto-Scheduling')
        .setEmoji('🤖')
        .setStyle(autoConfig.enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('schedule_view_sessions')
        .setLabel('View Scheduled Sessions')
        .setEmoji('📋')
        .setStyle(ButtonStyle.Secondary)
    );
  
  const buttons2 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_templates')
        .setLabel('Saved Templates')
        .setEmoji('💾')
        .setStyle(ButtonStyle.Secondary)
    );
  
  const cancelRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_cancel')
        .setLabel('Cancel')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [buttons, buttons2, cancelRow]
  });
}

/**
 * Show view scheduled sessions
 */
export async function showScheduledSessions(interaction) {
  const sessions = getAllScheduledSessions()
    .filter(s => !s.seasonId); // Exclude season sessions - they're managed via /patsseason
  const now = new Date();
  
  // Separate active and upcoming sessions
  const activeSessions = sessions.filter(s => {
    const firstGameTime = new Date(s.firstGameTime);
    const lastGameTime = s.gameDetails.length > 0 
      ? new Date(s.gameDetails[s.gameDetails.length - 1].startTime)
      : firstGameTime;
    return now >= firstGameTime && now <= new Date(lastGameTime.getTime() + 4 * 60 * 60 * 1000); // within 4 hours after last game
  });
  
  const upcomingSessions = sessions.filter(s => new Date(s.firstGameTime) > now);
  
  if (activeSessions.length === 0 && upcomingSessions.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle('📋 Scheduled Sessions')
      .setDescription('No scheduled sessions found.')
      .setColor('#808080');
    
    const backButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('schedule_back_main')
          .setLabel('Back')
          .setEmoji('⬅️')
          .setStyle(ButtonStyle.Secondary)
      );
    
    await interaction.editReply({
      embeds: [embed],
      components: [backButton]
    });
    return;
  }
  
  // Sort by date (earliest first)
  upcomingSessions.sort((a, b) => new Date(a.firstGameTime) - new Date(b.firstGameTime));
  activeSessions.sort((a, b) => new Date(a.firstGameTime) - new Date(b.firstGameTime));
  
  const embed = new EmbedBuilder()
    .setTitle('📋 Scheduled Sessions')
    .setColor('#5865F2');
  
  let description = '';
  if (activeSessions.length > 0) {
    description += `🟢 **${activeSessions.length} active session${activeSessions.length === 1 ? '' : 's'}**\n`;
  }
  if (upcomingSessions.length > 0) {
    description += `⏰ **${upcomingSessions.length} upcoming session${upcomingSessions.length === 1 ? '' : 's'}**`;
  }
  embed.setDescription(description);
  
  // Add active sessions first
  if (activeSessions.length > 0) {
    activeSessions.slice(0, 5).forEach((session, index) => {
      const date = new Date(session.scheduledDate);
      const firstGame = session.gameDetails[0];
      const channelMention = `<#${session.channelId}>`;
      
      const participantText = formatParticipants(session);
      
      // Add session type indicator
      const sessionTypeEmoji = session.sessionType === 'both' ? '🌐' : '👥';
      const sessionTypeText = session.sessionType === 'both' ? ' (Open to All)' : '';
      
      embed.addFields({
        name: `🟢 ACTIVE: ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${sessionTypeText}`,
        value: [
          `🎮 **${session.games.length} games**`,
          `${sessionTypeEmoji} Type: ${session.sessionType === 'both' ? 'Open to All' : 'Casual Only'}`,
          `⏰ First game: ${firstGame.matchup} @ ${new Date(firstGame.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles', timeZoneName: 'short' })}`,
          `📍 Channel: ${channelMention}`,
          `👥 Participants: ${participantText}`,
          `👤 Created by: ${session.createdByUsername || 'Unknown'}`
        ].join('\n'),
        inline: false
      });
    });
  }
  
  // Add upcoming sessions
  upcomingSessions.slice(0, 10 - activeSessions.length).forEach((session, index) => {
    const date = new Date(session.scheduledDate);
    const firstGame = session.gameDetails[0];
    const channelMention = `<#${session.channelId}>`;
    
    const participantText = formatParticipants(session);
    
    // Add session type indicator
    const sessionTypeEmoji = session.sessionType === 'both' ? '🌐' : '👥';
    const sessionTypeText = session.sessionType === 'both' ? ' (Open to All)' : '';
    
    embed.addFields({
      name: `${activeSessions.length + index + 1}. ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${sessionTypeText}`,
      value: [
        `🎮 **${session.games.length} games**`,
        `${sessionTypeEmoji} Type: ${session.sessionType === 'both' ? 'Open to All' : 'Casual Only'}`,
        `⏰ First game: ${firstGame.matchup} @ ${new Date(firstGame.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles', timeZoneName: 'short' })}`,
        `📍 Channel: ${channelMention}`,
        `👥 Participants: ${participantText}`,
        `👤 Created by: ${session.createdByUsername || 'Unknown'}`
      ].join('\n'),
      inline: false
    });
  });
  
  const totalShown = Math.min(activeSessions.length + upcomingSessions.length, 10);
  const totalSessions = activeSessions.length + upcomingSessions.length;
  if (totalSessions > 10) {
    embed.setFooter({ text: `Showing first ${totalShown} of ${totalSessions} sessions` });
  }
  
  // Create manage buttons - combine active and upcoming
  const allSessions = [...activeSessions, ...upcomingSessions];
  const manageButtons = new ActionRowBuilder();
  allSessions.slice(0, 5).forEach((session, index) => {
    const label = index < activeSessions.length ? `Manage 🟢${index + 1}` : `Manage ${index + 1}`;
    manageButtons.addComponents(
      new ButtonBuilder()
        .setCustomId(`schedule_manage_${session.id}`)
        .setLabel(label)
        .setStyle(index < activeSessions.length ? ButtonStyle.Success : ButtonStyle.Primary)
    );
  });
  
  const backButton = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_back_main')
        .setLabel('Back')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('schedule_cancel')
        .setLabel('Cancel')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    );
  
  const components = manageButtons.components.length > 0 ? [manageButtons, backButton] : [backButton];
  
  await interaction.editReply({
    embeds: [embed],
    components
  });
}

/**
 * Show session manager
 */
export async function showSessionManager(interaction, sessionId) {
  const session = getScheduledSession(sessionId);
  
  if (!session) {
    await interaction.editReply({
      content: '❌ Session not found.',
      embeds: [],
      components: []
    });
    return;
  }
  
  // Safety check: Don't allow management of season sessions
  if (session.seasonId) {
    await interaction.editReply({
      content: '❌ Season sessions are managed automatically. Use `/patsseason` to view season sessions.',
      embeds: [],
      components: []
    });
    return;
  }
  
  const date = new Date(session.scheduledDate);
  const firstGameTime = new Date(session.firstGameTime);
  const now = new Date();
  
  // Session starts when announcement is sent, not when first game begins
  const sessionStartTime = session.notifications.announcement.enabled && session.notifications.announcement.time
    ? new Date(session.notifications.announcement.time)
    : firstGameTime;
  
  const timeUntilStart = sessionStartTime - now;
  const hoursUntil = Math.floor(timeUntilStart / (1000 * 60 * 60));
  
  const statusText = hoursUntil > 0 
    ? `Scheduled (starts in ${hoursUntil} hour${hoursUntil === 1 ? '' : 's'})`
    : 'Starting soon';
  
  const channelMention = `<#${session.channelId}>`;
  const participantText = formatParticipants(session);
  
  const firstGame = session.gameDetails[0];
  
  // Format notification times
  let announcementText = '❌ Disabled';
  if (session.notifications.announcement.enabled) {
    const announcementTime = new Date(session.notifications.announcement.time);
    announcementText = `✅ ${announcementTime.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: 'numeric', 
      minute: '2-digit',
      timeZone: 'America/Los_Angeles',
      timeZoneName: 'short'
    })}`;
  }
  
  let reminderText = '❌ Disabled';
  if (session.notifications.reminder.enabled) {
    const reminderTime = new Date(firstGameTime.getTime() - (session.notifications.reminder.minutesBefore * 60 * 1000));
    reminderText = `✅ ${reminderTime.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: 'numeric', 
      minute: '2-digit',
      timeZone: 'America/Los_Angeles',
      timeZoneName: 'short'
    })} (${session.notifications.reminder.minutesBefore} min before)`;
  }
  
  let warningText = '❌ Disabled';
  if (session.notifications.warning.enabled) {
    const warningTime = new Date(firstGameTime.getTime() - (session.notifications.warning.minutesBefore * 60 * 1000));
    warningText = `✅ ${warningTime.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: 'numeric', 
      minute: '2-digit',
      timeZone: 'America/Los_Angeles',
      timeZoneName: 'short'
    })} (${session.notifications.warning.minutesBefore} min before)`;
  }
  
  const embed = new EmbedBuilder()
    .setTitle(`⚙️ Manage Session: ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`)
    .setColor('#5865F2')
    .addFields(
      {
        name: '📅 Session Details',
        value: [
          `**Date:** ${session.scheduledDate}`,
          `**Games:** ${session.games.length}`,
          `**First Game:** ${new Date(firstGame.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles', timeZoneName: 'short' })} (${firstGame.matchup})`,
          `**Channel:** ${channelMention}`,
          `**Participants:** ${participantText}`
        ].join('\n')
      },
      {
        name: '🔔 Notifications',
        value: [
          `**Announcement:** ${announcementText}`,
          `**Reminder:** ${reminderText}`,
          `**Warning:** ${warningText}`
        ].join('\n')
      },
      {
        name: '📊 Status',
        value: statusText
      }
    );
  
  const actionButtons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`schedule_start_now_${sessionId}`)
        .setLabel('Start Now')
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`schedule_edit_${sessionId}`)
        .setLabel('Edit Configuration')
        .setEmoji('✏️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`schedule_delete_${sessionId}`)
        .setLabel('Delete Session')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
    );
  
  const backButton = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_view_sessions')
        .setLabel('Back to List')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [actionButtons, backButton]
  });
}

/**
 * Show session editor menu
 */
export async function showSessionEditor(interaction, sessionId) {
  const session = getScheduledSession(sessionId);
  
  if (!session) {
    await interaction.editReply({
      content: '❌ Session not found.',
      embeds: [],
      components: []
    });
    return;
  }
  
  // Safety check: Don't allow editing of season sessions
  if (session.seasonId) {
    await interaction.editReply({
      content: '❌ Season sessions are managed automatically. Use `/patsseason` to manage season settings.',
      embeds: [],
      components: []
    });
    return;
  }
  
  const date = new Date(session.scheduledDate);
  const firstGameTime = new Date(session.firstGameTime);
  
  // Calculate hoursBefore if not stored (backward compatibility)
  let announcementHoursBefore = session.notifications.announcement.hoursBefore;
  if (session.notifications.announcement.enabled && !announcementHoursBefore) {
    const announcementTime = new Date(session.notifications.announcement.time);
    announcementHoursBefore = Math.round((firstGameTime - announcementTime) / (60 * 60 * 1000));
  }
  
  const embed = new EmbedBuilder()
    .setTitle(`✏️ Edit Session: ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`)
    .setDescription('What would you like to edit?')
    .setColor('#5865F2')
    .addFields(
      {
        name: '📅 Current Configuration',
        value: [
          `**Games:** ${session.games.length}`,
          `**Channel:** <#${session.channelId}>`,
          `**Participants:** ${formatParticipants(session)}`,
          `**Announcement:** ${session.notifications.announcement.enabled ? `${announcementHoursBefore}h before` : 'Disabled'}`,
          `**Reminder:** ${session.notifications.reminder.enabled ? `${session.notifications.reminder.minutesBefore}min before` : 'Disabled'}`,
          `**Warning:** ${session.notifications.warning.enabled ? `${session.notifications.warning.minutesBefore}min before` : 'Disabled'}`
        ].join('\n')
      }
    );
  
  const editButtons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`schedule_edit_channel_${sessionId}`)
        .setLabel('Edit Channel')
        .setEmoji('📍')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`schedule_edit_participants_${sessionId}`)
        .setLabel('Edit Participants')
        .setEmoji('👥')
        .setStyle(ButtonStyle.Secondary)
    );
  
  const notifButtons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`schedule_edit_announcement_${sessionId}`)
        .setLabel('Edit Announcement')
        .setEmoji('📢')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`schedule_edit_reminder_${sessionId}`)
        .setLabel('Edit Reminder')
        .setEmoji('⏰')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`schedule_edit_warning_${sessionId}`)
        .setLabel('Edit Warning')
        .setEmoji('⚠️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  const backButton = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`schedule_manage_${sessionId}`)
        .setLabel('Back')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [editButtons, notifButtons, backButton]
  });
}

/**
 * Show templates menu
 */
export async function showTemplatesMenu(interaction) {
  const templates = getAllTemplates();
  
  if (templates.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle('💾 Saved Templates')
      .setDescription('No templates saved yet. Create a template when scheduling a session.')
      .setColor('#808080');
    
    const backButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('schedule_back_main')
          .setLabel('Back')
          .setEmoji('⬅️')
          .setStyle(ButtonStyle.Secondary)
      );
    
    await interaction.editReply({
      embeds: [embed],
      components: [backButton]
    });
    return;
  }
  
  const embed = new EmbedBuilder()
    .setTitle('💾 Saved Templates')
    .setDescription(`${templates.length} template${templates.length === 1 ? '' : 's'} available`)
    .setColor('#5865F2');
  
  templates.forEach((template, index) => {
    const channelMention = `<#${template.channelId}>`;
    const participantText = formatParticipants(template);
    
    const notifIcons = [
      template.notifications.announcement.enabled ? '✅' : '❌',
      template.notifications.reminder.enabled ? '✅' : '❌',
      template.notifications.warning.enabled ? '✅' : '❌'
    ];
    
    embed.addFields({
      name: `${index + 1}. ${template.name}`,
      value: [
        `📍 Channel: ${channelMention}`,
        `👥 Participants: ${participantText}`,
        `🔔 Announcements: ${notifIcons[0]} | Reminders: ${notifIcons[1]} | Warnings: ${notifIcons[2]}`
      ].join('\n'),
      inline: false
    });
  });
  
  const backButton = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_back_main')
        .setLabel('Back')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('schedule_cancel')
        .setLabel('Cancel')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [backButton]
  });
}

/**
 * Cancel/close the menu
 */
export async function cancelMenu(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('❌ Cancelled')
    .setDescription('Session scheduling cancelled.')
    .setColor('#808080');
  
  await interaction.editReply({
    embeds: [embed],
    components: []
  });
}

/**
 * Dismiss the scheduling success message
 */
export async function dismissMenu(interaction) {
  await interaction.editReply({
    embeds: [],
    components: [],
    content: '✅ Session scheduled successfully!'
  });
}

/**
 * Start a scheduled session immediately
 */
export async function startSessionNow(interaction, sessionId) {
  const session = getScheduledSession(sessionId);
  
  if (!session) {
    await interaction.editReply({
      content: '❌ Session not found.',
      embeds: [],
      components: []
    });
    return;
  }
  
  // Safety check: Don't allow manual start of season sessions
  if (session.seasonId) {
    await interaction.editReply({
      content: '❌ Season sessions are managed automatically. Use `/patsseason` to manage season sessions.',
      embeds: [],
      components: []
    });
    return;
  }
  
  await interaction.editReply({
    content: '⏳ Starting PATS session now...',
    embeds: [],
    components: []
  });
  
  try {
    const channel = await interaction.client.channels.fetch(session.channelId);
    const guild = await interaction.client.guilds.fetch(session.guildId);
    
    if (!channel || !guild) {
      await interaction.editReply({
        content: '❌ Could not find channel or guild for this session.'
      });
      return;
    }
    
    // Get the date for this session (use scheduledDate to avoid timezone conversion issues)
    const dateStr = session.scheduledDate; // Already in YYYY-MM-DD format
    
    // Import necessary functions
    const { fetchGamesForSession, clearGamesCache, prefetchMatchupInfo } = await import('../utils/dataCache.js');
    const { createPATSSession } = await import('../utils/patsData.js');
    const { EmbedBuilder } = await import('discord.js');
    
    // Fetch games with spreads
    console.log(`📊 Fetching games with spreads for manually started PATS session on ${dateStr}...`);
    console.log(`💡 This will use 1 Odds API call (we have 500/month)`);
    
    // Clear any old cache and fetch fresh data for this session
    clearGamesCache();
    const games = await fetchGamesForSession(dateStr);
    
    if (!games || games.length === 0) {
      await interaction.editReply({
        content: `❌ No games with spreads available for ${dateStr}.`
      });
      return;
    }
    
    // Determine participants based on session configuration
    let participants = [];
    
    // New format: roleIds and userIds arrays
    if (session.roleIds && session.roleIds.length > 0) {
      participants.push(...session.roleIds);
    }
    if (session.userIds && session.userIds.length > 0) {
      participants.push(...session.userIds);
    }
    
    // Legacy format support
    if (participants.length === 0) {
      if (session.participantType === 'role' && session.roleId) {
        participants = [session.roleId];
      } else if (session.participantType === 'users' && session.specificUsers) {
        participants = session.specificUsers;
      }
    }
    
    // Create the PATS session
    const patsSession = createPATSSession(dateStr, games, participants);
    console.log(`✅ Created PATS session ${patsSession.id} with ${games.length} games`);
    
    // Prefetch matchup info
    prefetchMatchupInfo(patsSession.games).catch(err => {
      console.error('[PATS] Error prefetching matchup info:', err);
    });
    
    // Get first game time for announcement
    const firstGameTime = new Date(session.firstGameTime);
    
    // Create announcement embed
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
    
    // Create participant mention string
    let mentionText = '';
    const mentions = [];
    
    // New format
    if (session.roleIds && session.roleIds.length > 0) {
      mentions.push(...session.roleIds.map(id => `<@&${id}>`));
    }
    if (session.userIds && session.userIds.length > 0) {
      mentions.push(...session.userIds.map(id => `<@${id}>`));
    }
    
    // Legacy format support
    if (mentions.length === 0) {
      if (session.participantType === 'role' && session.roleId) {
        mentions.push(`<@&${session.roleId}>`);
      } else if (session.participantType === 'users' && session.specificUsers?.length > 0) {
        mentions.push(...session.specificUsers.map(uid => `<@${uid}>`));
      } else if (session.participantType === 'here') {
        mentions.push('@here');
      }
    }
    
    mentionText = mentions.join(' ');
    
    // Send announcement to channel
    await channel.send({ 
      content: mentionText || undefined,
      embeds: [embed]
    });
    
    // Delete the scheduled session since it's been started
    const { deleteScheduledSession } = await import('../utils/sessionScheduler.js');
    deleteScheduledSession(sessionId);
    
    await interaction.editReply({
      content: `✅ PATS session started successfully with ${games.length} games! The scheduled session has been removed.`,
      embeds: [],
      components: []
    });
    
  } catch (error) {
    console.error('Error starting session manually:', error);
    await interaction.editReply({
      content: `❌ Failed to start session: ${error.message}`,
      embeds: [],
      components: []
    });
  }
}

/**
 * Show date selection menu
 */
export async function showDateSelection(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('📆 Select Date for PATS Session')
    .setDescription('Fetching available dates with NBA games...')
    .setColor('#5865F2');
  
  await interaction.editReply({
    embeds: [embed],
    components: []
  });
  
  try {
    // Fetch next 7 days of games IN PARALLEL for speed
    // Get current date in Pacific Time
    const nowUTC = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(nowUTC);
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    const today = new Date(`${year}-${month}-${day}T00:00:00`);
    
    console.log(`[PATS SCHEDULE] Current date in Pacific Time: ${today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`);
    const datePromises = [];
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      
      datePromises.push(
        getESPNGamesForDate(dateStr)
          .then(games => ({
            date: dateStr,
            dateObj: date,
            gameCount: games ? games.length : 0,
            games: games || []
          }))
          .catch(error => {
            console.error(`Error fetching games for ${dateStr}:`, error);
            return null;
          })
      );
    }
    
    // Wait for all promises to resolve
    const results = await Promise.all(datePromises);
    const datesWithGames = results.filter(r => r !== null && r.gameCount > 0);
    
    if (datesWithGames.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('📆 No Games Available')
        .setDescription('No NBA games found in the next 7 days.')
        .setColor('#808080');
      
      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('schedule_back_main')
            .setLabel('Back')
            .setEmoji('⬅️')
            .setStyle(ButtonStyle.Secondary)
        );
      
      await interaction.editReply({
        embeds: [embed],
        components: [backButton]
      });
      return;
    }
    
    // Build the embed with available dates
    const dateEmbed = new EmbedBuilder()
      .setTitle('📆 Select Date for PATS Session')
      .setDescription('Choose a date with NBA games:')
      .setColor('#5865F2');
    
    datesWithGames.forEach((dateInfo) => {
      const dayName = dateInfo.dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const isToday = dateInfo.dateObj.toDateString() === today.toDateString();
      const isTomorrow = dateInfo.dateObj.toDateString() === new Date(today.getTime() + 86400000).toDateString();
      
      let label = dayName;
      if (isToday) label = `Today - ${dayName}`;
      else if (isTomorrow) label = `Tomorrow - ${dayName}`;
      
      dateEmbed.addFields({
        name: label,
        value: `🎮 ${dateInfo.gameCount} game${dateInfo.gameCount === 1 ? '' : 's'}`,
        inline: true
      });
    });
    
    // Create buttons for dates (max 5 per row, 2 rows = 10 buttons)
    const buttonRows = [];
    let currentRow = new ActionRowBuilder();
    
    datesWithGames.slice(0, 10).forEach((dateInfo, index) => {
      if (index > 0 && index % 5 === 0) {
        buttonRows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }
      
      const dayName = dateInfo.dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const isToday = dateInfo.dateObj.toDateString() === today.toDateString();
      const isTomorrow = dateInfo.dateObj.toDateString() === new Date(today.getTime() + 86400000).toDateString();
      
      let buttonLabel = dayName;
      if (isToday) buttonLabel = 'Today';
      else if (isTomorrow) buttonLabel = 'Tomorrow';
      else buttonLabel = dateInfo.dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      currentRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`schedule_date_${dateInfo.date}`)
          .setLabel(`${buttonLabel} (${dateInfo.gameCount})`)
          .setStyle(ButtonStyle.Primary)
      );
    });
    
    if (currentRow.components.length > 0) {
      buttonRows.push(currentRow);
    }
    
    // Add navigation buttons
    const navRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('schedule_back_main')
          .setLabel('Back')
          .setEmoji('⬅️')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('schedule_cancel')
          .setLabel('Cancel')
          .setEmoji('❌')
          .setStyle(ButtonStyle.Danger)
      );
    
    buttonRows.push(navRow);
    
    await interaction.editReply({
      embeds: [dateEmbed],
      components: buttonRows
    });
  } catch (error) {
    console.error('Error in showDateSelection:', error);
    await interaction.editReply({
      content: '❌ Error loading dates. Please try again.',
      embeds: [],
      components: []
    });
  }
}

/**
 * Show game selection menu
 */
export async function showGameSelection(interaction, selectedDate) {
  const embed = new EmbedBuilder()
    .setTitle('🏀 Loading games...')
    .setDescription(`Fetching games for ${selectedDate}`)
    .setColor('#5865F2');
  
  await interaction.editReply({
    embeds: [embed],
    components: []
  });
  
  try {
    const games = await getESPNGamesForDate(selectedDate);
    
    if (!games || games.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('❌ No Games Found')
        .setDescription(`No games available for ${selectedDate}`)
        .setColor('#808080');
      
      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('schedule_new_session')
            .setLabel('Back to Date Selection')
            .setEmoji('⬅️')
            .setStyle(ButtonStyle.Secondary)
        );
      
      await interaction.editReply({
        embeds: [embed],
        components: [backButton]
      });
      return;
    }
    
    // Sort games by start time
    games.sort((a, b) => new Date(a.commenceTime) - new Date(b.commenceTime));
    
    // Store selected date in interaction metadata (we'll use customId to pass data)
    const date = new Date(selectedDate);
    const dateDisplay = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    
    // Get current selection state
    const config = getSessionConfig(interaction.user.id);
    const selectedIndices = config.selectedGameIndices || games.map((_, i) => i);
    
    const gameEmbed = new EmbedBuilder()
      .setTitle(`🏀 Games on ${dateDisplay}`)
      .setDescription('Select games to include in the session:\n*Click buttons below to toggle game selection*')
      .setColor('#5865F2')
      .setFooter({ text: `${selectedIndices.length} of ${games.length} games selected` });
    
    // Show all games with checkboxes
    let gamesList = '';
    games.forEach((game, index) => {
      const isSelected = selectedIndices.includes(index);
      const checkbox = isSelected ? '☑️' : '☐';
      const startTime = new Date(game.commenceTime).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/Los_Angeles',
        timeZoneName: 'short'
      });
      gamesList += `${checkbox} **${game.awayTeam} @ ${game.homeTeam}** - ${startTime}\n`;
    });
    
    gameEmbed.addFields({
      name: `${games.length} Games Available`,
      value: gamesList
    });
    
    // Create toggle buttons for each game (max 5 per row)
    const buttonRows = [];
    let currentRow = new ActionRowBuilder();
    
    games.slice(0, 20).forEach((game, index) => {
      const isSelected = selectedIndices.includes(index);
      
      if (index > 0 && index % 5 === 0) {
        buttonRows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }
      
      currentRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`schedule_toggle_game_${selectedDate}_${index}`)
          .setLabel(`${index + 1}`)
          .setStyle(isSelected ? ButtonStyle.Success : ButtonStyle.Secondary)
      );
    });
    
    if (currentRow.components.length > 0) {
      buttonRows.push(currentRow);
    }
    
    // Add action buttons
    const actionRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`schedule_selectall_${selectedDate}`)
          .setLabel('Select All')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`schedule_deselectall_${selectedDate}`)
          .setLabel('Deselect All')
          .setEmoji('❌')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`schedule_continue_config_${selectedDate}`)
          .setLabel('Continue')
          .setEmoji('➡️')
          .setStyle(ButtonStyle.Primary)
      );
    
    buttonRows.push(actionRow);
    
    // Add navigation
    const navRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('schedule_new_session')
          .setLabel('Back to Dates')
          .setEmoji('⬅️')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('schedule_cancel')
          .setLabel('Cancel')
          .setEmoji('❌')
          .setStyle(ButtonStyle.Danger)
      );
    
    buttonRows.push(navRow);
    
    // Initialize/update session config for this user
    const userConfig = getSessionConfig(interaction.user.id);
    if (!userConfig.selectedDate) {
      // First time - initialize with all games selected
      userConfig.selectedDate = selectedDate;
      userConfig.games = games;
      userConfig.selectedGameIndices = games.map((_, index) => index);
    } else {
      // Update games list (in case they navigated back)
      userConfig.games = games;
    }
    
    await interaction.editReply({
      embeds: [gameEmbed],
      components: buttonRows
    });
    
  } catch (error) {
    console.error('Error fetching games:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Error')
      .setDescription('Failed to fetch games. Please try again.')
      .setColor('#FF0000');
    
    const backButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('schedule_new_session')
          .setLabel('Back')
          .setEmoji('⬅️')
          .setStyle(ButtonStyle.Secondary)
      );
    
    await interaction.editReply({
      embeds: [errorEmbed],
      components: [backButton]
    });
  }
}

/**
 * Show configuration menu
 */
export async function showConfigurationMenu(interaction) {
  const config = getSessionConfig(interaction.user.id);
  
  if (!config.selectedDate || config.selectedGameIndices.length === 0) {
    await interaction.editReply({
      content: '❌ Please select at least one game first.',
      embeds: [],
      components: []
    });
    return;
  }
  
  const selectedGames = config.selectedGameIndices.map(i => config.games[i]);
  const firstGame = selectedGames[0];
  const firstGameTime = new Date(firstGame.commenceTime);
  
  const date = new Date(config.selectedDate);
  const dateDisplay = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  
  // Calculate announcement time
  const announcementTime = new Date(firstGameTime);
  announcementTime.setTime(announcementTime.getTime() - (config.notifications.announcement.hoursBefore * 60 * 60 * 1000));
  
  const embed = new EmbedBuilder()
    .setTitle('⚙️ Configure Session')
    .setColor('#5865F2')
    .addFields(
      {
        name: '📅 Session Details',
        value: [
          `**Date:** ${dateDisplay}`,
          `**Games:** ${selectedGames.length} selected`,
          `**First Game:** ${firstGame.awayTeam} @ ${firstGame.homeTeam} - ${firstGameTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles', timeZoneName: 'short' })}`
        ].join('\n')
      },
      {
        name: '📍 Channel',
        value: config.channelId ? `<#${config.channelId}>` : '❌ Not set - Click "Set Channel" below'
      },
      {
        name: '👥 Participants',
        value: ((config.roleIds?.length > 0) || (config.userIds?.length > 0))
          ? formatParticipants(config)
          : '❌ Not set - Click "Set Participants" below'
      },
      {
        name: '🔔 Notifications',
        value: [
          `📢 Announcement: ${config.notifications.announcement.enabled ? `✅ ${announcementTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })} (${config.notifications.announcement.hoursBefore}h before)` : '❌ Disabled'}`,
          `⏰ Reminder: ${config.notifications.reminder.enabled ? `✅ ${config.notifications.reminder.minutesBefore} min before` : '❌ Disabled'}`,
          `⚠️ Warning: ${config.notifications.warning.enabled ? `✅ ${config.notifications.warning.minutesBefore} min before` : '❌ Disabled'}`
        ].join('\n')
      }
    )
    .setFooter({ text: 'Configure all settings before scheduling' });
  
  const row1 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_config_channel')
        .setLabel('Set Channel')
        .setEmoji('📍')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('schedule_config_participants')
        .setLabel('Set Participants')
        .setEmoji('👥')
        .setStyle(ButtonStyle.Primary)
    );
  
  const row2 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_config_announcement')
        .setLabel('Edit Announcement')
        .setEmoji('📢')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('schedule_config_reminder')
        .setLabel('Edit Reminder')
        .setEmoji('⏰')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('schedule_config_warning')
        .setLabel('Edit Warning')
        .setEmoji('⚠️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  const row3 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_create_session')
        .setLabel('Schedule Session')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!config.channelId || ((config.roleIds?.length || 0) === 0 && (config.userIds?.length || 0) === 0)),
      new ButtonBuilder()
        .setCustomId(`schedule_date_${config.selectedDate}`)
        .setLabel('Back to Games')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('schedule_cancel')
        .setLabel('Cancel')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [row1, row2, row3]
  });
}

/**
 * Toggle game selection
 */
export function toggleGameSelection(userId, selectedDate, gameIndex) {
  const config = getSessionConfig(userId);
  const index = config.selectedGameIndices.indexOf(gameIndex);
  
  if (index > -1) {
    config.selectedGameIndices.splice(index, 1);
  } else {
    config.selectedGameIndices.push(gameIndex);
  }
  
  // Keep sorted
  config.selectedGameIndices.sort((a, b) => a - b);
}

/**
 * Select all games
 */
export function selectAllGames(userId) {
  const config = getSessionConfig(userId);
  config.selectedGameIndices = config.games.map((_, index) => index);
}

/**
 * Deselect all games
 */
export function deselectAllGames(userId) {
  const config = getSessionConfig(userId);
  config.selectedGameIndices = [];
}

/**
 * Show channel selection menu
 */
export async function showChannelSelection(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('📍 Select Channel')
    .setDescription('Choose the channel where the PATS session will be announced:')
    .setColor('#5865F2');
  
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('schedule_select_channel')
    .setPlaceholder('Select a channel')
    .setChannelTypes([ChannelType.GuildText]);
  
  const row = new ActionRowBuilder().addComponents(channelSelect);
  
  const backButton = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_back_to_config')
        .setLabel('Back to Configuration')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [row, backButton]
  });
}

/**
 * Show participant type selection
 */
export async function showParticipantTypeSelection(interaction) {
  const config = getSessionConfig(interaction.user.id);
  
  const embed = new EmbedBuilder()
    .setTitle('👥 Select Participants')
    .setDescription('Choose who should be included in this PATS session.\nYou can select multiple roles and/or users.')
    .setColor('#5865F2');
  
  // Show current selections if any
  if ((config.roleIds?.length || 0) > 0 || (config.userIds?.length || 0) > 0) {
    let currentText = [];
    if ((config.roleIds?.length || 0) > 0) {
      currentText.push(`**Roles:** ${config.roleIds.map(id => `<@&${id}>`).join(', ')}`);
    }
    if ((config.userIds?.length || 0) > 0) {
      currentText.push(`**Users:** ${config.userIds.map(id => `<@${id}>`).join(', ')}`);
    }
    embed.addFields({
      name: 'Current Selection',
      value: currentText.join('\n')
    });
  }
  
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId('schedule_select_roles')
    .setPlaceholder('Select roles (optional)')
    .setMinValues(0)
    .setMaxValues(25);
  
  // Pre-populate with current selections if any
  if (config.roleIds && config.roleIds.length > 0) {
    roleSelect.setDefaultRoles(...config.roleIds);
  }
  
  const userSelect = new UserSelectMenuBuilder()
    .setCustomId('schedule_select_users')
    .setPlaceholder('Select users (optional)')
    .setMinValues(0)
    .setMaxValues(25);
  
  // Pre-populate with current selections if any
  if (config.userIds && config.userIds.length > 0) {
    userSelect.setDefaultUsers(...config.userIds);
  }
  
  const roleRow = new ActionRowBuilder().addComponents(roleSelect);
  const userRow = new ActionRowBuilder().addComponents(userSelect);
  
  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_participants_done')
        .setLabel('Done')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success)
        .setDisabled((config.roleIds?.length || 0) === 0 && (config.userIds?.length || 0) === 0),
      new ButtonBuilder()
        .setCustomId('schedule_back_to_config')
        .setLabel('Back to Configuration')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [roleRow, userRow, buttons]
  });
}

/**
 * Update channel in config
 */
export function setChannel(userId, channelId) {
  const config = getSessionConfig(userId);
  config.channelId = channelId;
}

/**
 * Update participant roles in config
 */
export function setRoles(userId, roleIds) {
  const config = getSessionConfig(userId);
  config.roleIds = roleIds;
}

/**
 * Update participant users in config
 */
export function setUsers(userId, userIds) {
  const config = getSessionConfig(userId);
  config.userIds = userIds;
}

/**
 * Show announcement timing editor
 */
export async function showAnnouncementEditor(interaction) {
  const config = getSessionConfig(interaction.user.id);
  
  const embed = new EmbedBuilder()
    .setTitle('📢 Edit Announcement Time')
    .setDescription('How many hours before the first game should the announcement be sent?')
    .setColor('#5865F2')
    .addFields({
      name: 'Current Setting',
      value: `${config.notifications.announcement.hoursBefore} hours before first game`
    });
  
  const options = [
    { label: '1 hour before', value: '1' },
    { label: '2 hours before', value: '2' },
    { label: '3 hours before', value: '3' },
    { label: '4 hours before', value: '4' },
    { label: '6 hours before', value: '6' },
    { label: '9 hours before', value: '9' },
    { label: '12 hours before', value: '12' },
    { label: '24 hours before', value: '24' },
    { label: 'Disable announcement', value: '0' }
  ];
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('schedule_set_announcement')
    .setPlaceholder('Select announcement time')
    .addOptions(options);
  
  const row = new ActionRowBuilder().addComponents(selectMenu);
  
  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_back_to_config')
        .setLabel('Back to Configuration')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [row, buttons]
  });
}

/**
 * Show reminder timing editor
 */
export async function showReminderEditor(interaction) {
  const config = getSessionConfig(interaction.user.id);
  
  const embed = new EmbedBuilder()
    .setTitle('⏰ Edit Reminder Time')
    .setDescription('How many minutes before the first game should the reminder DM be sent?')
    .setColor('#5865F2')
    .addFields({
      name: 'Current Setting',
      value: `${config.notifications.reminder.minutesBefore} minutes before first game`
    });
  
  const options = [
    { label: '15 minutes before', value: '15' },
    { label: '30 minutes before', value: '30' },
    { label: '45 minutes before', value: '45' },
    { label: '60 minutes before (1 hour)', value: '60' },
    { label: '90 minutes before (1.5 hours)', value: '90' },
    { label: '120 minutes before (2 hours)', value: '120' },
    { label: 'Disable reminder', value: '0' }
  ];
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('schedule_set_reminder')
    .setPlaceholder('Select reminder time')
    .addOptions(options);
  
  const row = new ActionRowBuilder().addComponents(selectMenu);
  
  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_back_to_config')
        .setLabel('Back to Configuration')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [row, buttons]
  });
}

/**
 * Show warning timing editor
 */
export async function showWarningEditor(interaction) {
  const config = getSessionConfig(interaction.user.id);
  
  const embed = new EmbedBuilder()
    .setTitle('⚠️ Edit Warning Time')
    .setDescription('How many minutes before the first game should the warning DM be sent?')
    .setColor('#5865F2')
    .addFields({
      name: 'Current Setting',
      value: `${config.notifications.warning.minutesBefore} minutes before first game`
    });
  
  const options = [
    { label: '5 minutes before', value: '5' },
    { label: '10 minutes before', value: '10' },
    { label: '15 minutes before', value: '15' },
    { label: '20 minutes before', value: '20' },
    { label: '30 minutes before', value: '30' },
    { label: 'Disable warning', value: '0' }
  ];
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('schedule_set_warning')
    .setPlaceholder('Select warning time')
    .addOptions(options);
  
  const row = new ActionRowBuilder().addComponents(selectMenu);
  
  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_back_to_config')
        .setLabel('Back to Configuration')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [row, buttons]
  });
}

/**
 * Update announcement timing
 */
export function setAnnouncementTime(userId, hours) {
  const config = getSessionConfig(userId);
  const hoursNum = parseInt(hours);
  config.notifications.announcement.enabled = hoursNum > 0;
  config.notifications.announcement.hoursBefore = hoursNum;
}

/**
 * Update reminder timing
 */
export function setReminderTime(userId, minutes) {
  const config = getSessionConfig(userId);
  const minutesNum = parseInt(minutes);
  config.notifications.reminder.enabled = minutesNum > 0;
  config.notifications.reminder.minutesBefore = minutesNum;
}

/**
 * Update warning timing
 */
export function setWarningTime(userId, minutes) {
  const config = getSessionConfig(userId);
  const minutesNum = parseInt(minutes);
  config.notifications.warning.enabled = minutesNum > 0;
  config.notifications.warning.minutesBefore = minutesNum;
}

/**
 * Show announcement editor for existing session
 */
export async function showSessionAnnouncementEditor(interaction, sessionId) {
  const session = getScheduledSession(sessionId);
  
  if (!session) {
    await interaction.editReply({
      content: '❌ Session not found.',
      embeds: [],
      components: []
    });
    return;
  }
  
  // Calculate hoursBefore if not stored
  let currentHours = session.notifications.announcement.hoursBefore || 0;
  if (session.notifications.announcement.enabled && !currentHours) {
    const firstGameTime = new Date(session.firstGameTime);
    const announcementTime = new Date(session.notifications.announcement.time);
    currentHours = Math.round((firstGameTime - announcementTime) / (60 * 60 * 1000));
  }
  
  const embed = new EmbedBuilder()
    .setTitle('📢 Edit Announcement Time')
    .setDescription('How many hours before the first game should the announcement be sent?')
    .setColor('#5865F2')
    .addFields({
      name: 'Current Setting',
      value: session.notifications.announcement.enabled 
        ? `${currentHours} hours before first game`
        : 'Disabled'
    });
  
  const options = [
    { label: '1 hour before', value: `1|${sessionId}` },
    { label: '2 hours before', value: `2|${sessionId}` },
    { label: '3 hours before', value: `3|${sessionId}` },
    { label: '4 hours before', value: `4|${sessionId}` },
    { label: '6 hours before', value: `6|${sessionId}` },
    { label: '9 hours before', value: `9|${sessionId}` },
    { label: '12 hours before', value: `12|${sessionId}` },
    { label: '24 hours before', value: `24|${sessionId}` },
    { label: 'Disable announcement', value: `0|${sessionId}` }
  ];
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('schedule_update_announcement')
    .setPlaceholder('Select announcement time')
    .addOptions(options);
  
  const row = new ActionRowBuilder().addComponents(selectMenu);
  
  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`schedule_edit_${sessionId}`)
        .setLabel('Back to Editor')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [row, buttons]
  });
}

/**
 * Show reminder editor for existing session
 */
export async function showSessionReminderEditor(interaction, sessionId) {
  const session = getScheduledSession(sessionId);
  
  if (!session) {
    await interaction.editReply({
      content: '❌ Session not found.',
      embeds: [],
      components: []
    });
    return;
  }
  
  const embed = new EmbedBuilder()
    .setTitle('⏰ Edit Reminder Time')
    .setDescription('How many minutes before the first game should the reminder DM be sent?')
    .setColor('#5865F2')
    .addFields({
      name: 'Current Setting',
      value: session.notifications.reminder.enabled 
        ? `${session.notifications.reminder.minutesBefore} minutes before first game`
        : 'Disabled'
    });
  
  const options = [
    { label: '15 minutes before', value: `15|${sessionId}` },
    { label: '30 minutes before', value: `30|${sessionId}` },
    { label: '45 minutes before', value: `45|${sessionId}` },
    { label: '60 minutes before', value: `60|${sessionId}` },
    { label: '90 minutes before', value: `90|${sessionId}` },
    { label: '120 minutes before', value: `120|${sessionId}` },
    { label: 'Disable reminder', value: `0|${sessionId}` }
  ];
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('schedule_update_reminder')
    .setPlaceholder('Select reminder time')
    .addOptions(options);
  
  const row = new ActionRowBuilder().addComponents(selectMenu);
  
  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`schedule_edit_${sessionId}`)
        .setLabel('Back to Editor')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [row, buttons]
  });
}

/**
 * Show warning editor for existing session
 */
export async function showSessionWarningEditor(interaction, sessionId) {
  const session = getScheduledSession(sessionId);
  
  if (!session) {
    await interaction.editReply({
      content: '❌ Session not found.',
      embeds: [],
      components: []
    });
    return;
  }
  
  const embed = new EmbedBuilder()
    .setTitle('⚠️ Edit Warning Time')
    .setDescription('How many minutes before the first game should the final warning be sent?')
    .setColor('#5865F2')
    .addFields({
      name: 'Current Setting',
      value: session.notifications.warning.enabled 
        ? `${session.notifications.warning.minutesBefore} minutes before first game`
        : 'Disabled'
    });
  
  const options = [
    { label: '5 minutes before', value: `5|${sessionId}` },
    { label: '10 minutes before', value: `10|${sessionId}` },
    { label: '15 minutes before', value: `15|${sessionId}` },
    { label: '20 minutes before', value: `20|${sessionId}` },
    { label: '30 minutes before', value: `30|${sessionId}` },
    { label: 'Disable warning', value: `0|${sessionId}` }
  ];
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('schedule_update_warning')
    .setPlaceholder('Select warning time')
    .addOptions(options);
  
  const row = new ActionRowBuilder().addComponents(selectMenu);
  
  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`schedule_edit_${sessionId}`)
        .setLabel('Back to Editor')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [row, buttons]
  });
}

/**
 * Update existing session announcement time
 */
export async function updateSessionAnnouncement(interaction, hours, sessionId) {
  const session = getScheduledSession(sessionId);
  
  if (!session) {
    await interaction.followUp({
      content: '❌ Session not found.',
      ephemeral: true
    });
    return;
  }
  
  const hoursNum = parseInt(hours);
  const firstGameTime = new Date(session.firstGameTime);
  
  // Calculate new announcement time
  const announcementTime = new Date(firstGameTime);
  announcementTime.setTime(announcementTime.getTime() - (hoursNum * 60 * 60 * 1000));
  
  // Update session
  updateScheduledSession(sessionId, {
    notifications: {
      ...session.notifications,
      announcement: {
        enabled: hoursNum > 0,
        time: hoursNum > 0 ? announcementTime.toISOString() : null,
        hoursBefore: hoursNum
      }
    }
  });
  
  await showSessionEditor(interaction, sessionId);
}

/**
 * Update existing session reminder time
 */
export async function updateSessionReminder(interaction, minutes, sessionId) {
  const session = getScheduledSession(sessionId);
  
  if (!session) {
    await interaction.followUp({
      content: '❌ Session not found.',
      ephemeral: true
    });
    return;
  }
  
  const minutesNum = parseInt(minutes);
  
  // Update session
  updateScheduledSession(sessionId, {
    notifications: {
      ...session.notifications,
      reminder: {
        enabled: minutesNum > 0,
        minutesBefore: minutesNum
      }
    }
  });
  
  await showSessionEditor(interaction, sessionId);
}

/**
 * Update existing session warning time
 */
export async function updateSessionWarning(interaction, minutes, sessionId) {
  const session = getScheduledSession(sessionId);
  
  if (!session) {
    await interaction.followUp({
      content: '❌ Session not found.',
      ephemeral: true
    });
    return;
  }
  
  const minutesNum = parseInt(minutes);
  
  // Update session
  updateScheduledSession(sessionId, {
    notifications: {
      ...session.notifications,
      warning: {
        enabled: minutesNum > 0,
        minutesBefore: minutesNum
      }
    }
  });
  
  await showSessionEditor(interaction, sessionId);
}

/**
 * Show channel editor for scheduled session
 */
export async function showSessionChannelEditor(interaction, sessionId) {
  const session = getScheduledSession(sessionId);
  
  if (!session) {
    await interaction.editReply({
      content: '❌ Session not found.',
      embeds: [],
      components: []
    });
    return;
  }
  
  const embed = new EmbedBuilder()
    .setTitle('📍 Edit Channel')
    .setDescription('Select a new channel for this scheduled session.')
    .setColor('#5865F2')
    .addFields({
      name: 'Current Channel',
      value: `<#${session.channelId}>`
    });
  
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(`schedule_update_channel_${sessionId}`)
    .setPlaceholder('Select a channel')
    .setChannelTypes([ChannelType.GuildText])
    .setDefaultChannels(session.channelId);
  
  const row = new ActionRowBuilder().addComponents(channelSelect);
  
  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`schedule_edit_${sessionId}`)
        .setLabel('Back to Editor')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [row, buttons]
  });
}

/**
 * Update scheduled session channel
 */
export async function updateSessionChannel(interaction, channelId, sessionId) {
  const session = getScheduledSession(sessionId);
  
  if (!session) {
    await interaction.followUp({
      content: '❌ Session not found.',
      ephemeral: true
    });
    return;
  }
  
  // Update session
  updateScheduledSession(sessionId, {
    channelId: channelId
  });
  
  await interaction.editReply({
    content: `✅ Channel updated to <#${channelId}>`,
    embeds: [],
    components: []
  });
  
  setTimeout(async () => {
    await showSessionEditor(interaction, sessionId);
  }, 1500);
}

/**
 * Show participant selection for scheduled session editing
 */
export async function showSessionParticipantEditor(interaction, sessionId) {
  const session = getScheduledSession(sessionId);
  
  if (!session) {
    await interaction.editReply({
      content: '❌ Session not found.',
      embeds: [],
      components: []
    });
    return;
  }
  
  const embed = new EmbedBuilder()
    .setTitle('👥 Edit Participants')
    .setDescription('Select who can participate in this scheduled session.\nYou can select multiple roles and/or users.')
    .setColor('#5865F2');
  
  // Show current selections
  if ((session.roleIds && session.roleIds.length > 0) || (session.userIds && session.userIds.length > 0)) {
    let currentText = [];
    if (session.roleIds && session.roleIds.length > 0) {
      currentText.push(`**Roles:** ${session.roleIds.map(id => `<@&${id}>`).join(', ')}`);
    }
    if (session.userIds && session.userIds.length > 0) {
      currentText.push(`**Users:** ${session.userIds.map(id => `<@${id}>`).join(', ')}`);
    }
    embed.addFields({
      name: 'Current Selection',
      value: currentText.join('\n')
    });
  } else {
    // Legacy format support
    if (session.participantType === 'role' && session.roleId) {
      embed.addFields({
        name: 'Current Selection',
        value: `**Role:** <@&${session.roleId}>`
      });
    } else if (session.participantType === 'users' && session.specificUsers && session.specificUsers.length > 0) {
      embed.addFields({
        name: 'Current Selection',
        value: `**Users:** ${session.specificUsers.map(id => `<@${id}>`).join(', ')}`
      });
    }
  }
  
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(`schedule_update_participant_roles_${sessionId}`)
    .setPlaceholder('Select roles (optional)')
    .setMinValues(0)
    .setMaxValues(25);
  
  // Pre-populate with current role selections
  if (session.roleIds && session.roleIds.length > 0) {
    roleSelect.setDefaultRoles(...session.roleIds);
  }
  
  const userSelect = new UserSelectMenuBuilder()
    .setCustomId(`schedule_update_participant_users_${sessionId}`)
    .setPlaceholder('Select users (optional)')
    .setMinValues(0)
    .setMaxValues(25);
  
  // Pre-populate with current user selections
  if (session.userIds && session.userIds.length > 0) {
    userSelect.setDefaultUsers(...session.userIds);
  }
  
  const roleRow = new ActionRowBuilder().addComponents(roleSelect);
  const userRow = new ActionRowBuilder().addComponents(userSelect);
  
  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`schedule_edit_${sessionId}`)
        .setLabel('Back to Editor')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [roleRow, userRow, buttons]
  });
}

/**
 * Update scheduled session participant roles
 */
export async function updateSessionParticipantRoles(interaction, roleIds, sessionId) {
  const session = getScheduledSession(sessionId);
  
  if (!session) {
    await interaction.followUp({
      content: '❌ Session not found.',
      ephemeral: true
    });
    return;
  }
  
  // Update session - preserve existing userIds
  const updates = {
    roleIds: roleIds,
    // Keep existing userIds if they exist
    userIds: session.userIds || []
  };
  
  // Remove legacy fields
  delete updates.participantType;
  delete updates.roleId;
  delete updates.specificUsers;
  
  updateScheduledSession(sessionId, updates);
  
  // Stay on participant editor to allow further changes
  await showSessionParticipantEditor(interaction, sessionId);
}

/**
 * Update scheduled session participant users
 */
export async function updateSessionParticipantUsers(interaction, userIds, sessionId) {
  const session = getScheduledSession(sessionId);
  
  if (!session) {
    await interaction.followUp({
      content: '❌ Session not found.',
      ephemeral: true
    });
    return;
  }
  
  // Update session - preserve existing roleIds
  const updates = {
    userIds: userIds,
    // Keep existing roleIds if they exist
    roleIds: session.roleIds || []
  };
  
  // Remove legacy fields
  delete updates.participantType;
  delete updates.roleId;
  delete updates.specificUsers;
  
  updateScheduledSession(sessionId, updates);
  
  // Stay on participant editor to allow further changes
  await showSessionParticipantEditor(interaction, sessionId);
}

/**
 * Create the scheduled session
 */
export async function createScheduledSession(interaction) {
  const config = getSessionConfig(interaction.user.id);
  
  // Validate configuration
  if (!config.selectedDate || config.selectedGameIndices.length === 0) {
    await interaction.editReply({
      content: '❌ Error: No games selected.',
      embeds: [],
      components: []
    });
    return;
  }
  
  if (!config.channelId) {
    await interaction.editReply({
      content: '❌ Error: No channel selected.',
      embeds: [],
      components: []
    });
    return;
  }
  
  if ((config.roleIds?.length || 0) === 0 && (config.userIds?.length || 0) === 0) {
    await interaction.editReply({
      content: '❌ Error: No participants selected.',
      embeds: [],
      components: []
    });
    return;
  }
  
  try {
    const selectedGames = config.selectedGameIndices.map(i => config.games[i]);
    const firstGame = selectedGames[0];
    const firstGameTime = new Date(firstGame.commenceTime);
    
    // Calculate announcement time
    const announcementTime = new Date(firstGameTime);
    announcementTime.setTime(announcementTime.getTime() - (config.notifications.announcement.hoursBefore * 60 * 60 * 1000));
    
    // Build game details
    const gameDetails = selectedGames.map(game => ({
      gameId: game.id,
      matchup: `${game.awayTeam} @ ${game.homeTeam}`,
      startTime: game.commenceTime
    }));
    
    // Create session configuration
    const sessionConfig = {
      guildId: interaction.guildId,
      channelId: config.channelId,
      scheduledDate: config.selectedDate,
      firstGameTime: firstGameTime.toISOString(),
      games: selectedGames.map(g => g.id),
      gameDetails: gameDetails,
      roleIds: config.roleIds,
      userIds: config.userIds,
      sessionType: 'casual', // Manual sessions are casual by default
      notifications: {
        announcement: {
          enabled: config.notifications.announcement.enabled,
          time: announcementTime.toISOString(),
          hoursBefore: config.notifications.announcement.hoursBefore
        },
        reminder: {
          enabled: config.notifications.reminder.enabled,
          minutesBefore: config.notifications.reminder.minutesBefore
        },
        warning: {
          enabled: config.notifications.warning.enabled,
          minutesBefore: config.notifications.warning.minutesBefore
        }
      },
      createdBy: interaction.user.id,
      createdByUsername: interaction.user.username
    };
    
    // Save the session
    const session = addScheduledSession(sessionConfig);
    
    // Schedule the cron jobs for this new session
    const handlers = {
      sendAnnouncement: async (session) => {
        const { sendSessionAnnouncement, startScheduledSession } = await import('../utils/sessionScheduler.js');
        await sendSessionAnnouncement(interaction.client, session);
        await startScheduledSession(interaction.client, session);
      },
      sendReminders: async (session) => {
        const { sendSessionReminder } = await import('../utils/sessionScheduler.js');
        await sendSessionReminder(interaction.client, session);
      },
      sendWarnings: async (session) => {
        console.log(`[Scheduler] Session warning skipped for ${session.id} (using game warnings instead)`);
      },
      startSession: async (session) => {
        console.log(`[Scheduler] First game time reached for session ${session.id} (already started at announcement)`);
      }
    };
    scheduleSessionJobs(session, handlers, true); // isNewSession = true
    
    // Clear the config
    clearSessionConfig(interaction.user.id);
    
    // Show success message
    const date = new Date(config.selectedDate);
    const dateDisplay = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    
    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Session Scheduled Successfully!')
      .setColor('#00FF00')
      .addFields(
        {
          name: '📅 Session Details',
          value: [
            `**Date:** ${dateDisplay}`,
            `**Games:** ${selectedGames.length}`,
            `**First Game:** ${firstGame.awayTeam} @ ${firstGame.homeTeam}`,
            `**Start Time:** ${firstGameTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles', timeZoneName: 'short' })}`
          ].join('\n')
        },
        {
          name: '📍 Configuration',
          value: [
            `**Channel:** <#${config.channelId}>`,
            `**Participants:** ${formatParticipants(config)}`
          ].join('\n')
        },
        {
          name: '🔔 Notifications',
          value: [
            `📢 Announcement: ${config.notifications.announcement.enabled ? announcementTime.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Disabled'}`,
            `⏰ Reminder: ${config.notifications.reminder.enabled ? `${config.notifications.reminder.minutesBefore} min before` : 'Disabled'}`,
            `⚠️ Warning: ${config.notifications.warning.enabled ? `${config.notifications.warning.minutesBefore} min before` : 'Disabled'}`
          ].join('\n')
        }
      )
      .setFooter({ text: `Session ID: ${session.id}` });
    
    const buttons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('schedule_view_sessions')
          .setLabel('View All Scheduled')
          .setEmoji('📋')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('schedule_new_session')
          .setLabel('Schedule Another')
          .setEmoji('📆')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('schedule_dismiss')
          .setLabel('Done')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success)
      );
    
    await interaction.editReply({
      embeds: [successEmbed],
      components: [buttons]
    });
    
  } catch (error) {
    console.error('Error creating scheduled session:', error);
    
    await interaction.editReply({
      content: '❌ Error creating session. Please try again.',
      embeds: [],
      components: []
    });
  }
}

// Export helper functions
export { getSessionConfig, clearSessionConfig };

// Modal functions for patsschedule.js - append to end of file

/**
 * Show modal for role input
 */
export async function showRoleInputModal(interaction) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
  
  const modal = new ModalBuilder()
    .setCustomId('schedule_modal_role')
    .setTitle('Enter Role');
  
  const roleInput = new TextInputBuilder()
    .setCustomId('role_input')
    .setLabel('Role Name or ID')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., @Discord Manager or role ID')
    .setRequired(true);
  
  const row = new ActionRowBuilder().addComponents(roleInput);
  modal.addComponents(row);
  
  await interaction.showModal(modal);
}

/**
 * Handle role modal submission
 */
export async function handleRoleModalSubmit(interaction) {
  const roleInput = interaction.fields.getTextInputValue('role_input');
  
  // Try to extract role ID from mention or use as-is
  const roleIdMatch = roleInput.match(/^<@&(\d+)>$/) || roleInput.match(/^(\d+)$/);
  
  if (!roleIdMatch) {
    // Try to find role by name
    const role = interaction.guild.roles.cache.find(r => 
      r.name.toLowerCase() === roleInput.toLowerCase()
    );
    
    if (!role) {
      await interaction.editReply({
        content: `❌ Could not find role: "${roleInput}". Please use a role mention, ID, or exact role name.`,
        embeds: [],
        components: []
      });
      
      // Show participant selection again after 3 seconds
      setTimeout(async () => {
        await showParticipantTypeSelection(interaction);
      }, 3000);
      return;
    }
    
    setRole(interaction.user.id, role.id);
  } else {
    const roleId = roleIdMatch[1];
    
    // Verify role exists
    const role = interaction.guild.roles.cache.get(roleId);
    if (!role) {
      await interaction.editReply({
        content: `❌ Role not found. Please check the role ID and try again.`,
        embeds: [],
        components: []
      });
      
      setTimeout(async () => {
        await showParticipantTypeSelection(interaction);
      }, 3000);
      return;
    }
    
    setRole(interaction.user.id, roleId);
  }
  
  await showConfigurationMenu(interaction);
}

/**
 * Show modal for user input
 */
export async function showUserInputModal(interaction) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
  
  const modal = new ModalBuilder()
    .setCustomId('schedule_modal_users')
    .setTitle('Enter Users');
  
  const userInput = new TextInputBuilder()
    .setCustomId('user_input')
    .setLabel('User IDs (comma separated)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('e.g., 123456789, 987654321, 456789123')
    .setRequired(true);
  
  const row = new ActionRowBuilder().addComponents(userInput);
  modal.addComponents(row);
  
  await interaction.showModal(modal);
}

/**
 * Handle user modal submission
 */
export async function handleUserModalSubmit(interaction) {
  const userInput = interaction.fields.getTextInputValue('user_input');
  
  // Split by comma and clean up
  const inputs = userInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
  const userIds = [];
  const notFound = [];
  
  for (const input of inputs) {
    // Try to extract user ID from various formats:
    // 1. Direct ID: 123456789
    // 2. Mention format: <@123456789> or <@!123456789>
    // 3. Username mention that Discord may auto-format
    
    let userId = null;
    
    // Try direct ID match
    const directIdMatch = input.match(/^(\d{17,20})$/);
    if (directIdMatch) {
      userId = directIdMatch[1];
    }
    
    // Try mention format (with or without !)
    if (!userId) {
      const mentionMatch = input.match(/<@!?(\d{17,20})>/);
      if (mentionMatch) {
        userId = mentionMatch[1];
      }
    }
    
    // If we found a user ID, verify it exists
    if (userId) {
      try {
        const member = await interaction.guild.members.fetch(userId);
        if (member) {
          userIds.push(userId);
        } else {
          notFound.push(input);
        }
      } catch (error) {
        notFound.push(input);
      }
    } else {
      // Couldn't extract ID from any format
      notFound.push(input);
    }
  }
  
  if (userIds.length === 0) {
    await interaction.editReply({
      content: `❌ No valid users found. Please use user IDs separated by commas.\n💡 Tip: Right-click a user → Copy ID (enable Developer Mode in Discord settings)`,
      embeds: [],
      components: []
    });
    
    setTimeout(async () => {
      await showParticipantTypeSelection(interaction);
    }, 3000);
    return;
  }
  
  setUsers(interaction.user.id, userIds);
  
  let message = `✅ Added ${userIds.length} user(s) to participants.`;
  if (notFound.length > 0) {
    message += `\n⚠️ Could not find: ${notFound.join(', ')}`;
  }
  
  await interaction.editReply({
    content: message,
    embeds: [],
    components: []
  });
  
  setTimeout(async () => {
    await showConfigurationMenu(interaction);
  }, 2000);
}

// ============================================
// AUTO-SCHEDULING SYSTEM
// ============================================

// Store in-progress auto-schedule configurations (userId -> config)
const autoScheduleConfigs = new Map();

/**
 * Get or create auto-schedule config for user (in-progress editing)
 */
export function getAutoScheduleEditConfig(userId) {
  if (!autoScheduleConfigs.has(userId)) {
    // Load from saved config or use defaults
    const saved = getAutoScheduleConfig();
    autoScheduleConfigs.set(userId, { ...saved });
  }
  return autoScheduleConfigs.get(userId);
}

/**
 * Clear auto-schedule edit config for user
 */
function clearAutoScheduleEditConfig(userId) {
  autoScheduleConfigs.delete(userId);
}

/**
 * Save auto-schedule configuration from edit config
 */
export async function saveAutoScheduleConfiguration(interaction) {
  const editConfig = getAutoScheduleEditConfig(interaction.user.id);
  
  // Validate configuration
  if (!editConfig.channelId) {
    const embed = new EmbedBuilder()
      .setTitle('⚠️ Configuration Incomplete')
      .setDescription('Please set a channel before saving.')
      .setColor('#ED4245');
    
    await interaction.editReply({
      embeds: [embed],
      components: []
    });
    
    setTimeout(async () => {
      await showAutoScheduleConfig(interaction);
    }, 2000);
    return;
  }
  
  // Add creator info
  editConfig.createdBy = interaction.user.id;
  editConfig.createdByUsername = interaction.user.username;
  editConfig.guildId = interaction.guild.id;
  
  // Save the configuration
  saveAutoScheduleConfig(editConfig);
  
  // Clear the edit config
  clearAutoScheduleEditConfig(interaction.user.id);
  
  const embed = new EmbedBuilder()
    .setTitle('💾 Configuration Saved')
    .setDescription('Auto-schedule settings have been saved successfully.')
    .setColor('#57F287');
  
  await interaction.editReply({
    embeds: [embed],
    components: []
  });
  
  setTimeout(async () => {
    await showAutoScheduleMenu(interaction);
  }, 2000);
}

/**
 * Show auto-schedule main menu
 */
export async function showAutoScheduleMenu(interaction) {
  // Clear any in-progress edit config when returning to menu
  clearAutoScheduleEditConfig(interaction.user.id);
  
  const config = getAutoScheduleConfig();
  
  // Count upcoming auto-scheduled sessions
  const autoSessions = getAllScheduledSessions().filter(s => s.autoScheduled && !s.seasonId);
  const upcomingSessions = autoSessions.filter(s => new Date(s.startTime || s.firstGameTime) > new Date());
  
  const statusEmoji = config.enabled ? '✅' : '❌';
  const statusText = config.enabled ? 'Enabled' : 'Disabled';
  
  const embed = new EmbedBuilder()
    .setTitle('🤖 Auto-Schedule Settings')
    .setDescription(
      `Automatically schedule PATS sessions for upcoming NBA games.\n\n` +
      `**Status:** ${statusEmoji} ${statusText}\n` +
      `**Scheduled Sessions:** ${upcomingSessions.length} upcoming`
    )
    .setColor(config.enabled ? '#57F287' : '#ED4245');
  
  // Add current settings if configured
  if (config.channelId) {
    const settingsLines = [
      `📅 **Days Ahead:** ${config.daysAhead} days`,
      `🏀 **Min Games:** ${config.minGames} game${config.minGames !== 1 ? 's' : ''}`,
      `📢 **Channel:** <#${config.channelId}>`
    ];
    
    // Participants
    const participants = [];
    if (config.roleIds?.length > 0) {
      participants.push(`Roles: ${config.roleIds.map(id => `<@&${id}>`).join(', ')}`);
    }
    if (config.userIds?.length > 0) {
      participants.push(`Users: ${config.userIds.length} user${config.userIds.length !== 1 ? 's' : ''}`);
    }
    if (participants.length > 0) {
      settingsLines.push(`👥 **Participants:** ${participants.join(' | ')}`);
    }
    
    // Notifications
    const notifParts = [];
    if (config.notifications?.announcement?.enabled) {
      notifParts.push(`📣 ${config.notifications.announcement.hoursBefore}h before`);
    }
    if (config.notifications?.reminder?.enabled) {
      notifParts.push(`⏰ ${config.notifications.reminder.minutesBefore}m reminder`);
    }
    if (config.notifications?.warning?.enabled) {
      notifParts.push(`⚠️ ${config.notifications.warning.minutesBefore}m warning`);
    }
    if (notifParts.length > 0) {
      settingsLines.push(`🔔 **Notifications:** ${notifParts.join(', ')}`);
    }
    
    // Auto-end
    if (config.autoEnd?.enabled) {
      settingsLines.push(`🏁 **Auto-End:** ${config.autoEnd.hoursAfterLastGame}h after last game`);
    }
    
    embed.addFields({ name: '⚙️ Current Settings', value: settingsLines.join('\n') });
  } else {
    embed.addFields({ name: '⚙️ Settings', value: '⚠️ Not configured yet - click "Configure" to set up' });
  }
  
  // Show upcoming scheduled dates if enabled
  if (config.enabled && upcomingSessions.length > 0) {
    const datesList = upcomingSessions
      .slice(0, 7)
      .map(s => {
        const date = new Date(s.scheduledDate || s.startTime);
        return `• ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} (${s.games || s.gameDetails?.length || '?'} games)`;
      })
      .join('\n');
    embed.addFields({ 
      name: '📋 Upcoming Sessions', 
      value: datesList + (upcomingSessions.length > 7 ? `\n... and ${upcomingSessions.length - 7} more` : '')
    });
  }
  
  const row1 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_auto_toggle')
        .setLabel(config.enabled ? 'Disable Auto-Schedule' : 'Enable Auto-Schedule')
        .setEmoji(config.enabled ? '🔴' : '🟢')
        .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
        .setDisabled(!config.channelId), // Can't enable without configuration
      new ButtonBuilder()
        .setCustomId('schedule_auto_config_back')
        .setLabel('Configure')
        .setEmoji('⚙️')
        .setStyle(ButtonStyle.Primary)
    );
  
  const row2 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_auto_preview')
        .setLabel('Preview Schedule')
        .setEmoji('👁️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!config.channelId),
      new ButtonBuilder()
        .setCustomId('schedule_auto_run_now')
        .setLabel('Run Now')
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!config.enabled),
      new ButtonBuilder()
        .setCustomId('schedule_auto_clear')
        .setLabel('Clear Sessions')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(upcomingSessions.length === 0)
    );
  
  const backRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_main_menu')
        .setLabel('Back to Main Menu')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [row1, row2, backRow]
  });
}

/**
 * Show auto-schedule configuration menu
 */
export async function showAutoScheduleConfig(interaction, resetConfig = false) {
  // Only reset if explicitly requested (e.g., first time entering)
  if (resetConfig) {
    clearAutoScheduleEditConfig(interaction.user.id);
  }
  const config = getAutoScheduleEditConfig(interaction.user.id);
  
  const embed = new EmbedBuilder()
    .setTitle('⚙️ Configure Auto-Schedule')
    .setDescription('Set up how sessions will be automatically scheduled.')
    .setColor('#5865F2');
  
  // Current settings summary
  const settingsLines = [
    `📅 **Days Ahead:** ${config.daysAhead} days`,
    `🏀 **Min Games Required:** ${config.minGames} game${config.minGames !== 1 ? 's' : ''}`,
    `📢 **Channel:** ${config.channelId ? `<#${config.channelId}>` : '⚠️ Not set'}`,
  ];
  
  // Participants
  const participants = [];
  if (config.roleIds?.length > 0) {
    participants.push(`${config.roleIds.length} role${config.roleIds.length !== 1 ? 's' : ''}`);
  }
  if (config.userIds?.length > 0) {
    participants.push(`${config.userIds.length} user${config.userIds.length !== 1 ? 's' : ''}`);
  }
  settingsLines.push(`👥 **Participants:** ${participants.length > 0 ? participants.join(', ') : '⚠️ Not set'}`);
  
  embed.addFields({ name: '📋 Current Configuration', value: settingsLines.join('\n') });
  
  const row1 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_auto_days')
        .setLabel(`Days Ahead: ${config.daysAhead}`)
        .setEmoji('📅')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('schedule_auto_mingames')
        .setLabel(`Min Games: ${config.minGames}`)
        .setEmoji('🏀')
        .setStyle(ButtonStyle.Secondary)
    );
  
  const row2 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_auto_channel')
        .setLabel('Set Channel')
        .setEmoji('📢')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('schedule_auto_participants')
        .setLabel('Set Participants')
        .setEmoji('👥')
        .setStyle(ButtonStyle.Secondary)
    );
  
  const row3 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_auto_notifications')
        .setLabel('Notifications')
        .setEmoji('🔔')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('schedule_auto_autoend')
        .setLabel('Auto-End')
        .setEmoji('🏁')
        .setStyle(ButtonStyle.Secondary)
    );
  
  const row4 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_auto_save')
        .setLabel('Save Configuration')
        .setEmoji('💾')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('schedule_auto_menu')
        .setLabel('Cancel')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [row1, row2, row3, row4]
  });
}

/**
 * Show days ahead selector
 */
export async function showAutoScheduleDaysSelector(interaction) {
  const config = getAutoScheduleEditConfig(interaction.user.id);
  
  const embed = new EmbedBuilder()
    .setTitle('📅 Days Ahead')
    .setDescription('Select how many days in advance to auto-schedule sessions.')
    .setColor('#5865F2')
    .addFields({ name: 'Current', value: `${config.daysAhead} days` });
  
  const options = [1, 2, 3, 5, 7, 10, 14, 21, 30].map(days => 
    new StringSelectMenuOptionBuilder()
      .setLabel(`${days} day${days !== 1 ? 's' : ''}`)
      .setValue(days.toString())
      .setDefault(config.daysAhead === days)
  );
  
  const selectRow = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('schedule_auto_days_select')
        .setPlaceholder('Select days ahead')
        .addOptions(options)
    );
  
  const backRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_auto_configure')
        .setLabel('Back')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [selectRow, backRow]
  });
}

/**
 * Show min games selector
 */
export async function showAutoScheduleMinGamesSelector(interaction) {
  const config = getAutoScheduleEditConfig(interaction.user.id);
  
  const embed = new EmbedBuilder()
    .setTitle('🏀 Minimum Games Required')
    .setDescription('Set the minimum number of NBA games required to auto-schedule a session for that day.')
    .setColor('#5865F2')
    .addFields({ name: 'Current', value: `${config.minGames} game${config.minGames !== 1 ? 's' : ''}` });
  
  const options = [1, 2, 3, 4, 5, 6, 7, 8].map(games => 
    new StringSelectMenuOptionBuilder()
      .setLabel(`${games} game${games !== 1 ? 's' : ''}`)
      .setValue(games.toString())
      .setDefault(config.minGames === games)
  );
  
  const selectRow = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('schedule_auto_mingames_select')
        .setPlaceholder('Select minimum games')
        .addOptions(options)
    );
  
  const backRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_auto_config_back')
        .setLabel('Back')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [selectRow, backRow]
  });
}

/**
 * Show channel selector for auto-schedule
 */
export async function showAutoScheduleChannelSelector(interaction) {
  const config = getAutoScheduleEditConfig(interaction.user.id);
  
  const embed = new EmbedBuilder()
    .setTitle('📢 Select Channel')
    .setDescription('Choose the channel where auto-scheduled sessions will be posted.')
    .setColor('#5865F2');
  
  if (config.channelId) {
    embed.addFields({ name: 'Current', value: `<#${config.channelId}>` });
  }
  
  const channelRow = new ActionRowBuilder()
    .addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('schedule_auto_channel_select')
        .setPlaceholder('Select a channel')
        .setChannelTypes(ChannelType.GuildText)
    );
  
  const backRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_auto_config_back')
        .setLabel('Back')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [channelRow, backRow]
  });
}

/**
 * Show participants selector for auto-schedule
 */
export async function showAutoScheduleParticipantsMenu(interaction) {
  const config = getAutoScheduleEditConfig(interaction.user.id);
  
  const embed = new EmbedBuilder()
    .setTitle('👥 Set Participants')
    .setDescription('Configure who can participate in auto-scheduled sessions.')
    .setColor('#5865F2');
  
  const participantLines = [];
  if (config.roleIds?.length > 0) {
    participantLines.push(`**Roles:** ${config.roleIds.map(id => `<@&${id}>`).join(', ')}`);
  }
  if (config.userIds?.length > 0) {
    participantLines.push(`**Users:** ${config.userIds.length} user${config.userIds.length !== 1 ? 's' : ''}`);
  }
  
  if (participantLines.length > 0) {
    embed.addFields({ name: 'Current Participants', value: participantLines.join('\n') });
  } else {
    embed.addFields({ name: 'Current Participants', value: '⚠️ No participants configured' });
  }
  
  const row1 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_auto_participants_roles')
        .setLabel('Add Roles')
        .setEmoji('👑')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('schedule_auto_participants_users')
        .setLabel('Add Users')
        .setEmoji('👤')
        .setStyle(ButtonStyle.Secondary)
    );
  
  const row2 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_auto_participants_clear')
        .setLabel('Clear All')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(participantLines.length === 0),
      new ButtonBuilder()
        .setCustomId('schedule_auto_config_back')
        .setLabel('Done')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [row1, row2]
  });
}

/**
 * Show role selector for auto-schedule participants
 */
export async function showAutoScheduleRoleSelector(interaction) {
  const config = getAutoScheduleEditConfig(interaction.user.id);
  
  const embed = new EmbedBuilder()
    .setTitle('👑 Select Roles')
    .setDescription('Choose roles that can participate in auto-scheduled sessions.')
    .setColor('#5865F2');
  
  if (config.roleIds?.length > 0) {
    embed.addFields({ name: 'Current Roles', value: config.roleIds.map(id => `<@&${id}>`).join(', ') });
  }
  
  const roleRow = new ActionRowBuilder()
    .addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId('schedule_auto_roles_select')
        .setPlaceholder('Select roles')
        .setMaxValues(10)
    );
  
  const backRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_auto_participants')
        .setLabel('Back')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [roleRow, backRow]
  });
}

/**
 * Show user selector for auto-schedule participants
 */
export async function showAutoScheduleUserSelector(interaction) {
  const config = getAutoScheduleEditConfig(interaction.user.id);
  
  const embed = new EmbedBuilder()
    .setTitle('👤 Select Users')
    .setDescription('Choose specific users that can participate in auto-scheduled sessions.')
    .setColor('#5865F2');
  
  if (config.userIds?.length > 0) {
    embed.addFields({ name: 'Current Users', value: `${config.userIds.length} user${config.userIds.length !== 1 ? 's' : ''} selected` });
  }
  
  const userRow = new ActionRowBuilder()
    .addComponents(
      new UserSelectMenuBuilder()
        .setCustomId('schedule_auto_users_select')
        .setPlaceholder('Select users')
        .setMaxValues(25)
    );
  
  const backRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_auto_participants')
        .setLabel('Back')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [userRow, backRow]
  });
}

/**
 * Show notifications config for auto-schedule
 */
export async function showAutoScheduleNotifications(interaction) {
  const config = getAutoScheduleEditConfig(interaction.user.id);
  const notifs = config.notifications || {};
  
  const embed = new EmbedBuilder()
    .setTitle('🔔 Notification Settings')
    .setDescription('Configure when notifications are sent for auto-scheduled sessions.')
    .setColor('#5865F2');
  
  const lines = [
    `📣 **Announcement:** ${notifs.announcement?.enabled ? `${notifs.announcement.hoursBefore}h before first game` : 'Disabled'}`,
    `⏰ **Reminder:** ${notifs.reminder?.enabled ? `${notifs.reminder.minutesBefore}m before first game` : 'Disabled'}`,
    `⚠️ **Warning:** ${notifs.warning?.enabled ? `${notifs.warning.minutesBefore}m before first game` : 'Disabled'}`
  ];
  embed.addFields({ name: 'Current Settings', value: lines.join('\n') });
  
  const row1 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_auto_notif_announcement')
        .setLabel(`Announcement: ${notifs.announcement?.enabled ? 'ON' : 'OFF'}`)
        .setEmoji('📣')
        .setStyle(notifs.announcement?.enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('schedule_auto_notif_reminder')
        .setLabel(`Reminder: ${notifs.reminder?.enabled ? 'ON' : 'OFF'}`)
        .setEmoji('⏰')
        .setStyle(notifs.reminder?.enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
    );
  
  const row2 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_auto_notif_warning')
        .setLabel(`Warning: ${notifs.warning?.enabled ? 'ON' : 'OFF'}`)
        .setEmoji('⚠️')
        .setStyle(notifs.warning?.enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('schedule_auto_config_back')
        .setLabel('Done')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Primary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [row1, row2]
  });
}

/**
 * Show announcement time selector
 */
export async function showAutoScheduleAnnouncementSelector(interaction) {
  const config = getAutoScheduleEditConfig(interaction.user.id);
  const currentHours = config.notifications?.announcement?.hoursBefore || 9;
  const enabled = config.notifications?.announcement?.enabled ?? true;
  
  const embed = new EmbedBuilder()
    .setTitle('📣 Announcement Settings')
    .setDescription('Set when the announcement is posted before the first game.')
    .setColor('#5865F2')
    .addFields({ name: 'Current', value: enabled ? `${currentHours} hours before` : 'Disabled' });
  
  const options = [1, 2, 3, 4, 6, 8, 9, 10, 12, 18, 24].map(hours => 
    new StringSelectMenuOptionBuilder()
      .setLabel(`${hours} hour${hours !== 1 ? 's' : ''} before`)
      .setValue(hours.toString())
      .setDefault(currentHours === hours)
  );
  
  const selectRow = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('schedule_auto_announcement_select')
        .setPlaceholder('Select announcement time')
        .addOptions(options)
    );
  
  const toggleRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_auto_announcement_toggle')
        .setLabel(enabled ? 'Disable Announcement' : 'Enable Announcement')
        .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('schedule_auto_notifications')
        .setLabel('Back')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [selectRow, toggleRow]
  });
}

/**
 * Show reminder time selector
 */
export async function showAutoScheduleReminderSelector(interaction) {
  const config = getAutoScheduleEditConfig(interaction.user.id);
  const currentMins = config.notifications?.reminder?.minutesBefore || 60;
  const enabled = config.notifications?.reminder?.enabled ?? true;
  
  const embed = new EmbedBuilder()
    .setTitle('⏰ Reminder Settings')
    .setDescription('Set when the reminder is sent before the first game.')
    .setColor('#5865F2')
    .addFields({ name: 'Current', value: enabled ? `${currentMins} minutes before` : 'Disabled' });
  
  const options = [15, 30, 45, 60, 90, 120].map(mins => 
    new StringSelectMenuOptionBuilder()
      .setLabel(`${mins} minutes before`)
      .setValue(mins.toString())
      .setDefault(currentMins === mins)
  );
  
  const selectRow = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('schedule_auto_reminder_select')
        .setPlaceholder('Select reminder time')
        .addOptions(options)
    );
  
  const toggleRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_auto_reminder_toggle')
        .setLabel(enabled ? 'Disable Reminder' : 'Enable Reminder')
        .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('schedule_auto_notifications')
        .setLabel('Back')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [selectRow, toggleRow]
  });
}

/**
 * Show warning time selector
 */
export async function showAutoScheduleWarningSelector(interaction) {
  const config = getAutoScheduleEditConfig(interaction.user.id);
  const currentMins = config.notifications?.warning?.minutesBefore || 15;
  const enabled = config.notifications?.warning?.enabled ?? true;
  
  const embed = new EmbedBuilder()
    .setTitle('⚠️ Warning Settings')
    .setDescription('Set when the final warning is sent before the first game.')
    .setColor('#5865F2')
    .addFields({ name: 'Current', value: enabled ? `${currentMins} minutes before` : 'Disabled' });
  
  const options = [5, 10, 15, 20, 30].map(mins => 
    new StringSelectMenuOptionBuilder()
      .setLabel(`${mins} minutes before`)
      .setValue(mins.toString())
      .setDefault(currentMins === mins)
  );
  
  const selectRow = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('schedule_auto_warning_select')
        .setPlaceholder('Select warning time')
        .addOptions(options)
    );
  
  const toggleRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_auto_warning_toggle')
        .setLabel(enabled ? 'Disable Warning' : 'Enable Warning')
        .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('schedule_auto_notifications')
        .setLabel('Back')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [selectRow, toggleRow]
  });
}

/**
 * Show auto-end configuration
 */
export async function showAutoScheduleAutoEnd(interaction) {
  const config = getAutoScheduleEditConfig(interaction.user.id);
  const autoEnd = config.autoEnd || { enabled: false, hoursAfterLastGame: 6 };
  
  const embed = new EmbedBuilder()
    .setTitle('🏁 Auto-End Settings')
    .setDescription('Configure whether sessions automatically end after the last game.')
    .setColor('#5865F2')
    .addFields({ 
      name: 'Current', 
      value: autoEnd.enabled 
        ? `✅ Enabled - ${autoEnd.hoursAfterLastGame} hours after last game` 
        : '❌ Disabled - Sessions must be manually ended'
    });
  
  const options = [1, 2, 3, 4, 5, 6, 8, 10, 12].map(hours => 
    new StringSelectMenuOptionBuilder()
      .setLabel(`${hours} hour${hours !== 1 ? 's' : ''} after last game`)
      .setValue(hours.toString())
      .setDefault(autoEnd.hoursAfterLastGame === hours)
  );
  
  const selectRow = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('schedule_auto_autoend_select')
        .setPlaceholder('Select auto-end time')
        .addOptions(options)
    );
  
  const toggleRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_auto_autoend_toggle')
        .setLabel(autoEnd.enabled ? 'Disable Auto-End' : 'Enable Auto-End')
        .setStyle(autoEnd.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('schedule_auto_config_back')
        .setLabel('Back')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [selectRow, toggleRow]
  });
}

/**
 * Preview auto-schedule - show what days would be scheduled
 */
export async function showAutoSchedulePreview(interaction) {
  const config = getAutoScheduleConfig();
  const { getESPNGamesForDate } = await import('../utils/oddsApi.js');
  
  const embed = new EmbedBuilder()
    .setTitle('👁️ Auto-Schedule Preview')
    .setDescription(`Checking next ${config.daysAhead} days for games...`)
    .setColor('#5865F2');
  
  await interaction.editReply({
    embeds: [embed],
    components: []
  });
  
  const preview = [];
  const today = new Date();
  
  for (let i = 0; i <= config.daysAhead; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + i);
    const dateStr = checkDate.toISOString().split('T')[0];
    
    try {
      const games = await getESPNGamesForDate(dateStr);
      const upcomingGames = i === 0 
        ? games.filter(g => new Date(g.date) > new Date())
        : games;
      
      const hasExisting = hasAutoScheduledSessionForDate(dateStr);
      const meetsMin = upcomingGames.length >= config.minGames;
      
      let status;
      if (hasExisting) {
        status = '✅ Already scheduled';
      } else if (!meetsMin && upcomingGames.length > 0) {
        status = `⏭️ Only ${upcomingGames.length} game${upcomingGames.length !== 1 ? 's' : ''} (min: ${config.minGames})`;
      } else if (upcomingGames.length === 0) {
        status = '⏭️ No games';
      } else {
        status = `🆕 Would schedule (${upcomingGames.length} games)`;
      }
      
      preview.push({
        date: checkDate,
        dateStr,
        games: upcomingGames.length,
        status,
        wouldSchedule: !hasExisting && meetsMin && upcomingGames.length > 0
      });
    } catch (error) {
      console.error(`[Auto-Schedule] Error fetching games for ${dateStr}:`, error);
      preview.push({
        date: checkDate,
        dateStr,
        games: 0,
        status: '❌ Error fetching games',
        wouldSchedule: false
      });
    }
  }
  
  const wouldScheduleCount = preview.filter(p => p.wouldSchedule).length;
  
  const previewEmbed = new EmbedBuilder()
    .setTitle('👁️ Auto-Schedule Preview')
    .setDescription(
      `Based on current settings, **${wouldScheduleCount}** new session${wouldScheduleCount !== 1 ? 's' : ''} would be scheduled.\n\n` +
      `**Settings:** ${config.daysAhead} days ahead, minimum ${config.minGames} game${config.minGames !== 1 ? 's' : ''}`
    )
    .setColor('#5865F2');
  
  const previewLines = preview.map(p => {
    const dateDisplay = p.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return `${p.status}\n└ ${dateDisplay}`;
  });
  
  // Split into chunks if too long
  const chunkSize = 7;
  for (let i = 0; i < previewLines.length; i += chunkSize) {
    const chunk = previewLines.slice(i, i + chunkSize);
    previewEmbed.addFields({
      name: i === 0 ? '📅 Schedule Preview' : '\u200b',
      value: chunk.join('\n'),
      inline: false
    });
  }
  
  const backRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_auto_menu')
        .setLabel('Back to Auto-Schedule')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [previewEmbed],
    components: [backRow]
  });
}

/**
 * Run auto-scheduler now
 */
export async function runAutoSchedulerNow(interaction) {
  const config = getAutoScheduleConfig();
  
  if (!config.enabled || !config.channelId) {
    const embed = new EmbedBuilder()
      .setTitle('⚠️ Cannot Run')
      .setDescription('Auto-scheduling must be enabled and configured before running.')
      .setColor('#ED4245');
    
    await interaction.editReply({
      embeds: [embed],
      components: []
    });
    
    setTimeout(async () => {
      await showAutoScheduleMenu(interaction);
    }, 2000);
    return;
  }
  
  const embed = new EmbedBuilder()
    .setTitle('▶️ Running Auto-Scheduler')
    .setDescription('Checking for games and scheduling sessions...')
    .setColor('#5865F2');
  
  await interaction.editReply({
    embeds: [embed],
    components: []
  });
  
  const { getESPNGamesForDate } = await import('../utils/oddsApi.js');
  const { createSchedulerHandlers } = await import('../utils/sessionScheduler.js');
  
  const handlers = createSchedulerHandlers(interaction.client);
  const today = new Date();
  let sessionsCreated = 0;
  let sessionsSkipped = 0;
  const createdSessions = [];
  
  for (let i = 0; i <= config.daysAhead; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + i);
    const dateStr = checkDate.toISOString().split('T')[0];
    
    // Skip if already has session
    if (hasAutoScheduledSessionForDate(dateStr)) {
      sessionsSkipped++;
      continue;
    }
    
    try {
      const games = await getESPNGamesForDate(dateStr);
      const upcomingGames = i === 0 
        ? games.filter(g => new Date(g.date) > new Date())
        : games;
      
      if (upcomingGames.length < config.minGames) {
        continue;
      }
      
      // Create the session
      const session = await createAutoScheduledSession(interaction.client, dateStr, upcomingGames, config);
      if (session) {
        sessionsCreated++;
        createdSessions.push({
          date: checkDate,
          games: upcomingGames.length
        });
        
        // Schedule cron jobs
        scheduleSessionJobs(session, handlers, true);
      }
    } catch (error) {
      console.error(`[Auto-Schedule] Error scheduling for ${dateStr}:`, error);
    }
  }
  
  const resultEmbed = new EmbedBuilder()
    .setTitle('✅ Auto-Scheduler Complete')
    .setDescription(
      `**Created:** ${sessionsCreated} session${sessionsCreated !== 1 ? 's' : ''}\n` +
      `**Skipped:** ${sessionsSkipped} (already scheduled)`
    )
    .setColor('#57F287');
  
  if (createdSessions.length > 0) {
    const sessionList = createdSessions.map(s => {
      const dateDisplay = s.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      return `• ${dateDisplay} (${s.games} games)`;
    }).join('\n');
    resultEmbed.addFields({ name: '📅 Sessions Created', value: sessionList });
  }
  
  const backRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_auto_menu')
        .setLabel('Back to Auto-Schedule')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [resultEmbed],
    components: [backRow]
  });
}

/**
 * Create an auto-scheduled session for a specific date
 */
async function createAutoScheduledSession(client, dateStr, games, config) {
  // Sort games by start time
  games.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  const firstGame = games[0];
  const lastGame = games[games.length - 1];
  const firstGameTime = new Date(firstGame.date);
  const lastGameTime = new Date(lastGame.date);
  
  // Calculate announcement time
  const announcementHours = config.notifications?.announcement?.hoursBefore || 9;
  const announcementTime = new Date(firstGameTime.getTime() - (announcementHours * 60 * 60 * 1000));
  
  // Calculate auto-end time if enabled
  let autoEndTime = null;
  if (config.autoEnd?.enabled) {
    autoEndTime = new Date(lastGameTime.getTime() + (config.autoEnd.hoursAfterLastGame * 60 * 60 * 1000));
  }
  
  // Build game details
  const gameDetails = games.map(game => ({
    awayTeam: game.awayTeam?.displayName || game.awayTeam,
    homeTeam: game.homeTeam?.displayName || game.homeTeam,
    awayAbbr: game.awayTeam?.abbreviation || game.awayAbbr,
    homeAbbr: game.homeTeam?.abbreviation || game.homeAbbr,
    startTime: game.date
  }));
  
  // Create session config
  const sessionConfig = {
    guildId: config.guildId,
    channelId: config.channelId,
    scheduledDate: dateStr,
    startTime: firstGameTime.toISOString(),
    firstGameTime: firstGameTime.toISOString(),
    games: games.length,
    gameDetails: gameDetails,
    participantType: 'users',
    roleIds: config.roleIds || [],
    userIds: config.userIds || [],
    autoEnd: config.autoEnd?.enabled ? {
      enabled: true,
      time: autoEndTime.toISOString(),
      hoursAfterLastGame: config.autoEnd.hoursAfterLastGame
    } : { enabled: false },
    notifications: {
      announcement: {
        enabled: config.notifications?.announcement?.enabled ?? true,
        time: announcementTime.toISOString(),
        hoursBefore: announcementHours
      },
      reminder: {
        enabled: config.notifications?.reminder?.enabled ?? true,
        minutesBefore: config.notifications?.reminder?.minutesBefore || 60
      },
      warning: {
        enabled: config.notifications?.warning?.enabled ?? true,
        minutesBefore: config.notifications?.warning?.minutesBefore || 15
      }
    },
    createdBy: config.createdBy || 'auto',
    createdByUsername: config.createdByUsername || 'Auto-Scheduler',
    autoScheduled: true
  };
  
  // Add the session
  const session = addScheduledSession(sessionConfig);
  console.log(`[Auto-Schedule] Created session ${session.id} for ${dateStr} with ${games.length} games`);
  
  return session;
}

/**
 * Toggle auto-scheduling on/off
 */
export async function toggleAutoSchedule(interaction) {
  const config = getAutoScheduleConfig();
  
  if (!config.channelId) {
    const embed = new EmbedBuilder()
      .setTitle('⚠️ Configuration Required')
      .setDescription('You must configure auto-scheduling settings before enabling it.')
      .setColor('#ED4245');
    
    await interaction.editReply({
      embeds: [embed],
      components: []
    });
    
    setTimeout(async () => {
      await showAutoScheduleConfig(interaction);
    }, 2000);
    return;
  }
  
  const wasEnabled = config.enabled;
  config.enabled = !wasEnabled;
  saveAutoScheduleConfig(config);
  
  if (!config.enabled) {
    // Disabling - remove all auto-scheduled sessions
    const result = deleteAutoScheduledSessions();
    
    const embed = new EmbedBuilder()
      .setTitle('🔴 Auto-Schedule Disabled')
      .setDescription(
        `Auto-scheduling has been disabled.\n\n` +
        `**Sessions Removed:** ${result.count}`
      )
      .setColor('#ED4245');
    
    await interaction.editReply({
      embeds: [embed],
      components: []
    });
  } else {
    // Enabling - schedule sessions
    const embed = new EmbedBuilder()
      .setTitle('🟢 Auto-Schedule Enabled')
      .setDescription('Auto-scheduling has been enabled. Running initial schedule...')
      .setColor('#57F287');
    
    await interaction.editReply({
      embeds: [embed],
      components: []
    });
    
    // Run the auto-scheduler
    await runAutoSchedulerNow(interaction);
    return;
  }
  
  setTimeout(async () => {
    await showAutoScheduleMenu(interaction);
  }, 2500);
}

/**
 * Clear all auto-scheduled sessions
 */
export async function clearAutoScheduledSessions(interaction) {
  const result = deleteAutoScheduledSessions();
  
  const embed = new EmbedBuilder()
    .setTitle('🗑️ Cleared Auto-Scheduled Sessions')
    .setDescription(
      result.count > 0
        ? `Deleted **${result.count}** auto-scheduled session${result.count !== 1 ? 's' : ''}.`
        : 'No auto-scheduled sessions to clear.'
    )
    .setColor(result.count > 0 ? '#57F287' : '#FFA500');
  
  await interaction.editReply({
    embeds: [embed],
    components: []
  });
  
  setTimeout(async () => {
    await showAutoScheduleMenu(interaction);
  }, 2500);
}

