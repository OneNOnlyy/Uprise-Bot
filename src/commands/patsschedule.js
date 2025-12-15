import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { getAllScheduledSessions, getScheduledSession, deleteScheduledSession, getAllTemplates, getTemplate, deleteTemplate, addScheduledSession, saveTemplate, updateScheduledSession, scheduleSessionJobs } from '../utils/sessionScheduler.js';
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
  const embed = new EmbedBuilder()
    .setTitle('📅 Schedule PATS Session')
    .setDescription('Choose an option to schedule and manage PATS sessions.')
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
        .setCustomId('schedule_auto_schedule')
        .setLabel('Auto-Schedule Today')
        .setEmoji('🤖')
        .setStyle(ButtonStyle.Success),
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

/**
 * Auto-schedule a session for today
 */
export async function autoScheduleToday(interaction) {
  const { getESPNGamesForDate } = await import('../utils/nbaScores.js');
  
  // Get today's date
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const dateDisplay = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  
  // Check if there's already a session scheduled for today
  const existingSessions = getAllScheduledSessions().filter(s => !s.seasonId);
  const todaySession = existingSessions.find(s => {
    const sessionDate = new Date(s.startTime).toISOString().split('T')[0];
    return sessionDate === dateStr;
  });
  
  if (todaySession) {
    const embed = new EmbedBuilder()
      .setColor(0xFF6B35)
      .setTitle('⚠️ Session Already Exists')
      .setDescription(`A session is already scheduled for today (${dateDisplay}).\n\nUse "View Scheduled Sessions" to manage it.`)
      .setTimestamp();
    
    await interaction.editReply({
      embeds: [embed],
      components: []
    });
    
    setTimeout(async () => {
      await showMainMenu(interaction);
    }, 3000);
    return;
  }
  
  // Fetch today's games
  let games;
  try {
    games = await getESPNGamesForDate(dateStr);
  } catch (error) {
    console.error('[SCHEDULE] Error fetching games:', error);
    
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('❌ Error')
      .setDescription('Failed to fetch today\'s games. Please try again later.')
      .setTimestamp();
    
    await interaction.editReply({
      embeds: [embed],
      components: []
    });
    
    setTimeout(async () => {
      await showMainMenu(interaction);
    }, 3000);
    return;
  }
  
  // Filter to games that haven't started yet
  const now = new Date();
  const upcomingGames = games.filter(g => new Date(g.date) > now);
  
  if (upcomingGames.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xFF6B35)
      .setTitle('⚠️ No Games Today')
      .setDescription(`There are no upcoming NBA games today (${dateDisplay}).`)
      .setTimestamp();
    
    await interaction.editReply({
      embeds: [embed],
      components: []
    });
    
    setTimeout(async () => {
      await showMainMenu(interaction);
    }, 3000);
    return;
  }
  
  // Pre-select all upcoming games
  clearSessionConfig(interaction.user.id);
  const config = getSessionConfig(interaction.user.id);
  config.selectedDate = dateStr;
  config.games = upcomingGames;
  config.selectedGameIndices = upcomingGames.map((_, index) => index);
  
  // Show success message and go to configuration
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('✅ Games Auto-Selected')
    .setDescription(
      `Found **${upcomingGames.length}** upcoming game${upcomingGames.length !== 1 ? 's' : ''} for today (${dateDisplay}).\n\n` +
      upcomingGames.map(g => `**${g.awayTeam.displayName}** @ **${g.homeTeam.displayName}**`).join('\n') +
      '\n\nProceed to configure your session settings.'
    )
    .setTimestamp();
  
  const continueButton = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`schedule_continue_config_${dateStr}`)
        .setLabel('Continue to Settings')
        .setEmoji('⚙️')
        .setStyle(ButtonStyle.Primary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [continueButton]
  });
}
