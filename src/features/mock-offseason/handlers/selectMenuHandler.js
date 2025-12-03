/**
 * Mock Offseason - Select Menu Handler
 * Routes all select menu interactions to appropriate handlers
 */

import { getMockLeague } from '../mockData.js';
import { handleTradeSelect } from './tradeHandler.js';
import { handleFASelect } from './freeAgencyHandler.js';
import { handleDraftSelect } from './draftHandler.js';
import { handleHelpSelect } from './helpHandler.js';
import { handleNavSelectMenu } from '../dashboards/mainDashboard.js';

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
