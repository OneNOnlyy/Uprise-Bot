import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getPlayerStats, getAllPlayers } from '../utils/patsData.js';

export const data = new SlashCommandBuilder()
  .setName('patsviewplayer')
  .setDescription('View player records in the PATS system (Admin only)')
  .addUserOption(option =>
    option.setName('player')
      .setDescription('Specific player to view (leave empty to view all)')
      .setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const player = interaction.options.getUser('player');

    if (player) {
      // View specific player
      const stats = getPlayerStats(player.id);
      
      if (!stats) {
        await interaction.editReply({
          content: `❌ Player <@${player.id}> is not in the PATS system.`
        });
        return;
      }

      // Calculate win percentage
      const totalGames = stats.totalWins + stats.totalLosses;
      const winPct = totalGames > 0 ? ((stats.totalWins / totalGames) * 100).toFixed(1) : 0;

      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle(`📊 PATS Stats: ${player.username}`)
        .setDescription(`Full statistics for <@${player.id}>`)
        .addFields(
          { 
            name: '🎯 Overall Record', 
            value: `**${stats.totalWins}-${stats.totalLosses}-${stats.totalPushes}**\nWin %: **${winPct}%**`, 
            inline: true 
          },
          { 
            name: '🎲 Sessions', 
            value: `**${stats.sessions}** played`, 
            inline: true 
          },
          { 
            name: '📈 Total Picks', 
            value: `**${stats.totalWins + stats.totalLosses + stats.totalPushes}**`, 
            inline: true 
          }
        );

      // Add double down stats if they exist
      if (stats.doubleDownsUsed > 0) {
        const ddTotal = stats.doubleDownWins + stats.doubleDownLosses;
        const ddWinPct = ddTotal > 0 ? ((stats.doubleDownWins / ddTotal) * 100).toFixed(1) : 0;
        
        embed.addFields({
          name: '⚡ Double Down Stats',
          value: `**${stats.doubleDownWins}-${stats.doubleDownLosses}-${stats.doubleDownPushes || 0}**\n` +
                 `Used: ${stats.doubleDownsUsed} times\n` +
                 `Win %: ${ddWinPct}%`,
          inline: false
        });
      }

      // Add metadata if available
      if (stats.addedAt) {
        embed.addFields({
          name: '📅 Added to System',
          value: new Date(stats.addedAt).toLocaleDateString(),
          inline: true
        });
      }

      if (stats.lastUpdated) {
        embed.addFields({
          name: '🔄 Last Updated',
          value: new Date(stats.lastUpdated).toLocaleDateString(),
          inline: true
        });
      }

      embed.setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } else {
      // View all players
      const allPlayers = getAllPlayers();
      
      if (allPlayers.length === 0) {
        await interaction.editReply({
          content: '📭 No players found in the PATS system.'
        });
        return;
      }

      // Sort by total wins descending
      allPlayers.sort((a, b) => b.totalWins - a.totalWins);

      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('📊 All PATS Players')
        .setDescription(`Total players in system: **${allPlayers.length}**`)
        .setTimestamp();

      // Create player list (limit to top 25 to avoid embed size limits)
      const displayPlayers = allPlayers.slice(0, 25);
      const playerList = displayPlayers.map((p, index) => {
        const totalGames = p.totalWins + p.totalLosses;
        const winPct = totalGames > 0 ? ((p.totalWins / totalGames) * 100).toFixed(1) : 0;
        const record = `${p.totalWins}-${p.totalLosses}-${p.totalPushes}`;
        
        return `**${index + 1}.** <@${p.userId}>\n` +
               `📊 ${record} (${winPct}%) | 🎲 ${p.sessions} sessions`;
      }).join('\n\n');

      embed.addFields({
        name: '🏆 Players Ranked by Wins',
        value: playerList || 'No data',
        inline: false
      });

      if (allPlayers.length > 25) {
        embed.setFooter({ text: `Showing top 25 of ${allPlayers.length} players` });
      }

      await interaction.editReply({ embeds: [embed] });
    }

    console.log(`[PATS Admin] ${interaction.user.username} viewed player stats${player ? ` for ${player.username}` : ' (all)'}`);
  } catch (error) {
    console.error('[PATS Admin] Error viewing player:', error);
    await interaction.editReply({ 
      content: '❌ Failed to retrieve player information. Please try again.' 
    });
  }
}
