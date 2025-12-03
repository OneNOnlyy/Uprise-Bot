import { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionFlagsBits
} from 'discord.js';
import { 
  getMockLeague, 
  getUserTeam, 
  getLeaguePhase,
  isAdmin 
} from '../features/mock-offseason/mockData.js';
import { buildMainDashboard } from '../features/mock-offseason/dashboards/mainDashboard.js';
import { handleAdminCommand } from '../features/mock-offseason/admin/adminCommands.js';

export const data = new SlashCommandBuilder()
  .setName('mock')
  .setDescription('Mock Offseason - Become a GM and manage an NBA team')
  .addSubcommand(subcommand =>
    subcommand
      .setName('dashboard')
      .setDescription('Open the Mock Offseason dashboard'))
  .addSubcommandGroup(group =>
    group
      .setName('admin')
      .setDescription('Admin commands for Mock Offseason')
      .addSubcommand(subcommand =>
        subcommand
          .setName('create')
          .setDescription('Create a new Mock Offseason league')
          .addStringOption(option =>
            option.setName('season_name')
              .setDescription('Name for this season (e.g., "2025-26 Mock Offseason")')
              .setRequired(true)))
      .addSubcommand(subcommand =>
        subcommand
          .setName('start')
          .setDescription('Start the current Mock Offseason season'))
      .addSubcommand(subcommand =>
        subcommand
          .setName('advance')
          .setDescription('Advance to the next phase'))
      .addSubcommand(subcommand =>
        subcommand
          .setName('pause')
          .setDescription('Pause all timers'))
      .addSubcommand(subcommand =>
        subcommand
          .setName('resume')
          .setDescription('Resume all timers'))
      .addSubcommand(subcommand =>
        subcommand
          .setName('import')
          .setDescription('Import data from NBA APIs')
          .addStringOption(option =>
            option.setName('type')
              .setDescription('Type of data to import')
              .setRequired(true)
              .addChoices(
                { name: 'NBA Rosters', value: 'rosters' },
                { name: '2026 Draft Prospects', value: 'prospects' },
                { name: 'All Data', value: 'all' }
              )))
      .addSubcommand(subcommand =>
        subcommand
          .setName('assign')
          .setDescription('Manually assign a user to a team')
          .addUserOption(option =>
            option.setName('user')
              .setDescription('User to assign')
              .setRequired(true))
          .addStringOption(option =>
            option.setName('team')
              .setDescription('Team abbreviation (e.g., LAL, BOS)')
              .setRequired(true)))
      .addSubcommand(subcommand =>
        subcommand
          .setName('remove')
          .setDescription('Remove a GM from their team')
          .addUserOption(option =>
            option.setName('user')
              .setDescription('User to remove')
              .setRequired(true)))
      .addSubcommand(subcommand =>
        subcommand
          .setName('announce')
          .setDescription('Send an announcement to all GMs')
          .addStringOption(option =>
            option.setName('message')
              .setDescription('Announcement message')
              .setRequired(true)))
      .addSubcommand(subcommand =>
        subcommand
          .setName('config')
          .setDescription('Open the admin configuration panel'))
      .addSubcommand(subcommand =>
        subcommand
          .setName('reset')
          .setDescription('Reset the entire league (DANGEROUS - requires confirmation)')));

export async function execute(interaction) {
  const subcommandGroup = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand();
  
  // Handle admin commands
  if (subcommandGroup === 'admin') {
    // Check if user has admin permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: '❌ You need Administrator permissions to use admin commands.',
        ephemeral: true
      });
    }
    
    return await handleAdminCommand(interaction, subcommand);
  }
  
  // Handle dashboard command
  if (subcommand === 'dashboard') {
    return await showDashboard(interaction);
  }
}

/**
 * Show the main Mock Offseason dashboard
 */
async function showDashboard(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const league = await getMockLeague(interaction.guildId);
    
    // Check if a league exists
    if (!league) {
      const noLeagueEmbed = new EmbedBuilder()
        .setColor(0xFF6B6B)
        .setTitle('🏀 Mock Offseason')
        .setDescription('No Mock Offseason league has been created yet.')
        .addFields({
          name: '📋 Getting Started',
          value: 'An admin needs to create a league first using:\n`/mock admin create <season_name>`'
        })
        .setFooter({ text: 'Mock Offseason • Uprise Bot' })
        .setTimestamp();
      
      return interaction.editReply({ embeds: [noLeagueEmbed] });
    }
    
    // Build and show the main dashboard
    const dashboard = await buildMainDashboard(interaction, league);
    return interaction.editReply(dashboard);
    
  } catch (error) {
    console.error('Error showing mock dashboard:', error);
    return interaction.editReply({
      content: '❌ An error occurred while loading the dashboard. Please try again.',
    });
  }
}

/**
 * Button interaction handler - called from index.js
 * Routes all mock_* button interactions
 */
export async function handleButtonInteraction(interaction) {
  const { handleButton } = await import('../features/mock-offseason/handlers/buttonHandler.js');
  return await handleButton(interaction);
}

/**
 * Select menu interaction handler - called from index.js
 * Routes all mock_* select menu interactions
 */
export async function handleSelectMenuInteraction(interaction) {
  const { handleSelectMenu } = await import('../features/mock-offseason/handlers/selectMenuHandler.js');
  return await handleSelectMenu(interaction);
}

/**
 * Modal submit handler - called from index.js
 * Routes all mock_* modal submissions
 */
export async function handleModalSubmitInteraction(interaction) {
  const { handleModalSubmit } = await import('../features/mock-offseason/handlers/modalHandler.js');
  return await handleModalSubmit(interaction);
}
