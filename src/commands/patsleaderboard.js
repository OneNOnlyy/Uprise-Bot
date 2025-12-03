import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getLeaderboard, getActiveSession, getUserPicks, getLiveSessionLeaderboard, getCurrentSessionStats } from '../utils/patsData.js';

export const data = new SlashCommandBuilder()
  .setName('patsleaderboard')
  .setDescription('View the Picks Against The Spread leaderboard');

export async function execute(interaction) {
  try {
    // Only defer if not already deferred or replied
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    const leaderboard = getLeaderboard();
    const session = getActiveSession();
    const liveLeaderboard = getLiveSessionLeaderboard();

    const embed = new EmbedBuilder()
      .setTitle('🏆 PATS Leaderboard')
      .setDescription('Top performers in Picks Against The Spread')
      .setColor(0xE03A3E)
      .setTimestamp();

    // Show live session leaderboard if active
    if (liveLeaderboard && liveLeaderboard.standings.length > 0) {
      const top10 = liveLeaderboard.standings.slice(0, 10);
      
      const sessionLeaderboardText = (await Promise.all(top10.map(async (entry, index) => {
        try {
          const member = await interaction.guild.members.fetch(entry.userId);
          const displayName = member.displayName;
          const record = `${entry.wins}-${entry.losses}-${entry.pushes}`;
          const winPct = entry.totalComplete > 0 ? ` (${entry.winPercentage.toFixed(1)}%)` : '';
          const pendingText = entry.pending > 0 ? ` • ${entry.pending} pending` : '';
          return `${index + 1}. ${displayName} - ${record}${winPct}${pendingText}`;
        } catch {
          // Skip users that can't be fetched (deleted accounts, left server, etc.)
          return null;
        }
      }))).filter(Boolean);

      // Cache age and other session info still tracked in background
      const cacheAge = Math.floor((Date.now() - liveLeaderboard.lastUpdate) / 1000);
      const participantCount = liveLeaderboard.standings.length;
      const totalGames = session ? session.games.length : 0;
      // These values are tracked but not displayed to keep the leaderboard cleaner
      
      embed.addFields({
        name: '📅 Today\'s Session Leaders',
        value: sessionLeaderboardText.join('\n') || 'No picks yet',
        inline: false
      });
    }

    // Overall all-time stats
    if (leaderboard.length > 0) {
      const top5 = leaderboard.slice(0, 5);
      
      const allTimeText = (await Promise.all(top5.map(async (entry, index) => {
        try {
          const member = await interaction.guild.members.fetch(entry.userId);
          const displayName = member.displayName;
          return `${index + 1}. ${displayName} - ${entry.totalWins}-${entry.totalLosses}-${entry.totalPushes} (${entry.winPercentage.toFixed(1)}%)`;
        } catch {
          // Skip users that can't be fetched (deleted accounts, left server, etc.)
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
        value: 'No stats yet! Be the first to participate in PATS.',
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
      const rank = leaderboard.findIndex(entry => entry.userId === interaction.user.id) + 1;
      const ddStats = (userStatsData.doubleDownsUsed || 0) > 0 
        ? `\n**Double Downs:** ${userStatsData.doubleDownWins || 0}-${userStatsData.doubleDownLosses || 0}-${userStatsData.doubleDownPushes || 0} 💰`
        : '';
      
      embed.addFields({
        name: '📈 Your All-Time Stats',
        value: `**Rank:** #${rank}\n` +
               `**Record:** ${userStatsData.totalWins}-${userStatsData.totalLosses}-${userStatsData.totalPushes}\n` +
               `**Win %:** ${userStatsData.winPercentage.toFixed(1)}%\n` +
               `**Sessions:** ${userStatsData.sessions}${ddStats}`,
        inline: true
      });
    }

    embed.setFooter({ text: 'Keep making picks to climb the leaderboard!' });

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('Error executing patsleaderboard command:', error);
    await interaction.editReply({
      content: '❌ An error occurred while loading the leaderboard.',
    });
  }
}

