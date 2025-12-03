/**
 * Mock Offseason - Select Menu Handler
 * Routes all select menu interactions to appropriate handlers
 */

import { getMockLeague } from '../mockData.js';
import { handleTradeSelect, handleTradePlayerSelect, handleTradePickSelect } from './tradeHandler.js';
import { handleFASelect } from './freeAgencyHandler.js';
import { handleDraftSelect } from './draftHandler.js';
import { handleHelpSelect } from './helpHandler.js';
import { handleNavSelectMenu } from '../dashboards/mainDashboard.js';
import { handleLeagueHubSelect } from './leagueHubHandler.js';

/**
 * Main select menu router
 */
export async function handleSelectMenu(interaction) {
  const customId = interaction.customId;
  
  // Navigation select menu
  if (customId === 'mock_nav_select' || customId === 'mock_select_navigation') {
    return await handleNavSelectMenu(interaction);
  }
  
  // Trade team selection
  if (customId === 'mock_trade_select_team') {
    return await handleTradeSelect(interaction);
  }
  
  // Trade player selection (in trade builder)
  if (customId === 'mock_trade_player_select') {
    return await handleTradePlayerSelect(interaction);
  }
  
  // Trade pick selection (in trade builder)
  if (customId === 'mock_trade_pick_select') {
    return await handleTradePickSelect(interaction);
  }
  
  // Free agent player selection
  if (customId === 'mock_fa_select_player') {
    return await handleFASelect(interaction);
  }
  
  // Draft prospect selection
  if (customId === 'mock_draft_select_prospect') {
    return await handleDraftSelect(interaction);
  }
  
  // Help topic selection
  if (customId === 'mock_help_topic') {
    return await handleHelpSelect(interaction);
  }
  
  // Team release player selection
  if (customId === 'mock_team_release_select') {
    return await handleReleaseSelect(interaction);
  }
  
  // Team extension player selection
  if (customId === 'mock_team_extend_select') {
    return await handleExtensionSelect(interaction);
  }
  
  // League hub team browser selection
  if (customId === 'mock_league_team_select') {
    return await handleLeagueHubSelect(interaction);
  }

  // Unknown select menu
  console.warn(`Unknown mock select menu: ${customId}`);
  return interaction.reply({ content: '❌ Unknown selection.', ephemeral: true });
}

/**
 * Handle player release selection
 */
async function handleReleaseSelect(interaction) {
  const playerId = interaction.values[0];
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
  const player = (team.roster || []).find(p => 
    (p.id || p.name.toLowerCase().replace(/\s/g, '_')) === playerId
  );
  
  if (!player) {
    return interaction.reply({ content: '❌ Player not found.', ephemeral: true });
  }
  
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
  const { formatCurrency } = await import('../mockData.js');
  
  const embed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('❌ Confirm Release')
    .setDescription(`Are you sure you want to release **${player.name}**?`)
    .addFields(
      { name: 'Position', value: player.position, inline: true },
      { name: 'Salary', value: formatCurrency(player.salary), inline: true },
      { name: 'Dead Cap', value: formatCurrency(player.salary * 0.5), inline: true }
    )
    .setFooter({ text: 'This action cannot be undone!' })
    .setTimestamp();
  
  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mock_team_release_confirm_${playerId}`)
      .setLabel('Confirm Release')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('mock_nav_team')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return interaction.update({ embeds: [embed], components: [buttonRow] });
}

/**
 * Handle extension player selection
 */
async function handleExtensionSelect(interaction) {
  const value = interaction.values[0];
  const playerId = value.replace('extend_', '');
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
  const player = (team.roster || []).find(p => 
    (p.id || p.name.toLowerCase().replace(/\s/g, '_')) === playerId
  );
  
  if (!player) {
    return interaction.reply({ content: '❌ Player not found.', ephemeral: true });
  }
  
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = await import('discord.js');
  const { formatCurrency } = await import('../mockData.js');
  
  // Show extension negotiation modal
  const modal = new ModalBuilder()
    .setCustomId(`mock_extension_offer_${playerId}`)
    .setTitle(`Extend ${player.name}`);
  
  const salaryInput = new TextInputBuilder()
    .setCustomId('ext_salary')
    .setLabel('Annual Salary (e.g., 25000000 or 25M)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(`${Math.round((player.salary || 10000000) * 1.1 / 1000000)}M`)
    .setRequired(true);
  
  const yearsInput = new TextInputBuilder()
    .setCustomId('ext_years')
    .setLabel('Contract Length (1-5 years)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('4')
    .setMaxLength(1)
    .setRequired(true);
  
  const optionInput = new TextInputBuilder()
    .setCustomId('ext_options')
    .setLabel('Contract Options (optional)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('PO in year 4, NTC')
    .setRequired(false);
  
  const salaryRow = new ActionRowBuilder().addComponents(salaryInput);
  const yearsRow = new ActionRowBuilder().addComponents(yearsInput);
  const optionRow = new ActionRowBuilder().addComponents(optionInput);
  
  modal.addComponents(salaryRow, yearsRow, optionRow);
  
  return interaction.showModal(modal);
}
