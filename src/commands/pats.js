import { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { getActiveSession, getUserPicks, getUserStats, getCurrentSessionStats, getLiveSessionLeaderboard, getUserSessionHistory, updateGameResult } from '../utils/patsData.js';
import { getTeamAbbreviation, fetchCBSSportsScores } from '../utils/oddsApi.js';

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
    
    // Fetch fresh CBS scores before showing dashboard
    const session = getActiveSession();
    if (session) {
      try {
        console.log('🔄 Loading dashboard - fetching fresh CBS scores...');
        const cbsGames = await fetchCBSSportsScores(session.date);
        
        let updatedCount = 0;
        for (const sessionGame of session.games) {
          // Match with CBS Sports data using abbreviations
          const awayAbbr = getTeamAbbreviation(sessionGame.awayTeam);
          const homeAbbr = getTeamAbbreviation(sessionGame.homeTeam);
          
          const cbsGame = cbsGames.find(cg => 
            cg.awayTeam === awayAbbr && cg.homeTeam === homeAbbr
          );
          
          if (cbsGame && cbsGame.awayScore !== null && cbsGame.homeScore !== null) {
            // If CBS says game is live, always update
            if (cbsGame.isLive) {
              const liveResult = {
                homeScore: cbsGame.homeScore,
                awayScore: cbsGame.awayScore,
                status: cbsGame.status,
                isLive: true
              };
              updateGameResult(session.id, sessionGame.id, liveResult);
              updatedCount++;
            } else if (cbsGame.isFinal) {
              // Only mark as final if not already final
              if (!sessionGame.result || sessionGame.result.status !== 'Final') {
                const result = {
                  homeScore: cbsGame.homeScore,
                  awayScore: cbsGame.awayScore,
                  winner: cbsGame.homeScore > cbsGame.awayScore ? 'home' : 'away',
                  status: 'Final'
                };
                updateGameResult(session.id, sessionGame.id, result);
                updatedCount++;
              }
            }
          }
        }
        
        if (updatedCount > 0) {
          console.log(`✅ Updated ${updatedCount} games with fresh CBS scores on load`);
        }
      } catch (error) {
        console.error('❌ Error fetching fresh CBS scores on load:', error);
      }
    }
    
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
    } else if (interaction.customId === 'pats_dashboard_view_everyone_picks') {
      // Show everyone's picks for all games
      await interaction.deferUpdate();
      await showEveryonesPicks(interaction);
    } else if (interaction.customId === 'pats_dashboard_stats') {
      // Show user stats
      await interaction.deferUpdate();
      await showUserStats(interaction);
    } else if (interaction.customId === 'pats_dashboard_refresh') {
      // Fetch fresh CBS scores and update session before showing dashboard
      await interaction.deferUpdate();
      
      const session = getActiveSession();
      if (session) {
        try {
          console.log('🔄 Refreshing dashboard - fetching fresh scores...');
          const espnGames = await fetchCBSSportsScores(session.date);
          
          let updatedCount = 0;
          for (const sessionGame of session.games) {
            // Match with ESPN data using abbreviations
            const awayAbbr = getTeamAbbreviation(sessionGame.awayTeam);
            const homeAbbr = getTeamAbbreviation(sessionGame.homeTeam);
            
            console.log(`🔍 Looking for match: ${awayAbbr} @ ${homeAbbr}`);
            
            const espnGame = espnGames.find(eg => 
              eg.awayTeam === awayAbbr && eg.homeTeam === homeAbbr
            );
            
            if (espnGame) {
              console.log(`  ✅ Found ESPN game: ${espnGame.awayTeam} @ ${espnGame.homeTeam} - ${espnGame.awayScore} @ ${espnGame.homeScore}`);
            } else {
              console.log(`  ❌ No ESPN match found for ${awayAbbr} @ ${homeAbbr}`);
            }
            
            if (espnGame && espnGame.awayScore !== null && espnGame.homeScore !== null) {
              // If ESPN says game is live, always update
              if (espnGame.isLive) {
                const liveResult = {
                  homeScore: espnGame.homeScore,
                  awayScore: espnGame.awayScore,
                  status: espnGame.status,
                  isLive: true
                };
                const updated = updateGameResult(session.id, sessionGame.id, liveResult);
                if (updated !== false) updatedCount++;
              } else if (espnGame.isFinal) {
                // Mark as final
                const result = {
                  homeScore: espnGame.homeScore,
                  awayScore: espnGame.awayScore,
                  winner: espnGame.homeScore > espnGame.awayScore ? 'home' : 'away',
                  status: 'Final'
                };
                const updated = updateGameResult(session.id, sessionGame.id, result);
                if (updated !== false) updatedCount++;
              }
            }
          }
          
          if (updatedCount > 0) {
            console.log(`✅ Updated ${updatedCount} games with fresh scores`);
          } else {
            console.log('ℹ️ No score updates needed');
          }
        } catch (error) {
          console.error('❌ Error fetching fresh scores for refresh:', error);
        }
      }
      
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
    let completedGames = 0; // Track actual number of completed games (not win/loss count)
    
    // Sort picks by game commence time to match the order elsewhere
    const sortedPicks = [...userPicks].sort((a, b) => {
      const gameA = session.games.find(g => g.id === a.gameId);
      const gameB = session.games.find(g => g.id === b.gameId);
      if (!gameA || !gameB) return 0;
      return new Date(gameA.commenceTime) - new Date(gameB.commenceTime);
    });
    
    const pickSummary = sortedPicks.map((pick, index) => {
      const game = session.games.find(g => g.id === pick.gameId);
      if (!game) return null;
      
      const pickedTeam = pick.pick === 'home' ? game.homeTeam : game.awayTeam;
      
      // Use corrected spread, not the old saved value
      const fixedSpreads = fixZeroSpreads(game);
      const correctedSpread = pick.pick === 'home' ? fixedSpreads.homeSpread : fixedSpreads.awaySpread;
      const spreadText = correctedSpread > 0 ? `+${correctedSpread}` : correctedSpread.toString();
      
      const isLocked = new Date(game.commenceTime) < now;
      const ddEmoji = pick.isDoubleDown ? ' 💰' : '';
      
      let statusEmoji = '';
      
      // Check if game has result
      if (game.result && game.result.status === 'Final') {
        completedGames++; // Count actual completed games (not win/loss points)
        
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
      } else if (game.result && game.result.isLive) {
        // Game is in progress - show live pick status
        const homeScore = game.result.homeScore;
        const awayScore = game.result.awayScore;
        
        const { homeSpread, awaySpread } = fixZeroSpreads(game);
        
        // Calculate adjusted scores
        const adjustedHomeScore = homeScore + homeSpread;
        const adjustedAwayScore = awayScore + awaySpread;
        
        // Determine current status based on which side user picked
        let userAdjustedScore, opponentScore;
        if (pick.pick === 'home') {
          userAdjustedScore = adjustedHomeScore;
          opponentScore = awayScore;
        } else {
          userAdjustedScore = adjustedAwayScore;
          opponentScore = homeScore;
        }
        
        // Show live status: winning, losing, or push
        if (userAdjustedScore === opponentScore) {
          statusEmoji = '➖'; // Push - right at the line
        } else if (userAdjustedScore > opponentScore) {
          statusEmoji = '📈'; // Winning - trending good
        } else {
          statusEmoji = '📉'; // Losing - trending bad
        }
        pending++;
      } else if (isLocked) {
        statusEmoji = '🔒';
        pending++;
      } else {
        statusEmoji = '📌';  // Pick made but not locked yet
        pending++;
      }
      
      let scoreText = '';
      if (game.result) {
        const awayAbbrev = getTeamAbbreviation(game.awayTeam);
        const homeAbbrev = getTeamAbbreviation(game.homeTeam);
        
        if (game.result.status === 'Final') {
          scoreText = ` - ${awayAbbrev} ${game.result.awayScore} @ ${homeAbbrev} ${game.result.homeScore}`;
        } else if (game.result.isLive) {
          // Show live status with score
          const status = game.result.status || 'Live';
          scoreText = ` - ${awayAbbrev} ${game.result.awayScore} @ ${homeAbbrev} ${game.result.homeScore} (${status})`;
        }
      }
      
      return `${index + 1}. ${statusEmoji} **${pickedTeam}** (${spreadText})${ddEmoji}${scoreText}`;
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
        value: `**${wins}-${losses}-${pushes}** (${completedGames} complete, ${pending} pending)`,
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
      .setCustomId('pats_dashboard_view_everyone_picks')
      .setLabel('Everyone\'s Picks')
      .setEmoji('👥')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('pats_dashboard_refresh')
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary)
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

  // Double-Down Stats (show if ever used)
  const ddTotal = (stats.doubleDownWins || 0) + (stats.doubleDownLosses || 0) + (stats.doubleDownPushes || 0);
  if (ddTotal > 0 || (stats.doubleDownsUsed || 0) > 0) {
    const ddRecord = `${stats.doubleDownWins || 0}-${stats.doubleDownLosses || 0}-${stats.doubleDownPushes || 0}`;
    const ddGamesDecided = (stats.doubleDownWins || 0) + (stats.doubleDownLosses || 0);
    const ddWinRate = ddGamesDecided > 0 ? ((stats.doubleDownWins || 0) / ddGamesDecided * 100).toFixed(1) : '0.0';
    
    embed.addFields({
      name: '💰 Double Down Record',
      value: [
        `**Record:** ${ddRecord}`,
        `**Win Rate:** ${ddWinRate}%`,
        `**Used:** ${stats.doubleDownsUsed || 0} times`
      ].join('\n'),
      inline: true
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
      const awayAbbrev = getTeamAbbreviation(sessionStats.doubleDownGame.awayTeam);
      const homeAbbrev = getTeamAbbreviation(sessionStats.doubleDownGame.homeTeam);
      sessionDetails.push(`**💰 Double Down:**  ${awayAbbrev} @ ${homeAbbrev}`);
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

/**
 * Show everyone's picks for all games in the session (paginated by game)
 */
async function showEveryonesPicks(interaction, gameIndex = 0) {
  const session = getActiveSession();
  
  if (!session) {
    await interaction.editReply({
      content: '❌ No active session.',
      components: []
    });
    return;
  }

  // Get all picks from patsData
  const { readPATSData } = await import('../utils/patsData.js');
  const data = readPATSData();
  const sessionData = data.activeSessions.find(s => s.id === session.id);
  
  if (!sessionData || !sessionData.picks) {
    await interaction.editReply({
      content: '❌ No picks found for this session.',
      components: []
    });
    return;
  }

  // Sort games by commence time to match dashboard and other views
  const sortedGames = [...session.games].sort((a, b) => 
    new Date(a.commenceTime) - new Date(b.commenceTime)
  );

  // Validate game index
  if (gameIndex < 0 || gameIndex >= sortedGames.length) {
    gameIndex = 0;
  }

  const game = sortedGames[gameIndex];
  
  // Apply zero spread fix
  const { homeSpread, awaySpread } = fixZeroSpreads(game);

  // Collect picks for this specific game
  const gamePicks = [];
  for (const [userId, userPicksArray] of Object.entries(sessionData.picks)) {
    const pickForGame = userPicksArray.find(p => p.gameId === game.id);
    if (pickForGame) {
      gamePicks.push({
        userId: userId,
        pick: pickForGame
      });
    }
  }

  // Build embed for this game
  const awayAbbrev = getTeamAbbreviation(game.awayTeam);
  const homeAbbrev = getTeamAbbreviation(game.homeTeam);
  
  // Add score information if available
  let scoreInfo = '';
  if (game.result) {
    if (game.result.status === 'Final') {
      scoreInfo = `\n**Score: ${awayAbbrev} ${game.result.awayScore} @ ${homeAbbrev} ${game.result.homeScore} (Final)**`;
    } else if (game.result.isLive) {
      const status = game.result.status || 'Live';
      scoreInfo = `\n**Score: ${awayAbbrev} ${game.result.awayScore} @ ${homeAbbrev} ${game.result.homeScore} (${status})**`;
    }
  }
  
  const embed = new EmbedBuilder()
    .setTitle('👥 Everyone\'s Picks')
    .setDescription(`**${awayAbbrev}** @ **${homeAbbrev}**\nGame ${gameIndex + 1} of ${sortedGames.length}${scoreInfo}`)
    .setColor(0x5865F2)
    .setTimestamp();

  if (gamePicks.length === 0) {
    embed.addFields({
      name: 'No Picks Yet',
      value: 'No one has made a pick for this game.',
      inline: false
    });
  } else {
    // Count picks for each team
    let homePicks = 0;
    let awayPicks = 0;
    const homePickDetails = [];
    const awayPickDetails = [];

    for (const { userId, pick } of gamePicks) {
      const ddTag = pick.isDoubleDown ? ' 💰' : '';
      const userMention = `<@${userId}>`;
      
      // Determine if this pick won/lost/pending
      let resultEmoji = '';
      if (game.result && game.result.status === 'Final') {
        // Calculate if pick won against the spread
        const homeScore = game.result.homeScore;
        const awayScore = game.result.awayScore;
        
        let pickWon = false;
        if (pick.pick === 'home') {
          pickWon = (homeScore + homeSpread) > awayScore;
        } else {
          pickWon = (awayScore + awaySpread) > homeScore;
        }
        
        // Check for push (exact tie with spread)
        const isPush = (pick.pick === 'home' && (homeScore + homeSpread) === awayScore) ||
                       (pick.pick === 'away' && (awayScore + awaySpread) === homeScore);
        
        if (isPush) {
          resultEmoji = ' 🟡'; // Push
        } else {
          resultEmoji = pickWon ? ' ✅' : ' ❌';
        }
      }
      
      if (pick.pick === 'home') {
        homePicks++;
        const spread = homeSpread > 0 ? `+${homeSpread}` : homeSpread;
        homePickDetails.push(`${userMention} (${spread})${ddTag}${resultEmoji}`);
      } else {
        awayPicks++;
        const spread = awaySpread > 0 ? `+${awaySpread}` : awaySpread;
        awayPickDetails.push(`${userMention} (${spread})${ddTag}${resultEmoji}`);
      }
    }

    // Add away team picks
    embed.addFields({
      name: `✈️ ${game.awayTeam} (${awaySpread > 0 ? '+' : ''}${awaySpread})`,
      value: awayPicks > 0 ? `**${awayPicks} ${awayPicks === 1 ? 'pick' : 'picks'}**\n${awayPickDetails.join('\n')}` : 'No picks',
      inline: false
    });

    // Add home team picks
    embed.addFields({
      name: `🏠 ${game.homeTeam} (${homeSpread > 0 ? '+' : ''}${homeSpread})`,
      value: homePicks > 0 ? `**${homePicks} ${homePicks === 1 ? 'pick' : 'picks'}**\n${homePickDetails.join('\n')}` : 'No picks',
      inline: false
    });

    // Add summary
    const totalPlayers = Object.keys(sessionData.picks).length;
    embed.addFields({
      name: 'Session Summary',
      value: `**${totalPlayers}** ${totalPlayers === 1 ? 'player' : 'players'} in session\n**${gamePicks.length}** ${gamePicks.length === 1 ? 'pick' : 'picks'} for this game`,
      inline: false
    });
  }

  // Navigation buttons
  const navigationButtons = new ActionRowBuilder();
  
  const isFirstGame = gameIndex === 0;
  const isLastGame = gameIndex === sortedGames.length - 1;

  if (!isFirstGame) {
    navigationButtons.addComponents(
      new ButtonBuilder()
        .setCustomId(`pats_everyone_picks_nav_${gameIndex - 1}`)
        .setLabel('Previous Game')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('◀️')
    );
  }

  navigationButtons.addComponents(
    new ButtonBuilder()
      .setCustomId('pats_dashboard_refresh')
      .setLabel('Back to Dashboard')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🏠')
  );

  if (!isLastGame) {
    navigationButtons.addComponents(
      new ButtonBuilder()
        .setCustomId(`pats_everyone_picks_nav_${gameIndex + 1}`)
        .setLabel('Next Game')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('▶️')
    );
  }

  await interaction.editReply({
    embeds: [embed],
    components: [navigationButtons]
  });
}

// Export the handler for navigation
export async function handleEveryonePicksNavigation(interaction) {
  await interaction.deferUpdate();
  const gameIndex = parseInt(interaction.customId.split('_').pop());
  await showEveryonesPicks(interaction, gameIndex);
}

