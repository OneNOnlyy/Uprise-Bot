/**
 * Mock Offseason - Trade Handler
 * Handles trade hub interface and trade negotiations
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { getMockLeague, saveMockLeague, formatCurrency, NBA_TEAMS } from '../mockData.js';

/**
 * Build trade hub embed
 */
export async function buildTradeHub(interaction, league, userTeamId) {
  const userTeam = league.teams[userTeamId];
  const pendingTrades = (league.pendingTrades || []).filter(
    t => t.from === userTeamId || t.to === userTeamId
  );
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle('🔄 TRADE HUB')
    .setDescription(`**Your Team:** ${userTeam.emoji} ${userTeam.name}`)
    .addFields(
      {
        name: '📨 Pending Offers',
        value: pendingTrades.length > 0 
          ? `You have **${pendingTrades.length}** pending trade(s)`
          : 'No pending trades',
        inline: true
      },
      {
        name: '📋 Trade History',
        value: `${(league.tradeHistory || []).length} total trades this offseason`,
        inline: true
      }
    )
    .setFooter({ text: 'Mock Offseason • Trade Hub' })
    .setTimestamp();
  
  // Add recent league trades
  const recentTrades = (league.tradeHistory || []).slice(-3);
  if (recentTrades.length > 0) {
    const tradeList = recentTrades.map(t => 
      `${t.team1} ↔️ ${t.team2}`
    ).join('\n');
    embed.addFields({
      name: '📰 Recent Trades',
      value: tradeList,
      inline: false
    });
  }
  
  // Trade action buttons
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_trade_new')
      .setLabel('Propose Trade')
      .setEmoji('📤')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('mock_trade_inbox')
      .setLabel('Trade Inbox')
      .setEmoji('📥')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(pendingTrades.length === 0),
    new ButtonBuilder()
      .setCustomId('mock_trade_finder')
      .setLabel('Trade Finder')
      .setEmoji('🔍')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_trade_history')
      .setLabel('History')
      .setEmoji('📜')
      .setStyle(ButtonStyle.Secondary)
  );
  
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_nav_dashboard')
      .setLabel('Dashboard')
      .setEmoji('🏠')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_nav_help')
      .setLabel('Trade Help')
      .setEmoji('❓')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return {
    embeds: [embed],
    components: [actionRow, navRow]
  };
}

/**
 * Handle trade button interactions
 */
export async function handleTradeAction(interaction) {
  const customId = interaction.customId;
  const league = await getMockLeague(interaction.guildId);
  
  if (!league) {
    return interaction.reply({ content: '❌ No league exists.', ephemeral: true });
  }
  
  // Find user's team
  const userTeam = Object.entries(league.teams).find(([_, t]) => t.gm === interaction.user.id)?.[0];
  if (!userTeam) {
    return interaction.reply({ content: '❌ You don\'t have a team!', ephemeral: true });
  }
  
  switch (customId) {
    case 'mock_trade_new':
      return await showNewTradeMenu(interaction, league, userTeam);
    case 'mock_trade_inbox':
      return await showTradeInbox(interaction, league, userTeam);
    case 'mock_trade_finder':
      return await showTradeFinder(interaction, league, userTeam);
    case 'mock_trade_history':
      return await showTradeHistory(interaction, league);
    default:
      return interaction.reply({ content: '❌ Unknown trade action.', ephemeral: true });
  }
}

/**
 * Show new trade menu - select team to trade with
 */
async function showNewTradeMenu(interaction, league, userTeamId) {
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('📤 Propose New Trade')
    .setDescription('Select a team to trade with.\n\nYou\'ll be able to select players and picks to offer/request.')
    .setTimestamp();
  
  // Get teams with GMs (excluding user's team)
  const availableTeams = Object.entries(league.teams)
    .filter(([id, team]) => id !== userTeamId && team.gm)
    .slice(0, 25);
  
  if (availableTeams.length === 0) {
    embed.setDescription('❌ No other teams have GMs assigned yet.');
    return interaction.update({ embeds: [embed], components: getBackButton() });
  }
  
  const options = availableTeams.map(([id, team]) => ({
    label: team.name,
    description: `GM: ${team.gmName || 'Unknown'}`,
    value: id,
    emoji: team.emoji
  }));
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('mock_trade_select_team')
    .setPlaceholder('Select team to trade with...')
    .addOptions(options);
  
  const selectRow = new ActionRowBuilder().addComponents(selectMenu);
  
  return interaction.update({ embeds: [embed], components: [selectRow, ...getBackButton()] });
}

/**
 * Show trade inbox
 */
async function showTradeInbox(interaction, league, userTeamId) {
  const pendingTrades = (league.pendingTrades || []).filter(
    t => t.from === userTeamId || t.to === userTeamId
  );
  
  if (pendingTrades.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xFF9500)
      .setTitle('📥 Trade Inbox')
      .setDescription('No pending trades.')
      .setTimestamp();
    
    return interaction.update({ embeds: [embed], components: getBackButton() });
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle('📥 Trade Inbox')
    .setDescription(`You have **${pendingTrades.length}** pending trade(s)`)
    .setTimestamp();
  
  pendingTrades.slice(0, 5).forEach((trade, i) => {
    const isIncoming = trade.to === userTeamId;
    const otherTeam = isIncoming ? league.teams[trade.from] : league.teams[trade.to];
    
    embed.addFields({
      name: `${isIncoming ? '📥 FROM' : '📤 TO'} ${otherTeam?.name || 'Unknown'}`,
      value: `Status: ${trade.status}\nExpires: ${trade.expiresAt || 'Never'}`,
      inline: true
    });
  });
  
  return interaction.update({ embeds: [embed], components: getBackButton() });
}

/**
 * Show trade finder
 */
async function showTradeFinder(interaction, league, userTeamId) {
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle('🔍 Trade Finder')
    .setDescription('🚧 **Trade Finder coming soon!**\n\nThis will help you find:\n• Cap-matching trades\n• Available players at your positions of need\n• Teams looking for your trade assets')
    .setTimestamp();
  
  return interaction.update({ embeds: [embed], components: getBackButton() });
}

/**
 * Show trade history
 */
async function showTradeHistory(interaction, league) {
  const history = league.tradeHistory || [];
  
  if (history.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xFF9500)
      .setTitle('📜 Trade History')
      .setDescription('No trades have been completed yet this offseason.')
      .setTimestamp();
    
    return interaction.update({ embeds: [embed], components: getBackButton() });
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle('📜 Trade History')
    .setDescription(`**${history.length}** trades completed`)
    .setTimestamp();
  
  history.slice(-10).reverse().forEach((trade, i) => {
    embed.addFields({
      name: `Trade #${history.length - i}`,
      value: `${trade.team1} ↔️ ${trade.team2}\n${trade.date || 'Unknown date'}`,
      inline: true
    });
  });
  
  return interaction.update({ embeds: [embed], components: getBackButton() });
}

/**
 * Handle trade select menu
 */
export async function handleTradeSelect(interaction) {
  const league = await getMockLeague(interaction.guildId);
  if (!league) {
    return interaction.reply({ content: '❌ No league exists.', ephemeral: true });
  }
  
  const selectedTeamId = interaction.values[0];
  const selectedTeam = league.teams[selectedTeamId];
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle(`🔄 Trade with ${selectedTeam?.name}`)
    .setDescription('🚧 **Trade builder coming soon!**\n\nYou\'ll be able to:\n• Select players to offer\n• Select picks to offer\n• Request players from them\n• Request picks from them\n• See salary matching requirements')
    .setTimestamp();
  
  return interaction.update({ embeds: [embed], components: getBackButton() });
}

/**
 * Get back button
 */
function getBackButton() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mock_nav_trade')
        .setLabel('Back to Trade Hub')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('mock_nav_dashboard')
        .setLabel('Dashboard')
        .setEmoji('🏠')
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}
