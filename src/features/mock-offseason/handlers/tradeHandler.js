/**
 * Mock Offseason - Trade Handler
 * Handles trade hub interface and trade negotiations
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { getMockLeague, saveMockLeague, formatCurrency, NBA_TEAMS, getUserTeam } from '../mockData.js';
import { TradeBuilder, validateTrade, TRADE_STATUS } from '../systems/tradeSystem.js';

// Store active trade builders (in memory - would need Redis for production)
const activeTradeBuilders = new Map();

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
    case 'mock_trade_finder_refresh':
      return await showTradeFinder(interaction, league, userTeam);
    case 'mock_trade_history':
      return await showTradeHistory(interaction, league);
    case 'mock_trade_add_player_offer':
      return await showPlayerSelect(interaction, league, userTeam, 'offer');
    case 'mock_trade_add_player_request':
      return await showPlayerSelect(interaction, league, userTeam, 'request');
    case 'mock_trade_add_pick_offer':
      return await showPickSelect(interaction, league, userTeam, 'offer');
    case 'mock_trade_add_pick_request':
      return await showPickSelect(interaction, league, userTeam, 'request');
    case 'mock_trade_clear':
      return await clearTrade(interaction, league);
    case 'mock_trade_propose':
      return await proposeTrade(interaction, league, userTeam);
    case 'mock_trade_whatif':
      return await showTradeWhatIf(interaction, league, userTeam);
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
 * Show trade finder - AI-assisted trade suggestions
 */
async function showTradeFinder(interaction, league, userTeamId) {
  const userTeam = league.teams[userTeamId];
  
  // Analyze team needs
  const teamNeeds = analyzeTeamNeeds(userTeam);
  const tradeSuggestions = findTradeSuggestions(league, userTeamId, teamNeeds);
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle('🔍 Trade Finder')
    .setDescription(`Analyzing trade options for **${userTeam.name}**...`)
    .setTimestamp();
  
  // Team needs analysis
  embed.addFields({
    name: '📊 Your Team Needs',
    value: teamNeeds.length > 0 
      ? teamNeeds.map(n => `• ${n.position}: ${n.reason}`).join('\n')
      : '• Team looks well-balanced!',
    inline: false
  });
  
  // Trade suggestions
  if (tradeSuggestions.length > 0) {
    embed.addFields({
      name: '💡 Suggested Trades',
      value: tradeSuggestions.slice(0, 5).map((s, i) => 
        `**${i + 1}.** ${s.description}`
      ).join('\n\n'),
      inline: false
    });
  } else {
    embed.addFields({
      name: '💡 Suggested Trades',
      value: '_No clear trade opportunities found right now._',
      inline: false
    });
  }
  
  // Cap situation
  const capSpace = (league.salaryCap || 140600000) - (userTeam.totalSalary || 0);
  const isTaxTeam = (userTeam.totalSalary || 0) > (league.taxLine || 170800000);
  
  embed.addFields({
    name: '💰 Cap Situation',
    value: `Cap Space: **${formatCurrency(capSpace)}**\nTax Status: ${isTaxTeam ? '⚠️ Tax Team' : '✅ Below Tax'}\nSalary Match: ${isTaxTeam ? '125% rule' : '110% rule'}`,
    inline: true
  });
  
  // Available assets
  const availableAssets = countTradeAssets(userTeam);
  embed.addFields({
    name: '📦 Your Trade Assets',
    value: `Players: **${availableAssets.players}**\nFirst Round Picks: **${availableAssets.firstRoundPicks}**\nSecond Round Picks: **${availableAssets.secondRoundPicks}**`,
    inline: true
  });
  
  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_trade_finder_refresh')
      .setLabel('Refresh Analysis')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('mock_trade_finder_byposition')
      .setLabel('Search by Position')
      .setEmoji('🎯')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_trade_finder_byteam')
      .setLabel('Search by Team')
      .setEmoji('🏀')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return interaction.update({ embeds: [embed], components: [buttonRow, ...getBackButton()] });
}

/**
 * Analyze team needs based on roster composition
 */
function analyzeTeamNeeds(team) {
  const needs = [];
  const roster = team.roster || [];
  
  // Count positions
  const positionCounts = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  roster.forEach(player => {
    const pos = player.position?.split('-')[0] || player.position;
    if (positionCounts[pos] !== undefined) {
      positionCounts[pos]++;
    }
  });
  
  // Check for thin positions
  Object.entries(positionCounts).forEach(([pos, count]) => {
    if (count < 2) {
      needs.push({
        position: pos,
        reason: count === 0 ? 'No players at position' : 'Only 1 player at position',
        priority: count === 0 ? 'HIGH' : 'MEDIUM'
      });
    }
  });
  
  // Check for lack of star power
  const starPlayers = roster.filter(p => (p.overall || 0) >= 85);
  if (starPlayers.length === 0) {
    needs.push({
      position: 'STAR',
      reason: 'No elite players (85+ OVR)',
      priority: 'HIGH'
    });
  }
  
  // Check for aging core
  const veteranCount = roster.filter(p => (p.age || 25) >= 32).length;
  if (veteranCount >= 4) {
    needs.push({
      position: 'YOUTH',
      reason: 'Heavy on veterans (32+)',
      priority: 'MEDIUM'
    });
  }
  
  return needs;
}

/**
 * Find trade suggestions based on team needs
 */
function findTradeSuggestions(league, userTeamId, needs) {
  const suggestions = [];
  const userTeam = league.teams[userTeamId];
  
  // Look through other teams for matching opportunities
  Object.entries(league.teams).forEach(([teamId, team]) => {
    if (teamId === userTeamId || !team.gm) return;
    
    const theirRoster = team.roster || [];
    
    needs.forEach(need => {
      if (need.position === 'STAR' || need.position === 'YOUTH') return;
      
      // Find players at needed position
      const matchingPlayers = theirRoster.filter(p => {
        const pos = p.position?.split('-')[0] || p.position;
        return pos === need.position && (p.overall || 70) >= 70;
      });
      
      matchingPlayers.forEach(player => {
        suggestions.push({
          targetTeam: teamId,
          targetTeamName: team.name,
          player: player,
          description: `**${player.name}** (${player.position}) from ${team.name}\n${formatCurrency(player.salary || 0)}/yr`,
          score: (player.overall || 70) + (need.priority === 'HIGH' ? 10 : 0)
        });
      });
    });
  });
  
  // Sort by score
  suggestions.sort((a, b) => b.score - a.score);
  
  return suggestions;
}

/**
 * Count available trade assets
 */
function countTradeAssets(team) {
  const roster = team.roster || [];
  const picks = team.picks || [];
  
  return {
    players: roster.filter(p => !(p.noTrade)).length,
    firstRoundPicks: picks.filter(p => p.round === 1).length,
    secondRoundPicks: picks.filter(p => p.round === 2).length
  };
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
 * Handle trade select menu - Start trade builder with selected team
 */
export async function handleTradeSelect(interaction) {
  const league = await getMockLeague(interaction.guildId);
  if (!league) {
    return interaction.reply({ content: '❌ No league exists.', ephemeral: true });
  }
  
  const userTeamEntry = Object.entries(league.teams).find(([_, t]) => t.gm === interaction.user.id);
  if (!userTeamEntry) {
    return interaction.reply({ content: '❌ You don\'t have a team!', ephemeral: true });
  }
  
  const [userTeamId, userTeam] = userTeamEntry;
  const selectedTeamId = interaction.values[0];
  const selectedTeam = league.teams[selectedTeamId];
  
  // Create new trade builder
  const tradeBuilder = new TradeBuilder(userTeamId, selectedTeamId);
  
  // Store in memory (keyed by user ID)
  activeTradeBuilders.set(interaction.user.id, tradeBuilder);
  
  // Show trade builder interface
  return await showTradeBuilder(interaction, league, tradeBuilder);
}

/**
 * Show the trade builder interface
 */
async function showTradeBuilder(interaction, league, tradeBuilder) {
  const fromTeam = league.teams[tradeBuilder.fromTeam];
  const toTeam = league.teams[tradeBuilder.toTeam];
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle(`🔄 Trade Builder`)
    .setDescription(`**${fromTeam.name}** ↔️ **${toTeam.name}**`)
    .setTimestamp();
  
  // Your offer section
  const yourOffer = formatTradePackage(tradeBuilder.offer, league);
  embed.addFields({
    name: `📤 You Offer (${fromTeam.name})`,
    value: yourOffer || '_Nothing selected_',
    inline: true
  });
  
  // Their side section
  const theirOffer = formatTradePackage(tradeBuilder.request, league);
  embed.addFields({
    name: `📥 You Receive (${toTeam.name})`,
    value: theirOffer || '_Nothing selected_',
    inline: true
  });
  
  // Salary breakdown
  const offerSalary = calculatePackageSalary(tradeBuilder.offer, league);
  const requestSalary = calculatePackageSalary(tradeBuilder.request, league);
  
  embed.addFields({
    name: '💰 Salary Breakdown',
    value: `Outgoing: **${formatCurrency(offerSalary)}**\nIncoming: **${formatCurrency(requestSalary)}**`,
    inline: false
  });
  
  // Validation status
  if (tradeBuilder.offer.players.length > 0 || tradeBuilder.request.players.length > 0) {
    const validation = validateTrade({
      fromTeam: fromTeam,
      toTeam: toTeam,
      offer: tradeBuilder.offer,
      request: tradeBuilder.request
    }, league);
    
    if (validation.valid) {
      embed.addFields({
        name: '✅ Trade Status',
        value: 'Trade is valid and can be proposed!',
        inline: false
      });
    } else {
      embed.addFields({
        name: '❌ Trade Issues',
        value: validation.errors.slice(0, 3).map(e => `• ${e}`).join('\n'),
        inline: false
      });
    }
  }
  
  // Build action buttons
  const actionRow1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_trade_add_player_offer')
      .setLabel('Add Player (Yours)')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('mock_trade_add_player_request')
      .setLabel('Add Player (Theirs)')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('mock_trade_add_pick_offer')
      .setLabel('Add Pick (Yours)')
      .setEmoji('🎯')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_trade_add_pick_request')
      .setLabel('Add Pick (Theirs)')
      .setEmoji('🎯')
      .setStyle(ButtonStyle.Secondary)
  );
  
  const actionRow2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_trade_clear')
      .setLabel('Clear Trade')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('mock_trade_propose')
      .setLabel('Propose Trade')
      .setEmoji('📤')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canProposeTrade(tradeBuilder)),
    new ButtonBuilder()
      .setCustomId('mock_trade_whatif')
      .setLabel('What-If Analysis')
      .setEmoji('🔮')
      .setStyle(ButtonStyle.Secondary)
  );
  
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_nav_trade')
      .setLabel('Cancel')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return interaction.update({ embeds: [embed], components: [actionRow1, actionRow2, navRow] });
}

/**
 * Format trade package for display
 */
function formatTradePackage(package_, league) {
  const parts = [];
  
  // Players
  if (package_.players.length > 0) {
    package_.players.forEach(p => {
      parts.push(`🏀 **${p.name}** (${formatCurrency(p.salary || 0)})`);
    });
  }
  
  // Picks
  if (package_.picks.length > 0) {
    package_.picks.forEach(pick => {
      parts.push(`🎯 ${pick.year} ${pick.round === 1 ? '1st' : '2nd'} Round Pick`);
    });
  }
  
  return parts.join('\n') || null;
}

/**
 * Calculate total salary in a trade package
 */
function calculatePackageSalary(package_, league) {
  return package_.players.reduce((sum, p) => sum + (p.salary || 0), 0);
}

/**
 * Check if trade can be proposed
 */
function canProposeTrade(tradeBuilder) {
  return (tradeBuilder.offer.players.length > 0 || tradeBuilder.offer.picks.length > 0) &&
         (tradeBuilder.request.players.length > 0 || tradeBuilder.request.picks.length > 0);
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

/**
 * Show player selection menu
 */
async function showPlayerSelect(interaction, league, userTeamId, side) {
  const tradeBuilder = activeTradeBuilders.get(interaction.user.id);
  if (!tradeBuilder) {
    return interaction.reply({ content: '❌ No active trade. Start a new trade first.', ephemeral: true });
  }
  
  // Determine which team's players to show
  const teamId = side === 'offer' ? tradeBuilder.fromTeam : tradeBuilder.toTeam;
  const team = league.teams[teamId];
  const roster = team.roster || [];
  
  if (roster.length === 0) {
    return interaction.reply({ content: `❌ ${team.name} has no players on roster.`, ephemeral: true });
  }
  
  // Filter out already selected players
  const alreadySelected = side === 'offer' 
    ? tradeBuilder.offer.players.map(p => p.id || p.name)
    : tradeBuilder.request.players.map(p => p.id || p.name);
  
  const availablePlayers = roster.filter(p => !alreadySelected.includes(p.id || p.name));
  
  if (availablePlayers.length === 0) {
    return interaction.reply({ content: '❌ All players already selected.', ephemeral: true });
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle(`Select Player from ${team.name}`)
    .setDescription(side === 'offer' ? 'Choose a player to **offer**' : 'Choose a player to **receive**')
    .setTimestamp();
  
  const options = availablePlayers.slice(0, 25).map(player => ({
    label: player.name,
    description: `${player.position} | ${formatCurrency(player.salary || 0)}/yr`,
    value: `${side}_${player.id || player.name.toLowerCase().replace(/\s/g, '_')}`,
    emoji: '🏀'
  }));
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('mock_trade_player_select')
    .setPlaceholder('Select a player...')
    .addOptions(options);
  
  const selectRow = new ActionRowBuilder().addComponents(selectMenu);
  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_trade_back_to_builder')
      .setLabel('Back to Trade Builder')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return interaction.update({ embeds: [embed], components: [selectRow, backRow] });
}

/**
 * Show pick selection menu
 */
async function showPickSelect(interaction, league, userTeamId, side) {
  const tradeBuilder = activeTradeBuilders.get(interaction.user.id);
  if (!tradeBuilder) {
    return interaction.reply({ content: '❌ No active trade. Start a new trade first.', ephemeral: true });
  }
  
  const teamId = side === 'offer' ? tradeBuilder.fromTeam : tradeBuilder.toTeam;
  const team = league.teams[teamId];
  const picks = team.picks || [];
  
  // Generate available picks if none exist
  const currentYear = new Date().getFullYear();
  const defaultPicks = [];
  for (let year = currentYear + 1; year <= currentYear + 5; year++) {
    defaultPicks.push({ year, round: 1, originalTeam: teamId });
    defaultPicks.push({ year, round: 2, originalTeam: teamId });
  }
  
  const availablePicks = picks.length > 0 ? picks : defaultPicks;
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle(`Select Pick from ${team.name}`)
    .setDescription(side === 'offer' ? 'Choose a draft pick to **offer**' : 'Choose a draft pick to **receive**')
    .setTimestamp();
  
  const options = availablePicks.slice(0, 25).map(pick => ({
    label: `${pick.year} ${pick.round === 1 ? '1st' : '2nd'} Round Pick`,
    description: pick.originalTeam !== teamId ? `Via ${NBA_TEAMS[pick.originalTeam]?.name || 'Unknown'}` : 'Own pick',
    value: `${side}_${pick.year}_${pick.round}_${pick.originalTeam}`,
    emoji: pick.round === 1 ? '🥇' : '🥈'
  }));
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('mock_trade_pick_select')
    .setPlaceholder('Select a draft pick...')
    .addOptions(options);
  
  const selectRow = new ActionRowBuilder().addComponents(selectMenu);
  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_trade_back_to_builder')
      .setLabel('Back to Trade Builder')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return interaction.update({ embeds: [embed], components: [selectRow, backRow] });
}

/**
 * Clear the current trade
 */
async function clearTrade(interaction, league) {
  const tradeBuilder = activeTradeBuilders.get(interaction.user.id);
  if (!tradeBuilder) {
    return interaction.reply({ content: '❌ No active trade to clear.', ephemeral: true });
  }
  
  // Create fresh trade builder with same teams
  const newBuilder = new TradeBuilder(tradeBuilder.fromTeam, tradeBuilder.toTeam);
  activeTradeBuilders.set(interaction.user.id, newBuilder);
  
  return await showTradeBuilder(interaction, league, newBuilder);
}

/**
 * Propose the trade to the other team
 */
async function proposeTrade(interaction, league, userTeamId) {
  const tradeBuilder = activeTradeBuilders.get(interaction.user.id);
  if (!tradeBuilder) {
    return interaction.reply({ content: '❌ No active trade to propose.', ephemeral: true });
  }
  
  const fromTeam = league.teams[tradeBuilder.fromTeam];
  const toTeam = league.teams[tradeBuilder.toTeam];
  
  // Validate trade
  const validation = validateTrade({
    fromTeam: fromTeam,
    toTeam: toTeam,
    offer: tradeBuilder.offer,
    request: tradeBuilder.request
  }, league);
  
  if (!validation.valid) {
    return interaction.reply({
      content: `❌ **Trade Invalid**\n${validation.errors.join('\n')}`,
      ephemeral: true
    });
  }
  
  // Create pending trade
  const pendingTrade = {
    id: `trade_${Date.now()}`,
    from: tradeBuilder.fromTeam,
    to: tradeBuilder.toTeam,
    offer: tradeBuilder.offer,
    request: tradeBuilder.request,
    status: TRADE_STATUS.PENDING,
    proposedAt: new Date().toISOString(),
    proposedBy: interaction.user.id,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hour expiry
  };
  
  if (!league.pendingTrades) league.pendingTrades = [];
  league.pendingTrades.push(pendingTrade);
  
  await saveMockLeague(interaction.guildId, league);
  
  // Clear the builder
  activeTradeBuilders.delete(interaction.user.id);
  
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('📤 Trade Proposed!')
    .setDescription(`Your trade offer has been sent to **${toTeam.name}**`)
    .addFields(
      { name: 'Status', value: 'Pending acceptance', inline: true },
      { name: 'Expires', value: '24 hours', inline: true }
    )
    .setTimestamp();
  
  return interaction.update({ embeds: [embed], components: getBackButton() });
}

/**
 * Show what-if analysis for the trade
 */
async function showTradeWhatIf(interaction, league, userTeamId) {
  const tradeBuilder = activeTradeBuilders.get(interaction.user.id);
  if (!tradeBuilder) {
    return interaction.reply({ content: '❌ No active trade to analyze.', ephemeral: true });
  }
  
  const fromTeam = league.teams[tradeBuilder.fromTeam];
  const toTeam = league.teams[tradeBuilder.toTeam];
  
  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle('🔮 What-If Analysis')
    .setDescription(`Trade Impact: **${fromTeam.name}** ↔️ **${toTeam.name}**`)
    .setTimestamp();
  
  // Calculate salary changes
  const offerSalary = tradeBuilder.offer.players.reduce((sum, p) => sum + (p.salary || 0), 0);
  const requestSalary = tradeBuilder.request.players.reduce((sum, p) => sum + (p.salary || 0), 0);
  
  const yourCurrentSalary = fromTeam.totalSalary || 0;
  const yourNewSalary = yourCurrentSalary - offerSalary + requestSalary;
  
  const theirCurrentSalary = toTeam.totalSalary || 0;
  const theirNewSalary = theirCurrentSalary - requestSalary + offerSalary;
  
  embed.addFields({
    name: `💰 ${fromTeam.name} Cap Impact`,
    value: `Before: ${formatCurrency(yourCurrentSalary)}\nAfter: ${formatCurrency(yourNewSalary)}\nChange: ${yourNewSalary > yourCurrentSalary ? '+' : ''}${formatCurrency(yourNewSalary - yourCurrentSalary)}`,
    inline: true
  });
  
  embed.addFields({
    name: `💰 ${toTeam.name} Cap Impact`,
    value: `Before: ${formatCurrency(theirCurrentSalary)}\nAfter: ${formatCurrency(theirNewSalary)}\nChange: ${theirNewSalary > theirCurrentSalary ? '+' : ''}${formatCurrency(theirNewSalary - theirCurrentSalary)}`,
    inline: true
  });
  
  // Position changes
  const positionsLost = tradeBuilder.offer.players.map(p => p.position).join(', ') || 'None';
  const positionsGained = tradeBuilder.request.players.map(p => p.position).join(', ') || 'None';
  
  embed.addFields({
    name: '📊 Roster Changes (Your Team)',
    value: `Losing: ${positionsLost}\nGaining: ${positionsGained}`,
    inline: false
  });
  
  // Pick analysis
  const picksLost = tradeBuilder.offer.picks.length;
  const picksGained = tradeBuilder.request.picks.length;
  
  if (picksLost > 0 || picksGained > 0) {
    embed.addFields({
      name: '🎯 Draft Capital',
      value: `Sending: ${picksLost} pick(s)\nReceiving: ${picksGained} pick(s)`,
      inline: true
    });
  }
  
  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_trade_back_to_builder')
      .setLabel('Back to Trade Builder')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return interaction.update({ embeds: [embed], components: [backRow] });
}

/**
 * Handle player selection from trade builder
 */
export async function handleTradePlayerSelect(interaction) {
  const league = await getMockLeague(interaction.guildId);
  if (!league) {
    return interaction.reply({ content: '❌ No league exists.', ephemeral: true });
  }
  
  const tradeBuilder = activeTradeBuilders.get(interaction.user.id);
  if (!tradeBuilder) {
    return interaction.reply({ content: '❌ No active trade.', ephemeral: true });
  }
  
  const value = interaction.values[0];
  const [side, ...playerIdParts] = value.split('_');
  const playerId = playerIdParts.join('_');
  
  // Find the player
  const teamId = side === 'offer' ? tradeBuilder.fromTeam : tradeBuilder.toTeam;
  const team = league.teams[teamId];
  const player = (team.roster || []).find(p => 
    (p.id || p.name.toLowerCase().replace(/\s/g, '_')) === playerId
  );
  
  if (!player) {
    return interaction.reply({ content: '❌ Player not found.', ephemeral: true });
  }
  
  // Add to trade builder
  if (side === 'offer') {
    tradeBuilder.addPlayerToOffer(player);
  } else {
    tradeBuilder.addPlayerToRequest(player);
  }
  
  return await showTradeBuilder(interaction, league, tradeBuilder);
}

/**
 * Handle pick selection from trade builder
 */
export async function handleTradePickSelect(interaction) {
  const league = await getMockLeague(interaction.guildId);
  if (!league) {
    return interaction.reply({ content: '❌ No league exists.', ephemeral: true });
  }
  
  const tradeBuilder = activeTradeBuilders.get(interaction.user.id);
  if (!tradeBuilder) {
    return interaction.reply({ content: '❌ No active trade.', ephemeral: true });
  }
  
  const value = interaction.values[0];
  const [side, year, round, originalTeam] = value.split('_');
  
  const pick = {
    year: parseInt(year),
    round: parseInt(round),
    originalTeam: originalTeam
  };
  
  // Add to trade builder
  if (side === 'offer') {
    tradeBuilder.addPickToOffer(pick);
  } else {
    tradeBuilder.addPickToRequest(pick);
  }
  
  return await showTradeBuilder(interaction, league, tradeBuilder);
}

/**
 * Handle back to builder button
 */
export async function handleBackToBuilder(interaction) {
  const league = await getMockLeague(interaction.guildId);
  if (!league) {
    return interaction.reply({ content: '❌ No league exists.', ephemeral: true });
  }
  
  const tradeBuilder = activeTradeBuilders.get(interaction.user.id);
  if (!tradeBuilder) {
    return interaction.reply({ content: '❌ No active trade.', ephemeral: true });
  }
  
  return await showTradeBuilder(interaction, league, tradeBuilder);
}
