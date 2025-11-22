import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getLeaderboard, getActiveSession, getUserPicks } from '../utils/patsData.js';

export const data = new SlashCommandBuilder()
  .setName('patsleaderboard')
  .setDescription('View the Picks Against The Spread leaderboard');

export async function execute(interaction) {
  try {
    await interaction.deferReply();

    const leaderboard = getLeaderboard();
    const session = getActiveSession();

    const embed = new EmbedBuilder()
      .setTitle('🏆 PATS Leaderboard')
      .setDescription('Top performers in Picks Against The Spread')
      .setColor(0xE03A3E)
      .setTimestamp();

    if (leaderboard.length === 0) {
      embed.setDescription('No stats yet! Be the first to participate in PATS.');
    } else {
      // Overall stats
      const top10 = leaderboard.slice(0, 10);
      
      const leaderboardText = await Promise.all(top10.map(async (entry, index) => {
        try {
          const user = await interaction.client.users.fetch(entry.userId);
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
          return `${medal} **${user.username}** - ${entry.totalWins}-${entry.totalLosses} (${entry.winPercentage.toFixed(1)}%)`;
        } catch {
          return `${index + 1}. Unknown User - ${entry.totalWins}-${entry.totalLosses}`;
        }
      }));

      embed.addFields({
        name: '📊 All-Time Leaders',
        value: leaderboardText.join('\n') || 'No data yet',
        inline: false
      });
    }

    // Current session stats
    if (session) {
      const pickCounts = Object.keys(session.picks).length;
      embed.addFields({
        name: '🎮 Current Session',
        value: `**${pickCounts}** participants have made picks\n**${session.games.length}** games available`,
        inline: false
      });

      // Show user's current session picks
      const userPicks = getUserPicks(session.id, interaction.user.id);
      if (userPicks.length > 0) {
        embed.addFields({
          name: '✅ Your Picks Today',
          value: `${userPicks.length}/${session.games.length} games picked`,
          inline: true
        });
      }
    }

    // User's personal stats
    const userStats = leaderboard.find(entry => entry.userId === interaction.user.id);
    if (userStats) {
      const rank = leaderboard.findIndex(entry => entry.userId === interaction.user.id) + 1;
      embed.addFields({
        name: '📈 Your Stats',
        value: `**Rank:** #${rank}\n` +
               `**Record:** ${userStats.totalWins}-${userStats.totalLosses}\n` +
               `**Win %:** ${userStats.winPercentage.toFixed(1)}%\n` +
               `**Sessions:** ${userStats.sessions}`,
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
