import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getLeaderboard, getActiveSession, getUserPicks, getLiveSessionLeaderboard, getCurrentSessionStats } from '../utils/patsData.js';

// PATS Role ID for Blazers Uprise filter
const PATS_ROLE_ID = '1445979227525746798';

export const data = new SlashCommandBuilder()
  .setName('patsleaderboard')
  .setDescription('View the Picks Against The Spread leaderboard');

/**
 * Build leaderboard embed with optional role filter
 * @param {Interaction} interaction 
 * @param {boolean} filterByRole - If true, only show members with PATS role
 * @param {boolean} fromStatsMenu - If true, show navigation buttons for stats menu
 */
export async function buildLeaderboardEmbed(interaction, filterByRole = false, fromStatsMenu = false) {
  const leaderboard = getLeaderboard();
  const session = getActiveSession();
  const liveLeaderboard = getLiveSessionLeaderboard();
  
  const leaderboardType = filterByRole ? "Blazers Uprise" : "Global";
  
  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${leaderboardType} PATS Leaderboard`)
    .setDescription(`Top performers in Picks Against The Spread${filterByRole ? ' (PATS Role Members)' : ''}`)
    .setColor(filterByRole ? 0xE03A3E : 0x5865F2) // Blazers red for filtered, blue for global
    .setTimestamp();

  // Get members with PATS role if filtering
  let patsRoleMembers = new Set();
  if (filterByRole) {
    try {
      const role = await interaction.guild.roles.fetch(PATS_ROLE_ID);
      if (role) {
        role.members.forEach(member => patsRoleMembers.add(member.id));
      }
    } catch (error) {
      console.error('Error fetching PATS role:', error);
    }
  }

  // Show live session leaderboard if active
  if (liveLeaderboard && liveLeaderboard.standings.length > 0) {
    let standings = liveLeaderboard.standings;
    
    // Filter by role if needed
    if (filterByRole) {
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

  // Overall all-time stats
  let allTimeLeaderboard = leaderboard;
  if (filterByRole) {
    allTimeLeaderboard = leaderboard.filter(entry => patsRoleMembers.has(entry.userId));
  }
  
  if (allTimeLeaderboard.length > 0) {
    const top10 = allTimeLeaderboard.slice(0, 10);
    
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
      value: filterByRole ? 'No PATS role members have stats yet.' : 'No stats yet! Be the first to participate in PATS.',
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

  // User's personal all-time stats
  const userStatsData = leaderboard.find(entry => entry.userId === interaction.user.id);
  if (userStatsData) {
    // Calculate rank in current view (global or filtered)
    const rankLeaderboard = filterByRole ? allTimeLeaderboard : leaderboard;
    const rank = rankLeaderboard.findIndex(entry => entry.userId === interaction.user.id) + 1;
    const rankDisplay = rank > 0 ? `#${rank}` : 'Unranked';
    
    const ddStats = (userStatsData.doubleDownsUsed || 0) > 0 
      ? `\n**Double Downs:** ${userStatsData.doubleDownWins || 0}-${userStatsData.doubleDownLosses || 0}-${userStatsData.doubleDownPushes || 0} 💰`
      : '';
    
    embed.addFields({
      name: '📈 Your All-Time Stats',
      value: `**Rank:** ${rankDisplay}${filterByRole ? ' (Blazers Uprise)' : ' (Global)'}\n` +
             `**Record:** ${userStatsData.totalWins}-${userStatsData.totalLosses}-${userStatsData.totalPushes}\n` +
             `**Win %:** ${userStatsData.winPercentage.toFixed(1)}%\n` +
             `**Sessions:** ${userStatsData.sessions}${ddStats}`,
      inline: true
    });
  }

  embed.setFooter({ text: 'Keep making picks to climb the leaderboard!' });

  // Build components based on context
  const components = [];
  
  // Toggle buttons row
  const toggleRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('pats_leaderboard_global')
      .setLabel('🌐 Global')
      .setStyle(filterByRole ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(!filterByRole),
    new ButtonBuilder()
      .setCustomId('pats_leaderboard_blazers')
      .setLabel('🔥 Blazers Uprise')
      .setStyle(filterByRole ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(filterByRole)
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
export async function showLeaderboardFromStats(interaction, filterByRole = false) {
  const { embed, components } = await buildLeaderboardEmbed(interaction, filterByRole, true);
  
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

    const { embed, components } = await buildLeaderboardEmbed(interaction, false, false);

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

