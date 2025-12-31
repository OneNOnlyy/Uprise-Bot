import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getFormattedGamesForDate } from '../utils/oddsApi.js';
import { getActiveGlobalSession, updateSessionSpreads } from '../utils/patsData.js';

export const data = new SlashCommandBuilder()
  .setName('patsrefreshspreads')
  .setDescription('Regenerate spreads for the current PATS session (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    // Check if there's an active session
    const session = getActiveGlobalSession();
    if (!session) {
      await interaction.editReply({
        content: '❌ There is no active global PATS session. Start one with `/patsstart` first.',
      });
      return;
    }

    // Fetch fresh spreads from Odds API
    console.log(`📊 Refreshing spreads for PATS session ${session.id}...`);
    console.log(`💡 This will use 1 Odds API call`);
    
    const freshGames = await getFormattedGamesForDate(session.date);
    
    if (!freshGames || freshGames.length === 0) {
      await interaction.editReply({
        content: `❌ Could not fetch fresh spreads. The Odds API may be unavailable.`,
      });
      return;
    }

    // Match fresh spreads to existing games and update
    let updatedCount = 0;
    let unchangedCount = 0;
    const spreadChanges = [];

    for (const sessionGame of session.games) {
      // Find matching game in fresh data
      const freshGame = freshGames.find(g => 
        (g.homeTeam === sessionGame.homeTeam && g.awayTeam === sessionGame.awayTeam) ||
        (g.homeTeam?.toLowerCase().includes(sessionGame.homeTeam?.toLowerCase()) && 
         g.awayTeam?.toLowerCase().includes(sessionGame.awayTeam?.toLowerCase()))
      );

      if (freshGame) {
        const oldHomeSpread = sessionGame.homeSpread;
        const oldAwaySpread = sessionGame.awaySpread;
        const newHomeSpread = freshGame.homeSpread;
        const newAwaySpread = freshGame.awaySpread;

        if (oldHomeSpread !== newHomeSpread || oldAwaySpread !== newAwaySpread) {
          spreadChanges.push({
            game: `${sessionGame.awayTeam} @ ${sessionGame.homeTeam}`,
            old: `${oldAwaySpread}/${oldHomeSpread}`,
            new: `${newAwaySpread}/${newHomeSpread}`
          });
          updatedCount++;
        } else {
          unchangedCount++;
        }

        // Update spreads
        sessionGame.homeSpread = newHomeSpread;
        sessionGame.awaySpread = newAwaySpread;
        sessionGame.favored = freshGame.favored;
        sessionGame.spreadDisplay = freshGame.spreadDisplay;
      }
    }

    // Save the updated session
    updateSessionSpreads(session.id, session.games);

    // Build response embed
    const embed = new EmbedBuilder()
      .setTitle('🔄 PATS Spreads Refreshed')
      .setColor(updatedCount > 0 ? 0xFFA500 : 0x00FF00)
      .setDescription(`Successfully refreshed spreads for session on **${session.date}**`)
      .addFields(
        { name: '📊 Updated', value: `${updatedCount} games`, inline: true },
        { name: '✅ Unchanged', value: `${unchangedCount} games`, inline: true },
        { name: '🎮 Total Games', value: `${session.games.length}`, inline: true }
      )
      .setTimestamp();

    // Add spread changes if any
    if (spreadChanges.length > 0) {
      const changesText = spreadChanges.slice(0, 10).map(change => 
        `**${change.game}**\n${change.old} → ${change.new}`
      ).join('\n\n');
      
      embed.addFields({
        name: '📝 Spread Changes',
        value: changesText + (spreadChanges.length > 10 ? `\n\n*...and ${spreadChanges.length - 10} more*` : '')
      });
    }

    await interaction.editReply({
      embeds: [embed]
    });

    console.log(`✅ Refreshed spreads: ${updatedCount} updated, ${unchangedCount} unchanged`);

  } catch (error) {
    console.error('Error refreshing PATS spreads:', error);
    await interaction.editReply({
      content: '❌ An error occurred while refreshing spreads. Check the console for details.',
    });
  }
}
