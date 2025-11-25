import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { getAllScheduledSessions, getScheduledSession, deleteScheduledSession, getAllTemplates, getTemplate, deleteTemplate, addScheduledSession, saveTemplate } from '../utils/sessionScheduler.js';
import { getNBAGamesWithSpreads } from '../utils/oddsApi.js';

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
      participantType: 'role', // 'role' or 'users'
      roleId: null,
      specificUsers: [],
      notifications: {
        announcement: { enabled: true, hoursBefore: 9 },
        reminder: { enabled: true, minutesBefore: 60 },
        warning: { enabled: true, minutesBefore: 15 }
      }
    });
  }
  return sessionConfigs.get(userId);
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
  
  // Fetch next 7 days of games
  const today = new Date();
  const datesWithGames = [];
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    
    try {
      const games = await getNBAGamesWithSpreads(dateStr);
      if (games && games.length > 0) {
        datesWithGames.push({
          date: dateStr,
          dateObj: date,
          gameCount: games.length,
          games: games
        });
      }
    } catch (error) {
      console.error(`Error fetching games for ${dateStr}:`, error);
    }
  }
  
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
    const games = await getNBAGamesWithSpreads(selectedDate);
    
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
  announcementTime.setHours(announcementTime.getHours() - config.notifications.announcement.hoursBefore);
  
  const embed = new EmbedBuilder()
    .setTitle('⚙️ Configure Session')
    .setColor('#5865F2')
    .addFields(
      {
        name: '📅 Session Details',
        value: [
          `**Date:** ${dateDisplay}`,
          `**Games:** ${selectedGames.length} selected`,
          `**First Game:** ${firstGame.awayTeam} @ ${firstGame.homeTeam} - ${firstGameTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`
        ].join('\n')
      },
      {
        name: '📍 Channel',
        value: config.channelId ? `<#${config.channelId}>` : '❌ Not set - Click "Set Channel" below'
      },
      {
        name: '👥 Participants',
        value: config.participantType === 'role'
          ? (config.roleId ? `<@&${config.roleId}>` : '❌ Not set - Click "Set Participants" below')
          : (config.specificUsers.length > 0 ? `${config.specificUsers.length} user(s) selected` : '❌ Not set - Click "Set Participants" below')
      },
      {
        name: '🔔 Notifications',
        value: [
          `📢 Announcement: ${config.notifications.announcement.enabled ? `✅ ${announcementTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} (${config.notifications.announcement.hoursBefore}h before)` : '❌ Disabled'}`,
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
        .setDisabled(!config.channelId || (!config.roleId && config.specificUsers.length === 0)),
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

// Export helper functions
export { getSessionConfig, clearSessionConfig };
