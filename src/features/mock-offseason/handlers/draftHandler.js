/**
 * Mock Offseason - Draft Handler
 * Handles draft room interface and player selection
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { getMockLeague, saveMockLeague, formatCurrency, PHASES } from '../mockData.js';
import { DRAFT_PROSPECTS_2026, getProspect, getTopProspects, getProspectsByPosition, searchProspects } from '../data/playerData.js';

/**
 * Build draft room embed
 */
export async function buildDraftRoom(interaction, league, userTeamId) {
  const userTeam = league.teams[userTeamId];
  const draftSettings = league.draftSettings || {};
  const isDraftActive = league.phase === PHASES.DRAFT;
  
  // Get user's picks
  const myPicks = (userTeam.draftPicks || []).filter(p => p.year === (draftSettings.year || 2026));
  
  const embed = new EmbedBuilder()
    .setColor(isDraftActive ? 0x00FF00 : 0x1D428A)
    .setTitle('🎯 2026 NBA DRAFT ROOM')
    .setDescription(isDraftActive 
      ? '🟢 **DRAFT IS LIVE!**' 
      : '⏳ **Draft not yet started**')
    .addFields(
      {
        name: '🏆 Your Picks',
        value: myPicks.length > 0 
          ? myPicks.map(p => `Round ${p.round} #${p.pickNumber || '?'}`).join(', ')
          : 'No picks in this draft',
        inline: true
      },
      {
        name: '⏱️ Time Per Pick',
        value: `${draftSettings.timePerPick || 120} seconds`,
        inline: true
      },
      {
        name: '📊 Draft Progress',
        value: `Pick ${draftSettings.currentPick || 0}/60`,
        inline: true
      }
    )
    .setFooter({ text: 'Mock Offseason • Draft Room' })
    .setTimestamp();
  
  // Current pick info if draft is active
  if (isDraftActive && draftSettings.currentPick) {
    const onClock = draftSettings.onTheClock;
    embed.addFields({
      name: '🔔 ON THE CLOCK',
      value: onClock 
        ? `${league.teams[onClock]?.emoji} ${league.teams[onClock]?.name}`
        : 'Determining...',
      inline: false
    });
  }
  
  // Action buttons
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_draft_board')
      .setLabel('Draft Board')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('mock_draft_prospects')
      .setLabel('Prospects')
      .setEmoji('⭐')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_draft_results')
      .setLabel('Results')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_draft_my_board')
      .setLabel('My Big Board')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Secondary)
  );
  
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_nav_dashboard')
      .setLabel('Dashboard')
      .setEmoji('🏠')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_draft_simulate')
      .setLabel('Simulate Pick')
      .setEmoji('🤖')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!isDraftActive),
    new ButtonBuilder()
      .setCustomId('mock_nav_help')
      .setLabel('Draft Help')
      .setEmoji('❓')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return {
    embeds: [embed],
    components: [actionRow, navRow]
  };
}

/**
 * Handle draft button interactions
 */
export async function handleDraftAction(interaction) {
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
    case 'mock_draft_board':
      return await showDraftBoard(interaction, league);
    case 'mock_draft_prospects':
      return await showProspects(interaction, league);
    case 'mock_draft_results':
      return await showDraftResults(interaction, league);
    case 'mock_draft_my_board':
      return await showMyBigBoard(interaction, league, userTeam);
    case 'mock_draft_simulate':
      return await simulatePick(interaction, league, userTeam);
    case 'mock_draft_filter_all':
      return await showProspects(interaction, league);
    case 'mock_draft_filter_pg':
      return await showProspectsByPosition(interaction, league, 'PG');
    case 'mock_draft_filter_sg':
      return await showProspectsByPosition(interaction, league, ['SG', 'SF']);
    case 'mock_draft_filter_pf':
      return await showProspectsByPosition(interaction, league, ['PF', 'C']);
    case 'mock_draft_board_clear':
      return await clearBigBoard(interaction, league, userTeam);
    case 'mock_draft_toggle_autodraft':
      return await toggleAutoDraft(interaction, league, userTeam);
    default:
      // Handle add to board button
      if (customId.startsWith('mock_draft_add_board_')) {
        const prospectId = customId.replace('mock_draft_add_board_', '');
        return await addToBigBoard(interaction, league, userTeam, prospectId);
      }
      return interaction.reply({ content: '❌ Unknown draft action.', ephemeral: true });
  }
}

/**
 * Show draft order board
 */
async function showDraftBoard(interaction, league) {
  const draftSettings = league.draftSettings || {};
  const draftOrder = draftSettings.order || [];
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle('📋 2026 Draft Order')
    .setDescription('First round pick order')
    .setTimestamp();
  
  if (draftOrder.length === 0) {
    embed.setDescription('Draft order not yet determined.\n\nThis will be set based on:\n• Lottery results (picks 1-14)\n• Inverse regular season standings (15-30)');
  } else {
    // Show first 15 picks
    const orderList = draftOrder.slice(0, 15).map((teamId, i) => {
      const team = league.teams[teamId];
      return `${i + 1}. ${team?.emoji || '🏀'} ${team?.name || 'TBD'}`;
    }).join('\n');
    
    embed.addFields({
      name: 'Round 1 (1-15)',
      value: orderList || 'TBD',
      inline: true
    });
    
    // Show picks 16-30
    const orderList2 = draftOrder.slice(15, 30).map((teamId, i) => {
      const team = league.teams[teamId];
      return `${i + 16}. ${team?.emoji || '🏀'} ${team?.name || 'TBD'}`;
    }).join('\n');
    
    if (orderList2) {
      embed.addFields({
        name: 'Round 1 (16-30)',
        value: orderList2,
        inline: true
      });
    }
  }
  
  return interaction.update({ embeds: [embed], components: getBackButton() });
}

/**
 * Show prospect list
 */
async function showProspects(interaction, league) {
  // Use the 2026 draft prospects from playerData
  const prospects = DRAFT_PROSPECTS_2026;
  const draftedPlayers = (league.draftResults || []).map(r => r.playerId);
  
  // Filter out drafted players
  const availableProspects = prospects.filter(p => !draftedPlayers.includes(p.id));
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle('⭐ 2026 Draft Prospects')
    .setDescription(`**${availableProspects.length}** prospects available`)
    .setTimestamp();
  
  // Show top 10 available prospects with ratings
  const prospectList = availableProspects.slice(0, 10).map((p, i) => {
    const stars = '★'.repeat(Math.floor(p.ratings.overall / 20)) + '☆'.repeat(5 - Math.floor(p.ratings.overall / 20));
    return `**${i + 1}. ${p.name}** (${p.position})\n${stars} ${p.ratings.overall} OVR | ${p.school}`;
  }).join('\n\n');
  
  embed.addFields({
    name: '🏆 Top Available',
    value: prospectList || 'No prospects available',
    inline: false
  });
  
  // Filter buttons
  const filterRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_draft_filter_all')
      .setLabel('All')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('mock_draft_filter_pg')
      .setLabel('PG')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_draft_filter_sg')
      .setLabel('SG/SF')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_draft_filter_pf')
      .setLabel('PF/C')
      .setStyle(ButtonStyle.Secondary)
  );
  
  // Select menu for detailed view
  const options = availableProspects.slice(0, 25).map(p => ({
    label: p.name,
    description: `${p.position} | ${p.school} | ${p.ratings.overall} OVR`,
    value: p.id,
    emoji: getPositionEmoji(p.position)
  }));
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('mock_draft_select_prospect')
    .setPlaceholder('Select prospect for scouting report...')
    .addOptions(options);
  
  const selectRow = new ActionRowBuilder().addComponents(selectMenu);
  
  return interaction.update({ embeds: [embed], components: [filterRow, selectRow, ...getBackButton()] });
}

/**
 * Get emoji for position
 */
function getPositionEmoji(position) {
  const emojis = {
    'PG': '🏃',
    'SG': '🎯',
    'SF': '🦅',
    'PF': '💪',
    'C': '🏔️'
  };
  return emojis[position?.split('-')[0]] || '🏀';
}

/**
 * Show draft results
 */
async function showDraftResults(interaction, league) {
  const results = league.draftResults || [];
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle('📊 Draft Results')
    .setDescription(results.length > 0 
      ? `**${results.length}** picks made`
      : 'No picks have been made yet.')
    .setTimestamp();
  
  if (results.length > 0) {
    const resultList = results.slice(-15).map(pick => 
      `${pick.pickNumber}. ${pick.teamEmoji} **${pick.playerName}** (${pick.position})`
    ).join('\n');
    
    embed.addFields({
      name: 'Recent Picks',
      value: resultList,
      inline: false
    });
  }
  
  return interaction.update({ embeds: [embed], components: getBackButton() });
}

/**
 * Show user's personal big board
 */
async function showMyBigBoard(interaction, league, userTeamId) {
  const team = league.teams[userTeamId];
  const bigBoard = team.bigBoard || [];
  const allProspects = DRAFT_PROSPECTS_2026;
  const draftedPlayers = (league.draftResults || []).map(r => r.playerId);
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle('📝 My Big Board')
    .setDescription(bigBoard.length > 0 
      ? `You have **${bigBoard.length}** players ranked`
      : 'Your personal draft board is empty.')
    .setTimestamp();
  
  if (bigBoard.length === 0) {
    embed.addFields({
      name: '📋 How to Use',
      value: '1. Browse prospects in the Draft Room\n2. Click "Add to Big Board" on players you like\n3. Your rankings will appear here\n4. During the draft, you\'ll see your board with availability status',
      inline: false
    });
  } else {
    // Show ranked players with availability
    const boardList = bigBoard.slice(0, 15).map((entry, i) => {
      const prospect = allProspects.find(p => p.id === entry.prospectId);
      const isDrafted = draftedPlayers.includes(entry.prospectId);
      const status = isDrafted ? '🔴' : '🟢';
      
      return `${i + 1}. ${status} **${entry.name}** (${prospect?.position || '?'}) - ${prospect?.ratings?.overall || '?'} OVR`;
    }).join('\n');
    
    embed.addFields({
      name: '🏆 Your Rankings',
      value: boardList,
      inline: false
    });
    
    // Show auto-draft preference
    const autoDraft = team.autoDraftEnabled !== false;
    embed.addFields({
      name: '🤖 Auto-Draft',
      value: autoDraft 
        ? '✅ Enabled - Will pick from your board if you\'re away'
        : '❌ Disabled - You must be present to pick',
      inline: false
    });
  }
  
  // Action buttons
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_draft_board_reorder')
      .setLabel('Reorder Board')
      .setEmoji('↕️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(bigBoard.length < 2),
    new ButtonBuilder()
      .setCustomId('mock_draft_board_clear')
      .setLabel('Clear Board')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(bigBoard.length === 0),
    new ButtonBuilder()
      .setCustomId('mock_draft_toggle_autodraft')
      .setLabel(team.autoDraftEnabled !== false ? 'Disable Auto-Draft' : 'Enable Auto-Draft')
      .setEmoji('🤖')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return interaction.update({ embeds: [embed], components: [actionRow, ...getBackButton()] });
}

/**
 * Simulate/auto-pick
 */
async function simulatePick(interaction, league, userTeamId) {
  const draftSettings = league.draftSettings || {};
  
  // Check if user is on the clock
  if (draftSettings.onTheClock !== userTeamId) {
    return interaction.reply({ 
      content: '❌ It\'s not your turn to pick!',
      ephemeral: true 
    });
  }
  
  const embed = new EmbedBuilder()
    .setColor(0xFF9500)
    .setTitle('🤖 Auto-Pick Confirmation')
    .setDescription('Are you sure you want to simulate your pick?\n\nThe system will select the best available player based on consensus rankings.')
    .setTimestamp();
  
  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_draft_simulate_confirm')
      .setLabel('Yes, Auto-Pick')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('mock_nav_draft')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return interaction.update({ embeds: [embed], components: [buttonRow] });
}

/**
 * Handle draft select menu
 */
export async function handleDraftSelect(interaction) {
  const prospectId = interaction.values[0];
  const league = await getMockLeague(interaction.guildId);
  
  if (!league) {
    return interaction.reply({ content: '❌ No league exists.', ephemeral: true });
  }
  
  // Find prospect from our 2026 class
  const prospect = getProspect(prospectId);
  
  if (!prospect) {
    return interaction.reply({ content: '❌ Prospect not found.', ephemeral: true });
  }
  
  // Calculate star rating
  const stars = '★'.repeat(Math.floor(prospect.ratings.overall / 20)) + '☆'.repeat(5 - Math.floor(prospect.ratings.overall / 20));
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle(`🏀 ${prospect.name}`)
    .setDescription(`**${prospect.position}** | ${prospect.school}\n${stars} **${prospect.ratings.overall} OVR**`)
    .addFields(
      { name: '📏 Height', value: prospect.height, inline: true },
      { name: '⚖️ Weight', value: `${prospect.weight} lbs`, inline: true },
      { name: '🎂 Age', value: `${prospect.age}`, inline: true },
      { name: '📊 Projected Pick', value: `${prospect.projectedPick.min}-${prospect.projectedPick.max}`, inline: true },
      { name: '🏆 Ceiling', value: `${prospect.ratings.ceiling}`, inline: true },
      { name: '📉 Floor', value: `${prospect.ratings.floor}`, inline: true }
    )
    .setTimestamp();
  
  // Skills section
  if (prospect.skills && prospect.skills.length > 0) {
    embed.addFields({
      name: '🎯 Key Skills',
      value: prospect.skills.map(s => `• ${s}`).join('\n'),
      inline: true
    });
  }
  
  // Comparison
  if (prospect.comparison) {
    embed.addFields({
      name: '📺 Comparison',
      value: prospect.comparison,
      inline: true
    });
  }
  
  // Scouting report if available
  if (prospect.scoutingReport) {
    embed.addFields({
      name: '📋 Scouting Report',
      value: prospect.scoutingReport,
      inline: false
    });
  }
  
  // Check if draft is active and user can pick
  const isDraftActive = league.phase === PHASES.DRAFT;
  const userTeam = Object.entries(league.teams).find(([_, t]) => t.gm === interaction.user.id)?.[0];
  const canPick = isDraftActive && league.draftSettings?.onTheClock === userTeam;
  
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mock_draft_pick_${prospectId}`)
      .setLabel('Draft This Player')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canPick),
    new ButtonBuilder()
      .setCustomId(`mock_draft_add_board_${prospectId}`)
      .setLabel('Add to Big Board')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return interaction.update({ embeds: [embed], components: [actionRow, ...getBackButton()] });
}

/**
 * Show prospects filtered by position
 */
async function showProspectsByPosition(interaction, league, positions) {
  const posArray = Array.isArray(positions) ? positions : [positions];
  const prospects = DRAFT_PROSPECTS_2026.filter(p => posArray.includes(p.position));
  const draftedPlayers = (league.draftResults || []).map(r => r.playerId);
  const availableProspects = prospects.filter(p => !draftedPlayers.includes(p.id));
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle(`⭐ 2026 Prospects - ${posArray.join('/')}`)
    .setDescription(`**${availableProspects.length}** prospects available`)
    .setTimestamp();
  
  const prospectList = availableProspects.slice(0, 10).map((p, i) => {
    const stars = '★'.repeat(Math.floor(p.ratings.overall / 20));
    return `**${i + 1}. ${p.name}** (${p.position})\n${stars} ${p.ratings.overall} OVR | ${p.school}`;
  }).join('\n\n');
  
  embed.addFields({
    name: '🏆 Top Available',
    value: prospectList || 'No prospects at this position',
    inline: false
  });
  
  // Filter buttons
  const filterRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_draft_filter_all')
      .setLabel('All')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_draft_filter_pg')
      .setLabel('PG')
      .setStyle(posArray.includes('PG') ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_draft_filter_sg')
      .setLabel('SG/SF')
      .setStyle(posArray.includes('SG') ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_draft_filter_pf')
      .setLabel('PF/C')
      .setStyle(posArray.includes('PF') ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );
  
  if (availableProspects.length === 0) {
    return interaction.update({ embeds: [embed], components: [filterRow, ...getBackButton()] });
  }
  
  // Select menu for detailed view
  const options = availableProspects.slice(0, 25).map(p => ({
    label: p.name,
    description: `${p.position} | ${p.school} | ${p.ratings.overall} OVR`,
    value: p.id,
    emoji: getPositionEmoji(p.position)
  }));
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('mock_draft_select_prospect')
    .setPlaceholder('Select prospect for scouting report...')
    .addOptions(options);
  
  const selectRow = new ActionRowBuilder().addComponents(selectMenu);
  
  return interaction.update({ embeds: [embed], components: [filterRow, selectRow, ...getBackButton()] });
}

/**
 * Add prospect to big board
 */
async function addToBigBoard(interaction, league, userTeamId, prospectId) {
  const team = league.teams[userTeamId];
  const prospect = getProspect(prospectId);
  
  if (!prospect) {
    return interaction.reply({ content: '❌ Prospect not found.', ephemeral: true });
  }
  
  // Initialize big board
  if (!team.bigBoard) team.bigBoard = [];
  
  // Check if already on board
  if (team.bigBoard.find(b => b.prospectId === prospectId)) {
    return interaction.reply({ content: '❌ This prospect is already on your big board!', ephemeral: true });
  }
  
  // Add to board
  team.bigBoard.push({
    prospectId: prospect.id,
    name: prospect.name,
    position: prospect.position,
    overall: prospect.ratings.overall,
    addedAt: new Date().toISOString()
  });
  
  await saveMockLeague(interaction.guildId, league);
  
  return interaction.reply({
    content: `✅ **${prospect.name}** added to your big board at #${team.bigBoard.length}!`,
    ephemeral: true
  });
}

/**
 * Clear big board
 */
async function clearBigBoard(interaction, league, userTeamId) {
  const team = league.teams[userTeamId];
  
  if (!team.bigBoard || team.bigBoard.length === 0) {
    return interaction.reply({ content: '❌ Your big board is already empty.', ephemeral: true });
  }
  
  const count = team.bigBoard.length;
  team.bigBoard = [];
  
  await saveMockLeague(interaction.guildId, league);
  
  return interaction.reply({
    content: `✅ Cleared **${count}** players from your big board.`,
    ephemeral: true
  });
}

/**
 * Toggle auto-draft setting
 */
async function toggleAutoDraft(interaction, league, userTeamId) {
  const team = league.teams[userTeamId];
  
  team.autoDraftEnabled = team.autoDraftEnabled === false ? true : false;
  
  await saveMockLeague(interaction.guildId, league);
  
  return interaction.reply({
    content: team.autoDraftEnabled 
      ? '✅ Auto-draft **enabled**. If you\'re away during your pick, we\'ll select from your big board.'
      : '❌ Auto-draft **disabled**. You must be present to make your picks.',
    ephemeral: true
  });
}

/**
 * Get back button
 */
function getBackButton() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mock_nav_draft')
        .setLabel('Back to Draft Room')
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
