import { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { getActiveSession, getUserPicks } from '../utils/patsData.js';

export const data = new SlashCommandBuilder()
  .setName('pats')
  .setDescription('View your PATS dashboard and stats');

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    // Check for active session
    const session = getActiveSession();
    
    if (!session) {
      const embed = new EmbedBuilder()
        .setTitle('🏀 Picks Against The Spread')
        .setDescription('**No active PATS session today.**\n\nWait for an admin to start a new session with `/patsstart`.')
        .setColor(0x808080)
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed]
      });
      return;
    }

    // Get user's picks for this session
    const userPicks = getUserPicks(session.id, interaction.user.id);
    const totalGames = session.games.length;
    const pickedCount = userPicks.length;
    const remainingPicks = totalGames - pickedCount;

    // Count locked games and missed picks
    const now = new Date();
    const lockedGames = session.games.filter(g => new Date(g.commenceTime) < now);
    const pickedGameIds = userPicks.map(p => p.gameId);
    const missedPicks = lockedGames.filter(g => !pickedGameIds.includes(g.id)).length;
    const lockedPicksCount = userPicks.filter(p => {
      const game = session.games.find(g => g.id === p.gameId);
      return game && new Date(game.commenceTime) < now;
    }).length;

    // Build status text
    let statusText = '';
    if (pickedCount === totalGames) {
      statusText = '✅ **All picks complete!**';
    } else if (remainingPicks > 0) {
      statusText = `⚠️ **${remainingPicks} pick${remainingPicks === 1 ? '' : 's'} remaining**`;
    }

    // Build the main embed
    const embed = new EmbedBuilder()
      .setTitle('🏀 Your PATS Dashboard')
      .setDescription(`Welcome to Picks Against The Spread!\n${statusText}`)
      .setColor(pickedCount === totalGames ? 0x00FF00 : 0xE03A3E)
      .setTimestamp()
      .addFields(
        {
          name: '📊 Today\'s Progress',
          value: [
            `**Picks Made:** ${pickedCount}/${totalGames}`,
            `**Locked Picks:** ${lockedPicksCount}`,
            missedPicks > 0 ? `**Missed Picks:** ${missedPicks} ⚠️` : null
          ].filter(Boolean).join('\n'),
          inline: true
        },
        {
          name: '📅 Session Info',
          value: [
            `**Date:** ${session.date}`,
            `**Total Games:** ${totalGames}`,
            `**Status:** ${session.status === 'active' ? '🟢 Active' : '🔴 Closed'}`
          ].join('\n'),
          inline: true
        }
      );

    // Add warning about missed picks
    if (missedPicks > 0) {
      embed.addFields({
        name: '⚠️ Important',
        value: `You have **${missedPicks}** missed pick${missedPicks === 1 ? '' : 's'} on games that have started. These will count as automatic losses.`,
        inline: false
      });
    }

    // Add pick summary if user has picks
    if (pickedCount > 0) {
      const pickSummary = userPicks.slice(0, 5).map((pick, index) => {
        const game = session.games.find(g => g.id === pick.gameId);
        if (!game) return null;
        
        const pickedTeam = pick.pick === 'home' ? game.homeTeam : game.awayTeam;
        const spreadText = pick.spread > 0 ? `+${pick.spread}` : pick.spread.toString();
        const isLocked = new Date(game.commenceTime) < now;
        
        return `${index + 1}. **${pickedTeam}** (${spreadText}) ${isLocked ? '🔒' : ''}`;
      }).filter(Boolean).join('\n');

      embed.addFields({
        name: `🎯 Your Picks ${pickedCount > 5 ? '(First 5)' : ''}`,
        value: pickSummary || 'No picks yet',
        inline: false
      });
    }

    // Create action buttons
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('pats_dashboard_makepick')
        .setLabel(pickedCount === totalGames ? 'View/Edit Picks' : 'Make Picks')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🏀'),
      new ButtonBuilder()
        .setCustomId('pats_dashboard_view_all_picks')
        .setLabel('View All Picks')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📋')
        .setDisabled(pickedCount === 0)
    );

    const secondRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('pats_dashboard_refresh')
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄')
    );

    await interaction.editReply({
      embeds: [embed],
      components: [buttons, secondRow]
    });

  } catch (error) {
    console.error('Error executing pats command:', error);
    await interaction.editReply({
      content: '❌ An error occurred while loading your PATS dashboard.',
    });
  }
}

/**
 * Handle dashboard button interactions
 */
export async function handleDashboardButton(interaction) {
  try {
    if (interaction.customId === 'pats_dashboard_makepick') {
      // Import and execute makepick command
      const makepickCommand = await import('./makepick.js');
      await makepickCommand.execute(interaction);
    } else if (interaction.customId === 'pats_dashboard_view_all_picks') {
      // Import and execute view picks handler
      const makepickCommand = await import('./makepick.js');
      await makepickCommand.handleViewMyPicks(interaction);
    } else if (interaction.customId === 'pats_dashboard_refresh') {
      // Re-execute the dashboard
      await execute(interaction);
    }
  } catch (error) {
    console.error('Error handling dashboard button:', error);
    await interaction.reply({
      content: '❌ Error processing your request.',
      ephemeral: true
    });
  }
}
