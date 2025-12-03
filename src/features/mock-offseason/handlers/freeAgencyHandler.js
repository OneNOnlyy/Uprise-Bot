/**
 * Mock Offseason - Free Agency Handler
 * Handles free agency hub and player signing
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { getMockLeague, saveMockLeague, formatCurrency, CBA_CONSTANTS, PHASES } from '../mockData.js';

/**
 * Build free agency hub embed
 */
export async function buildFreeAgencyHub(interaction, league, userTeamId) {
  const userTeam = league.teams[userTeamId];
  const cap = userTeam.capSituation || { capSpace: 0, mleBudget: CBA_CONSTANTS.NON_TAX_MLE };
  const freeAgents = league.freeAgents || [];
  
  // Determine FA period status
  const isFA = league.phase === PHASES.FREE_AGENCY;
  const statusText = isFA ? '🟢 FREE AGENCY IS OPEN' : '🔴 FREE AGENCY NOT ACTIVE';
  
  const embed = new EmbedBuilder()
    .setColor(isFA ? 0x00FF00 : 0xFF0000)
    .setTitle('💼 FREE AGENCY HUB')
    .setDescription(`**Status:** ${statusText}\n**Your Team:** ${userTeam.emoji} ${userTeam.name}`)
    .addFields(
      {
        name: '💰 Your Cap Situation',
        value: [
          `**Cap Space:** ${formatCurrency(cap.capSpace)}`,
          `**MLE Budget:** ${formatCurrency(cap.mleBudget)}`,
          `**Room Exception:** ${formatCurrency(cap.roomException || CBA_CONSTANTS.ROOM_EXCEPTION)}`
        ].join('\n'),
        inline: true
      },
      {
        name: '📊 Market Overview',
        value: [
          `**Available FAs:** ${freeAgents.length}`,
          `**Pending Offers:** ${(league.pendingOffers || []).filter(o => o.from === userTeamId).length}`,
          `**Your Signings:** ${userTeam.signings?.length || 0}`
        ].join('\n'),
        inline: true
      }
    )
    .setFooter({ text: 'Mock Offseason • Free Agency' })
    .setTimestamp();
  
  // Top free agents preview
  const topFAs = freeAgents.slice(0, 5);
  if (topFAs.length > 0) {
    const faList = topFAs.map(p => 
      `${p.position} **${p.name}** - Asking ${formatCurrency(p.askingPrice)}`
    ).join('\n');
    embed.addFields({
      name: '⭐ Top Available Free Agents',
      value: faList,
      inline: false
    });
  }
  
  // Action buttons
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_fa_browse')
      .setLabel('Browse Free Agents')
      .setEmoji('🔍')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!isFA),
    new ButtonBuilder()
      .setCustomId('mock_fa_offers')
      .setLabel('My Offers')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_fa_signings')
      .setLabel('My Signings')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_fa_targets')
      .setLabel('Set Targets')
      .setEmoji('🎯')
      .setStyle(ButtonStyle.Secondary)
  );
  
  const filterRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_fa_filter_all')
      .setLabel('All')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_fa_filter_guards')
      .setLabel('Guards')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_fa_filter_wings')
      .setLabel('Wings')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_fa_filter_bigs')
      .setLabel('Bigs')
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
      .setLabel('FA Help')
      .setEmoji('❓')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return {
    embeds: [embed],
    components: [actionRow, filterRow, navRow]
  };
}

/**
 * Handle free agency button interactions
 */
export async function handleFreeAgencyAction(interaction) {
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
    case 'mock_fa_browse':
      return await showFABrowser(interaction, league, userTeam, 'all');
    case 'mock_fa_offers':
      return await showMyOffers(interaction, league, userTeam);
    case 'mock_fa_signings':
      return await showMySignings(interaction, league, userTeam);
    case 'mock_fa_targets':
      return await showTargets(interaction, league, userTeam);
    case 'mock_fa_filter_all':
      return await showFABrowser(interaction, league, userTeam, 'all');
    case 'mock_fa_filter_guards':
      return await showFABrowser(interaction, league, userTeam, 'guards');
    case 'mock_fa_filter_wings':
      return await showFABrowser(interaction, league, userTeam, 'wings');
    case 'mock_fa_filter_bigs':
      return await showFABrowser(interaction, league, userTeam, 'bigs');
    default:
      return interaction.reply({ content: '❌ Unknown FA action.', ephemeral: true });
  }
}

/**
 * Show FA browser with filter
 */
async function showFABrowser(interaction, league, userTeamId, filter) {
  let freeAgents = league.freeAgents || [];
  
  // Apply filter
  if (filter === 'guards') {
    freeAgents = freeAgents.filter(p => ['PG', 'SG'].includes(p.position));
  } else if (filter === 'wings') {
    freeAgents = freeAgents.filter(p => ['SF', 'SG'].includes(p.position));
  } else if (filter === 'bigs') {
    freeAgents = freeAgents.filter(p => ['PF', 'C'].includes(p.position));
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle(`🔍 Free Agent Market - ${filter.charAt(0).toUpperCase() + filter.slice(1)}`)
    .setDescription(`**${freeAgents.length}** free agents available`)
    .setTimestamp();
  
  if (freeAgents.length === 0) {
    embed.setDescription('No free agents match this filter, or free agency hasn\'t started yet.');
    return interaction.update({ embeds: [embed], components: getBackButton() });
  }
  
  // Show first 10
  const faList = freeAgents.slice(0, 10).map((p, i) => 
    `${i + 1}. **${p.name}** (${p.position}) - ${formatCurrency(p.askingPrice)}`
  ).join('\n');
  
  embed.addFields({
    name: 'Available Players',
    value: faList,
    inline: false
  });
  
  // Select menu for players
  const options = freeAgents.slice(0, 25).map(p => ({
    label: p.name,
    description: `${p.position} - ${formatCurrency(p.askingPrice)}`,
    value: p.id || p.name.toLowerCase().replace(/\s/g, '_')
  }));
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('mock_fa_select_player')
    .setPlaceholder('Select player for details...')
    .addOptions(options);
  
  const selectRow = new ActionRowBuilder().addComponents(selectMenu);
  
  return interaction.update({ embeds: [embed], components: [selectRow, ...getBackButton()] });
}

/**
 * Show my offers
 */
async function showMyOffers(interaction, league, userTeamId) {
  const offers = (league.pendingOffers || []).filter(o => o.from === userTeamId);
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle('📝 My Pending Offers')
    .setDescription(offers.length > 0 
      ? `You have **${offers.length}** pending offer(s)`
      : 'You have no pending offers.')
    .setTimestamp();
  
  offers.slice(0, 10).forEach(offer => {
    embed.addFields({
      name: offer.playerName,
      value: `${formatCurrency(offer.salary)} / ${offer.years}yr\nStatus: ${offer.status}`,
      inline: true
    });
  });
  
  return interaction.update({ embeds: [embed], components: getBackButton() });
}

/**
 * Show my signings
 */
async function showMySignings(interaction, league, userTeamId) {
  const team = league.teams[userTeamId];
  const signings = team.signings || [];
  
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('✅ My Signings This Offseason')
    .setDescription(signings.length > 0 
      ? `You've signed **${signings.length}** player(s)`
      : 'You haven\'t signed anyone yet.')
    .setTimestamp();
  
  signings.forEach(signing => {
    embed.addFields({
      name: signing.playerName,
      value: `${formatCurrency(signing.salary)} / ${signing.years}yr\nSigned: ${signing.date}`,
      inline: true
    });
  });
  
  return interaction.update({ embeds: [embed], components: getBackButton() });
}

/**
 * Show targets list
 */
async function showTargets(interaction, league, userTeamId) {
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle('🎯 Free Agent Targets')
    .setDescription('🚧 **Target list coming soon!**\n\nYou\'ll be able to:\n• Mark players as targets\n• Set max offer amounts\n• Get notifications when targets sign elsewhere')
    .setTimestamp();
  
  return interaction.update({ embeds: [embed], components: getBackButton() });
}

/**
 * Handle FA select menu
 */
export async function handleFASelect(interaction) {
  const playerId = interaction.values[0];
  const league = await getMockLeague(interaction.guildId);
  
  if (!league) {
    return interaction.reply({ content: '❌ No league exists.', ephemeral: true });
  }
  
  const player = (league.freeAgents || []).find(p => 
    (p.id || p.name.toLowerCase().replace(/\s/g, '_')) === playerId
  );
  
  if (!player) {
    return interaction.reply({ content: '❌ Player not found.', ephemeral: true });
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle(`${player.name}`)
    .setDescription(`**Position:** ${player.position}\n**Age:** ${player.age || 'Unknown'}`)
    .addFields(
      { name: '💰 Asking Price', value: formatCurrency(player.askingPrice), inline: true },
      { name: '📊 Market', value: `${player.interestedTeams?.length || 0} teams interested`, inline: true }
    )
    .setTimestamp();
  
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mock_fa_offer_${playerId}`)
      .setLabel('Make Offer')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`mock_fa_target_${playerId}`)
      .setLabel('Add to Targets')
      .setEmoji('🎯')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return interaction.update({ embeds: [embed], components: [actionRow, ...getBackButton()] });
}

/**
 * Get back button
 */
function getBackButton() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mock_nav_freeagency')
        .setLabel('Back to FA Hub')
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
