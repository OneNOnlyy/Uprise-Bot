import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { deletePlayer, getPlayerStats } from '../utils/patsData.js';

export const data = new SlashCommandBuilder()
  .setName('patsdeleteplayer')
  .setDescription('Remove a player from the PATS system (Admin only)')
  .addUserOption(option =>
    option.setName('player')
      .setDescription('The player to remove')
      .setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const player = interaction.options.getUser('player');
    
    // Check if player exists
    const stats = getPlayerStats(player.id);
    if (!stats) {
      await interaction.editReply({
        content: `❌ Player <@${player.id}> is not in the PATS system.`
      });
      return;
    }

    // Delete the player
    deletePlayer(player.id);

    // Create confirmation embed
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('🗑️ Player Removed from PATS')
      .setDescription(`Successfully removed **${player.username}** from the system`)
      .addFields(
        { name: '👤 Player', value: `<@${player.id}>`, inline: true },
        { 
          name: '📊 Final Record', 
          value: `${stats.totalWins}-${stats.totalLosses}-${stats.totalPushes}`, 
          inline: true 
        },
        { 
          name: '🎲 Sessions', 
          value: `${stats.sessions}`, 
          inline: true 
        }
      )
      .setFooter({ text: 'This action cannot be undone' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    console.log(`[PATS Admin] ${interaction.user.username} deleted player: ${player.username} (${player.id})`);
  } catch (error) {
    console.error('[PATS Admin] Error deleting player:', error);
    await interaction.editReply({ 
      content: '❌ Failed to delete player from PATS system. Please try again.' 
    });
  }
}
