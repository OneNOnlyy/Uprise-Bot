/**
 * Mock Offseason - Team Handler
 * Handles team management dashboard and player operations
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { getMockLeague, formatCurrency, CBA_CONSTANTS } from '../mockData.js';

/**
 * Build team dashboard embed
 */
export async function buildTeamDashboard(interaction, league, userTeam) {
  const team = league.teams[userTeam];
  const roster = team.roster || [];
  const cap = team.capSituation || {
    totalSalary: 0,
    capSpace: CBA_CONSTANTS.SALARY_CAP,
    luxuryTaxPayroll: 0,
    mleBudget: CBA_CONSTANTS.NON_TAX_MLE
  };
  
  // Calculate cap status
  const capStatus = cap.totalSalary > CBA_CONSTANTS.LUXURY_TAX 
    ? '🔴 LUXURY TAX'
    : cap.totalSalary > CBA_CONSTANTS.FIRST_APRON
      ? '🟡 FIRST APRON'
      : cap.totalSalary > CBA_CONSTANTS.SALARY_CAP
        ? '🟡 OVER CAP'
        : '🟢 UNDER CAP';
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle(`${team.emoji || '🏀'} ${team.name}`)
    .setDescription(`**GM:** <@${team.gm}>\n**Conference:** ${team.conference}\n**Division:** ${team.division}`)
    .addFields(
      {
        name: '💰 Cap Situation',
        value: [
          `**Total Payroll:** ${formatCurrency(cap.totalSalary)}`,
          `**Cap Space:** ${formatCurrency(cap.capSpace)}`,
          `**Status:** ${capStatus}`
        ].join('\n'),
        inline: true
      },
      {
        name: '📊 Roster Status',
        value: [
          `**Players:** ${roster.length}/15`,
          `**Draft Picks:** ${(team.draftPicks || []).length}`,
          `**MLE Remaining:** ${formatCurrency(cap.mleBudget)}`
        ].join('\n'),
        inline: true
      }
    )
    .setFooter({ text: 'Mock Offseason • Team Dashboard' })
    .setTimestamp();
  
  // Add roster preview
  if (roster.length > 0) {
    const rosterPreview = roster.slice(0, 5).map(p => 
      `${p.position} ${p.name} - ${formatCurrency(p.salary)}`
    ).join('\n');
    embed.addFields({
      name: '📋 Roster Preview',
      value: rosterPreview + (roster.length > 5 ? `\n*...and ${roster.length - 5} more*` : ''),
      inline: false
    });
  }
  
  // Navigation buttons
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_nav_dashboard')
      .setLabel('Dashboard')
      .setEmoji('🏠')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_team_roster')
      .setLabel('Full Roster')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('mock_team_depth')
      .setLabel('Depth Chart')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_team_picks')
      .setLabel('Draft Picks')
      .setEmoji('🎯')
      .setStyle(ButtonStyle.Secondary)
  );
  
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_team_release')
      .setLabel('Release Player')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(roster.length === 0),
    new ButtonBuilder()
      .setCustomId('mock_team_extend')
      .setLabel('Extend Player')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(roster.length === 0),
    new ButtonBuilder()
      .setCustomId('mock_nav_help')
      .setLabel('Help')
      .setEmoji('❓')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return {
    embeds: [embed],
    components: [navRow, actionRow]
  };
}

/**
 * Handle team button interactions
 */
export async function handleTeamAction(interaction) {
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
    case 'mock_team_roster':
      return await showFullRoster(interaction, league, userTeam);
    case 'mock_team_depth':
      return await showDepthChart(interaction, league, userTeam);
    case 'mock_team_picks':
      return await showDraftPicks(interaction, league, userTeam);
    case 'mock_team_release':
      return await showReleaseMenu(interaction, league, userTeam);
    case 'mock_team_extend':
      return await showExtendMenu(interaction, league, userTeam);
    default:
      return interaction.reply({ content: '❌ Unknown team action.', ephemeral: true });
  }
}

/**
 * Show full roster
 */
async function showFullRoster(interaction, league, teamId) {
  const team = league.teams[teamId];
  const roster = team.roster || [];
  
  if (roster.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xFF9500)
      .setTitle(`${team.emoji} ${team.name} - Roster`)
      .setDescription('Your roster is empty! Import real rosters or sign free agents.')
      .setTimestamp();
    
    return interaction.update({ embeds: [embed], components: getBackButton() });
  }
  
  // Group by position
  const byPosition = {
    PG: roster.filter(p => p.position === 'PG'),
    SG: roster.filter(p => p.position === 'SG'),
    SF: roster.filter(p => p.position === 'SF'),
    PF: roster.filter(p => p.position === 'PF'),
    C: roster.filter(p => p.position === 'C')
  };
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle(`${team.emoji} ${team.name} - Full Roster`)
    .setDescription(`**${roster.length}/15 roster spots filled**`)
    .setTimestamp();
  
  for (const [pos, players] of Object.entries(byPosition)) {
    if (players.length > 0) {
      const playerList = players.map(p => 
        `${p.name} - ${formatCurrency(p.salary)} (${p.yearsRemaining}yr)`
      ).join('\n');
      embed.addFields({ name: pos, value: playerList, inline: true });
    }
  }
  
  return interaction.update({ embeds: [embed], components: getBackButton() });
}

/**
 * Show depth chart
 */
async function showDepthChart(interaction, league, teamId) {
  const team = league.teams[teamId];
  const roster = team.roster || [];
  
  // Define positions and their typical minutes
  const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
  const depthChart = {};
  
  // Initialize depth chart
  positions.forEach(pos => {
    depthChart[pos] = { starter: null, backup: null, third: null };
  });
  
  // Sort players into positions by overall rating
  roster.forEach(player => {
    const primaryPos = player.position?.split('-')[0] || player.position;
    if (!positions.includes(primaryPos)) return;
    
    const slot = depthChart[primaryPos];
    const overall = player.overall || 70;
    
    if (!slot.starter || overall > (slot.starter.overall || 0)) {
      slot.third = slot.backup;
      slot.backup = slot.starter;
      slot.starter = player;
    } else if (!slot.backup || overall > (slot.backup.overall || 0)) {
      slot.third = slot.backup;
      slot.backup = player;
    } else if (!slot.third) {
      slot.third = player;
    }
  });
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle(`${team.emoji} ${team.name} - Depth Chart`)
    .setDescription('Starting lineup and rotations')
    .setTimestamp();
  
  // Starting Five
  const startingFive = positions.map(pos => {
    const player = depthChart[pos].starter;
    if (player) {
      return `**${pos}:** ${player.name} (${player.overall || '?'} OVR)`;
    }
    return `**${pos}:** _Empty_`;
  }).join('\n');
  
  embed.addFields({
    name: '🏀 Starting Five',
    value: startingFive,
    inline: false
  });
  
  // Bench Rotation
  const bench = positions.map(pos => {
    const player = depthChart[pos].backup;
    if (player) {
      return `${pos}: ${player.name}`;
    }
    return null;
  }).filter(Boolean).join('\n') || '_No backups_';
  
  embed.addFields({
    name: '🪑 Bench',
    value: bench,
    inline: true
  });
  
  // Deep Bench
  const deepBench = positions.map(pos => {
    const player = depthChart[pos].third;
    if (player) {
      return `${pos}: ${player.name}`;
    }
    return null;
  }).filter(Boolean).join('\n') || '_Empty_';
  
  embed.addFields({
    name: '📋 Deep Bench',
    value: deepBench,
    inline: true
  });
  
  // Projected Minutes
  let totalMinutes = 0;
  const minutesBreakdown = roster.slice(0, 10).map(player => {
    const mins = estimateMinutes(player, depthChart);
    totalMinutes += mins;
    return `${player.name}: ${mins} mpg`;
  }).join('\n');
  
  embed.addFields({
    name: '⏱️ Projected Minutes',
    value: minutesBreakdown || '_No players_',
    inline: false
  });
  
  return interaction.update({ embeds: [embed], components: getBackButton() });
}

/**
 * Estimate minutes per game for a player
 */
function estimateMinutes(player, depthChart) {
  const pos = player.position?.split('-')[0] || player.position;
  const slot = depthChart[pos];
  
  if (slot?.starter?.name === player.name) {
    return 32 + Math.floor(Math.random() * 6); // 32-37 minutes for starters
  } else if (slot?.backup?.name === player.name) {
    return 18 + Math.floor(Math.random() * 6); // 18-23 minutes for backups
  } else if (slot?.third?.name === player.name) {
    return 8 + Math.floor(Math.random() * 5); // 8-12 minutes for third string
  }
  return 5; // DNP-CD or garbage time
}

/**
 * Show draft picks
 */
async function showDraftPicks(interaction, league, teamId) {
  const team = league.teams[teamId];
  const picks = team.draftPicks || [];
  
  if (picks.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xFF9500)
      .setTitle(`${team.emoji} ${team.name} - Draft Picks`)
      .setDescription('You have no draft picks! You may have traded them away.')
      .setTimestamp();
    
    return interaction.update({ embeds: [embed], components: getBackButton() });
  }
  
  const picksList = picks.map(p => 
    `• **${p.year} Round ${p.round}** - ${p.originalTeam === teamId ? 'Own' : `from ${p.originalTeam}`}${p.protected ? ` (${p.protected})` : ''}`
  ).join('\n');
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle(`${team.emoji} ${team.name} - Draft Picks`)
    .setDescription(`**${picks.length} picks available**\n\n${picksList}`)
    .setTimestamp();
  
  return interaction.update({ embeds: [embed], components: getBackButton() });
}

/**
 * Show release player menu
 */
async function showReleaseMenu(interaction, league, teamId) {
  const team = league.teams[teamId];
  const roster = team.roster || [];
  
  if (roster.length === 0) {
    return interaction.reply({ content: '❌ No players to release.', ephemeral: true });
  }
  
  const embed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('❌ Release Player')
    .setDescription('Select a player to release from your roster.\n\n⚠️ **Warning:** Waived players may be claimed by other teams!')
    .setTimestamp();
  
  const options = roster.slice(0, 25).map(p => ({
    label: p.name,
    description: `${p.position} - ${formatCurrency(p.salary)}`,
    value: p.id || p.name.toLowerCase().replace(/\s/g, '_')
  }));
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('mock_team_release_select')
    .setPlaceholder('Select player to release...')
    .addOptions(options);
  
  const selectRow = new ActionRowBuilder().addComponents(selectMenu);
  
  return interaction.update({ embeds: [embed], components: [selectRow, ...getBackButton()] });
}

/**
 * Show extend player menu
 */
async function showExtendMenu(interaction, league, teamId) {
  const team = league.teams[teamId];
  const roster = team.roster || [];
  
  // Filter to extension-eligible players
  const eligible = roster.filter(p => p.yearsRemaining <= 2);
  
  if (eligible.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xFF9500)
      .setTitle('📝 Contract Extensions')
      .setDescription('No players are currently eligible for extensions.\n\nPlayers must have 2 or fewer years remaining.')
      .setTimestamp();
    
    return interaction.update({ embeds: [embed], components: getBackButton() });
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('📝 Contract Extensions')
    .setDescription(`**${eligible.length}** player(s) eligible for extension`)
    .setTimestamp();
  
  // Show extension-eligible players with estimated market value
  eligible.slice(0, 10).forEach(player => {
    const marketValue = calculateMarketValue(player);
    const currentAav = player.salary || 0;
    
    embed.addFields({
      name: `${player.name} (${player.position})`,
      value: `Current: ${formatCurrency(currentAav)}/yr (${player.yearsRemaining}yr left)\nEst. Market: ${formatCurrency(marketValue)}/yr\nMax Extension: ${calculateMaxExtension(player, league)}`,
      inline: true
    });
  });
  
  // Select menu for player selection
  const options = eligible.slice(0, 25).map(player => ({
    label: player.name,
    description: `${player.position} | ${formatCurrency(player.salary || 0)}/yr`,
    value: `extend_${player.id || player.name.toLowerCase().replace(/\s/g, '_')}`,
    emoji: '📝'
  }));
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('mock_team_extend_select')
    .setPlaceholder('Select player to extend...')
    .addOptions(options);
  
  const selectRow = new ActionRowBuilder().addComponents(selectMenu);
  
  return interaction.update({ embeds: [embed], components: [selectRow, ...getBackButton()] });
}

/**
 * Calculate player's estimated market value
 */
function calculateMarketValue(player) {
  const overall = player.overall || 70;
  const age = player.age || 25;
  
  // Base salary by overall rating
  let baseSalary;
  if (overall >= 90) baseSalary = 45000000; // Superstar
  else if (overall >= 85) baseSalary = 35000000; // All-Star
  else if (overall >= 80) baseSalary = 25000000; // Starter+
  else if (overall >= 75) baseSalary = 15000000; // Quality starter
  else if (overall >= 70) baseSalary = 8000000; // Role player
  else baseSalary = 3000000; // Bench/minimum
  
  // Age adjustment
  if (age <= 25) baseSalary *= 1.1; // Young premium
  else if (age >= 32) baseSalary *= 0.75; // Declining
  else if (age >= 30) baseSalary *= 0.9; // Getting older
  
  return Math.round(baseSalary);
}

/**
 * Calculate maximum extension offer
 */
function calculateMaxExtension(player, league) {
  const overall = player.overall || 70;
  const currentSalary = player.salary || 0;
  
  // Check if eligible for supermax (10+ years service, last 2 years: All-NBA, MVP, or DPOY)
  if (overall >= 90 && player.yearsInLeague >= 10) {
    const supermaxPct = 0.35; // 35% of cap
    const supermax = (league.salaryCap || 140600000) * supermaxPct;
    return `${formatCurrency(supermax)}/yr (Supermax eligible)`;
  }
  
  // Check if eligible for designated veteran extension (8+ years)
  if (overall >= 85 && player.yearsInLeague >= 8) {
    const maxPct = 0.30; // 30% of cap
    const max = (league.salaryCap || 140600000) * maxPct;
    return `${formatCurrency(max)}/yr (Veteran max)`;
  }
  
  // Standard extension rules: up to 120% of current salary or estimated max
  const standardIncrease = currentSalary * 1.2;
  const estimatedMax = calculateMarketValue(player);
  
  return `${formatCurrency(Math.max(standardIncrease, estimatedMax))}/yr`;
}

/**
 * Get back to team button
 */
function getBackButton() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mock_nav_team')
        .setLabel('Back to Team')
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
