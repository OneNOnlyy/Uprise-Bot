/**
 * Mock Offseason - Admin Panel Handler
 * Handles button interactions from the admin panel
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { 
  getMockLeague, 
  saveMockLeague,
  runGMLottery,
  PHASES
} from '../mockData.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../../../data/mock-offseason');
const LEAGUE_FILE = path.join(DATA_DIR, 'league-settings.json');

/**
 * Handle admin panel button interactions
 */
export async function handleAdminPanelAction(interaction) {
  const customId = interaction.customId;
  
  // Verify admin permissions
  if (!interaction.member.permissions.has('Administrator')) {
    return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
  }
  
  if (customId === 'mock_admin_import_all') {
    return await handleImportAll(interaction);
  }
  
  if (customId === 'mock_admin_open_lottery') {
    return await handleOpenLottery(interaction);
  }
  
  if (customId === 'mock_admin_config') {
    return await handleOpenConfig(interaction);
  }
  
  if (customId === 'mock_admin_reset_confirm') {
    return await handleResetConfirm(interaction);
  }
  
  if (customId === 'mock_admin_reset_cancel') {
    return await interaction.update({ 
      content: '✅ Reset cancelled.',
      embeds: [],
      components: []
    });
  }
  
  if (customId === 'mock_admin_run_lottery') {
    return await handleRunLottery(interaction);
  }
  
  return interaction.reply({ content: '❌ Unknown admin action.', ephemeral: true });
}

/**
 * Import all data
 */
async function handleImportAll(interaction) {
  await interaction.deferUpdate();
  
  const league = await getMockLeague(interaction.guildId);
  if (!league) {
    return interaction.editReply({ content: '❌ No league exists.', embeds: [], components: [] });
  }
  
  try {
    // Dynamic import to avoid circular dependencies
    const { importAllData } = await import('../data/rosterImport.js');
    
    const result = await importAllData(interaction.guildId);
    
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ All Data Imported!')
      .setDescription('Successfully imported all mock offseason data.')
      .addFields(
        { name: '📊 Teams', value: `${result.rosters.teamsImported}`, inline: true },
        { name: '👥 Players', value: `${result.rosters.totalPlayers}`, inline: true },
        { name: '🎓 Prospects', value: `${result.prospects.prospectsImported}`, inline: true },
        { name: '📝 Free Agents', value: `${result.freeAgents.freeAgentsGenerated}`, inline: true }
      )
      .setTimestamp();
    
    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mock_admin_open_lottery')
        .setLabel('Open GM Lottery')
        .setEmoji('🎰')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('mock_nav_dashboard')
        .setLabel('View Dashboard')
        .setEmoji('📊')
        .setStyle(ButtonStyle.Secondary)
    );
    
    return interaction.editReply({ embeds: [embed], components: [buttonRow] });
    
  } catch (error) {
    console.error('Import error:', error);
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('❌ Import Failed')
      .setDescription(`Error: ${error.message}`)
      .setTimestamp();
    
    return interaction.editReply({ embeds: [embed], components: [] });
  }
}

/**
 * Open GM lottery registration
 */
async function handleOpenLottery(interaction) {
  const league = await getMockLeague(interaction.guildId);
  if (!league) {
    return interaction.reply({ content: '❌ No league exists.', ephemeral: true });
  }
  
  await interaction.deferUpdate();
  
  league.lotterySettings.registrationOpen = true;
  league.phase = PHASES.GM_LOTTERY;
  league.phaseStartTime = new Date().toISOString();
  
  await saveMockLeague(interaction.guildId, league);
  
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('🎰 GM Lottery Registration Open!')
    .setDescription('Users can now register for the GM lottery.\n\nThey should run `/mock dashboard` to access the registration.')
    .addFields(
      { name: 'Registered', value: `${league.lotterySettings.registeredUsers.length}/30`, inline: true },
      { name: 'Status', value: '📖 Open', inline: true }
    )
    .setTimestamp();
  
  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_admin_run_lottery')
      .setLabel('Run Lottery Draw')
      .setEmoji('🎲')
      .setStyle(ButtonStyle.Success)
      .setDisabled(league.lotterySettings.registeredUsers.length === 0),
    new ButtonBuilder()
      .setCustomId('mock_admin_close_lottery')
      .setLabel('Close Registration')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );
  
  return interaction.editReply({ embeds: [embed], components: [buttonRow] });
}

/**
 * Open config panel
 */
async function handleOpenConfig(interaction) {
  const league = await getMockLeague(interaction.guildId);
  if (!league) {
    return interaction.reply({ content: '❌ No league exists.', ephemeral: true });
  }
  
  await interaction.deferUpdate();
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle('⚙️ League Configuration')
    .setDescription('🚧 **Configuration panel coming soon!**\n\nFor now, use `/mock admin config` command.')
    .setTimestamp();
  
  return interaction.editReply({ embeds: [embed], components: [] });
}

/**
 * Confirm reset
 */
async function handleResetConfirm(interaction) {
  const league = await getMockLeague(interaction.guildId);
  if (!league) {
    return interaction.reply({ content: '❌ No league exists.', ephemeral: true });
  }
  
  await interaction.deferUpdate();
  
  try {
    // Delete the league
    const data = await fs.readFile(LEAGUE_FILE, 'utf-8');
    const leagues = JSON.parse(data);
    delete leagues[interaction.guildId];
    await fs.writeFile(LEAGUE_FILE, JSON.stringify(leagues, null, 2));
    
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('🗑️ League Reset')
      .setDescription(`**${league.seasonName}** has been deleted.\n\nUse \`/mock admin create\` to start a new league.`)
      .setTimestamp();
    
    return interaction.editReply({ embeds: [embed], components: [] });
    
  } catch (error) {
    console.error('Error resetting league:', error);
    return interaction.editReply({ content: `❌ Error: ${error.message}`, embeds: [], components: [] });
  }
}

/**
 * Run the GM lottery
 */
async function handleRunLottery(interaction) {
  await interaction.deferUpdate();
  
  try {
    const lotteryOrder = await runGMLottery(interaction.guildId);
    
    // Format the lottery order
    const orderList = lotteryOrder.map((userId, index) => 
      `${index + 1}. <@${userId}>`
    ).join('\n');
    
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('🎰 GM Lottery Complete!')
      .setDescription('The lottery order has been determined!\n\n**Selection Order:**')
      .addFields({
        name: 'Order',
        value: orderList || 'No participants'
      })
      .setFooter({ text: 'Users will be notified when it\'s their turn to pick!' })
      .setTimestamp();
    
    return interaction.editReply({ embeds: [embed], components: [] });
    
  } catch (error) {
    console.error('Error running lottery:', error);
    return interaction.editReply({ content: `❌ Error: ${error.message}`, embeds: [], components: [] });
  }
}

/**
 * Build admin panel embed
 */
export async function buildAdminPanel(interaction, league) {
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle('⚙️ ADMIN CONTROL PANEL')
    .setDescription(`**${league.seasonName}**`)
    .addFields(
      {
        name: '📅 Phase Control',
        value: `Current: ${league.phase}${league.isPaused ? ' (PAUSED)' : ''}`,
        inline: true
      },
      {
        name: '👥 GMs',
        value: `${Object.values(league.teams).filter(t => t.gm).length}/30 assigned`,
        inline: true
      },
      {
        name: '🎰 Lottery',
        value: `${league.lotterySettings.registeredUsers.length} registered\n${league.lotterySettings.registrationOpen ? '📖 Open' : '🔒 Closed'}`,
        inline: true
      }
    )
    .setFooter({ text: 'Mock Offseason Admin • Uprise Bot' })
    .setTimestamp();
  
  const buttonRow1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_admin_advance_phase')
      .setLabel('Advance Phase')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(league.isPaused ? 'mock_admin_resume' : 'mock_admin_pause')
      .setLabel(league.isPaused ? 'Resume' : 'Pause')
      .setEmoji(league.isPaused ? '▶️' : '⏸️')
      .setStyle(league.isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_admin_config')
      .setLabel('Config')
      .setEmoji('⚙️')
      .setStyle(ButtonStyle.Secondary)
  );
  
  const buttonRow2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_admin_import_all')
      .setLabel('Import Data')
      .setEmoji('📥')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_admin_announce_modal')
      .setLabel('Announce')
      .setEmoji('📢')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_admin_reset_prompt')
      .setLabel('Reset')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger)
  );
  
  return {
    embeds: [embed],
    components: [buttonRow1, buttonRow2]
  };
}
