import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getLeaderboard, getMonthlyLeaderboard, getUserStats, getUserMonthlyStats, getActiveGlobalSession, getUserPicks, getLiveSessionLeaderboard, getCurrentSessionStats, getCurrentPacificMonthKey } from '../utils/patsData.js';
import { getCurrentSeason, getSeasonStandings } from '../utils/patsSeasons.js';

// PATS Role ID for Blazers Uprise filter
const PATS_ROLE_ID = '1445979227525746798';

export const data = new SlashCommandBuilder()
  .setName('patsleaderboard')
  .setDescription('View the Picks Against The Spread leaderboard');

/**
 * Build leaderboard embed with optional filters
 * @param {Interaction} interaction 
 * @param {string} filterType - 'global', 'role', or 'season'
 * @param {boolean} fromStatsMenu - If true, show navigation buttons for stats menu
 */
export async function buildLeaderboardEmbed(interaction, filterType = 'global', fromStatsMenu = false) {
  // Handle legacy boolean parameter
  if (typeof filterType === 'boolean') {
    filterType = filterType ? 'role' : 'global';
  }
  
  const monthKey = getCurrentPacificMonthKey();
  const monthlyLeaderboard = getMonthlyLeaderboard(monthKey);
  const allTimeLeaderboard = getLeaderboard();
  const session = getActiveGlobalSession();
  const liveLeaderboard = session ? getLiveSessionLeaderboard(session) : null;
  const currentSeason = getCurrentSeason();
  
  const leaderboardTitles = {
    global: '🌐 Global PATS Leaderboard',
    role: '🔥 Blazers Uprise PATS Leaderboard',
    season: currentSeason ? `🏆 ${currentSeason.name} Leaderboard` : '🏆 Season Leaderboard'
  };
  
  const embed = new EmbedBuilder()
    .setTitle(leaderboardTitles[filterType] || leaderboardTitles.global)
    .setDescription(`Top performers in Picks Against The Spread`)
    .setColor(filterType === 'role' ? 0xE03A3E : (filterType === 'season' ? 0xFFD700 : 0x5865F2))
    .setTimestamp();

  // Get members with PATS role if filtering by role
  let patsRoleMembers = new Set();
  if (filterType === 'role') {
    try {
      const role = await interaction.guild.roles.fetch(PATS_ROLE_ID);
      if (role) {
        role.members.forEach(member => patsRoleMembers.add(member.id));
      }
    } catch (error) {
      console.error('Error fetching PATS role:', error);
    }
  }

  // These are populated for non-season views (used later for rank display)
  let monthData = [];
  let allTimeData = [];

  // SEASON LEADERBOARD
  if (filterType === 'season') {
    if (!currentSeason) {
      embed.setDescription('No active season. Create a season with `/pats season` to track season standings.');
    } else {
      const seasonStandings = getSeasonStandings(currentSeason.id);
      
      // Calculate days remaining
      const endDate = new Date(currentSeason.endDate);
      const now = new Date();
      const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
      const daysText = daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Ending soon';
      
      embed.setDescription(`Season standings for **${currentSeason.name}**\n${daysText} • ${currentSeason.sessionCount || 0} sessions played`);
      
      if (seasonStandings.length > 0) {
        const top10 = seasonStandings.slice(0, 10);
        
        const seasonText = (await Promise.all(top10.map(async (entry, index) => {
          try {
            const member = await interaction.guild.members.fetch(entry.oddsUserId);
            const displayName = member.displayName;
            const totalPicks = entry.wins + entry.losses + entry.pushes;
            const record = `${entry.wins}-${entry.losses}-${entry.pushes}`;
            return `${index + 1}. ${displayName} - ${record} (${entry.winPercentage.toFixed(1)}%)`;
          } catch {
            const record = `${entry.wins}-${entry.losses}-${entry.pushes}`;
            return `${index + 1}. ${entry.username || 'Unknown'} - ${record} (${entry.winPercentage.toFixed(1)}%)`;
          }
        }))).filter(Boolean);

        embed.addFields({
          name: '🏆 Season Standings',
          value: seasonText.join('\n') || 'No picks yet this season',
          inline: false
        });
      } else {
        embed.addFields({
          name: '🏆 Season Standings',
          value: 'No participants have made picks this season yet.',
          inline: false
        });
      }
      
      // Show user's season rank
      const userSeasonEntry = seasonStandings.find(e => e.oddsUserId === interaction.user.id);
      if (userSeasonEntry) {
        const userRank = seasonStandings.indexOf(userSeasonEntry) + 1;
        const totalPicks = userSeasonEntry.wins + userSeasonEntry.losses + userSeasonEntry.pushes;
        
        embed.addFields({
          name: '📈 Your Season Stats',
          value: `**Rank:** #${userRank} of ${seasonStandings.length}\n` +
                 `**Record:** ${userSeasonEntry.wins}-${userSeasonEntry.losses}-${userSeasonEntry.pushes}\n` +
                 `**Win %:** ${userSeasonEntry.winPercentage.toFixed(1)}%\n` +
                 `**Total Picks:** ${totalPicks}`,
          inline: true
        });
      }
    }
  } else {
    // GLOBAL or ROLE LEADERBOARD (original logic)
    
    // Show live session leaderboard if active
    if (liveLeaderboard && liveLeaderboard.standings.length > 0) {
      let standings = liveLeaderboard.standings;
      
      // Filter by role if needed
      if (filterType === 'role') {
        standings = standings.filter(entry => patsRoleMembers.has(entry.userId));
      }
      
      const top10 = standings.slice(0, 10);
      
      const sessionLeaderboardText = (await Promise.all(top10.map(async (entry, index) => {
        try {
          const member = await interaction.guild.members.fetch(entry.userId);
          const displayName = member.displayName;
          const record = `${entry.wins}-${entry.losses}-${entry.pushes}`;
          const winPct = entry.totalComplete > 0 ? ` (${entry.winPercentage.toFixed(1)}%)` : '';
          const pendingText = entry.pending > 0 ? ` • ${entry.pending} pending` : '';
          return `${index + 1}. ${displayName} - ${record}${winPct}${pendingText}`;
        } catch {
          return null;
        }
    }))).filter(Boolean);

    if (sessionLeaderboardText.length > 0) {
      embed.addFields({
        name: '📅 Today\'s Session Leaders',
        value: sessionLeaderboardText.join('\n') || 'No picks yet',
        inline: false
      });
    }
  }

  // Monthly stats
  monthData = monthlyLeaderboard;
  if (filterType === 'role') {
    monthData = monthlyLeaderboard.filter(entry => patsRoleMembers.has(entry.userId));
  }

  if (monthData.length > 0) {
    const top10 = monthData.slice(0, 10);

    const monthText = (await Promise.all(top10.map(async (entry, index) => {
      try {
        const member = await interaction.guild.members.fetch(entry.userId);
        const displayName = member.displayName;
        return `${index + 1}. ${displayName} - ${entry.totalWins}-${entry.totalLosses}-${entry.totalPushes} (${entry.winPercentage.toFixed(1)}%)`;
      } catch {
        return null;
      }
    }))).filter(Boolean);

    embed.addFields({
      name: `📅 This Month Leaders (${monthKey || 'N/A'})`,
      value: monthText.join('\n') || 'No data yet',
      inline: false
    });
  } else {
    embed.addFields({
      name: `📅 This Month Leaders (${monthKey || 'N/A'})`,
      value: filterType === 'role' ? 'No PATS role members have stats this month yet.' : 'No stats this month yet! Be the first to participate in PATS.',
      inline: false
    });
  }

  // Overall all-time stats
  allTimeData = allTimeLeaderboard;
  if (filterType === 'role') {
    allTimeData = allTimeLeaderboard.filter(entry => patsRoleMembers.has(entry.userId));
  }

  if (allTimeData.length > 0) {
    const top10 = allTimeData.slice(0, 10);

    const allTimeText = (await Promise.all(top10.map(async (entry, index) => {
      try {
        const member = await interaction.guild.members.fetch(entry.userId);
        const displayName = member.displayName;
        return `${index + 1}. ${displayName} - ${entry.totalWins}-${entry.totalLosses}-${entry.totalPushes} (${entry.winPercentage.toFixed(1)}%)`;
      } catch {
        return null;
      }
    }))).filter(Boolean);

    embed.addFields({
      name: '🏅 All-Time Leaders',
      value: allTimeText.join('\n') || 'No data yet',
      inline: false
    });
  } else {
    embed.addFields({
      name: '🏅 All-Time Leaders',
      value: filterType === 'role' ? 'No PATS role members have stats yet.' : 'No stats yet! Be the first to participate in PATS.',
      inline: false
    });
  }

  // User's personal stats for current session
  if (session) {
    const userStats = getCurrentSessionStats(interaction.user.id);
    if (userStats && userStats.totalPicks > 0) {
      const record = `${userStats.wins}-${userStats.losses}-${userStats.pushes}`;
      const pendingText = userStats.pending > 0 ? `\n**Pending:** ${userStats.pending}` : '';
      const ddText = userStats.doubleDownGame ? `\n**Double Down:**  ${userStats.doubleDownGame.awayTeam} @ ${userStats.doubleDownGame.homeTeam} 💰` : '';
      
      embed.addFields({
        name: '✅ Your Session',
        value: `**Record:** ${record}\n` +
               `**Progress:** ${userStats.totalPicks}/${userStats.totalGames}${pendingText}${ddText}`,
        inline: true
      });
    }
  }
  } // End of else block (non-season leaderboard)

  // User's personal all-time stats (only show for non-season views)
  if (filterType !== 'season') {
    const userMonthStats = getUserMonthlyStats(interaction.user.id, monthKey);
    const userAllTimeStats = getUserStats(interaction.user.id);

    const monthRankList = filterType === 'role'
      ? monthData
      : monthlyLeaderboard;
    const monthRank = monthRankList.findIndex(entry => entry.userId === interaction.user.id) + 1;
    const monthRankDisplay = monthRank > 0 ? `#${monthRank}` : 'Unranked';

    embed.addFields({
      name: `📈 Your This Month Stats (${monthKey || 'N/A'})`,
      value: `**Rank:** ${monthRankDisplay}${filterType === 'role' ? ' (Blazers Uprise)' : ' (Global)'}\n` +
             `**Record:** ${userMonthStats.totalWins}-${userMonthStats.totalLosses}-${userMonthStats.totalPushes}\n` +
             `**Win %:** ${userMonthStats.winPercentage.toFixed(1)}%\n` +
             `**Sessions:** ${userMonthStats.sessions}`,
      inline: true
    });

    const allTimeRankList = filterType === 'role'
      ? allTimeData
      : allTimeLeaderboard;
    const allTimeRank = allTimeRankList.findIndex(entry => entry.userId === interaction.user.id) + 1;
    const allTimeRankDisplay = allTimeRank > 0 ? `#${allTimeRank}` : 'Unranked';

    const ddStats = (userAllTimeStats.doubleDownsUsed || 0) > 0
      ? `\n**Double Downs:** ${userAllTimeStats.doubleDownWins || 0}-${userAllTimeStats.doubleDownLosses || 0}-${userAllTimeStats.doubleDownPushes || 0} 💰`
      : '';

    embed.addFields({
      name: '📈 Your All-Time Stats',
      value: `**Rank:** ${allTimeRankDisplay}${filterType === 'role' ? ' (Blazers Uprise)' : ' (Global)'}\n` +
             `**Record:** ${userAllTimeStats.totalWins}-${userAllTimeStats.totalLosses}-${userAllTimeStats.totalPushes}\n` +
             `**Win %:** ${userAllTimeStats.winPercentage.toFixed(1)}%\n` +
             `**Sessions:** ${userAllTimeStats.sessions}${ddStats}`,
      inline: true
    });
  }

  embed.setFooter({ text: 'Keep making picks to climb the leaderboard!' });

  // Build components based on context
  const components = [];
  
  // Use different button IDs based on context to preserve navigation state
  const globalButtonId = fromStatsMenu ? 'pats_leaderboard_global_stats' : 'pats_leaderboard_global_cmd';
  const blazersButtonId = fromStatsMenu ? 'pats_leaderboard_blazers_stats' : 'pats_leaderboard_blazers_cmd';
  const seasonButtonId = fromStatsMenu ? 'pats_leaderboard_season_stats' : 'pats_leaderboard_season_cmd';
  
  // Toggle buttons row - now with 3 options
  const toggleRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(globalButtonId)
      .setLabel('🌐 Global')
      .setStyle(filterType === 'global' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(filterType === 'global'),
    new ButtonBuilder()
      .setCustomId(blazersButtonId)
      .setLabel('🔥 Blazers')
      .setStyle(filterType === 'role' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(filterType === 'role'),
    new ButtonBuilder()
      .setCustomId(seasonButtonId)
      .setLabel('🏆 This Season')
      .setStyle(filterType === 'season' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(filterType === 'season' || !currentSeason)
  );
  components.push(toggleRow);
  
  // Navigation row (only if from stats menu)
  if (fromStatsMenu) {
    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('pats_leaderboard_back_to_stats')
        .setLabel('Back to Stats')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📊')
    );
    components.push(navRow);
  }

  return { embed, components };
}

/**
 * Show leaderboard with toggle buttons (called from stats menu)
 */
export async function showLeaderboardFromStats(interaction, filterType = 'global') {
  // Handle legacy boolean parameter
  if (typeof filterType === 'boolean') {
    filterType = filterType ? 'role' : 'global';
  }
  const { embed, components } = await buildLeaderboardEmbed(interaction, filterType, true);
  
  await interaction.editReply({
    embeds: [embed],
    components: components
  });
}

/**
 * Show leaderboard standalone (called from /pats leaderboard command or its toggle buttons)
 */
export async function showLeaderboardStandalone(interaction, filterType = 'global') {
  // Handle legacy boolean parameter
  if (typeof filterType === 'boolean') {
    filterType = filterType ? 'role' : 'global';
  }
  const { embed, components } = await buildLeaderboardEmbed(interaction, filterType, false);
  
  await interaction.editReply({
    embeds: [embed],
    components: components
  });
}

export async function execute(interaction) {
  try {
    // Only defer if not already deferred or replied
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    const { embed, components } = await buildLeaderboardEmbed(interaction, 'global', false);

    await interaction.editReply({ 
      embeds: [embed],
      components: components
    });

  } catch (error) {
    console.error('Error executing patsleaderboard command:', error);
    await interaction.editReply({
      content: '❌ An error occurred while loading the leaderboard.',
    });
  }
}

