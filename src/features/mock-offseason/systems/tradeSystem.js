/**
 * Mock Offseason - Trade System
 * Complete trade builder and validation system
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { getMockLeague, saveMockLeague, formatCurrency, addTransaction, CBA, NBA_TEAMS } from '../mockData.js';
import { validateTradeSalaries, calculateTradeCapImpact, calculateTradeValue } from '../data/playerData.js';

/**
 * Trade Proposal Structure
 */
export function createTradeProposal(initiatorTeam, targetTeam) {
  return {
    id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    status: 'draft', // draft, proposed, countered, accepted, rejected, expired, cancelled
    createdAt: new Date().toISOString(),
    expiresAt: null,
    
    initiator: {
      teamId: initiatorTeam,
      players: [],
      picks: [],
      cash: 0
    },
    target: {
      teamId: targetTeam,
      players: [],
      picks: [],
      cash: 0
    },
    
    messages: [],
    counterHistory: []
  };
}

/**
 * Build the trade builder interface
 */
export async function buildTradeBuilder(interaction, league, userTeamId, targetTeamId, tradeProposal = null) {
  const userTeam = league.teams[userTeamId];
  const targetTeam = league.teams[targetTeamId];
  
  if (!targetTeam) {
    return { content: '❌ Invalid target team.', ephemeral: true };
  }
  
  // Create or use existing proposal
  const proposal = tradeProposal || createTradeProposal(userTeamId, targetTeamId);
  
  // Calculate trade impact
  const userOutgoing = proposal.initiator.players;
  const userIncoming = proposal.target.players;
  const userCapImpact = calculateTradeCapImpact(
    userTeam.capSpace?.totalSalary || 0,
    userOutgoing,
    userIncoming
  );
  
  const targetCapImpact = calculateTradeCapImpact(
    targetTeam.capSpace?.totalSalary || 0,
    userIncoming,
    userOutgoing
  );
  
  // Validate salary matching
  const userIsOverCap = (userTeam.capSpace?.totalSalary || 0) > league.salaryCap;
  const salaryValid = validateTradeSalaries(
    userCapImpact.outgoingTotal,
    userCapImpact.incomingTotal,
    league.salaryCap - (userTeam.capSpace?.totalSalary || 0),
    userIsOverCap
  );
  
  const embed = new EmbedBuilder()
    .setColor(salaryValid ? 0x00FF00 : 0xFF6B6B)
    .setTitle('🔄 TRADE BUILDER')
    .setDescription(`**${userTeam.teamName || NBA_TEAMS[userTeamId]?.name}** ↔️ **${targetTeam.teamName || NBA_TEAMS[targetTeamId]?.name}**`)
    .setTimestamp();
  
  // Your team's side
  const yourPlayersText = proposal.initiator.players.length > 0
    ? proposal.initiator.players.map(p => `${p.name} (${formatCurrency(p.salary)})`).join('\n')
    : '_No players selected_';
  
  const yourPicksText = proposal.initiator.picks.length > 0
    ? proposal.initiator.picks.map(p => `${p.year} Round ${p.round}`).join('\n')
    : '_No picks selected_';
  
  embed.addFields({
    name: `📤 YOU SEND (${userTeam.teamName || NBA_TEAMS[userTeamId]?.name})`,
    value: `**Players:**\n${yourPlayersText}\n\n**Picks:**\n${yourPicksText}\n\n**Total:** ${formatCurrency(userCapImpact.outgoingTotal)}`,
    inline: true
  });
  
  // Their side
  const theirPlayersText = proposal.target.players.length > 0
    ? proposal.target.players.map(p => `${p.name} (${formatCurrency(p.salary)})`).join('\n')
    : '_No players selected_';
  
  const theirPicksText = proposal.target.picks.length > 0
    ? proposal.target.picks.map(p => `${p.year} Round ${p.round}`).join('\n')
    : '_No picks selected_';
  
  embed.addFields({
    name: `📥 YOU RECEIVE (${targetTeam.teamName || NBA_TEAMS[targetTeamId]?.name})`,
    value: `**Players:**\n${theirPlayersText}\n\n**Picks:**\n${theirPicksText}\n\n**Total:** ${formatCurrency(userCapImpact.incomingTotal)}`,
    inline: true
  });
  
  // Salary matching info
  const salaryMatchText = salaryValid 
    ? '✅ Salaries match CBA rules'
    : '❌ Salaries do NOT match - adjust trade';
  
  embed.addFields({
    name: '💰 Salary Matching',
    value: `${salaryMatchText}\n\nNet change: ${userCapImpact.netChange >= 0 ? '+' : ''}${formatCurrency(userCapImpact.netChange)}`,
    inline: false
  });
  
  // Action buttons
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mock_trade_add_player_${proposal.id}_yours`)
      .setLabel('Add Your Player')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`mock_trade_add_player_${proposal.id}_theirs`)
      .setLabel('Request Player')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`mock_trade_add_pick_${proposal.id}_yours`)
      .setLabel('Add Your Pick')
      .setEmoji('🎯')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`mock_trade_add_pick_${proposal.id}_theirs`)
      .setLabel('Request Pick')
      .setEmoji('🎯')
      .setStyle(ButtonStyle.Secondary)
  );
  
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mock_trade_submit_${proposal.id}`)
      .setLabel('Propose Trade')
      .setEmoji('📤')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!salaryValid || (proposal.initiator.players.length === 0 && proposal.initiator.picks.length === 0)),
    new ButtonBuilder()
      .setCustomId(`mock_trade_clear_${proposal.id}`)
      .setLabel('Clear')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('mock_nav_trade')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );
  
  // Store proposal in temp storage for this interaction
  interaction.client.mockTrades = interaction.client.mockTrades || new Map();
  interaction.client.mockTrades.set(proposal.id, proposal);
  
  return {
    embeds: [embed],
    components: [row1, row2]
  };
}

/**
 * Show player selection for trade
 */
export async function showPlayerSelection(interaction, proposalId, side, league, teamId) {
  const team = league.teams[teamId];
  const roster = team?.roster || [];
  
  if (roster.length === 0) {
    return interaction.reply({ content: '❌ This team has no players on the roster.', ephemeral: true });
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle(`📋 Select Player - ${team.teamName || NBA_TEAMS[teamId]?.name}`)
    .setDescription('Select a player to add to the trade.')
    .setTimestamp();
  
  const options = roster.slice(0, 25).map(player => ({
    label: player.name,
    description: `${player.position} - ${formatCurrency(player.salary)} / ${player.yearsRemaining}yr`,
    value: player.id,
    emoji: getPositionEmoji(player.position)
  }));
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`mock_trade_select_player_${proposalId}_${side}_${teamId}`)
    .setPlaceholder('Select player...')
    .addOptions(options);
  
  const selectRow = new ActionRowBuilder().addComponents(selectMenu);
  
  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mock_trade_builder_${proposalId}`)
      .setLabel('Back to Trade')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return interaction.update({ embeds: [embed], components: [selectRow, backRow] });
}

/**
 * Show pick selection for trade
 */
export async function showPickSelection(interaction, proposalId, side, league, teamId) {
  const team = league.teams[teamId];
  const picks = team?.draftPicks || [];
  
  if (picks.length === 0) {
    return interaction.reply({ content: '❌ This team has no draft picks available.', ephemeral: true });
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle(`🎯 Select Draft Pick - ${team.teamName || NBA_TEAMS[teamId]?.name}`)
    .setDescription('Select a draft pick to add to the trade.')
    .setTimestamp();
  
  const options = picks.slice(0, 25).map(pick => ({
    label: `${pick.year} Round ${pick.round}`,
    description: `${pick.originalTeam === teamId ? 'Own pick' : `From ${pick.originalTeam}`}${pick.protected ? ` - ${pick.protected}` : ''}`,
    value: `${pick.year}_${pick.round}_${pick.originalTeam}`
  }));
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`mock_trade_select_pick_${proposalId}_${side}_${teamId}`)
    .setPlaceholder('Select pick...')
    .addOptions(options);
  
  const selectRow = new ActionRowBuilder().addComponents(selectMenu);
  
  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mock_trade_builder_${proposalId}`)
      .setLabel('Back to Trade')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return interaction.update({ embeds: [embed], components: [selectRow, backRow] });
}

/**
 * Submit a trade proposal
 */
export async function submitTradeProposal(interaction, proposalId) {
  const proposal = interaction.client.mockTrades?.get(proposalId);
  if (!proposal) {
    return interaction.reply({ content: '❌ Trade proposal not found.', ephemeral: true });
  }
  
  const league = await getMockLeague(interaction.guildId);
  if (!league) {
    return interaction.reply({ content: '❌ No league exists.', ephemeral: true });
  }
  
  // Update proposal status
  proposal.status = 'proposed';
  proposal.expiresAt = new Date(Date.now() + (league.timingConfig?.tradeProposalExpiration || 86400000)).toISOString();
  
  // Add to pending trades
  league.pendingTrades = league.pendingTrades || [];
  league.pendingTrades.push(proposal);
  
  await saveMockLeague(interaction.guildId, league);
  
  const targetTeam = league.teams[proposal.target.teamId];
  const userTeam = league.teams[proposal.initiator.teamId];
  
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('📤 Trade Proposal Sent!')
    .setDescription(`Your trade proposal has been sent to **${targetTeam.teamName || NBA_TEAMS[proposal.target.teamId]?.name}**`)
    .addFields(
      { name: 'Status', value: '⏳ Awaiting Response', inline: true },
      { name: 'Expires', value: `<t:${Math.floor(new Date(proposal.expiresAt).getTime() / 1000)}:R>`, inline: true }
    )
    .setTimestamp();
  
  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_nav_trade')
      .setLabel('Back to Trade Hub')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`mock_trade_cancel_${proposalId}`)
      .setLabel('Cancel Trade')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
  );
  
  // Clean up temp storage
  interaction.client.mockTrades.delete(proposalId);
  
  return interaction.update({ embeds: [embed], components: [buttonRow] });
}

/**
 * Accept a trade proposal
 */
export async function acceptTradeProposal(interaction, proposalId) {
  const league = await getMockLeague(interaction.guildId);
  if (!league) {
    return interaction.reply({ content: '❌ No league exists.', ephemeral: true });
  }
  
  const proposal = league.pendingTrades?.find(t => t.id === proposalId);
  if (!proposal) {
    return interaction.reply({ content: '❌ Trade proposal not found.', ephemeral: true });
  }
  
  // Verify user is the target team's GM
  const userTeam = Object.entries(league.teams).find(([_, t]) => t.gm === interaction.user.id)?.[0];
  if (userTeam !== proposal.target.teamId) {
    return interaction.reply({ content: '❌ Only the receiving team\'s GM can accept this trade.', ephemeral: true });
  }
  
  // Execute the trade
  const initiatorTeam = league.teams[proposal.initiator.teamId];
  const targetTeam = league.teams[proposal.target.teamId];
  
  // Swap players
  for (const player of proposal.initiator.players) {
    const idx = initiatorTeam.roster.findIndex(p => p.id === player.id);
    if (idx !== -1) {
      initiatorTeam.roster.splice(idx, 1);
      targetTeam.roster.push(player);
    }
  }
  
  for (const player of proposal.target.players) {
    const idx = targetTeam.roster.findIndex(p => p.id === player.id);
    if (idx !== -1) {
      targetTeam.roster.splice(idx, 1);
      initiatorTeam.roster.push(player);
    }
  }
  
  // Swap picks
  for (const pick of proposal.initiator.picks) {
    const idx = initiatorTeam.draftPicks.findIndex(p => 
      p.year === pick.year && p.round === pick.round && p.originalTeam === pick.originalTeam
    );
    if (idx !== -1) {
      initiatorTeam.draftPicks.splice(idx, 1);
      targetTeam.draftPicks.push(pick);
    }
  }
  
  for (const pick of proposal.target.picks) {
    const idx = targetTeam.draftPicks.findIndex(p => 
      p.year === pick.year && p.round === pick.round && p.originalTeam === pick.originalTeam
    );
    if (idx !== -1) {
      targetTeam.draftPicks.splice(idx, 1);
      initiatorTeam.draftPicks.push(pick);
    }
  }
  
  // Update cap situations
  const initOutgoing = proposal.initiator.players.reduce((sum, p) => sum + p.salary, 0);
  const initIncoming = proposal.target.players.reduce((sum, p) => sum + p.salary, 0);
  initiatorTeam.capSpace.totalSalary = (initiatorTeam.capSpace.totalSalary || 0) - initOutgoing + initIncoming;
  
  const targetOutgoing = proposal.target.players.reduce((sum, p) => sum + p.salary, 0);
  const targetIncoming = proposal.initiator.players.reduce((sum, p) => sum + p.salary, 0);
  targetTeam.capSpace.totalSalary = (targetTeam.capSpace.totalSalary || 0) - targetOutgoing + targetIncoming;
  
  // Mark proposal as accepted and move to history
  proposal.status = 'accepted';
  proposal.completedAt = new Date().toISOString();
  
  league.pendingTrades = league.pendingTrades.filter(t => t.id !== proposalId);
  league.tradeHistory = league.tradeHistory || [];
  league.tradeHistory.push({
    ...proposal,
    team1: initiatorTeam.teamName || NBA_TEAMS[proposal.initiator.teamId]?.name,
    team2: targetTeam.teamName || NBA_TEAMS[proposal.target.teamId]?.name,
    date: new Date().toISOString()
  });
  
  // Log transaction
  await addTransaction(interaction.guildId, {
    type: 'trade',
    teams: [proposal.initiator.teamId, proposal.target.teamId],
    details: proposal
  });
  
  await saveMockLeague(interaction.guildId, league);
  
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('✅ TRADE COMPLETED!')
    .setDescription(`Trade between **${initiatorTeam.teamName}** and **${targetTeam.teamName}** has been finalized.`)
    .setTimestamp();
  
  return interaction.update({ embeds: [embed], components: [] });
}

/**
 * Get position emoji
 */
function getPositionEmoji(position) {
  const emojis = {
    PG: '🎯',
    SG: '🏹',
    SF: '🦅',
    PF: '💪',
    C: '🗼'
  };
  return emojis[position] || '🏀';
}

/**
 * Handle trade button interactions
 */
export async function handleTradeBuilderAction(interaction) {
  const customId = interaction.customId;
  const league = await getMockLeague(interaction.guildId);
  
  if (!league) {
    return interaction.reply({ content: '❌ No league exists.', ephemeral: true });
  }
  
  // Parse the action
  const parts = customId.split('_');
  
  // Add player to trade
  if (customId.includes('_add_player_')) {
    const proposalId = parts[4];
    const side = parts[5]; // 'yours' or 'theirs'
    const proposal = interaction.client.mockTrades?.get(proposalId);
    
    if (!proposal) {
      return interaction.reply({ content: '❌ Trade session expired.', ephemeral: true });
    }
    
    const teamId = side === 'yours' ? proposal.initiator.teamId : proposal.target.teamId;
    return await showPlayerSelection(interaction, proposalId, side, league, teamId);
  }
  
  // Add pick to trade  
  if (customId.includes('_add_pick_')) {
    const proposalId = parts[4];
    const side = parts[5];
    const proposal = interaction.client.mockTrades?.get(proposalId);
    
    if (!proposal) {
      return interaction.reply({ content: '❌ Trade session expired.', ephemeral: true });
    }
    
    const teamId = side === 'yours' ? proposal.initiator.teamId : proposal.target.teamId;
    return await showPickSelection(interaction, proposalId, side, league, teamId);
  }
  
  // Submit trade
  if (customId.includes('_submit_')) {
    const proposalId = parts[3];
    return await submitTradeProposal(interaction, proposalId);
  }
  
  // Clear trade
  if (customId.includes('_clear_')) {
    const proposalId = parts[3];
    const proposal = interaction.client.mockTrades?.get(proposalId);
    
    if (proposal) {
      proposal.initiator.players = [];
      proposal.initiator.picks = [];
      proposal.target.players = [];
      proposal.target.picks = [];
      
      const userTeamId = Object.entries(league.teams).find(([_, t]) => t.gm === interaction.user.id)?.[0];
      return interaction.update(await buildTradeBuilder(interaction, league, userTeamId, proposal.target.teamId, proposal));
    }
  }
  
  // Accept trade
  if (customId.includes('_accept_')) {
    const proposalId = parts[3];
    return await acceptTradeProposal(interaction, proposalId);
  }
  
  return interaction.reply({ content: '❌ Unknown trade action.', ephemeral: true });
}
