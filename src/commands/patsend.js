import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getActiveGlobalSession, closePATSSession } from '../utils/patsData.js';

export const data = new SlashCommandBuilder()
  .setName('patsend')
  .setDescription('End the current PATS session (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    // Check if there's an active session
    const session = getActiveGlobalSession();
    if (!session) {
      await interaction.editReply({
        content: '❌ No active global PATS session to end.',
      });
      return;
    }

    // Close the session (without results - manual close)
    const success = closePATSSession(session.id, []);
    
    if (!success) {
      await interaction.editReply({
        content: '❌ Failed to end the PATS session.',
      });
      return;
    }

    // Get pick statistics
    const totalPicks = Object.values(session.picks).reduce((sum, picks) => sum + picks.length, 0);
    const totalParticipants = Object.keys(session.picks).length;

    const embed = new EmbedBuilder()
      .setTitle('🏁 PATS Session Ended')
      .setDescription('The Picks Against The Spread session has been closed.')
      .setColor(0xFF6B6B)
      .addFields(
        { name: '📅 Date', value: session.date, inline: true },
        { name: '🎮 Games', value: session.games.length.toString(), inline: true },
        { name: '👥 Participants', value: totalParticipants.toString(), inline: true },
        { name: '🎯 Total Picks', value: totalPicks.toString(), inline: true }
      )
      .setTimestamp();

    await interaction.editReply({
      content: '✅ PATS session ended successfully!',
      embeds: [embed]
    });

    // Announce in channel
    try {
      await interaction.channel.send({
        embeds: [embed]
      });
    } catch (error) {
      console.error('Could not announce session end in channel:', error);
    }

  } catch (error) {
    console.error('Error executing patsend command:', error);
    await interaction.editReply({
      content: '❌ An error occurred while ending the PATS session.',
    });
  }
}
