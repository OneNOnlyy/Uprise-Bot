import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, UserSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { 
  getCurrentSeason, 
  createSeason, 
  endSeason, 
  addSeasonParticipant, 
  removeSeasonParticipant, 
  getSeasonStandings,
  updateSeasonScheduleSettings,
  getSeasonSchedule,
  addScheduledSession,
  removeScheduledSession,
  isUserInCurrentSeason,
  getSeasonHistory,
  getSessionsInSeason,
  getSeasonById,
  runAutoSchedulerCheck
} from '../utils/patsSeasons.js';
import { getAllPlayers, readPATSData, writePATSData } from '../utils/patsData.js';
import { getESPNGamesForDate } from '../utils/oddsApi.js';
import { scheduleSessionJobs } from '../utils/sessionScheduler.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEASON_CONFIG_FILE = path.join(__dirname, '../../data/season-creation-configs.json');

// PATS Role ID for auto-adding members
const PATS_ROLE_ID = '1445979227525746798';

// Store in-progress season configurations (userId -> config)
const seasonConfigs = new Map();

/**
 * Load saved season configs from file
 */
async function loadSeasonConfigs() {
  try {
    const data = await fs.readFile(SEASON_CONFIG_FILE, 'utf-8');
    const configs = JSON.parse(data);
    
    // Restore configs to Map
    for (const [userId, config] of Object.entries(configs)) {
      seasonConfigs.set(userId, config);
    }
    
    console.log(`[Season Creation] Loaded ${seasonConfigs.size} saved season configs`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('[Season Creation] No saved configs found, starting fresh');
    } else {
      console.error('[Season Creation] Error loading configs:', error);
    }
  }
}

/**
 * Save season configs to file
 */
async function saveSeasonConfigs() {
  try {
    const configs = Object.fromEntries(seasonConfigs);
    await fs.writeFile(SEASON_CONFIG_FILE, JSON.stringify(configs, null, 2));
    console.log(`[Season Creation] Saved ${seasonConfigs.size} season configs to file`);
  } catch (error) {
    console.error('[Season Creation] Error saving configs:', error);
  }
}

// Load configs on module initialization
loadSeasonConfigs();

/**
 * Create notification handlers for the scheduler
 * @param {Client} client - Discord client
 * @returns {object} Handlers object
 */
function createSchedulerHandlers(client) {
  return {
    sendAnnouncement: async (session) => {
      const { sendSessionAnnouncement, startScheduledSession } = await import('../utils/sessionScheduler.js');
      await sendSessionAnnouncement(client, session);
      // Start the PATS session when announcement is sent
      await startScheduledSession(client, session);
    },
    sendReminders: async (session) => {
      const { sendSessionReminder } = await import('../utils/sessionScheduler.js');
      await sendSessionReminder(client, session);
    },
    sendWarnings: async (session) => {
      // Session warnings disabled - we use individual game warnings instead
      console.log(`[Scheduler] Session warning skipped for ${session.id} (using game warnings instead)`);
    },
    startSession: async (session) => {
      // Session already started at announcement time - no action needed
      console.log(`[Scheduler] First game time reached for session ${session.id} (already started at announcement)`);
    }
  };
}

/**
 * Get or create season config for user
 */
function getSeasonConfig(userId) {
  if (!seasonConfigs.has(userId)) {
    seasonConfigs.set(userId, {
      step: 1,
      name: '',
      type: 'monthly',
      startDate: null,
      endDate: null,
      participants: [],
      schedule: {
        enabled: false,
        channelId: null,
        sessionStartMinutes: 60,
        announcementMinutes: 60,
        sessionType: 'season',
        daysAhead: 7, // Default to 1 week ahead
        reminders: {
          enabled: true,
          minutes: [60, 30],
          dm: true
        },
        warnings: {
          enabled: true,
          minutes: [30, 10],
          dm: true
        }
      }
    });
    // Auto-save when creating new config
    saveSeasonConfigs();
  }
  return seasonConfigs.get(userId);
}

/**
 * Clear season config for user
 */
async function clearSeasonConfig(userId) {
  seasonConfigs.delete(userId);
  await saveSeasonConfigs();
}

/**
 * Update config and auto-save to file
 */
async function updateSeasonConfig(userId, updates) {
  const config = getSeasonConfig(userId);
  Object.assign(config, updates);
  await saveSeasonConfigs();
  return config;
}

/**
 * Update all upcoming scheduled sessions for a season with new settings
 * @param {string} seasonId - Season ID
 * @param {object} settings - Settings to update (announcementMinutes, sessionType, channelId, notifications)
 */
async function updateUpcomingSessionSettings(seasonId, settings) {
  try {
    const { getAllScheduledSessions, updateScheduledSession } = await import('../utils/sessionScheduler.js');
    const allSessions = getAllScheduledSessions();
    
    // Filter to only this season's upcoming sessions
    const now = new Date();
    const upcomingSessions = allSessions.filter(s => 
      s.seasonId === seasonId && 
      new Date(s.firstGameTime) > now &&
      !s.sentNotifications?.announcement // Don't update if announcement already sent
    );
    
    for (const session of upcomingSessions) {
      const updates = {};
      
      // Update session type
      if (settings.sessionType !== undefined) {
        updates.sessionType = settings.sessionType;
      }
      
      // Update channel
      if (settings.channelId !== undefined) {
        updates.channelId = settings.channelId;
      }
      
      // Update announcement time
      if (settings.announcementMinutes !== undefined) {
        const firstGameTime = new Date(session.firstGameTime);
        const newAnnouncementTime = new Date(firstGameTime.getTime() - (settings.announcementMinutes * 60 * 1000));
        
        updates.notifications = {
          ...session.notifications,
          announcement: {
            ...session.notifications.announcement,
            time: newAnnouncementTime.toISOString()
          }
        };
      }
      
      // Update notification settings (merge with existing)
      if (settings.notifications) {
        updates.notifications = {
          ...(updates.notifications || session.notifications),
          ...settings.notifications
        };
        
        // Deep merge for nested notification properties
        if (settings.notifications.reminder) {
          updates.notifications.reminder = {
            ...session.notifications.reminder,
            ...settings.notifications.reminder
          };
        }
        if (settings.notifications.warning) {
          updates.notifications.warning = {
            ...session.notifications.warning,
            ...settings.notifications.warning
          };
        }
      }
      
      // Only update if there are changes
      if (Object.keys(updates).length > 0) {
        updateScheduledSession(session.id, updates);
        console.log(`[Season Settings] Updated session ${session.id} with new settings`);
      }
    }
    
    if (upcomingSessions.length > 0) {
      console.log(`[Season Settings] Updated ${upcomingSessions.length} upcoming session(s) for season ${seasonId}`);
    }
  } catch (error) {
    console.error('[Season Settings] Error updating upcoming sessions:', error);
  }
}

export const data = new SlashCommandBuilder()
  .setName('patsseason')
  .setDescription('Manage PATS Seasons (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    await showSeasonAdminMenu(interaction);
  } catch (error) {
    console.error('Error in patsseason execute:', error);
    await interaction.editReply({
      content: '❌ An error occurred. Please try again.',
      embeds: [],
      components: []
    });
  }
}

/**
 * Show main Season Admin menu
 */
export async function showSeasonAdminMenu(interaction) {
  const currentSeason = getCurrentSeason();
  
  // Check if user has a saved in-progress season creation
  const hasSavedConfig = seasonConfigs.has(interaction.user.id);
  
  const embed = new EmbedBuilder()
    .setTitle('⚙️ PATS Season Admin')
    .setColor('#5865F2');
  
  if (currentSeason) {
    const standings = getSeasonStandings(currentSeason.id);
    const schedule = getSeasonSchedule(currentSeason.id);
    
    embed.setDescription(
      `📅 **Current Season:** ${currentSeason.name}\n` +
      `└ Status: Active • ${standings.length} participant${standings.length !== 1 ? 's' : ''}\n` +
      `└ Auto-Schedule: ${currentSeason.schedule?.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
      `└ Sessions: ${currentSeason.sessionCount || 0}`
    );
    
    // Show date range
    const startDate = new Date(currentSeason.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endDate = new Date(currentSeason.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    embed.addFields({ name: '🗓️ Duration', value: `${startDate} - ${endDate}`, inline: true });
    
    if (schedule.sessions && schedule.sessions.length > 0) {
      const sessionText = schedule.total > 7 
        ? `${schedule.sessions.length} shown (${schedule.total} total)`
        : `${schedule.sessions.length} upcoming`;
      embed.addFields({ name: '📅 Scheduled Sessions', value: sessionText, inline: true });
    }
  } else {
    embed.setDescription(
      '📅 **No Active Season**\n\n' +
      'Create a new season to start tracking standings, awards, and auto-scheduling sessions.' +
      (hasSavedConfig ? '\n\n💾 **You have a saved season in progress!** Click "Create Season" to continue.' : '')
    );
  }
  
  embed.setFooter({ text: 'Seasons are optional - PATS works without them' });
  
  // Buttons row 1
  const row1 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_create')
        .setLabel('Create Season')
        .setEmoji('➕')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!!currentSeason), // Disable if season exists
      new ButtonBuilder()
        .setCustomId('pats_season_settings')
        .setLabel('Season Settings')
        .setEmoji('⚙️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!currentSeason)
    );
  
  // Buttons row 2
  const row2 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_participants')
        .setLabel('Manage Participants')
        .setEmoji('👥')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!currentSeason),
      new ButtonBuilder()
        .setCustomId('pats_season_schedule')
        .setLabel('Manage Schedule')
        .setEmoji('📅')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!currentSeason)
    );
  
  // Buttons row 3
  const row3 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_history')
        .setLabel('Season History')
        .setEmoji('📜')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('pats_season_end')
        .setLabel('End Season Early')
        .setEmoji('🏁')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!currentSeason),
      new ButtonBuilder()
        .setCustomId('pats_season_back')
        .setLabel('Back')
        .setEmoji('🔙')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [row1, row2, row3]
  });
}

/**
 * Show Create Season Wizard - Step 1: Basic Info
 */
export async function showCreateSeasonStep1(interaction) {
  const config = getSeasonConfig(interaction.user.id);
  config.step = 1;
  
  // Default name to next month
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const defaultName = nextMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  
  if (!config.name) {
    config.name = defaultName;
  }
  
  // Default dates for monthly
  if (!config.startDate) {
    config.startDate = nextMonth.toISOString().split('T')[0];
    const endOfMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0);
    config.endDate = endOfMonth.toISOString().split('T')[0];
  }
  
  // Auto-save progress
  await saveSeasonConfigs();
  
  const embed = new EmbedBuilder()
    .setTitle('➕ Create New Season (1/4)')
    .setDescription('📝 **Basic Information**')
    .setColor('#5865F2')
    .addFields(
      { name: '📛 Season Name', value: `\`${config.name}\``, inline: true },
      { name: '📆 Type', value: `\`${config.type}\``, inline: true },
      { name: '🗓️ Dates', value: `\`${config.startDate}\` to \`${config.endDate}\``, inline: false }
    )
    .setFooter({ text: 'Step 1 of 4 • Progress auto-saved 💾' });
  
  const typeSelect = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('pats_season_create_type')
        .setPlaceholder('Select Season Type')
        .addOptions([
          { label: 'Weekly (7 days)', value: 'weekly', description: 'Short competition period', emoji: '📅' },
          { label: 'Biweekly (14 days)', value: 'biweekly', description: 'Two week competition', emoji: '📆' },
          { label: 'Monthly (calendar month)', value: 'monthly', description: 'Full month competition', emoji: '🗓️', default: config.type === 'monthly' },
          { label: 'Custom (set dates)', value: 'custom', description: 'Choose your own dates', emoji: '⚙️' }
        ])
    );
  
  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_create_edit_name')
        .setLabel('Edit Name')
        .setEmoji('✏️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('pats_season_create_edit_dates')
        .setLabel('Edit Dates')
        .setEmoji('📅')
        .setStyle(ButtonStyle.Secondary)
    );
  
  const navButtons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_create_cancel')
        .setLabel('Cancel')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('pats_season_create_next_2')
        .setLabel('Next: Participants')
        .setEmoji('➡️')
        .setStyle(ButtonStyle.Primary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [typeSelect, buttons, navButtons]
  });
}

/**
 * Show Create Season Wizard - Step 2: Participants
 */
export async function showCreateSeasonStep2(interaction) {
  const config = getSeasonConfig(interaction.user.id);
  config.step = 2;
  await saveSeasonConfigs();
  
  const allPlayers = getAllPlayers();
  const participantList = config.participants.length > 0 
    ? config.participants.map(p => `• <@${p}>`).join('\n')
    : '_No participants selected_';
  
  const embed = new EmbedBuilder()
    .setTitle('➕ Create New Season (2/4)')
    .setDescription('👥 **Select Participants**')
    .setColor('#5865F2')
    .addFields(
      { name: `Selected (${config.participants.length})`, value: participantList }
    )
    .setFooter({ text: 'Step 2 of 4 • Progress auto-saved 💾' });
  
  const userSelect = new ActionRowBuilder()
    .addComponents(
      new UserSelectMenuBuilder()
        .setCustomId('pats_season_create_select_users')
        .setPlaceholder('Select participants...')
        .setMinValues(0)
        .setMaxValues(25)
    );
  
  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_create_add_role')
        .setLabel('Add All PATS Role Members')
        .setEmoji('📋')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('pats_season_create_clear_participants')
        .setLabel('Clear All')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(config.participants.length === 0)
    );
  
  const navButtons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_create_back_1')
        .setLabel('Back')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('pats_season_create_next_3')
        .setLabel('Next: Schedule Settings')
        .setEmoji('➡️')
        .setStyle(ButtonStyle.Primary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [userSelect, buttons, navButtons]
  });
}

/**
 * Show Create Season Wizard - Step 3: Schedule Settings
 */
export async function showCreateSeasonStep3(interaction) {
  const config = getSeasonConfig(interaction.user.id);
  config.step = 3;
  await saveSeasonConfigs();
  
  const schedule = config.schedule;
  
  const embed = new EmbedBuilder()
    .setTitle('➕ Create New Season (3/4)')
    .setDescription('📅 **Schedule Settings**')
    .setColor('#5865F2')
    .addFields(
      { name: '🤖 Auto-Schedule Sessions', value: schedule.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
      { name: '📢 Announcement Channel', value: schedule.channelId ? `<#${schedule.channelId}>` : '_Not set_', inline: true },
      { name: '⏰ Session Start', value: `${schedule.sessionStartMinutes} min before first game`, inline: true },
      { name: '📣 Announcement', value: `${schedule.announcementMinutes} min before session`, inline: true },
      { name: '🔔 Reminders', value: schedule.reminders.enabled ? `__${schedule.reminders.minutes.join(' min, ')} min__${schedule.reminders.dm ? ' (DM)' : ''}` : '❌ Disabled', inline: true },
      { name: '⚠️ Warnings', value: schedule.warnings.enabled ? `__${schedule.warnings.minutes.join(' min, ')} min__${schedule.warnings.dm ? ' (DM)' : ''}` : '❌ Disabled', inline: true }
    )
    .setFooter({ text: 'Step 3 of 4 • Progress auto-saved 💾' });
  
  const toggleRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_create_toggle_auto')
        .setLabel(schedule.enabled ? 'Disable Auto-Schedule' : 'Enable Auto-Schedule')
        .setEmoji(schedule.enabled ? '❌' : '✅')
        .setStyle(schedule.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
    );
  
  const channelSelect = new ActionRowBuilder()
    .addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('pats_season_create_select_channel')
        .setPlaceholder('Select announcement channel...')
        .setChannelTypes(ChannelType.GuildText)
    );
  
  const settingsRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_create_edit_timing')
        .setLabel('Edit Timing')
        .setEmoji('⏰')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('pats_season_create_toggle_reminders')
        .setLabel(schedule.reminders.enabled ? 'Disable Reminders' : 'Enable Reminders')
        .setEmoji('🔔')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('pats_season_create_toggle_warnings')
        .setLabel(schedule.warnings.enabled ? 'Disable Warnings' : 'Enable Warnings')
        .setEmoji('⚠️')
        .setStyle(ButtonStyle.Secondary)
    );
  
  const navButtons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_create_back_2')
        .setLabel('Back')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('pats_season_create_next_4')
        .setLabel('Next: Review')
        .setEmoji('➡️')
        .setStyle(ButtonStyle.Primary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [toggleRow, channelSelect, settingsRow, navButtons]
  });
}

/**
 * Show Create Season Wizard - Step 4: Review
 */
export async function showCreateSeasonStep4(interaction) {
  const config = getSeasonConfig(interaction.user.id);
  config.step = 4;
  await saveSeasonConfigs();
  
  const schedule = config.schedule;
  
  const participantList = config.participants.length > 0 
    ? config.participants.slice(0, 10).map(p => `• <@${p}>`).join('\n') + 
      (config.participants.length > 10 ? `\n_...and ${config.participants.length - 10} more_` : '')
    : '_No participants selected_';
  
  const embed = new EmbedBuilder()
    .setTitle('➕ Create New Season (4/4)')
    .setDescription('📋 **Review Season Settings**')
    .setColor('#5865F2')
    .addFields(
      { name: '📅 Season', value: config.name, inline: true },
      { name: '📆 Type', value: config.type, inline: true },
      { name: '🗓️ Dates', value: `${config.startDate} to ${config.endDate}`, inline: false },
      { name: `👥 Participants (${config.participants.length})`, value: participantList, inline: false },
      { name: '⚙️ Schedule Settings', value: 
        `• Auto-Schedule: ${schedule.enabled ? 'Enabled' : 'Disabled'}\n` +
        `• Channel: ${schedule.channelId ? `<#${schedule.channelId}>` : 'Not set'}\n` +
        `• Session Start: ${schedule.sessionStartMinutes} min before games\n` +
        `• Reminders: ${schedule.reminders.enabled ? `__${schedule.reminders.minutes.join(' min, ')} min__` : 'Disabled'}\n` +
        `• Warnings: ${schedule.warnings.enabled ? `__${schedule.warnings.minutes.join(' min, ')} min__` : 'Disabled'}`,
        inline: false
      }
    )
    .setFooter({ text: 'Step 4 of 4 • Progress auto-saved 💾' });
  
  const navButtons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_create_back_3')
        .setLabel('Back')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('pats_season_create_confirm')
        .setLabel('Create Season')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [navButtons]
  });
}

/**
 * Show Manage Participants menu
 */
export async function showManageParticipants(interaction) {
  const currentSeason = getCurrentSeason();
  if (!currentSeason) {
    return await showSeasonAdminMenu(interaction);
  }
  
  const standings = getSeasonStandings(currentSeason.id);
  
  let participantList = '';
  if (standings.length === 0) {
    participantList = '_No participants yet_';
  } else {
    participantList = standings.slice(0, 15).map(p => {
      const totalPicks = p.wins + p.losses + p.pushes;
      return `<@${p.userId}> • ${totalPicks} picks`;
    }).join('\n');
    
    if (standings.length > 15) {
      participantList += `\n_...and ${standings.length - 15} more_`;
    }
  }
  
  const embed = new EmbedBuilder()
    .setTitle('👥 Season Participants')
    .setDescription(`📅 **${currentSeason.name}**`)
    .setColor('#5865F2')
    .addFields(
      { name: `Current Participants (${standings.length})`, value: participantList }
    )
    .setFooter({ text: 'Add or remove participants from the current season' });
  
  const userSelect = new ActionRowBuilder()
    .addComponents(
      new UserSelectMenuBuilder()
        .setCustomId('pats_season_add_participant')
        .setPlaceholder('Add a participant...')
        .setMinValues(1)
        .setMaxValues(1)
    );
  
  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_add_role_members')
        .setLabel('Add All PATS Role Members')
        .setEmoji('📋')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('pats_season_remove_participant')
        .setLabel('Remove Participant')
        .setEmoji('➖')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(standings.length === 0)
    );
  
  const backButton = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_admin_back')
        .setLabel('Back')
        .setEmoji('🔙')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [userSelect, buttons, backButton]
  });
}

/**
 * Show Remove Participant selection
 */
export async function showRemoveParticipantSelect(interaction) {
  const currentSeason = getCurrentSeason();
  if (!currentSeason) {
    return await showSeasonAdminMenu(interaction);
  }
  
  const standings = getSeasonStandings(currentSeason.id);
  
  if (standings.length === 0) {
    return await showManageParticipants(interaction);
  }
  
  const embed = new EmbedBuilder()
    .setTitle('➖ Remove Participant')
    .setDescription('Select a participant to remove from the season.\n\n⚠️ Their season stats will be preserved but they won\'t be eligible for awards.')
    .setColor('#ED4245');
  
  const options = standings.slice(0, 25).map(p => ({
    label: p.username || `User ${p.userId}`,
    value: p.userId,
    description: `${p.wins + p.losses + p.pushes} picks this season`
  }));
  
  const selectMenu = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('pats_season_remove_participant_select')
        .setPlaceholder('Select participant to remove...')
        .addOptions(options)
    );
  
  const backButton = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_participants_back')
        .setLabel('Cancel')
        .setEmoji('🔙')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [selectMenu, backButton]
  });
}

/**
 * Show End Season Confirmation
 */
export async function showEndSeasonConfirmation(interaction) {
  const currentSeason = getCurrentSeason();
  if (!currentSeason) {
    return await showSeasonAdminMenu(interaction);
  }
  
  const standings = getSeasonStandings(currentSeason.id);
  const champion = standings.length > 0 ? standings[0] : null;
  
  const embed = new EmbedBuilder()
    .setTitle('🏁 End Season Early')
    .setDescription(
      `Are you sure you want to end **${currentSeason.name}** early?\n\n` +
      `This will:\n` +
      `• Calculate and award season awards\n` +
      `• Move the season to history\n` +
      `• Allow creating a new season\n\n` +
      (champion ? `🏆 Current Leader: <@${champion.userId}> (${(champion.winRate * 100).toFixed(1)}%)` : '')
    )
    .setColor('#ED4245')
    .setFooter({ text: 'This action cannot be undone' });
  
  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_end_cancel')
        .setLabel('Cancel')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('pats_season_end_confirm')
        .setLabel('End Season')
        .setEmoji('🏁')
        .setStyle(ButtonStyle.Danger)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [buttons]
  });
}

/**
 * Show Season History
 */
export async function showSeasonHistory(interaction) {
  const history = getSeasonHistory();
  const currentSeason = getCurrentSeason();
  
  const embed = new EmbedBuilder()
    .setTitle('📜 Season History')
    .setColor('#5865F2');
  
  if (history.length === 0 && !currentSeason) {
    embed.setDescription('No seasons have been completed yet.');
  } else {
    let description = '';
    
    if (currentSeason) {
      const standings = getSeasonStandings(currentSeason.id);
      const leader = standings.length > 0 ? standings[0] : null;
      description += `**Current Season:** ${currentSeason.name}\n`;
      description += leader ? `└ Leader: <@${leader.oddsUserId}> (${(leader.winPercentage || 0).toFixed(1)}%)\n` : '';
      description += `└ ${currentSeason.sessionCount || 0} sessions\n\n`;
    }
    
    if (history.length > 0) {
      description += '**Past Seasons:**\n';
      for (const season of history.slice(0, 10)) {
        const champion = season.awards?.champion;
        description += `• **${season.name}**`;
        if (champion) {
          description += ` - 🏆 <@${champion.oddsUserId}> (${champion.winPercentage?.toFixed(1) || 0}%)`;
        }
        description += `\n  └ ${season.sessionCount || 0} sessions\n`;
      }
    }
    
    embed.setDescription(description);
  }
  
  const backButton = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_admin_back')
        .setLabel('Back')
        .setEmoji('🔙')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [backButton]
  });
}

/**
 * Show Schedule Settings for current season
 */
export async function showScheduleSettings(interaction) {
  const currentSeason = getCurrentSeason();
  if (!currentSeason) {
    return await showSeasonAdminMenu(interaction);
  }
  
  const schedule = currentSeason.schedule || {};
  
  // Get session type labels
  const sessionTypeLabels = {
    'season': '🏆 Season Only - Only season participants',
    'both': '🌐 Open to All - Season participants + casual players',
    'casual': '👥 Casual Only - Non-season players only'
  };
  const currentSessionType = schedule.sessionType || 'season';
  
  const embed = new EmbedBuilder()
    .setTitle('⚙️ Season Settings')
    .setDescription(`Configure **${currentSeason.name}**`)
    .setColor('#5865F2')
    .addFields(
      {
        name: '📅 Season Information',
        value: 
          `**Name:** ${currentSeason.name}\n` +
          `**Dates:** ${new Date(currentSeason.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(currentSeason.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}\n` +
          `**Participants:** ${currentSeason.participants?.length || 0} user${currentSeason.participants?.length !== 1 ? 's' : ''}`,
        inline: false
      },
      { 
        name: '🤖 Auto-Schedule', 
        value: schedule.enabled ? '✅ Enabled' : '❌ Disabled', 
        inline: true 
      },
      { 
        name: '👥 Session Type',
        value: sessionTypeLabels[currentSessionType] || sessionTypeLabels['season'],
        inline: true
      },
      { 
        name: '📢 Channel', 
        value: schedule.channelId ? `<#${schedule.channelId}>` : '_Not set_', 
        inline: true 
      },
      { 
        name: '📣 Announcement', 
        value: `${schedule.announcementMinutes || 60} min before first game`, 
        inline: true 
      },
      { 
        name: '🔔 Reminders', 
        value: schedule.reminders?.enabled 
          ? `✅ ${(schedule.reminders?.minutes || [60, 30]).join(', ')} min`
          : '❌ Disabled', 
        inline: true 
      },
      { 
        name: '⚠️ Warnings', 
        value: schedule.warnings?.enabled 
          ? `✅ ${(schedule.warnings?.minutes || [30, 15]).join(', ')} min`
          : '❌ Disabled', 
        inline: true 
      }
    );
  
  // Row 1: Edit Season Info and Auto-Schedule toggle
  const editInfoRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_edit_name')
        .setLabel('Edit Name')
        .setEmoji('✏️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('pats_season_edit_end_date')
        .setLabel('Edit End Date')
        .setEmoji('📅')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('pats_season_toggle_auto_schedule')
        .setLabel(schedule.enabled ? 'Disable Auto' : 'Enable Auto')
        .setEmoji('🤖')
        .setStyle(schedule.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
    );
  
  // Row 2: Channel selector
  const channelRow = new ActionRowBuilder()
    .addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('pats_season_select_channel')
        .setPlaceholder('📢 Select announcement channel...')
        .setChannelTypes(ChannelType.GuildText)
    );
  
  // Row 3: Session Type selector
  const sessionTypeRow = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('pats_season_select_session_type')
        .setPlaceholder('👥 Session type: ' + sessionTypeLabels[currentSessionType])
        .addOptions([
          { 
            label: 'Season Only', 
            value: 'season', 
            description: 'Only season participants',
            emoji: '🏆',
            default: currentSessionType === 'season'
          },
          { 
            label: 'Open to All', 
            value: 'both', 
            description: 'Season + casual players',
            emoji: '🌐',
            default: currentSessionType === 'both'
          }
        ])
    );
  
  // Row 4: Announcement time selector
  const announcementRow = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('pats_season_select_announcement')
        .setPlaceholder('📣 Announcement: ' + (schedule.announcementMinutes || 60) + ' min before')
        .addOptions([
          { label: '15 minutes', value: '15', emoji: '⏱️' },
          { label: '30 minutes', value: '30', emoji: '⏱️' },
          { label: '60 minutes (1 hour)', value: '60', emoji: '⏰', default: (schedule.announcementMinutes || 60) === 60 },
          { label: '90 minutes (1.5 hours)', value: '90', emoji: '⏰' },
          { label: '120 minutes (2 hours)', value: '120', emoji: '⏰' },
          { label: '180 minutes (3 hours)', value: '180', emoji: '⏰' }
        ])
    );
  
  // Row 5: Notification config buttons and back button
  const notificationRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_config_reminders')
        .setLabel('Configure Reminders')
        .setEmoji('🔔')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('pats_season_config_warnings')
        .setLabel('Configure Warnings')
        .setEmoji('⚠️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('pats_season_admin_back')
        .setLabel('Back')
        .setEmoji('🔙')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [editInfoRow, channelRow, sessionTypeRow, announcementRow, notificationRow]
  });
}

/**
 * Show Reminder Configuration submenu
 */
export async function showReminderConfig(interaction) {
  const currentSeason = getCurrentSeason();
  if (!currentSeason) {
    return await showSeasonAdminMenu(interaction);
  }
  
  const schedule = currentSeason.schedule || {};
  const reminders = schedule.reminders || { enabled: true, minutes: [60, 30] };
  
  const embed = new EmbedBuilder()
    .setTitle('🔔 Reminder Configuration')
    .setDescription(`Configure session reminders for **${currentSeason.name}**`)
    .setColor('#5865F2')
    .addFields(
      {
        name: 'Status',
        value: reminders.enabled ? '✅ Enabled' : '❌ Disabled',
        inline: true
      },
      {
        name: 'Reminder Times',
        value: reminders.enabled && reminders.minutes?.length > 0 
          ? reminders.minutes.map(m => `${m} minutes before`).join('\n')
          : '_No reminders set_',
        inline: true
      },
      {
        name: 'ℹ️ How it works',
        value: 'Reminders are sent before the session starts. You can have multiple reminders at different times.',
        inline: false
      }
    );
  
  const toggleRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_toggle_reminders')
        .setLabel(reminders.enabled ? 'Disable Reminders' : 'Enable Reminders')
        .setEmoji(reminders.enabled ? '❌' : '✅')
        .setStyle(reminders.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
    );
  
  const timesRow = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('pats_season_reminder_times')
        .setPlaceholder('⏰ Select reminder times...')
        .setMinValues(1)
        .setMaxValues(5)
        .addOptions([
          { label: '5 minutes before', value: '5', emoji: '⏱️', default: reminders.minutes?.includes(5) },
          { label: '10 minutes before', value: '10', emoji: '⏱️', default: reminders.minutes?.includes(10) },
          { label: '15 minutes before', value: '15', emoji: '⏱️', default: reminders.minutes?.includes(15) },
          { label: '30 minutes before', value: '30', emoji: '⏰', default: reminders.minutes?.includes(30) },
          { label: '60 minutes before (1 hour)', value: '60', emoji: '⏰', default: reminders.minutes?.includes(60) },
          { label: '90 minutes before (1.5 hours)', value: '90', emoji: '⏰', default: reminders.minutes?.includes(90) },
          { label: '120 minutes before (2 hours)', value: '120', emoji: '⏰', default: reminders.minutes?.includes(120) }
        ])
    );
  
  const backRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_settings')
        .setLabel('Back to Settings')
        .setEmoji('🔙')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [toggleRow, timesRow, backRow]
  });
}

/**
 * Show Warning Configuration submenu
 */
export async function showWarningConfig(interaction) {
  const currentSeason = getCurrentSeason();
  if (!currentSeason) {
    return await showSeasonAdminMenu(interaction);
  }
  
  const schedule = currentSeason.schedule || {};
  const warnings = schedule.warnings || { enabled: true, minutes: [30, 15] };
  
  const embed = new EmbedBuilder()
    .setTitle('⚠️ Warning Configuration')
    .setDescription(`Configure session warnings for **${currentSeason.name}**`)
    .setColor('#5865F2')
    .addFields(
      {
        name: 'Status',
        value: warnings.enabled ? '✅ Enabled' : '❌ Disabled',
        inline: true
      },
      {
        name: 'Warning Times',
        value: warnings.enabled && warnings.minutes?.length > 0 
          ? warnings.minutes.map(m => `${m} minutes before`).join('\n')
          : '_No warnings set_',
        inline: true
      },
      {
        name: 'ℹ️ How it works',
        value: 'Warnings are sent shortly before the session starts to alert participants. These are typically sent closer to game time than reminders.',
        inline: false
      }
    );
  
  const toggleRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_toggle_warnings')
        .setLabel(warnings.enabled ? 'Disable Warnings' : 'Enable Warnings')
        .setEmoji(warnings.enabled ? '❌' : '✅')
        .setStyle(warnings.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
    );
  
  const timesRow = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('pats_season_warning_times')
        .setPlaceholder('⏰ Select warning times...')
        .setMinValues(1)
        .setMaxValues(5)
        .addOptions([
          { label: '1 minute before', value: '1', emoji: '⏱️', default: warnings.minutes?.includes(1) },
          { label: '2 minutes before', value: '2', emoji: '⏱️', default: warnings.minutes?.includes(2) },
          { label: '5 minutes before', value: '5', emoji: '⏱️', default: warnings.minutes?.includes(5) },
          { label: '10 minutes before', value: '10', emoji: '⏱️', default: warnings.minutes?.includes(10) },
          { label: '15 minutes before', value: '15', emoji: '⏰', default: warnings.minutes?.includes(15) },
          { label: '30 minutes before', value: '30', emoji: '⏰', default: warnings.minutes?.includes(30) },
          { label: '45 minutes before', value: '45', emoji: '⏰', default: warnings.minutes?.includes(45) }
        ])
    );
  
  const backRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_settings')
        .setLabel('Back to Settings')
        .setEmoji('🔙')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [toggleRow, timesRow, backRow]
  });
}

/**
 * Show Edit Season menu
 */
/**
 * @deprecated - Now consolidated into showScheduleSettings
 */
export async function showEditSeason(interaction) {
  return await showScheduleSettings(interaction);
}

/**
 * Show Manage Schedule - view upcoming scheduled sessions for the season
 */
export async function showManageSchedule(interaction) {
  const currentSeason = getCurrentSeason();
  if (!currentSeason) {
    return await showSeasonAdminMenu(interaction);
  }
  
  // Get scheduled sessions from the scheduler
  const { getAllScheduledSessions } = await import('../utils/sessionScheduler.js');
  const allSessions = getAllScheduledSessions();
  
  // Filter to only this season's sessions (must have seasonId)
  const seasonSessions = allSessions.filter(s => s.seasonId === currentSeason.id);
  
  // Separate into upcoming and past
  const now = new Date();
  const upcomingSessions = seasonSessions.filter(s => new Date(s.firstGameTime) > now);
  const pastSessions = seasonSessions.filter(s => new Date(s.firstGameTime) <= now);
  
  const embed = new EmbedBuilder()
    .setTitle('📅 Season Schedule')
    .setDescription(`Scheduled sessions for **${currentSeason.name}**`)
    .setColor('#5865F2');
  
  if (upcomingSessions.length > 0) {
    const upcomingText = upcomingSessions.slice(0, 5).map(s => {
      const date = new Date(s.scheduledDate);
      const gameCount = Array.isArray(s.gameDetails) ? s.gameDetails.length : s.games;
      const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const typeEmoji = s.sessionType === 'both' ? '🌐' : '🏆';
      const typeText = s.sessionType === 'both' ? ' (Open to All)' : '';
      return `${typeEmoji} **${dateStr}** - ${gameCount} games${typeText}`;
    }).join('\n');
    
    embed.addFields({
      name: `📆 Upcoming (${upcomingSessions.length})`,
      value: upcomingText,
      inline: false
    });
  } else {
    embed.addFields({
      name: '📆 Upcoming',
      value: '_No upcoming sessions scheduled_',
      inline: false
    });
  }
  
  if (pastSessions.length > 0) {
    embed.addFields({
      name: '✅ Completed This Season',
      value: `${pastSessions.length} session${pastSessions.length !== 1 ? 's' : ''}`,
      inline: true
    });
  }
  
  // Show auto-schedule status and days ahead setting
  const schedule = currentSeason.schedule || {};
  const daysAhead = schedule.daysAhead || 7;
  embed.addFields(
    {
      name: '🤖 Auto-Schedule',
      value: schedule.enabled ? '✅ Enabled' : '❌ Disabled',
      inline: true
    },
    {
      name: '📅 Schedule Ahead',
      value: `${daysAhead} day${daysAhead !== 1 ? 's' : ''}`,
      inline: true
    }
  );
  
  // Add buttons for managing schedule
  const actionButtons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_schedule_view_all')
        .setLabel('View All Sessions')
        .setEmoji('📋')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(upcomingSessions.length === 0),
      new ButtonBuilder()
        .setCustomId('pats_season_schedule_config_days')
        .setLabel('Configure Days Ahead')
        .setEmoji('⚙️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('pats_season_schedule_refresh')
        .setLabel('Refresh')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary)
    );
  
  const backButton = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_schedule_back')
        .setLabel('Back')
        .setEmoji('🔙')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: upcomingSessions.length > 0 ? [actionButtons, backButton] : [backButton]
  });
}

/**
 * Show Days Ahead Configuration for auto-scheduling
 */
export async function showDaysAheadConfig(interaction) {
  const currentSeason = getCurrentSeason();
  if (!currentSeason) {
    return await showSeasonAdminMenu(interaction);
  }
  
  const schedule = currentSeason.schedule || {};
  const daysAhead = schedule.daysAhead || 7;
  
  const embed = new EmbedBuilder()
    .setTitle('📅 Auto-Schedule Days Ahead')
    .setDescription(`Configure how far in advance sessions are scheduled for **${currentSeason.name}**`)
    .setColor('#5865F2')
    .addFields(
      {
        name: 'Current Setting',
        value: `${daysAhead} day${daysAhead !== 1 ? 's' : ''} ahead`,
        inline: true
      },
      {
        name: 'ℹ️ How it works',
        value: 'The bot checks for NBA games this many days into the future and creates sessions automatically. Lower values = fewer sessions scheduled at once. Higher values = plan further ahead.',
        inline: false
      }
    );
  
  const selectRow = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('pats_season_select_days_ahead')
        .setPlaceholder('📅 Select days ahead...')
        .addOptions([
          { label: '1 day ahead', value: '1', emoji: '📅', default: daysAhead === 1 },
          { label: '2 days ahead', value: '2', emoji: '📅', default: daysAhead === 2 },
          { label: '3 days ahead', value: '3', emoji: '📅', default: daysAhead === 3 },
          { label: '5 days ahead', value: '5', emoji: '📅', default: daysAhead === 5 },
          { label: '7 days ahead (1 week)', value: '7', emoji: '📆', default: daysAhead === 7 },
          { label: '14 days ahead (2 weeks)', value: '14', emoji: '📆', default: daysAhead === 14 },
          { label: '21 days ahead (3 weeks)', value: '21', emoji: '📆', default: daysAhead === 21 },
          { label: '30 days ahead (1 month)', value: '30', emoji: '📆', default: daysAhead === 30 }
        ])
    );
  
  const backRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_schedule')
        .setLabel('Back to Schedule')
        .setEmoji('🔙')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [selectRow, backRow]
  });
}

/**
 * Show all scheduled sessions for the season
 */
export async function showAllScheduledSessions(interaction) {
  const currentSeason = getCurrentSeason();
  if (!currentSeason) {
    return await showSeasonAdminMenu(interaction);
  }
  
  // Get scheduled sessions from the scheduler
  const { getAllScheduledSessions } = await import('../utils/sessionScheduler.js');
  const allSessions = getAllScheduledSessions();
  
  // Filter to only this season's sessions
  const seasonSessions = allSessions.filter(s => s.seasonId === currentSeason.id);
  
  // Separate into upcoming and past
  const now = new Date();
  const upcomingSessions = seasonSessions.filter(s => new Date(s.firstGameTime) > now);
  
  if (upcomingSessions.length === 0) {
    return await showManageSchedule(interaction);
  }
  
  const embed = new EmbedBuilder()
    .setTitle('📋 All Scheduled Sessions')
    .setDescription(`Viewing all upcoming sessions for **${currentSeason.name}**`)
    .setColor('#5865F2');
  
  // Build session list with detailed info
  const sessionList = upcomingSessions.slice(0, 10).map((s, idx) => {
    const date = new Date(s.scheduledDate);
    const gameCount = Array.isArray(s.gameDetails) ? s.gameDetails.length : s.games;
    const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    // Use announcement time as session start time
    const sessionStartTime = new Date(s.notifications?.announcement?.time || s.firstGameTime);
    const timeStr = sessionStartTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });
    const typeEmoji = s.sessionType === 'both' ? '🌐' : '🏆';
    const typeText = s.sessionType === 'both' ? ' (Open)' : '';
    
    return `**${idx + 1}.** ${typeEmoji} ${dateStr} at ${timeStr}\n   └ ${gameCount} games${typeText} • Session ID: \`${s.id}\``;
  }).join('\n\n');
  
  embed.setDescription(
    `Viewing upcoming sessions for **${currentSeason.name}**\n\n${sessionList}`
  );
  
  if (upcomingSessions.length > 10) {
    embed.setFooter({ text: `Showing 10 of ${upcomingSessions.length} sessions` });
  }
  
  // Create session select menu
  const selectMenu = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('pats_season_schedule_select')
        .setPlaceholder('Select a session to manage...')
        .addOptions(
          upcomingSessions.slice(0, 25).map((s, idx) => {
            const date = new Date(s.scheduledDate);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const gameCount = Array.isArray(s.gameDetails) ? s.gameDetails.length : s.games;
            const typeEmoji = s.sessionType === 'both' ? '🌐' : '🏆';
            
            return {
              label: `${dateStr} - ${gameCount} games`,
              value: s.id,
              description: `Session ID: ${s.id}`,
              emoji: typeEmoji
            };
          })
        )
    );
  
  const backButton = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_schedule_back')
        .setLabel('Back')
        .setEmoji('🔙')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [selectMenu, backButton]
  });
}

/**
 * Show detailed view of a specific scheduled session
 */
export async function showSessionDetails(interaction, sessionId) {
  const currentSeason = getCurrentSeason();
  if (!currentSeason) {
    return await showSeasonAdminMenu(interaction);
  }
  
  const { getScheduledSession, deleteScheduledSession } = await import('../utils/sessionScheduler.js');
  const session = getScheduledSession(sessionId);
  
  if (!session || session.seasonId !== currentSeason.id) {
    await interaction.editReply({
      content: '❌ Session not found or does not belong to this season.',
      embeds: [],
      components: []
    });
    return;
  }
  
  const date = new Date(session.scheduledDate);
  const firstGame = new Date(session.firstGameTime);
  const announcement = new Date(session.notifications.announcement.time);
  
  const embed = new EmbedBuilder()
    .setTitle('📋 Session Details')
    .setColor('#5865F2')
    .addFields(
      {
        name: '📅 Date',
        value: date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        inline: false
      },
      {
        name: '⏰ First Game',
        value: firstGame.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles', timeZoneName: 'short' }),
        inline: true
      },
      {
        name: '📣 Announcement',
        value: announcement.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }),
        inline: true
      },
      {
        name: '🏀 Games',
        value: `${session.games} game${session.games !== 1 ? 's' : ''}`,
        inline: true
      },
      {
        name: '👥 Session Type',
        value: session.sessionType === 'both' ? '🌐 Open to All' : '🏆 Season Only',
        inline: true
      },
      {
        name: '🆔 Session ID',
        value: `\`${session.id}\``,
        inline: false
      }
    );
  
  // Show game details if available
  if (session.gameDetails && session.gameDetails.length > 0) {
    const gamesList = session.gameDetails.slice(0, 5).map(g => {
      const gameTime = new Date(g.startTime);
      const timeStr = gameTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });
      return `• ${g.awayAbbr} @ ${g.homeAbbr} - ${timeStr}`;
    }).join('\n');
    
    embed.addFields({
      name: '🏀 Matchups',
      value: gamesList + (session.gameDetails.length > 5 ? `\n_...and ${session.gameDetails.length - 5} more_` : ''),
      inline: false
    });
  }
  
  const actionButtons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`pats_season_schedule_delete_${sessionId}`)
        .setLabel('Delete Session')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
    );
  
  const backButton = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_season_schedule_view_all')
        .setLabel('Back to List')
        .setEmoji('🔙')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [actionButtons, backButton]
  });
}

/**
 * Show Manage Schedule - view upcoming scheduled sessions for the season
 */
/**
 * Handle button interactions
 */
export async function handleButton(interaction) {
  const customId = interaction.customId;
  
  try {
    // Handle Edit Name Modal - DON'T defer, show modal immediately
    if (customId === 'pats_season_create_edit_name') {
      const config = getSeasonConfig(interaction.user.id);
      
      const modal = new ModalBuilder()
        .setCustomId('pats_season_modal_name')
        .setTitle('Edit Season Name');
      
      const nameInput = new TextInputBuilder()
        .setCustomId('season_name')
        .setLabel('Season Name')
        .setStyle(TextInputStyle.Short)
        .setValue(config.name)
        .setRequired(true)
        .setMaxLength(50);
      
      modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
      return await interaction.showModal(modal);
    }
    
    // Handle Edit Dates Modal - DON'T defer, show modal immediately
    if (customId === 'pats_season_create_edit_dates') {
      const config = getSeasonConfig(interaction.user.id);
      
      // Only allow editing dates if type is 'custom'
      if (config.type !== 'custom') {
        await interaction.reply({
          content: '⚠️ To edit dates, select "Custom" from the season type dropdown first.',
          ephemeral: true
        });
        return;
      }
      
      const modal = new ModalBuilder()
        .setCustomId('pats_season_modal_dates')
        .setTitle('Edit Season Dates');
      
      const startInput = new TextInputBuilder()
        .setCustomId('start_date')
        .setLabel('Start Date (YYYY-MM-DD)')
        .setStyle(TextInputStyle.Short)
        .setValue(config.startDate)
        .setRequired(true)
        .setPlaceholder('2025-01-01');
      
      const endInput = new TextInputBuilder()
        .setCustomId('end_date')
        .setLabel('End Date (YYYY-MM-DD)')
        .setStyle(TextInputStyle.Short)
        .setValue(config.endDate)
        .setRequired(true)
        .setPlaceholder('2025-04-30');
      
      modal.addComponents(
        new ActionRowBuilder().addComponents(startInput),
        new ActionRowBuilder().addComponents(endInput)
      );
      return await interaction.showModal(modal);
    }
    
    // Handle Edit Timing Modal - DON'T defer, show modal immediately
    if (customId === 'pats_season_create_edit_timing') {
      const config = getSeasonConfig(interaction.user.id);
      const schedule = config.schedule;
      
      const modal = new ModalBuilder()
        .setCustomId('pats_season_modal_timing')
        .setTitle('Edit Session Timing');
      
      const sessionStartInput = new TextInputBuilder()
        .setCustomId('session_start')
        .setLabel('Session Start (minutes before first game)')
        .setStyle(TextInputStyle.Short)
        .setValue(schedule.sessionStartMinutes.toString())
        .setRequired(true)
        .setPlaceholder('60');
      
      const announcementInput = new TextInputBuilder()
        .setCustomId('announcement')
        .setLabel('Announcement (minutes before session start)')
        .setStyle(TextInputStyle.Short)
        .setValue(schedule.announcementMinutes.toString())
        .setRequired(true)
        .setPlaceholder('120');
      
      const remindersInput = new TextInputBuilder()
        .setCustomId('reminders')
        .setLabel('Reminders (comma-separated minutes)')
        .setStyle(TextInputStyle.Short)
        .setValue(schedule.reminders.minutes.join(', '))
        .setRequired(false)
        .setPlaceholder('60, 30, 15');
      
      const warningsInput = new TextInputBuilder()
        .setCustomId('warnings')
        .setLabel('Warnings (comma-separated minutes)')
        .setStyle(TextInputStyle.Short)
        .setValue(schedule.warnings.minutes.join(', '))
        .setRequired(false)
        .setPlaceholder('5, 2');
      
      modal.addComponents(
        new ActionRowBuilder().addComponents(sessionStartInput),
        new ActionRowBuilder().addComponents(announcementInput),
        new ActionRowBuilder().addComponents(remindersInput),
        new ActionRowBuilder().addComponents(warningsInput)
      );
      return await interaction.showModal(modal);
    }
    
    // Handle Edit Season Name Modal - DON'T defer, show modal immediately
    if (customId === 'pats_season_edit_name') {
      const currentSeason = getCurrentSeason();
      if (!currentSeason) {
        await interaction.reply({
          content: '❌ No active season found.',
          ephemeral: true
        });
        return;
      }
      
      const modal = new ModalBuilder()
        .setCustomId('pats_season_modal_edit_name')
        .setTitle('Edit Season Name');
      
      const nameInput = new TextInputBuilder()
        .setCustomId('season_name')
        .setLabel('Season Name')
        .setStyle(TextInputStyle.Short)
        .setValue(currentSeason.name)
        .setRequired(true)
        .setMaxLength(50);
      
      modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
      return await interaction.showModal(modal);
    }
    
    // Handle Edit Season End Date Modal - DON'T defer, show modal immediately
    if (customId === 'pats_season_edit_end_date') {
      const currentSeason = getCurrentSeason();
      if (!currentSeason) {
        await interaction.reply({
          content: '❌ No active season found.',
          ephemeral: true
        });
        return;
      }
      
      const modal = new ModalBuilder()
        .setCustomId('pats_season_modal_edit_end_date')
        .setTitle('Edit Season End Date');
      
      const endDateInput = new TextInputBuilder()
        .setCustomId('end_date')
        .setLabel('End Date (YYYY-MM-DD)')
        .setStyle(TextInputStyle.Short)
        .setValue(currentSeason.endDate)
        .setRequired(true)
        .setPlaceholder('2025-04-30');
      
      modal.addComponents(new ActionRowBuilder().addComponents(endDateInput));
      return await interaction.showModal(modal);
    }
    
    // For all other buttons, defer the update
    await interaction.deferUpdate();
    
    // Main menu navigation - only pats_season_back goes to PATS Dashboard
    if (customId === 'pats_season_back') {
      // Go back to main PATS dashboard
      const patsCommand = await import('./pats.js');
      return await patsCommand.showDashboard(interaction);
    }
    
    // pats_season_admin_back returns to Season Admin menu
    if (customId === 'pats_season_admin_back') {
      return await showSeasonAdminMenu(interaction);
    }
    
    // Back buttons for sub-menus
    if (customId === 'pats_season_settings_back' || customId === 'pats_season_schedule_back') {
      return await showSeasonAdminMenu(interaction);
    }
    
    // Create Season Wizard
    if (customId === 'pats_season_create') {
      clearSeasonConfig(interaction.user.id);
      return await showCreateSeasonStep1(interaction);
    }
    
    if (customId === 'pats_season_create_cancel') {
      clearSeasonConfig(interaction.user.id);
      return await showSeasonAdminMenu(interaction);
    }
    
    // Create Wizard Navigation
    if (customId === 'pats_season_create_next_2') {
      return await showCreateSeasonStep2(interaction);
    }
    if (customId === 'pats_season_create_next_3') {
      return await showCreateSeasonStep3(interaction);
    }
    if (customId === 'pats_season_create_next_4') {
      return await showCreateSeasonStep4(interaction);
    }
    if (customId === 'pats_season_create_back_1') {
      return await showCreateSeasonStep1(interaction);
    }
    if (customId === 'pats_season_create_back_2') {
      return await showCreateSeasonStep2(interaction);
    }
    if (customId === 'pats_season_create_back_3') {
      return await showCreateSeasonStep3(interaction);
    }
    
    // Create Season Confirm
    if (customId === 'pats_season_create_confirm') {
      const config = getSeasonConfig(interaction.user.id);
      
      try {
        const season = createSeason(
          config.name,
          config.type,
          config.startDate,
          config.endDate,
          config.participants,
          config.schedule
        );
        
        clearSeasonConfig(interaction.user.id);
        
        // If auto-scheduling is enabled, run the auto-scheduler immediately
        if (season.schedule?.enabled) {
          console.log('[SEASONS] Auto-scheduling enabled - triggering immediate scheduler check');
          try {
            await runAutoSchedulerCheck(
              interaction.client,
              getESPNGamesForDate,
              addScheduledSession,
              scheduleSessionJobs,
              createSchedulerHandlers(interaction.client)
            );
            console.log('[SEASONS] Auto-scheduler check completed after season creation');
          } catch (schedError) {
            console.error('[SEASONS] Error running auto-scheduler after season creation:', schedError);
          }
        }
        
        // Show success message
        const embed = new EmbedBuilder()
          .setTitle('✅ Season Created')
          .setDescription(`**${season.name}** has been created successfully!${season.schedule?.enabled ? '\n\n⏱️ Checking for games to auto-schedule...' : ''}`)
          .setColor('#57F287')
          .addFields(
            { name: '🗓️ Duration', value: `${season.startDate} to ${season.endDate}`, inline: true },
            { name: '👥 Participants', value: `${season.participants?.length || 0}`, inline: true }
          );
        
        await interaction.editReply({ embeds: [embed], components: [] });
        
        // Show admin menu after 2 seconds
        setTimeout(async () => {
          await showSeasonAdminMenu(interaction);
        }, 2000);
        
        return;
      } catch (error) {
        console.error('Error creating season:', error);
        const embed = new EmbedBuilder()
          .setTitle('❌ Error Creating Season')
          .setDescription(error.message)
          .setColor('#ED4245');
        
        await interaction.editReply({ embeds: [embed], components: [] });
        return;
      }
    }
    
    // Toggle Auto-Schedule
    if (customId === 'pats_season_create_toggle_auto') {
      const config = getSeasonConfig(interaction.user.id);
      config.schedule.enabled = !config.schedule.enabled;
      await saveSeasonConfigs();
      return await showCreateSeasonStep3(interaction);
    }
    
    // Toggle Reminders
    if (customId === 'pats_season_create_toggle_reminders') {
      const config = getSeasonConfig(interaction.user.id);
      config.schedule.reminders.enabled = !config.schedule.reminders.enabled;
      await saveSeasonConfigs();
      return await showCreateSeasonStep3(interaction);
    }
    
    // Toggle Warnings
    if (customId === 'pats_season_create_toggle_warnings') {
      const config = getSeasonConfig(interaction.user.id);
      config.schedule.warnings.enabled = !config.schedule.warnings.enabled;
      await saveSeasonConfigs();
      return await showCreateSeasonStep3(interaction);
    }
    
    // Add All PATS Role Members (Create Wizard)
    if (customId === 'pats_season_create_add_role') {
      const config = getSeasonConfig(interaction.user.id);
      
      try {
        const role = await interaction.guild.roles.fetch(PATS_ROLE_ID);
        if (role) {
          const members = role.members.map(m => m.id);
          // Add unique members
          for (const memberId of members) {
            if (!config.participants.includes(memberId)) {
              config.participants.push(memberId);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching PATS role members:', error);
      }
      
      return await showCreateSeasonStep2(interaction);
    }
    
    // Clear Participants (Create Wizard)
    if (customId === 'pats_season_create_clear_participants') {
      const config = getSeasonConfig(interaction.user.id);
      config.participants = [];
      await saveSeasonConfigs();
      return await showCreateSeasonStep2(interaction);
    }
    
    // Manage Participants
    if (customId === 'pats_season_participants') {
      return await showManageParticipants(interaction);
    }
    
    if (customId === 'pats_season_participants_back') {
      return await showManageParticipants(interaction);
    }
    
    // Add All PATS Role Members (Manage Participants)
    if (customId === 'pats_season_add_role_members') {
      const currentSeason = getCurrentSeason();
      if (!currentSeason) {
        return await showSeasonAdminMenu(interaction);
      }
      
      try {
        const role = await interaction.guild.roles.fetch(PATS_ROLE_ID);
        if (role) {
          let addedCount = 0;
          for (const [memberId, member] of role.members) {
            if (!isUserInCurrentSeason(memberId)) {
              addSeasonParticipant(memberId);
              addedCount++;
            }
          }
          console.log(`[PATS Season] Added ${addedCount} PATS role members to season`);
        }
      } catch (error) {
        console.error('Error adding PATS role members:', error);
      }
      
      return await showManageParticipants(interaction);
    }
    
    // Remove Participant
    if (customId === 'pats_season_remove_participant') {
      return await showRemoveParticipantSelect(interaction);
    }
    
    // End Season
    if (customId === 'pats_season_end') {
      return await showEndSeasonConfirmation(interaction);
    }
    
    if (customId === 'pats_season_end_cancel') {
      return await showSeasonAdminMenu(interaction);
    }
    
    if (customId === 'pats_season_end_confirm') {
      const currentSeason = getCurrentSeason();
      if (!currentSeason) {
        return await showSeasonAdminMenu(interaction);
      }
      
      try {
        const endedSeason = endSeason(currentSeason.id);
        
        const embed = new EmbedBuilder()
          .setTitle('🏁 Season Ended')
          .setDescription(`**${endedSeason.name}** has been completed!`)
          .setColor('#57F287');
        
        if (endedSeason.awards?.champion) {
          embed.addFields({
            name: '🏆 Season Champion',
            value: `<@${endedSeason.awards.champion.oddsUserId}> (${endedSeason.awards.champion.winPercentage?.toFixed(1) || 0}%)`
          });
        }
        
        await interaction.editReply({ embeds: [embed], components: [] });
        
        setTimeout(async () => {
          await showSeasonAdminMenu(interaction);
        }, 3000);
        
        return;
      } catch (error) {
        console.error('Error ending season:', error);
        const embed = new EmbedBuilder()
          .setTitle('❌ Error Ending Season')
          .setDescription(error.message)
          .setColor('#ED4245');
        
        await interaction.editReply({ embeds: [embed], components: [] });
        return;
      }
    }
    
    // Season History
    if (customId === 'pats_season_history') {
      return await showSeasonHistory(interaction);
    }
    
    // Schedule Settings (view/edit current season's schedule settings)
    if (customId === 'pats_season_settings') {
      return await showScheduleSettings(interaction);
    }
    
    // Configure Reminders submenu
    if (customId === 'pats_season_config_reminders') {
      return await showReminderConfig(interaction);
    }
    
    // Configure Warnings submenu
    if (customId === 'pats_season_config_warnings') {
      return await showWarningConfig(interaction);
    }
    
    // Configure Days Ahead
    if (customId === 'pats_season_schedule_config_days') {
      return await showDaysAheadConfig(interaction);
    }
    
    // Toggle Auto-Schedule for existing season
    if (customId === 'pats_season_toggle_auto_schedule') {
      const currentSeason = getCurrentSeason();
      if (!currentSeason) {
        return await showSeasonAdminMenu(interaction);
      }
      
      // Toggle the enabled state
      if (!currentSeason.schedule) {
        currentSeason.schedule = { enabled: false };
      }
      
      const newEnabledState = !currentSeason.schedule.enabled;
      
      // Update in data
      const { updateSeasonScheduleSettings } = await import('../utils/patsSeasons.js');
      updateSeasonScheduleSettings(currentSeason.id, {
        enabled: newEnabledState
      });
      
      // If enabling, run the auto-scheduler immediately to populate sessions
      if (newEnabledState) {
        console.log('[SEASONS] Auto-schedule enabled - triggering immediate scheduler check');
        try {
          await runAutoSchedulerCheck(
            interaction.client,
            getESPNGamesForDate,
            addScheduledSession,
            scheduleSessionJobs,
            createSchedulerHandlers(interaction.client)
          );
          console.log('[SEASONS] Auto-scheduler check completed');
        } catch (schedError) {
          console.error('[SEASONS] Error running auto-scheduler:', schedError);
        }
      } else {
        // If disabling, remove all auto-scheduled sessions for this season
        console.log('[SEASONS] Auto-schedule disabled - removing auto-scheduled sessions');
        try {
          const { getAllScheduledSessions, deleteScheduledSession } = await import('../utils/sessionScheduler.js');
          const allSessions = getAllScheduledSessions();
          const seasonSessions = allSessions.filter(s => s.seasonId === currentSeason.id);
          
          for (const session of seasonSessions) {
            deleteScheduledSession(session.id);
            console.log(`[SEASONS] Removed auto-scheduled session ${session.id}`);
          }
          
          console.log(`[SEASONS] Removed ${seasonSessions.length} auto-scheduled session(s)`);
        } catch (deleteError) {
          console.error('[SEASONS] Error removing auto-scheduled sessions:', deleteError);
        }
      }
      
      return await showScheduleSettings(interaction);
    }
    
    // Toggle Reminders (Schedule Settings)
    if (customId === 'pats_season_toggle_reminders') {
      const currentSeason = getCurrentSeason();
      if (!currentSeason) {
        return await showSeasonAdminMenu(interaction);
      }
      
      const { updateSeasonScheduleSettings } = await import('../utils/patsSeasons.js');
      const currentEnabled = currentSeason.schedule?.reminders?.enabled || false;
      
      const newSettings = {
        reminders: {
          enabled: !currentEnabled,
          minutes: currentSeason.schedule?.reminders?.minutes || [60, 30]
        }
      };
      updateSeasonScheduleSettings(currentSeason.id, newSettings);
      
      // Update all upcoming scheduled sessions for this season
      await updateUpcomingSessionSettings(currentSeason.id, {
        notifications: {
          reminder: {
            enabled: newSettings.reminders.enabled,
            minutesBefore: newSettings.reminders.minutes[0]
          }
        }
      });
      
      return await showScheduleSettings(interaction);
    }
    
    // Toggle Warnings (Schedule Settings)
    if (customId === 'pats_season_toggle_warnings') {
      const currentSeason = getCurrentSeason();
      if (!currentSeason) {
        return await showSeasonAdminMenu(interaction);
      }
      
      const { updateSeasonScheduleSettings } = await import('../utils/patsSeasons.js');
      const currentEnabled = currentSeason.schedule?.warnings?.enabled || false;
      
      const newSettings = {
        warnings: {
          enabled: !currentEnabled,
          minutes: currentSeason.schedule?.warnings?.minutes || [30, 15]
        }
      };
      updateSeasonScheduleSettings(currentSeason.id, newSettings);
      
      // Update all upcoming scheduled sessions for this season
      await updateUpcomingSessionSettings(currentSeason.id, {
        notifications: {
          warning: {
            enabled: newSettings.warnings.enabled,
            minutesBefore: newSettings.warnings.minutes[0]
          }
        }
      });
      
      return await showScheduleSettings(interaction);
    }
    
    // Manage Schedule (view upcoming scheduled sessions)
    if (customId === 'pats_season_schedule') {
      return await showManageSchedule(interaction);
    }
    
    // View All Scheduled Sessions
    if (customId === 'pats_season_schedule_view_all') {
      return await showAllScheduledSessions(interaction);
    }
    
    // Refresh Schedule View - rerun auto-scheduler
    if (customId === 'pats_season_schedule_refresh') {
      const currentSeason = getCurrentSeason();
      if (!currentSeason) {
        return await showSeasonAdminMenu(interaction);
      }
      
      // Run the auto-scheduler
      try {
        await interaction.editReply({
          content: '🔄 Running auto-scheduler...',
          embeds: [],
          components: []
        });
        
        await runAutoSchedulerCheck(
          interaction.client,
          getESPNGamesForDate,
          addScheduledSession,
          scheduleSessionJobs,
          createSchedulerHandlers(interaction.client)
        );
        
        // Small delay to let the scheduler complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await interaction.editReply({
          content: '✅ Auto-scheduler completed! Refreshing schedule...',
          embeds: [],
          components: []
        });
        
        // Small delay before showing the updated schedule
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error('[Season Schedule] Error running auto-scheduler:', error);
        await interaction.editReply({
          content: '⚠️ Auto-scheduler completed with some issues. Showing current schedule...',
          embeds: [],
          components: []
        });
      }
      
      return await showManageSchedule(interaction);
    }
    
    // Delete Session (pattern: pats_season_schedule_delete_<sessionId>)
    if (customId.startsWith('pats_season_schedule_delete_')) {
      const sessionId = customId.replace('pats_season_schedule_delete_', '');
      const currentSeason = getCurrentSeason();
      
      if (!currentSeason) {
        return await showSeasonAdminMenu(interaction);
      }
      
      try {
        const { getScheduledSession, deleteScheduledSession } = await import('../utils/sessionScheduler.js');
        const session = getScheduledSession(sessionId);
        
        if (!session || session.seasonId !== currentSeason.id) {
          await interaction.editReply({
            content: '❌ Session not found or does not belong to this season.',
            embeds: [],
            components: []
          });
          return;
        }
        
        // Delete the session
        deleteScheduledSession(sessionId);
        
        // Also remove from season's scheduledSessions list
        const { updateScheduledSession } = await import('../utils/patsSeasons.js');
        const data = readPATSData();
        if (data.seasons?.current?.scheduledSessions) {
          data.seasons.current.scheduledSessions = data.seasons.current.scheduledSessions.filter(
            s => s.sessionId !== sessionId
          );
          writePATSData(data);
        }
        
        await interaction.editReply({
          content: `✅ Session deleted successfully.`,
          embeds: [],
          components: []
        });
        
        // Return to schedule view after a moment
        setTimeout(async () => {
          await showAllScheduledSessions(interaction);
        }, 1500);
        
      } catch (error) {
        console.error('Error deleting session:', error);
        await interaction.editReply({
          content: '❌ Failed to delete session. Please try again.',
          embeds: [],
          components: []
        });
      }
      return;
    }
    
    // Default - show admin menu
    return await showSeasonAdminMenu(interaction);
    
  } catch (error) {
    console.error('Error handling season button:', error);
    await interaction.editReply({
      content: '❌ An error occurred. Please try again.',
      embeds: [],
      components: []
    });
  }
}

/**
 * Handle select menu interactions
 */
export async function handleSelectMenu(interaction) {
  const customId = interaction.customId;
  
  try {
    await interaction.deferUpdate();
    
    // Season Type Select (Create Wizard Step 1)
    if (customId === 'pats_season_create_type') {
      const config = getSeasonConfig(interaction.user.id);
      const type = interaction.values[0];
      config.type = type;
      
      // Update dates based on type
      const now = new Date();
      let startDate, endDate;
      
      switch (type) {
        case 'weekly':
          // Start next Monday
          const nextMonday = new Date(now);
          nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7) || 7);
          startDate = nextMonday;
          endDate = new Date(nextMonday);
          endDate.setDate(endDate.getDate() + 6);
          break;
        case 'biweekly':
          // Start next Monday
          const biweeklyStart = new Date(now);
          biweeklyStart.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7) || 7);
          startDate = biweeklyStart;
          endDate = new Date(biweeklyStart);
          endDate.setDate(endDate.getDate() + 13);
          break;
        case 'monthly':
        default:
          // Start first of next month
          startDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
          break;
        case 'custom':
          // Keep current dates or set reasonable defaults
          if (!config.startDate) {
            startDate = new Date(now);
            startDate.setDate(now.getDate() + 1);
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 30);
            config.startDate = startDate.toISOString().split('T')[0];
            config.endDate = endDate.toISOString().split('T')[0];
          }
          break;
      }
      
      if (startDate && type !== 'custom') {
        config.startDate = startDate.toISOString().split('T')[0];
        config.endDate = endDate.toISOString().split('T')[0];
        
        // Update name based on type
        if (type === 'monthly') {
          config.name = startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        } else if (type === 'weekly') {
          config.name = `Week of ${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        } else if (type === 'biweekly') {
          config.name = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        }
      }
      
      await saveSeasonConfigs();
      return await showCreateSeasonStep1(interaction);
    }
    
    // User Select (Create Wizard Step 2)
    if (customId === 'pats_season_create_select_users') {
      const config = getSeasonConfig(interaction.user.id);
      const selectedUsers = interaction.values;
      
      // Add selected users to participants
      for (const userId of selectedUsers) {
        if (!config.participants.includes(userId)) {
          config.participants.push(userId);
        }
      }
      
      await saveSeasonConfigs();
      return await showCreateSeasonStep2(interaction);
    }
    
    // Channel Select (Create Wizard Step 3)
    if (customId === 'pats_season_create_select_channel') {
      const config = getSeasonConfig(interaction.user.id);
      config.schedule.channelId = interaction.values[0];
      await saveSeasonConfigs();
      return await showCreateSeasonStep3(interaction);
    }
    
    // Add Participant (Manage Participants)
    if (customId === 'pats_season_add_participant') {
      const currentSeason = getCurrentSeason();
      if (!currentSeason) {
        return await showSeasonAdminMenu(interaction);
      }
      
      const userId = interaction.values[0];
      
      // Add participant
      addSeasonParticipant(userId);
      
      return await showManageParticipants(interaction);
    }
    
    // Remove Participant Confirm
    if (customId === 'pats_season_remove_participant_select') {
      const currentSeason = getCurrentSeason();
      if (!currentSeason) {
        return await showSeasonAdminMenu(interaction);
      }
      
      const userId = interaction.values[0];
      removeSeasonParticipant(userId);
      
      return await showManageParticipants(interaction);
    }
    
    // Channel Select (Schedule Settings)
    if (customId === 'pats_season_select_channel') {
      const currentSeason = getCurrentSeason();
      if (!currentSeason) {
        return await showSeasonAdminMenu(interaction);
      }
      
      const channelId = interaction.values[0];
      const { updateSeasonScheduleSettings } = await import('../utils/patsSeasons.js');
      updateSeasonScheduleSettings(currentSeason.id, { channelId });
      
      // Update all upcoming scheduled sessions for this season
      await updateUpcomingSessionSettings(currentSeason.id, { channelId });
      
      return await showScheduleSettings(interaction);
    }
    
    // Announcement Time Select (Schedule Settings)
    if (customId === 'pats_season_select_announcement') {
      const currentSeason = getCurrentSeason();
      if (!currentSeason) {
        return await showSeasonAdminMenu(interaction);
      }
      
      const announcementMinutes = parseInt(interaction.values[0]);
      const { updateSeasonScheduleSettings } = await import('../utils/patsSeasons.js');
      updateSeasonScheduleSettings(currentSeason.id, { announcementMinutes });
      
      // Update all upcoming scheduled sessions for this season
      await updateUpcomingSessionSettings(currentSeason.id, { announcementMinutes });
      
      return await showScheduleSettings(interaction);
    }
    
    // Session Type Select (Schedule Settings)
    if (customId === 'pats_season_select_session_type') {
      const currentSeason = getCurrentSeason();
      if (!currentSeason) {
        return await showSeasonAdminMenu(interaction);
      }
      
      const sessionType = interaction.values[0];
      const { updateSeasonScheduleSettings } = await import('../utils/patsSeasons.js');
      updateSeasonScheduleSettings(currentSeason.id, { sessionType });
      
      // Update all upcoming scheduled sessions for this season
      await updateUpcomingSessionSettings(currentSeason.id, { sessionType });
      
      return await showScheduleSettings(interaction);
    }
    
    // Select Session from Schedule List
    if (customId === 'pats_season_schedule_select') {
      const sessionId = interaction.values[0];
      return await showSessionDetails(interaction, sessionId);
    }
    
    // Reminder Times Select
    if (customId === 'pats_season_reminder_times') {
      const currentSeason = getCurrentSeason();
      if (!currentSeason) {
        return await showSeasonAdminMenu(interaction);
      }
      
      const minutes = interaction.values.map(v => parseInt(v)).sort((a, b) => b - a);
      const { updateSeasonScheduleSettings } = await import('../utils/patsSeasons.js');
      updateSeasonScheduleSettings(currentSeason.id, { 
        reminders: { 
          enabled: currentSeason.schedule?.reminders?.enabled ?? true, 
          minutes 
        } 
      });
      
      // Update all upcoming scheduled sessions
      await updateUpcomingSessionSettings(currentSeason.id, {
        notifications: {
          reminder: {
            enabled: currentSeason.schedule?.reminders?.enabled ?? true,
            minutesBefore: minutes[0]
          }
        }
      });
      
      return await showReminderConfig(interaction);
    }
    
    // Warning Times Select
    if (customId === 'pats_season_warning_times') {
      const currentSeason = getCurrentSeason();
      if (!currentSeason) {
        return await showSeasonAdminMenu(interaction);
      }
      
      const minutes = interaction.values.map(v => parseInt(v)).sort((a, b) => b - a);
      const { updateSeasonScheduleSettings } = await import('../utils/patsSeasons.js');
      updateSeasonScheduleSettings(currentSeason.id, { 
        warnings: { 
          enabled: currentSeason.schedule?.warnings?.enabled ?? true, 
          minutes 
        } 
      });
      
      // Update all upcoming scheduled sessions
      await updateUpcomingSessionSettings(currentSeason.id, {
        notifications: {
          warning: {
            enabled: currentSeason.schedule?.warnings?.enabled ?? true,
            minutesBefore: minutes[0]
          }
        }
      });
      
      return await showWarningConfig(interaction);
    }
    
    // Days Ahead Select
    if (customId === 'pats_season_select_days_ahead') {
      const currentSeason = getCurrentSeason();
      if (!currentSeason) {
        return await showSeasonAdminMenu(interaction);
      }
      
      const daysAhead = parseInt(interaction.values[0]);
      const { updateSeasonScheduleSettings } = await import('../utils/patsSeasons.js');
      updateSeasonScheduleSettings(currentSeason.id, { daysAhead });
      
      return await showDaysAheadConfig(interaction);
    }
    
  } catch (error) {
    console.error('Error handling season select menu:', error);
    await interaction.editReply({
      content: '❌ An error occurred. Please try again.',
      embeds: [],
      components: []
    });
  }
}

/**
 * Handle modal submissions
 */
export async function handleModal(interaction) {
  const customId = interaction.customId;
  
  try {
    await interaction.deferUpdate();
    
    if (customId === 'pats_season_modal_name') {
      const config = getSeasonConfig(interaction.user.id);
      config.name = interaction.fields.getTextInputValue('season_name');
      await saveSeasonConfigs();
      return await showCreateSeasonStep1(interaction);
    }
    
    if (customId === 'pats_season_modal_dates') {
      const config = getSeasonConfig(interaction.user.id);
      const startDate = interaction.fields.getTextInputValue('start_date');
      const endDate = interaction.fields.getTextInputValue('end_date');
      
      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        await interaction.followUp({
          content: '❌ Invalid date format. Please use YYYY-MM-DD format (e.g., 2025-01-01)',
          ephemeral: true
        });
        return await showCreateSeasonStep1(interaction);
      }
      
      // Validate dates are valid
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        await interaction.followUp({
          content: '❌ Invalid dates. Please check your dates and try again.',
          ephemeral: true
        });
        return await showCreateSeasonStep1(interaction);
      }
      
      if (start >= end) {
        await interaction.followUp({
          content: '❌ Start date must be before end date.',
          ephemeral: true
        });
        return await showCreateSeasonStep1(interaction);
      }
      
      config.startDate = startDate;
      config.endDate = endDate;
      await saveSeasonConfigs();
      return await showCreateSeasonStep1(interaction);
    }
    
    if (customId === 'pats_season_modal_timing') {
      const config = getSeasonConfig(interaction.user.id);
      const schedule = config.schedule;
      
      // Get values from modal
      const sessionStartStr = interaction.fields.getTextInputValue('session_start');
      const announcementStr = interaction.fields.getTextInputValue('announcement');
      const remindersStr = interaction.fields.getTextInputValue('reminders');
      const warningsStr = interaction.fields.getTextInputValue('warnings');
      
      // Parse and validate session start
      const sessionStart = parseInt(sessionStartStr);
      if (isNaN(sessionStart) || sessionStart < 0 || sessionStart > 1440) {
        await interaction.followUp({
          content: '❌ Session start must be a number between 0 and 1440 minutes.',
          ephemeral: true
        });
        return await showCreateSeasonStep3(interaction);
      }
      
      // Parse and validate announcement
      const announcement = parseInt(announcementStr);
      if (isNaN(announcement) || announcement < 0 || announcement > 1440) {
        await interaction.followUp({
          content: '❌ Announcement time must be a number between 0 and 1440 minutes.',
          ephemeral: true
        });
        return await showCreateSeasonStep3(interaction);
      }
      
      // Parse reminders (comma-separated)
      let reminders = [];
      if (remindersStr.trim()) {
        reminders = remindersStr.split(',')
          .map(s => parseInt(s.trim()))
          .filter(n => !isNaN(n) && n > 0 && n <= 1440);
        
        if (reminders.length === 0) {
          await interaction.followUp({
            content: '❌ Invalid reminders format. Use comma-separated numbers (e.g., 60, 30, 15)',
            ephemeral: true
          });
          return await showCreateSeasonStep3(interaction);
        }
      }
      
      // Parse warnings (comma-separated)
      let warnings = [];
      if (warningsStr.trim()) {
        warnings = warningsStr.split(',')
          .map(s => parseInt(s.trim()))
          .filter(n => !isNaN(n) && n > 0 && n <= 1440);
        
        if (warnings.length === 0) {
          await interaction.followUp({
            content: '❌ Invalid warnings format. Use comma-separated numbers (e.g., 5, 2)',
            ephemeral: true
          });
          return await showCreateSeasonStep3(interaction);
        }
      }
      
      // Update config
      schedule.sessionStartMinutes = sessionStart;
      schedule.announcementMinutes = announcement;
      if (reminders.length > 0) {
        schedule.reminders.minutes = reminders.sort((a, b) => b - a); // Sort descending
      }
      if (warnings.length > 0) {
        schedule.warnings.minutes = warnings.sort((a, b) => b - a); // Sort descending
      }
      
      await saveSeasonConfigs();
      return await showCreateSeasonStep3(interaction);
    }
    
    // Edit existing season name
    if (customId === 'pats_season_modal_edit_name') {
      const currentSeason = getCurrentSeason();
      if (!currentSeason) {
        return await showSeasonAdminMenu(interaction);
      }
      
      const newName = interaction.fields.getTextInputValue('season_name');
      
      if (!newName || newName.trim().length === 0) {
        await interaction.followUp({
          content: '❌ Season name cannot be empty.',
          ephemeral: true
        });
        return await showEditSeason(interaction);
      }
      
      const { updateSeason } = await import('../utils/patsSeasons.js');
      updateSeason(currentSeason.id, { name: newName.trim() });
      
      await interaction.followUp({
        content: `✅ Season name updated to **${newName.trim()}**`,
        ephemeral: true
      });
      
      return await showEditSeason(interaction);
    }
    
    // Edit existing season end date
    if (customId === 'pats_season_modal_edit_end_date') {
      const currentSeason = getCurrentSeason();
      if (!currentSeason) {
        return await showSeasonAdminMenu(interaction);
      }
      
      const endDate = interaction.fields.getTextInputValue('end_date');
      
      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(endDate)) {
        await interaction.followUp({
          content: '❌ Invalid date format. Please use YYYY-MM-DD format (e.g., 2025-04-30)',
          ephemeral: true
        });
        return await showEditSeason(interaction);
      }
      
      // Validate date is valid
      const end = new Date(endDate);
      const start = new Date(currentSeason.startDate);
      
      if (isNaN(end.getTime())) {
        await interaction.followUp({
          content: '❌ Invalid date. Please check your date and try again.',
          ephemeral: true
        });
        return await showEditSeason(interaction);
      }
      
      if (end <= start) {
        await interaction.followUp({
          content: '❌ End date must be after the season start date.',
          ephemeral: true
        });
        return await showEditSeason(interaction);
      }
      
      const { updateSeason } = await import('../utils/patsSeasons.js');
      updateSeason(currentSeason.id, { endDate });
      
      await interaction.followUp({
        content: `✅ Season end date updated to ${end.toLocaleDateString()}`,
        ephemeral: true
      });
      
      return await showEditSeason(interaction);
    }
    
  } catch (error) {
    console.error('Error handling season modal:', error);
    await interaction.editReply({
      content: '❌ An error occurred. Please try again.',
      embeds: [],
      components: []
    });
  }
}
