import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getActiveSession, reopenPATSSession } from '../utils/patsData.js';

export const data = new SlashCommandBuilder()
  .setName('patsreopen')
  .setDescription('Reopen the most recently closed PATS session (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(option =>
    option.setName('session_id')
      .setDescription('Session ID to reopen (defaults to most recent)')
      .setRequired(false)
  );

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    // Check if there's already an active session
    const activeSession = getActiveSession();
    if (activeSession) {
      await interaction.editReply({
        content: '❌ Cannot reopen a session while there is already an active session. Close the current session first with `/patsend`.',
      });
      return;
    }

    const sessionId = interaction.options.getString('session_id');
    
    // If no session ID provided, we need to get the most recent from history
    let targetSessionId = sessionId;
    
    if (!targetSessionId) {
      // Read the data to get the most recent session
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const DATA_DIR = path.join(__dirname, '../../data');
      const PATS_FILE = path.join(DATA_DIR, 'pats.json');
      
      const data = JSON.parse(fs.readFileSync(PATS_FILE, 'utf8'));
      
      if (!data.history || data.history.length === 0) {
        await interaction.editReply({
          content: '❌ No closed sessions found in history.',
        });
        return;
      }
      
      // Get most recent session (last in history array)
      const mostRecent = data.history[data.history.length - 1];
      targetSessionId = mostRecent.id;
    }

    // Reopen the session
    const result = reopenPATSSession(targetSessionId);
    
    if (!result.success) {
      await interaction.editReply({
        content: `❌ Failed to reopen session: ${result.error}`,
      });
      return;
    }

    const session = result.session;
    const totalPicks = Object.values(session.picks).reduce((sum, picks) => sum + picks.length, 0);
    const totalParticipants = Object.keys(session.picks).length;
    const gamesWithResults = session.games.filter(g => g.result).length;

    const embed = new EmbedBuilder()
      .setTitle('🔄 PATS Session Reopened')
      .setDescription('The session has been reopened and is now active again.')
      .setColor(0x00FF00)
      .addFields(
        { name: '📅 Date', value: session.date, inline: true },
        { name: '🎮 Games', value: session.games.length.toString(), inline: true },
        { name: '👥 Participants', value: totalParticipants.toString(), inline: true },
        { name: '🎯 Total Picks', value: totalPicks.toString(), inline: true },
        { name: '✅ Games Complete', value: `${gamesWithResults}/${session.games.length}`, inline: true },
        { name: '🆔 Session ID', value: session.id, inline: true }
      )
      .setFooter({ text: 'User stats have been reverted for this session' })
      .setTimestamp();

    await interaction.editReply({
      content: '✅ PATS session reopened successfully!',
      embeds: [embed]
    });

    // Announce in channel
    try {
      await interaction.channel.send({
        content: '📢 **A PATS session has been reopened!**',
        embeds: [embed]
      });
    } catch (error) {
      console.error('Could not announce session reopen in channel:', error);
    }

  } catch (error) {
    console.error('Error executing patsreopen command:', error);
    await interaction.editReply({
      content: '❌ An error occurred while reopening the PATS session.',
    });
  }
}
