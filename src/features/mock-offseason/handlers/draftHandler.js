/**
 * Mock Offseason - Draft Handler
 * Handles draft room interface and player selection
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { getMockLeague, saveMockLeague, formatCurrency, PHASES } from '../mockData.js';

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
    default:
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
  const prospects = league.draftProspects || [];
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle('⭐ 2026 Draft Prospects')
    .setDescription(`**${prospects.length}** prospects available`)
    .setTimestamp();
  
  if (prospects.length === 0) {
    embed.setDescription('🚧 **Prospects not yet loaded!**\n\nProspect data will include:\n• Mock draft rankings\n• Player stats and measurements\n• Scouting reports\n• Projected NBA role');
    return interaction.update({ embeds: [embed], components: getBackButton() });
  }
  
  // Show top 10 prospects
  const prospectList = prospects.slice(0, 10).map((p, i) => 
    `${i + 1}. **${p.name}** - ${p.position} | ${p.school || 'International'}`
  ).join('\n');
  
  embed.addFields({
    name: 'Top Prospects',
    value: prospectList,
    inline: false
  });
  
  // Select menu
  const options = prospects.slice(0, 25).map(p => ({
    label: p.name,
    description: `${p.position} - ${p.school || 'International'}`,
    value: p.id || p.name.toLowerCase().replace(/\s/g, '_')
  }));
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('mock_draft_select_prospect')
    .setPlaceholder('Select prospect for details...')
    .addOptions(options);
  
  const selectRow = new ActionRowBuilder().addComponents(selectMenu);
  
  return interaction.update({ embeds: [embed], components: [selectRow, ...getBackButton()] });
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
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle('📝 My Big Board')
    .setDescription('🚧 **Personal rankings coming soon!**\n\nYou\'ll be able to:\n• Rank prospects in your preferred order\n• Add notes on players\n• Set auto-draft priority\n• Compare your rankings to consensus')
    .setTimestamp();
  
  return interaction.update({ embeds: [embed], components: getBackButton() });
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
  
  const prospect = (league.draftProspects || []).find(p => 
    (p.id || p.name.toLowerCase().replace(/\s/g, '_')) === prospectId
  );
  
  if (!prospect) {
    return interaction.reply({ content: '❌ Prospect not found.', ephemeral: true });
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle(`${prospect.name}`)
    .setDescription(`**Position:** ${prospect.position}\n**School:** ${prospect.school || 'International'}\n**Age:** ${prospect.age || 'Unknown'}`)
    .addFields(
      { name: '📊 Mock Ranking', value: `#${prospect.mockRank || '?'}`, inline: true },
      { name: '📏 Height', value: prospect.height || 'Unknown', inline: true },
      { name: '⚖️ Weight', value: prospect.weight || 'Unknown', inline: true }
    )
    .setTimestamp();
  
  if (prospect.strengths) {
    embed.addFields({ name: '✅ Strengths', value: prospect.strengths, inline: false });
  }
  if (prospect.weaknesses) {
    embed.addFields({ name: '⚠️ Weaknesses', value: prospect.weaknesses, inline: false });
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
