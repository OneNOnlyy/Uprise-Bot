import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getLeaderboard, getActiveSession, getUserPicks, getLiveSessionLeaderboard, getCurrentSessionStats } from '../utils/patsData.js';

export const data = new SlashCommandBuilder()
  .setName('patsleaderboard')
  .setDescription('View the Picks Against The Spread leaderboard');

export async function execute(interaction) {
  try {
    await interaction.deferReply();

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
      
      const sessionLeaderboardText = await Promise.all(top10.map(async (entry, index) => {
        try {
          const user = await interaction.client.users.fetch(entry.userId);
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
          const pushText = entry.pushes > 0 ? `-${entry.pushes}` : '';
          const record = `${entry.wins}-${entry.losses}${pushText}`;
          const winPct = entry.totalComplete > 0 ? ` (${entry.winPercentage.toFixed(1)}%)` : '';
          const pendingText = entry.pending > 0 ? ` • ${entry.pending} pending` : '';
          return `${medal} **${user.username}** - ${record}${winPct}${pendingText}`;
        } catch {
          const pushText = entry.pushes > 0 ? `-${entry.pushes}` : '';
          return `${index + 1}. Unknown User - ${entry.wins}-${entry.losses}${pushText}`;
        }
      }));

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
      
      const allTimeText = await Promise.all(top5.map(async (entry, index) => {
        try {
          const user = await interaction.client.users.fetch(entry.userId);
          const medal = index === 0 ? '👑' : index === 1 ? '⭐' : index === 2 ? '🌟' : `${index + 1}.`;
          const pushText = entry.totalPushes > 0 ? `-${entry.totalPushes}` : '';
          return `${medal} **${user.username}** - ${entry.totalWins}-${entry.totalLosses}${pushText} (${entry.winPercentage.toFixed(1)}%)`;
        } catch {
          const pushText = entry.totalPushes > 0 ? `-${entry.totalPushes}` : '';
          return `${index + 1}. Unknown User - ${entry.totalWins}-${entry.totalLosses}${pushText}`;
        }
      }));

      embed.addFields({
        name: '🏅 All-Time Top 5',
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
        const pushText = userStats.pushes > 0 ? `-${userStats.pushes}` : '';
        const record = `${userStats.wins}-${userStats.losses}${pushText}`;
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
      const ddPushText = userStatsData.doubleDownPushes > 0 ? `-${userStatsData.doubleDownPushes}` : '';
      const ddStats = (userStatsData.doubleDownsUsed || 0) > 0 
        ? `\n**Double Downs:** ${userStatsData.doubleDownWins || 0}-${userStatsData.doubleDownLosses || 0}${ddPushText} 💰`
        : '';
      
      const allTimePushText = userStatsData.totalPushes > 0 ? `-${userStatsData.totalPushes}` : '';
      embed.addFields({
        name: '📈 Your All-Time Stats',
        value: `**Rank:** #${rank}\n` +
               `**Record:** ${userStatsData.totalWins}-${userStatsData.totalLosses}${allTimePushText}\n` +
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

