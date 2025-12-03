/**
 * Mock Offseason - League Hub Handler
 * Shows league standings, team browser, and transaction feed
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { getMockLeague, formatCurrency, NBA_TEAMS, PHASES } from '../mockData.js';

/**
 * Build the league hub main view
 */
export async function buildLeagueHub(interaction, league) {
  const gmCount = Object.values(league.teams).filter(t => t.gm).length;
  const recentTrades = (league.tradeHistory || []).slice(-3);
  const recentTransactions = (league.transactions || []).slice(-5);
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle('📊 LEAGUE HUB')
    .setDescription(`**${league.seasonName}**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    .addFields(
      {
        name: '🏆 League Status',
        value: [
          `**Phase:** ${getPhaseDisplayName(league.phase)}`,
          `**Active GMs:** ${gmCount}/30`,
          `**Trades:** ${(league.tradeHistory || []).length}`,
          `**Free Agent Signings:** ${countSignings(league)}`
        ].join('\n'),
        inline: true
      },
      {
        name: '💰 Cap Info',
        value: [
          `**Salary Cap:** ${formatCurrency(league.salaryCap)}`,
          `**Luxury Tax:** ${formatCurrency(league.luxuryTax)}`,
          `**First Apron:** ${formatCurrency(league.firstApron)}`
        ].join('\n'),
        inline: true
      }
    )
    .setTimestamp()
    .setFooter({ text: 'Mock Offseason • League Hub' });
  
  // Recent activity
  if (recentTransactions.length > 0) {
    const activityText = recentTransactions.map(txn => {
      const time = `<t:${Math.floor(new Date(txn.timestamp).getTime() / 1000)}:R>`;
      return `• ${getTransactionIcon(txn.type)} ${txn.type.toUpperCase()} - ${time}`;
    }).join('\n');
    
    embed.addFields({
      name: '📰 Recent Activity',
      value: activityText,
      inline: false
    });
  }
  
  // Navigation buttons
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_league_standings')
      .setLabel('Standings')
      .setEmoji('🏆')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('mock_league_teams')
      .setLabel('Browse Teams')
      .setEmoji('🏀')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_league_transactions')
      .setLabel('Transactions')
      .setEmoji('📜')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_league_cap_sheet')
      .setLabel('Cap Sheet')
      .setEmoji('💰')
      .setStyle(ButtonStyle.Secondary)
  );
  
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_nav_dashboard')
      .setLabel('Dashboard')
      .setEmoji('🏠')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_league_refresh')
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return {
    embeds: [embed],
    components: [row1, row2]
  };
}

/**
 * Build conference standings
 */
export async function buildStandings(interaction, league, conference = 'all') {
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle('🏆 League Standings')
    .setTimestamp();
  
  // Get teams with GMs
  const teamsWithGMs = Object.entries(league.teams)
    .filter(([_, team]) => team.gm)
    .map(([teamId, team]) => ({
      teamId,
      ...team,
      ...NBA_TEAMS[teamId],
      capSpace: league.salaryCap - (team.capSpace?.totalSalary || 0),
      rosterSize: (team.roster || []).length
    }));
  
  // Group by conference
  const eastern = teamsWithGMs.filter(t => t.conference === 'Eastern');
  const western = teamsWithGMs.filter(t => t.conference === 'Western');
  
  if (conference === 'all' || conference === 'eastern') {
    const eastText = eastern.length > 0
      ? eastern.map((t, i) => `${i + 1}. ${t.name} (${t.rosterSize} players)`).join('\n')
      : '_No teams yet_';
    
    embed.addFields({
      name: '🔵 Eastern Conference',
      value: eastText,
      inline: true
    });
  }
  
  if (conference === 'all' || conference === 'western') {
    const westText = western.length > 0
      ? western.map((t, i) => `${i + 1}. ${t.name} (${t.rosterSize} players)`).join('\n')
      : '_No teams yet_';
    
    embed.addFields({
      name: '🔴 Western Conference',
      value: westText,
      inline: true
    });
  }
  
  // Filter buttons
  const filterRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_league_standings_all')
      .setLabel('All')
      .setStyle(conference === 'all' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_league_standings_eastern')
      .setLabel('Eastern')
      .setStyle(conference === 'eastern' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_league_standings_western')
      .setLabel('Western')
      .setStyle(conference === 'western' ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );
  
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_nav_league')
      .setLabel('Back to Hub')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return {
    embeds: [embed],
    components: [filterRow, navRow]
  };
}

/**
 * Build team browser
 */
export async function buildTeamBrowser(interaction, league) {
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle('🏀 Browse Teams')
    .setDescription('Select a team to view their roster, cap situation, and trade assets.')
    .setTimestamp();
  
  // Group teams by division
  const divisions = {};
  for (const [teamId, teamInfo] of Object.entries(NBA_TEAMS)) {
    if (!divisions[teamInfo.division]) {
      divisions[teamInfo.division] = [];
    }
    const team = league.teams[teamId];
    divisions[teamInfo.division].push({
      id: teamId,
      name: teamInfo.name,
      hasGM: !!team?.gm,
      gmName: team?.gmName || 'Available'
    });
  }
  
  // Show divisions
  for (const [division, teams] of Object.entries(divisions)) {
    const divText = teams.map(t => 
      `${t.hasGM ? '✅' : '⬜'} ${t.name}`
    ).join('\n');
    
    embed.addFields({
      name: `📍 ${division}`,
      value: divText,
      inline: true
    });
  }
  
  // Team select menu
  const options = Object.entries(NBA_TEAMS).slice(0, 25).map(([id, team]) => ({
    label: team.name,
    description: league.teams[id]?.gm ? `GM: ${league.teams[id].gmName || 'Assigned'}` : 'No GM',
    value: id
  }));
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('mock_league_select_team')
    .setPlaceholder('Select team to view...')
    .addOptions(options);
  
  const selectRow = new ActionRowBuilder().addComponents(selectMenu);
  
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_nav_league')
      .setLabel('Back to Hub')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return {
    embeds: [embed],
    components: [selectRow, navRow]
  };
}

/**
 * Build team detail view
 */
export async function buildTeamDetail(interaction, league, teamId) {
  const teamInfo = NBA_TEAMS[teamId];
  const team = league.teams[teamId] || {};
  const roster = team.roster || [];
  const picks = team.draftPicks || [];
  
  const totalSalary = roster.reduce((sum, p) => sum + (p.salary || 0), 0);
  const capSpace = league.salaryCap - totalSalary;
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle(`${teamInfo.name}`)
    .setDescription(`**${teamInfo.conference} Conference** • ${teamInfo.division} Division`)
    .addFields(
      {
        name: '👤 General Manager',
        value: team.gm ? `<@${team.gm}>` : '_Available_',
        inline: true
      },
      {
        name: '💰 Cap Situation',
        value: [
          `Total: ${formatCurrency(totalSalary)}`,
          `Space: ${formatCurrency(Math.max(0, capSpace))}`,
          capSpace < 0 ? '🔴 Over Cap' : '🟢 Under Cap'
        ].join('\n'),
        inline: true
      },
      {
        name: '📊 Assets',
        value: [
          `Roster: ${roster.length}/15`,
          `Draft Picks: ${picks.length}`
        ].join('\n'),
        inline: true
      }
    )
    .setTimestamp();
  
  // Show top 5 players
  if (roster.length > 0) {
    const topPlayers = roster.slice(0, 5).map(p =>
      `${p.position} **${p.name}** - ${formatCurrency(p.salary)}`
    ).join('\n');
    
    embed.addFields({
      name: '⭐ Key Players',
      value: topPlayers + (roster.length > 5 ? `\n_...and ${roster.length - 5} more_` : ''),
      inline: false
    });
  }
  
  // Show picks
  if (picks.length > 0) {
    const picksList = picks.slice(0, 5).map(p =>
      `• ${p.year} Round ${p.round}${p.originalTeam !== teamId ? ` (from ${p.originalTeam})` : ''}`
    ).join('\n');
    
    embed.addFields({
      name: '🎯 Draft Picks',
      value: picksList,
      inline: false
    });
  }
  
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_league_teams')
      .setLabel('Back to Teams')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`mock_league_roster_${teamId}`)
      .setLabel('Full Roster')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(roster.length === 0),
    new ButtonBuilder()
      .setCustomId('mock_nav_league')
      .setLabel('League Hub')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return {
    embeds: [embed],
    components: [navRow]
  };
}

/**
 * Build transactions log
 */
export async function buildTransactionsLog(interaction, league, page = 0) {
  const transactions = league.transactions || [];
  const pageSize = 10;
  const totalPages = Math.ceil(transactions.length / pageSize) || 1;
  const start = page * pageSize;
  const pageTransactions = transactions.slice().reverse().slice(start, start + pageSize);
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle('📜 Transaction Log')
    .setDescription(`Page ${page + 1}/${totalPages}`)
    .setTimestamp();
  
  if (pageTransactions.length === 0) {
    embed.setDescription('No transactions recorded yet.');
  } else {
    const txnText = pageTransactions.map(txn => {
      const time = `<t:${Math.floor(new Date(txn.timestamp).getTime() / 1000)}:R>`;
      const icon = getTransactionIcon(txn.type);
      return `${icon} **${txn.type.toUpperCase()}** - ${time}\n${formatTransactionDetails(txn)}`;
    }).join('\n\n');
    
    embed.addFields({
      name: 'Transactions',
      value: txnText || 'No transactions',
      inline: false
    });
  }
  
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mock_league_txn_page_${page - 1}`)
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`mock_league_txn_page_${page + 1}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId('mock_nav_league')
      .setLabel('Back to Hub')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return {
    embeds: [embed],
    components: [navRow]
  };
}

/**
 * Build league-wide cap sheet
 */
export async function buildCapSheet(interaction, league) {
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle('💰 League Cap Sheet')
    .setDescription('Salary cap status for all teams')
    .setTimestamp();
  
  // Get all teams with their cap situations
  const teamsCap = Object.entries(league.teams)
    .filter(([_, t]) => t.gm)
    .map(([teamId, team]) => {
      const totalSalary = (team.roster || []).reduce((sum, p) => sum + (p.salary || 0), 0);
      return {
        teamId,
        name: NBA_TEAMS[teamId]?.name || teamId,
        salary: totalSalary,
        capSpace: league.salaryCap - totalSalary,
        isOverCap: totalSalary > league.salaryCap,
        isInTax: totalSalary > league.luxuryTax
      };
    })
    .sort((a, b) => b.salary - a.salary);
  
  // Show top 10 by salary
  const capText = teamsCap.slice(0, 10).map((t, i) => {
    const status = t.isInTax ? '🔴' : t.isOverCap ? '🟡' : '🟢';
    return `${status} **${t.name}**\nSalary: ${formatCurrency(t.salary)} | Space: ${formatCurrency(t.capSpace)}`;
  }).join('\n\n');
  
  embed.addFields({
    name: 'Teams by Payroll',
    value: capText || 'No teams with rosters yet',
    inline: false
  });
  
  // Legend
  embed.addFields({
    name: 'Legend',
    value: '🟢 Under Cap | 🟡 Over Cap | 🔴 In Luxury Tax',
    inline: false
  });
  
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_nav_league')
      .setLabel('Back to Hub')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return {
    embeds: [embed],
    components: [navRow]
  };
}

/**
 * Handle league hub button interactions
 */
export async function handleLeagueAction(interaction) {
  const customId = interaction.customId;
  const league = await getMockLeague(interaction.guildId);
  
  if (!league) {
    return interaction.reply({ content: '❌ No league exists.', ephemeral: true });
  }
  
  if (customId === 'mock_nav_league' || customId === 'mock_league_refresh') {
    const hub = await buildLeagueHub(interaction, league);
    return interaction.update(hub);
  }
  
  if (customId.startsWith('mock_league_standings')) {
    const conference = customId.split('_').pop();
    const conf = ['all', 'eastern', 'western'].includes(conference) ? conference : 'all';
    const standings = await buildStandings(interaction, league, conf);
    return interaction.update(standings);
  }
  
  if (customId === 'mock_league_teams') {
    const browser = await buildTeamBrowser(interaction, league);
    return interaction.update(browser);
  }
  
  if (customId === 'mock_league_transactions') {
    const log = await buildTransactionsLog(interaction, league);
    return interaction.update(log);
  }
  
  if (customId.startsWith('mock_league_txn_page_')) {
    const page = parseInt(customId.split('_').pop());
    const log = await buildTransactionsLog(interaction, league, page);
    return interaction.update(log);
  }
  
  if (customId === 'mock_league_cap_sheet') {
    const sheet = await buildCapSheet(interaction, league);
    return interaction.update(sheet);
  }
  
  if (customId.startsWith('mock_league_roster_')) {
    const teamId = customId.replace('mock_league_roster_', '');
    // Show full roster for team
    const detail = await buildTeamDetail(interaction, league, teamId);
    return interaction.update(detail);
  }
  
  return interaction.reply({ content: '❌ Unknown league action.', ephemeral: true });
}

/**
 * Handle team selection from browser
 */
export async function handleTeamSelect(interaction) {
  const teamId = interaction.values[0];
  const league = await getMockLeague(interaction.guildId);
  
  if (!league) {
    return interaction.reply({ content: '❌ No league exists.', ephemeral: true });
  }
  
  const detail = await buildTeamDetail(interaction, league, teamId);
  return interaction.update(detail);
}

// Helper functions
function getPhaseDisplayName(phase) {
  const names = {
    [PHASES.SETUP]: '⚙️ Setup',
    [PHASES.GM_LOTTERY]: '🎰 GM Lottery',
    [PHASES.PRE_DRAFT]: '📋 Pre-Draft',
    [PHASES.DRAFT]: '📝 NBA Draft',
    [PHASES.FREE_AGENCY]: '✍️ Free Agency',
    [PHASES.REGULAR_SEASON]: '🏀 Regular Season'
  };
  return names[phase] || phase;
}

function getTransactionIcon(type) {
  const icons = {
    trade: '🔄',
    signing: '✍️',
    release: '❌',
    draft: '🎯',
    extension: '📝'
  };
  return icons[type] || '📋';
}

function formatTransactionDetails(txn) {
  if (txn.type === 'trade') {
    return `${txn.details?.team1 || 'Team 1'} ↔️ ${txn.details?.team2 || 'Team 2'}`;
  }
  return txn.details?.summary || 'Details unavailable';
}

function countSignings(league) {
  return (league.transactions || []).filter(t => t.type === 'signing').length;
}
