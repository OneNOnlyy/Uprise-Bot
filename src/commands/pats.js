import { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { getActiveSession, getUserPicks, getUserStats, getCurrentSessionStats, getLiveSessionLeaderboard, getUserSessionHistory } from '../utils/patsData.js';

/**
 * FAIL-SAFE: Fix spreads where one is 0 but the other isn't (they should be inverse)
 * This fixes visual bugs from old session data that was stored before the fail-safe was added
 */
function fixZeroSpreads(game) {
  let homeSpread = game.homeSpread !== undefined ? game.homeSpread : 0;
  let awaySpread = game.awaySpread !== undefined ? game.awaySpread : 0;
  
  // If one spread is 0 but the other isn't, they should be inverse
  if (homeSpread !== 0 && awaySpread === 0) {
    awaySpread = -homeSpread;
  } else if (awaySpread !== 0 && homeSpread === 0) {
    homeSpread = -awaySpread;
  }
  
  return { homeSpread, awaySpread };
}

export const data = new SlashCommandBuilder()
  .setName('pats')
  .setDescription('View your PATS dashboard and stats');

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    await showDashboard(interaction);
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
      // Defer and import makepick command
      await interaction.deferUpdate();
      const makepickCommand = await import('./makepick.js');
      await makepickCommand.handleMakepickFromDashboard(interaction);
    } else if (interaction.customId === 'pats_dashboard_view_all_picks') {
      // Import and execute view picks handler
      const makepickCommand = await import('./makepick.js');
      await makepickCommand.handleViewMyPicks(interaction);
    } else if (interaction.customId === 'pats_dashboard_stats') {
      // Show user stats
      await interaction.deferUpdate();
      await showUserStats(interaction);
    } else if (interaction.customId === 'pats_dashboard_refresh') {
      // Defer and re-execute the dashboard
      await interaction.deferUpdate();
      await showDashboard(interaction);
    } else if (interaction.customId === 'pats_stats_back') {
      // Return to dashboard from stats
      await interaction.deferUpdate();
      await showDashboard(interaction);
    } else if (interaction.customId === 'pats_view_history') {
      // Show session history
      await interaction.deferUpdate();
      await showSessionHistory(interaction);
    } else if (interaction.customId === 'pats_history_back') {
      // Return to stats from history
      await interaction.deferUpdate();
      await showUserStats(interaction);
    }
  } catch (error) {
    console.error('Error handling dashboard button:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ Error processing your request.',
        ephemeral: true
      });
    }
  }
}

/**
 * Show dashboard (can be called from execute or refresh)
 */
export async function showDashboard(interaction) {
  // Check for active session
  const session = getActiveSession();
  
  if (!session) {
    // Get user's overall stats to display
    const stats = getUserStats(interaction.user.id);
    
    const embed = new EmbedBuilder()
      .setTitle('🏀 Picks Against The Spread')
      .setDescription('**No active PATS session today.**\n\nWait for an admin to start a new session with `/patsstart`.')
      .setColor(0x808080)
      .setTimestamp();

    // Show overall stats if user has any (total games > 0 OR sessions > 0)
    const hasStats = stats.sessions > 0 || (stats.totalWins + stats.totalLosses + stats.totalPushes) > 0;
    
    if (hasStats) {
      const totalGames = stats.totalWins + stats.totalLosses;
      embed.addFields({
        name: '📊 Your Overall Stats',
        value: [
          `**Record:** ${stats.totalWins}-${stats.totalLosses}-${stats.totalPushes}`,
          `**Win Rate:** ${stats.winPercentage.toFixed(1)}%`,
          `**Sessions Played:** ${stats.sessions}`
        ].join('\n'),
        inline: false
      });
      
      // Add button to view detailed stats
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('pats_dashboard_stats')
          .setLabel('View Full Statistics')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📊')
      );

      await interaction.editReply({
        embeds: [embed],
        components: [buttons]
      });
    } else {
      // No stats at all - just show the message
      await interaction.editReply({
        embeds: [embed],
        components: []
      });
    }
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

  // Add all picks to dashboard with win/loss status
  if (pickedCount > 0) {
    let wins = 0;
    let losses = 0;
    let pushes = 0;
    let pending = 0;
    
    const pickSummary = userPicks.map((pick, index) => {
      const game = session.games.find(g => g.id === pick.gameId);
      if (!game) return null;
      
      const pickedTeam = pick.pick === 'home' ? game.homeTeam : game.awayTeam;
      const spreadText = pick.spread > 0 ? `+${pick.spread}` : pick.spread.toString();
      const isLocked = new Date(game.commenceTime) < now;
      const ddEmoji = pick.isDoubleDown ? ' 💰' : '';
      
      let statusEmoji = '';
      
      // Check if game has result
      if (game.result && game.result.status === 'Final') {
        const homeScore = game.result.homeScore;
        const awayScore = game.result.awayScore;
        
        // Calculate if pick won, lost, or pushed against the spread (with fail-safe)
        const { homeSpread, awaySpread } = fixZeroSpreads(game);
        
        // Calculate adjusted scores
        const adjustedHomeScore = homeScore + homeSpread;
        const adjustedAwayScore = awayScore + awaySpread;
        
        // Determine result based on which side user picked
        let userAdjustedScore, opponentScore;
        if (pick.pick === 'home') {
          userAdjustedScore = adjustedHomeScore;
          opponentScore = awayScore;
        } else {
          userAdjustedScore = adjustedAwayScore;
          opponentScore = homeScore;
        }
        
        // Three-way check: push, win, or loss
        if (userAdjustedScore === opponentScore) {
          statusEmoji = '🟰';
          pushes += 1; // Pushes never double
        } else if (userAdjustedScore > opponentScore) {
          statusEmoji = '✅';
          wins += pick.isDoubleDown ? 2 : 1;
        } else {
          statusEmoji = '❌';
          losses += pick.isDoubleDown ? 2 : 1;
        }
      } else if (isLocked) {
        statusEmoji = '🔒';
        pending++;
      } else {
        statusEmoji = '📌';  // Pick made but not locked yet
        pending++;
      }
      
      return `${index + 1}. ${statusEmoji} **${pickedTeam}** (${spreadText})${ddEmoji}`;
    }).filter(Boolean).join('\n');

    embed.addFields({
      name: `🎯 Your Picks`,
      value: pickSummary || 'No picks yet',
      inline: false
    });
    
    // Add record if any games are complete
    if (wins > 0 || losses > 0 || pushes > 0) {
      embed.addFields({
        name: '📊 Current Record',
        value: `**${wins}-${losses}-${pushes}** (${wins + losses + pushes} complete, ${pending} pending)`,
        inline: false
      });
    }
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
      .setDisabled(pickedCount === 0),
    new ButtonBuilder()
      .setCustomId('pats_dashboard_stats')
      .setLabel('My Stats')
      .setStyle(ButtonStyle.Success)
      .setEmoji('📊')
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
}

/**
 * Show user stats page
 */
async function showUserStats(interaction) {
  const stats = getUserStats(interaction.user.id);
  const sessionStats = getCurrentSessionStats(interaction.user.id);
  
  const embed = new EmbedBuilder()
    .setTitle('📊 Your PATS Statistics')
    .setDescription(`**${interaction.user.displayName}'s** overall performance`)
    .setColor(0x5865F2)
    .setTimestamp();

  // Overall stats
  const totalGames = stats.totalWins + stats.totalLosses;
  embed.addFields({
    name: '🏆 Overall Record',
    value: [
      `**Record:** ${stats.totalWins}-${stats.totalLosses}-${stats.totalPushes}`,
      `**Win Rate:** ${stats.winPercentage.toFixed(1)}%`,
      `**Sessions Played:** ${stats.sessions}`,
      `**Avg Per Session:** ${totalGames > 0 ? (totalGames / stats.sessions).toFixed(1) : '0'} picks`
    ].join('\n'),
    inline: true
  });

  // Streaks
  const streakText = stats.currentStreak > 0 
    ? `${stats.currentStreak} ${stats.streakType === 'win' ? '🔥' : '❄️'}` 
    : 'None';
  
  embed.addFields({
    name: '🔥 Streaks',
    value: [
      `**Current:** ${streakText}`,
      `**Best Win Streak:** ${stats.bestStreak} 🏆`,
      stats.streakType === 'win' && stats.currentStreak >= 3 ? '**On Fire!** 🔥🔥🔥' : null
    ].filter(Boolean).join('\n'),
    inline: true
  });

  // Double-Down Stats (Overall - only show if used at least once in history)
  if (stats.doubleDownsUsed > 0) {
    const ddRecord = `${stats.doubleDownWins}-${stats.doubleDownLosses}-${stats.doubleDownPushes || 0}`;
    embed.addFields({
      name: '💰 Double Down Stats (All-Time)',
      value: [
        `**Used:** ${stats.doubleDownsUsed} times`,
        `**Record:** ${ddRecord}`,
        `**Win Rate:** ${stats.doubleDownWinRate.toFixed(1)}%`,
        stats.doubleDownWinRate >= 60 ? '🔥 Hot Hand!' : stats.doubleDownWinRate >= 50 ? '✅ Profitable' : '📉 Risky'
      ].join('\n'),
      inline: false
    });
  }

  // Current session stats
  if (sessionStats) {
    const sessionRecord = `${sessionStats.wins}-${sessionStats.losses}-${sessionStats.pushes}`;
    const sessionProgress = `${sessionStats.totalPicks}/${sessionStats.totalGames}`;
    
    // Build session details
    const sessionDetails = [
      `**Record:** ${sessionRecord}`,
      `**Progress:** ${sessionProgress} picks made`,
      sessionStats.pending > 0 ? `**Pending:** ${sessionStats.pending} locked` : null,
      sessionStats.missedPicks > 0 ? `**Missed:** ${sessionStats.missedPicks} ⚠️` : null
    ].filter(Boolean);
    
    // Add double-down info if used in current session
    if (sessionStats.doubleDownGame) {
      sessionDetails.push(`**💰 Double Down:**  ${sessionStats.doubleDownGame.awayTeam} @ ${sessionStats.doubleDownGame.homeTeam}`);
    }
    
    embed.addFields({
      name: '📅 Today\'s Session',
      value: sessionDetails.join('\n'),
      inline: false
    });
  } else {
    embed.addFields({
      name: '📅 Today\'s Session',
      value: 'No active session',
      inline: false
    });
  }

  // Performance indicators
  if (totalGames >= 5) {
    let performanceText = '';
    if (stats.winPercentage >= 60) {
      performanceText = '⭐⭐⭐ Elite Handicapper!';
    } else if (stats.winPercentage >= 55) {
      performanceText = '⭐⭐ Sharp Better';
    } else if (stats.winPercentage >= 50) {
      performanceText = '⭐ Above Average';
    } else if (stats.winPercentage >= 45) {
      performanceText = '📊 Learning the Ropes';
    } else {
      performanceText = '🎯 Keep Grinding!';
    }
    
    embed.addFields({
      name: '🎖️ Performance Level',
      value: performanceText,
      inline: false
    });
  }

  const backButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('pats_stats_back')
      .setLabel('Back to Dashboard')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀️'),
    new ButtonBuilder()
      .setCustomId('pats_view_history')
      .setLabel('View Session History')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📜')
  );

  await interaction.editReply({
    embeds: [embed],
    components: [backButton]
  });
}

/**
 * Show session history
 */
async function showSessionHistory(interaction) {
  const history = getUserSessionHistory(interaction.user.id, 10);
  
  const embed = new EmbedBuilder()
    .setTitle('📜 Your Session History')
    .setDescription(`**${interaction.user.displayName}'s** recent PATS sessions`)
    .setColor(0x5865F2)
    .setTimestamp();

  if (history.length === 0) {
    embed.setDescription('No session history found. Complete a session to see your history here!');
  } else {
    // Show last 10 sessions
    const historyText = history.map((session, index) => {
      const record = `${session.wins}-${session.losses}-${session.pushes}`;
      const winRate = session.wins + session.losses > 0 
        ? ((session.wins / (session.wins + session.losses)) * 100).toFixed(1) 
        : '0.0';
      const pickCount = session.picks.length;
      const missedText = session.missedPicks > 0 ? ` • ${session.missedPicks} missed` : '';
      const dateStr = new Date(session.closedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      return `**${index + 1}. ${dateStr}** - ${record} (${winRate}%) • ${pickCount}/${session.totalGames} picks${missedText}`;
    }).join('\n');

    embed.addFields({
      name: '📊 Recent Sessions',
      value: historyText,
      inline: false
    });
    
    // Summary stats from history
    const totalSessions = history.length;
    const totalWins = history.reduce((sum, s) => sum + s.wins, 0);
    const totalLosses = history.reduce((sum, s) => sum + s.losses, 0);
    const totalPushes = history.reduce((sum, s) => sum + (s.pushes || 0), 0);
    const avgWinRate = totalWins + totalLosses > 0 
      ? ((totalWins / (totalWins + totalLosses)) * 100).toFixed(1)
      : '0.0';
    
    embed.addFields({
      name: '📈 History Summary',
      value: [
        `**Sessions Shown:** ${totalSessions}`,
        `**Combined Record:** ${totalWins}-${totalLosses}-${totalPushes}`,
        `**Avg Win Rate:** ${avgWinRate}%`
      ].join('\n'),
      inline: false
    });
  }

  const backButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('pats_history_back')
      .setLabel('Back to Stats')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀️')
  );

  await interaction.editReply({
    embeds: [embed],
    components: [backButton]
  });
}

