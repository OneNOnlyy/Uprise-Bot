/**
 * Mock Offseason - Button Handler
 * Routes all button interactions to appropriate handlers
 */

import { handleNavigation } from './navigationHandler.js';
import { handleTeamAction } from './teamHandler.js';
import { handleTradeAction } from './tradeHandler.js';
import { handleFreeAgencyAction } from './freeAgencyHandler.js';
import { handleDraftAction } from './draftHandler.js';
import { handleLotteryAction, handleLotteryTeamPick } from './lotteryHandler.js';
import { handleHelpAction } from './helpHandler.js';
import { handleAdminPanelAction } from '../admin/adminPanel.js';
import { getMockLeague, saveMockLeague } from '../mockData.js';

/**
 * Main button router for all mock_* buttons
 */
export async function handleButton(interaction) {
  const customId = interaction.customId;
  
  // Navigation buttons
  if (customId.startsWith('mock_nav_')) {
    return await handleNavigation(interaction);
  }
  
  // Refresh button
  if (customId === 'mock_refresh') {
    return await handleNavigation(interaction);
  }
  
  // Team action buttons
  if (customId.startsWith('mock_team_')) {
    // Handle release confirmation
    if (customId.startsWith('mock_team_release_confirm_')) {
      return await handleReleaseConfirm(interaction);
    }
    return await handleTeamAction(interaction);
  }
  
  // Trade action buttons
  if (customId.startsWith('mock_trade_')) {
    return await handleTradeAction(interaction);
  }
  
  // Free agency action buttons
  if (customId.startsWith('mock_fa_')) {
    // Handle specific offer buttons
    if (customId.startsWith('mock_fa_offer_')) {
      return await showOfferModal(interaction);
    }
    return await handleFreeAgencyAction(interaction);
  }
  
  // Draft action buttons
  if (customId.startsWith('mock_draft_')) {
    return await handleDraftAction(interaction);
  }
  
  // Lottery buttons
  if (customId.startsWith('mock_lottery_')) {
    // Team pick from lottery
    if (customId.startsWith('mock_lottery_pick_')) {
      const teamId = customId.replace('mock_lottery_pick_', '');
      return await handleLotteryTeamPick(interaction, teamId);
    }
    return await handleLotteryAction(interaction);
  }
  
  // Help buttons
  if (customId.startsWith('mock_help_')) {
    return await handleHelpAction(interaction);
  }
  
  // Admin panel buttons
  if (customId.startsWith('mock_admin_')) {
    return await handleAdminPanelAction(interaction);
  }
  
  // Unknown button
  console.warn(`Unknown mock button: ${customId}`);
  return interaction.reply({ content: '❌ Unknown action.', ephemeral: true });
}

/**
 * Handle player release confirmation
 */
async function handleReleaseConfirm(interaction) {
  const playerId = interaction.customId.replace('mock_team_release_confirm_', '');
  const league = await getMockLeague(interaction.guildId);
  
  if (!league) {
    return interaction.reply({ content: '❌ No league exists.', ephemeral: true });
  }
  
  // Find user's team
  const userTeamEntry = Object.entries(league.teams).find(([_, t]) => t.gm === interaction.user.id);
  if (!userTeamEntry) {
    return interaction.reply({ content: '❌ You don\'t have a team!', ephemeral: true });
  }
  
  const [teamId, team] = userTeamEntry;
  const playerIndex = (team.roster || []).findIndex(p => 
    (p.id || p.name.toLowerCase().replace(/\s/g, '_')) === playerId
  );
  
  if (playerIndex === -1) {
    return interaction.reply({ content: '❌ Player not found.', ephemeral: true });
  }
  
  const player = team.roster[playerIndex];
  
  // Remove player from roster
  team.roster.splice(playerIndex, 1);
  
  // Add to waived players / free agents
  if (!league.freeAgents) league.freeAgents = [];
  league.freeAgents.push({
    ...player,
    waivedBy: teamId,
    waivedAt: new Date().toISOString(),
    askingPrice: player.salary * 0.75 // Reduced asking price
  });
  
  await saveMockLeague(interaction.guildId, league);
  
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
  const { formatCurrency } = await import('../mockData.js');
  
  const embed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('❌ Player Released')
    .setDescription(`**${player.name}** has been released.`)
    .addFields(
      { name: 'Dead Cap', value: formatCurrency(player.salary * 0.5), inline: true },
      { name: 'Status', value: 'Waived - Available to sign', inline: true }
    )
    .setTimestamp();
  
  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_nav_team')
      .setLabel('Back to Team')
      .setEmoji('🏀')
      .setStyle(ButtonStyle.Primary)
  );
  
  return interaction.update({ embeds: [embed], components: [buttonRow] });
}

/**
 * Show free agent offer modal
 */
async function showOfferModal(interaction) {
  const playerId = interaction.customId.replace('mock_fa_offer_', '');
  
  const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
  
  const modal = new ModalBuilder()
    .setCustomId(`mock_fa_offer_modal_${playerId}`)
    .setTitle('Make Contract Offer');
  
  const salaryInput = new TextInputBuilder()
    .setCustomId('fa_salary')
    .setLabel('Annual Salary (e.g., 15000000 or 15M)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('15000000')
    .setRequired(true);
  
  const yearsInput = new TextInputBuilder()
    .setCustomId('fa_years')
    .setLabel('Contract Length (1-5 years)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('3')
    .setMaxLength(1)
    .setRequired(true);
  
  const salaryRow = new ActionRowBuilder().addComponents(salaryInput);
  const yearsRow = new ActionRowBuilder().addComponents(yearsInput);
  
  modal.addComponents(salaryRow, yearsRow);
  
  return interaction.showModal(modal);
}
