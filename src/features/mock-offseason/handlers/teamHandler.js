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
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle(`${team.emoji} ${team.name} - Depth Chart`)
    .setDescription('🚧 **Depth Chart view coming soon!**\n\nThis will show:\n• Starting lineup\n• Bench rotation\n• Projected minutes')
    .setTimestamp();
  
  return interaction.update({ embeds: [embed], components: getBackButton() });
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
    .setDescription('Select a player to offer an extension.\n\n🚧 **Extension negotiations coming soon!**')
    .setTimestamp();
  
  return interaction.update({ embeds: [embed], components: getBackButton() });
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
