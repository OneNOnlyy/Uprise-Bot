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
  isSeasonParticipant,
  getSeasonHistory,
  getSessionsInSeason,
  getSeasonById
} from '../utils/patsSeasons.js';
import { getAllPlayers } from '../utils/patsData.js';

// PATS Role ID for auto-adding members
const PATS_ROLE_ID = '1445979227525746798';

// Store in-progress season configurations (userId -> config)
const seasonConfigs = new Map();

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
  }
  return seasonConfigs.get(userId);
}

/**
 * Clear season config for user
 */
function clearSeasonConfig(userId) {
  seasonConfigs.delete(userId);
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
    
    if (schedule.sessions.length > 0) {
      embed.addFields({ name: '📅 Scheduled Sessions', value: `${schedule.sessions.length} upcoming`, inline: true });
    }
  } else {
    embed.setDescription(
      '📅 **No Active Season**\n\n' +
      'Create a new season to start tracking standings, awards, and auto-scheduling sessions.'
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
        .setCustomId('pats_season_edit')
        .setLabel('Edit Season')
        .setEmoji('✏️')
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
        .setDisabled(!currentSeason),
      new ButtonBuilder()
        .setCustomId('pats_season_settings')
        .setLabel('Schedule Settings')
        .setEmoji('⚙️')
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
  
  const embed = new EmbedBuilder()
    .setTitle('➕ Create New Season (1/4)')
    .setDescription('📝 **Basic Information**')
    .setColor('#5865F2')
    .addFields(
      { name: '📛 Season Name', value: `\`${config.name}\``, inline: true },
      { name: '📆 Type', value: `\`${config.type}\``, inline: true },
      { name: '🗓️ Dates', value: `\`${config.startDate}\` to \`${config.endDate}\``, inline: false }
    )
    .setFooter({ text: 'Step 1 of 4 • Use buttons below to configure' });
  
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
    .setFooter({ text: 'Step 2 of 4 • Select users to participate in this season' });
  
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
    .setFooter({ text: 'Step 3 of 4 • Configure auto-scheduling for this season' });
  
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
    .setFooter({ text: 'Step 4 of 4 • Review and create your season' });
  
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
      return `<@${p.oddsUserId}> • ${totalPicks} picks`;
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
    label: p.username || `User ${p.oddsUserId}`,
    value: p.oddsUserId,
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
      (champion ? `🏆 Current Leader: <@${champion.oddsUserId}> (${champion.winPercentage.toFixed(1)}%)` : '')
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
      description += leader ? `└ Leader: <@${leader.oddsUserId}> (${leader.winPercentage.toFixed(1)}%)\n` : '';
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
 * Handle button interactions
 */
export async function handleButton(interaction) {
  const customId = interaction.customId;
  
  try {
    await interaction.deferUpdate();
    
    // Main menu navigation
    if (customId === 'pats_season_back' || customId === 'pats_season_admin_back') {
      // Go back to main PATS dashboard
      const patsCommand = await import('./pats.js');
      return await patsCommand.showDashboard(interaction);
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
        const season = createSeason({
          name: config.name,
          type: config.type,
          startDate: config.startDate,
          endDate: config.endDate,
          participants: config.participants,
          schedule: config.schedule
        });
        
        clearSeasonConfig(interaction.user.id);
        
        // Show success message
        const embed = new EmbedBuilder()
          .setTitle('✅ Season Created')
          .setDescription(`**${season.name}** has been created successfully!`)
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
      return await showCreateSeasonStep3(interaction);
    }
    
    // Toggle Reminders
    if (customId === 'pats_season_create_toggle_reminders') {
      const config = getSeasonConfig(interaction.user.id);
      config.schedule.reminders.enabled = !config.schedule.reminders.enabled;
      return await showCreateSeasonStep3(interaction);
    }
    
    // Toggle Warnings
    if (customId === 'pats_season_create_toggle_warnings') {
      const config = getSeasonConfig(interaction.user.id);
      config.schedule.warnings.enabled = !config.schedule.warnings.enabled;
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
            if (!isSeasonParticipant(currentSeason.id, memberId)) {
              addSeasonParticipant(currentSeason.id, memberId, member.user.username);
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
    
    // Edit Name Modal
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
      
      // For modals, we need to show modal without deferring
      // But we already deferred above, so we need to handle this differently
      // Let's use a workaround - we'll need to check if this works
      return await interaction.followUp({
        content: '⚠️ To edit the name, use `/pats season` and click "Edit Name" without any prior interaction.',
        ephemeral: true
      });
    }
    
    // Edit Dates Modal
    if (customId === 'pats_season_create_edit_dates') {
      return await interaction.followUp({
        content: '⚠️ To edit dates, select a different season type from the dropdown. For custom dates, choose "Custom" type.',
        ephemeral: true
      });
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
      
      return await showCreateSeasonStep2(interaction);
    }
    
    // Channel Select (Create Wizard Step 3)
    if (customId === 'pats_season_create_select_channel') {
      const config = getSeasonConfig(interaction.user.id);
      config.schedule.channelId = interaction.values[0];
      return await showCreateSeasonStep3(interaction);
    }
    
    // Add Participant (Manage Participants)
    if (customId === 'pats_season_add_participant') {
      const currentSeason = getCurrentSeason();
      if (!currentSeason) {
        return await showSeasonAdminMenu(interaction);
      }
      
      const userId = interaction.values[0];
      
      // Get username
      try {
        const user = await interaction.client.users.fetch(userId);
        addSeasonParticipant(currentSeason.id, userId, user.username);
      } catch (error) {
        addSeasonParticipant(currentSeason.id, userId);
      }
      
      return await showManageParticipants(interaction);
    }
    
    // Remove Participant Confirm
    if (customId === 'pats_season_remove_participant_select') {
      const currentSeason = getCurrentSeason();
      if (!currentSeason) {
        return await showSeasonAdminMenu(interaction);
      }
      
      const userId = interaction.values[0];
      removeSeasonParticipant(currentSeason.id, userId);
      
      return await showManageParticipants(interaction);
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
      return await showCreateSeasonStep1(interaction);
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
