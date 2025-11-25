import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import { getAllScheduledSessions, getScheduledSession, deleteScheduledSession, getAllTemplates, getTemplate, deleteTemplate, addScheduledSession, saveTemplate } from '../utils/sessionScheduler.js';

export const data = new SlashCommandBuilder()
  .setName('patsschedule')
  .setDescription('Schedule PATS sessions in advance with automatic notifications');

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  await showMainMenu(interaction);
}

/**
 * Show main menu
 */
async function showMainMenu(interaction) {
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
        .setCustomId('schedule_view_sessions')
        .setLabel('View Scheduled Sessions')
        .setEmoji('📋')
        .setStyle(ButtonStyle.Secondary),
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
    components: [buttons, cancelRow]
  });
}

/**
 * Show view scheduled sessions
 */
export async function showScheduledSessions(interaction) {
  const sessions = getAllScheduledSessions();
  const now = new Date();
  
  // Filter to upcoming sessions only
  const upcomingSessions = sessions.filter(s => new Date(s.firstGameTime) > now);
  
  if (upcomingSessions.length === 0) {
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
  
  const embed = new EmbedBuilder()
    .setTitle('📋 Scheduled Sessions')
    .setDescription(`${upcomingSessions.length} upcoming session${upcomingSessions.length === 1 ? '' : 's'}`)
    .setColor('#5865F2');
  
  // Add each session as a field
  upcomingSessions.slice(0, 10).forEach((session, index) => {
    const date = new Date(session.scheduledDate);
    const firstGame = session.gameDetails[0];
    const channelMention = `<#${session.channelId}>`;
    
    const participantText = session.participantType === 'role' 
      ? `<@&${session.roleId}>`
      : `${session.specificUsers.length} user${session.specificUsers.length === 1 ? '' : 's'}`;
    
    embed.addFields({
      name: `${index + 1}. ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
      value: [
        `🎮 **${session.games.length} games**`,
        `⏰ First game: ${firstGame.matchup} @ ${new Date(firstGame.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`,
        `📍 Channel: ${channelMention}`,
        `👥 Participants: ${participantText}`,
        `👤 Created by: ${session.createdByUsername || 'Unknown'}`
      ].join('\n'),
      inline: false
    });
  });
  
  if (upcomingSessions.length > 10) {
    embed.setFooter({ text: `Showing first 10 of ${upcomingSessions.length} sessions` });
  }
  
  // Create manage buttons for first 5 sessions
  const manageButtons = new ActionRowBuilder();
  upcomingSessions.slice(0, 5).forEach((session, index) => {
    manageButtons.addComponents(
      new ButtonBuilder()
        .setCustomId(`schedule_manage_${session.id}`)
        .setLabel(`Manage ${index + 1}`)
        .setStyle(ButtonStyle.Primary)
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
  
  const date = new Date(session.scheduledDate);
  const firstGameTime = new Date(session.firstGameTime);
  const now = new Date();
  const timeUntilStart = firstGameTime - now;
  const hoursUntil = Math.floor(timeUntilStart / (1000 * 60 * 60));
  
  const statusText = hoursUntil > 0 
    ? `Scheduled (starts in ${hoursUntil} hour${hoursUntil === 1 ? '' : 's'})`
    : 'Starting soon';
  
  const channelMention = `<#${session.channelId}>`;
  const participantText = session.participantType === 'role'
    ? `<@&${session.roleId}>`
    : session.specificUsers.map(uid => `<@${uid}>`).join(', ');
  
  const firstGame = session.gameDetails[0];
  
  const embed = new EmbedBuilder()
    .setTitle(`⚙️ Manage Session: ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`)
    .setColor('#5865F2')
    .addFields(
      {
        name: '📅 Session Details',
        value: [
          `**Date:** ${session.scheduledDate}`,
          `**Games:** ${session.games.length}`,
          `**First Game:** ${new Date(firstGame.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })} (${firstGame.matchup})`,
          `**Channel:** ${channelMention}`,
          `**Participants:** ${participantText}`
        ].join('\n')
      },
      {
        name: '🔔 Notifications',
        value: [
          `**Announcement:** ${session.notifications.announcement.enabled ? '✅ Enabled' : '❌ Disabled'}`,
          `**Reminder:** ${session.notifications.reminder.enabled ? `✅ ${session.notifications.reminder.minutesBefore} min before` : '❌ Disabled'}`,
          `**Warning:** ${session.notifications.warning.enabled ? `✅ ${session.notifications.warning.minutesBefore} min before` : '❌ Disabled'}`
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
    const participantText = template.participantType === 'role'
      ? `<@&${template.roleId}>`
      : `${template.specificUsers.length} user${template.specificUsers.length === 1 ? '' : 's'}`;
    
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
