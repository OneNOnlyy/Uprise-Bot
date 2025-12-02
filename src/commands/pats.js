import { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { getActiveSession, getUserPicks, getUserStats, getCurrentSessionStats, getLiveSessionLeaderboard, getUserSessionHistory, updateGameResult } from '../utils/patsData.js';
import { getTeamAbbreviation, fetchCBSSportsScores } from '../utils/oddsApi.js';
import { getUserSessionSnapshots, loadSessionSnapshot, loadInjuryData, loadRosterData } from '../utils/sessionSnapshot.js';
import { getUpcomingScheduledSessions } from '../utils/sessionScheduler.js';

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
  .setDescription('Picks Against The Spread commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('dashboard')
      .setDescription('View your PATS dashboard and make picks'))
  .addSubcommand(subcommand =>
    subcommand
      .setName('start')
      .setDescription('Start a new PATS session (Admin only)')
      .addStringOption(option =>
        option.setName('date')
          .setDescription('Date for games (YYYY-MM-DD, default: today)')
          .setRequired(false))
      .addRoleOption(option =>
        option.setName('participant_role')
          .setDescription('Role to DM for participation (default: @everyone)')
          .setRequired(false)))
  .addSubcommand(subcommand =>
    subcommand
      .setName('end')
      .setDescription('End the current PATS session (Admin only)'))
  .addSubcommand(subcommand =>
    subcommand
      .setName('schedule')
      .setDescription('Schedule PATS sessions (Admin only)'))
  .addSubcommand(subcommand =>
    subcommand
      .setName('assignpicks')
      .setDescription('Assign picks on behalf of a user (Admin only)')
      .addUserOption(option =>
        option.setName('user')
          .setDescription('The user to assign picks for')
          .setRequired(true)))
  .addSubcommand(subcommand =>
    subcommand
      .setName('history')
      .setDescription('View PATS session history (Admin only)'))
  .addSubcommand(subcommand =>
    subcommand
      .setName('leaderboard')
      .setDescription('View the all-time PATS leaderboard'))
  .addSubcommand(subcommand =>
    subcommand
      .setName('reopen')
      .setDescription('Reopen a closed session for more picks (Admin only)'))
  .addSubcommand(subcommand =>
    subcommand
      .setName('refreshspreads')
      .setDescription('Refresh spreads from Odds API (Admin only)'));

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  
  // Route to appropriate handler based on subcommand
  if (subcommand !== 'dashboard') {
    switch (subcommand) {
      case 'start': {
        const patsstartCommand = await import('./patsstart.js');
        return await patsstartCommand.execute(interaction);
      }
      case 'end': {
        const patsendCommand = await import('./patsend.js');
        return await patsendCommand.execute(interaction);
      }
      case 'schedule': {
        const patsscheduleCommand = await import('./patsschedule.js');
        return await patsscheduleCommand.execute(interaction);
      }
      case 'assignpicks': {
        const patsassignpicksCommand = await import('./patsassignpicks.js');
        return await patsassignpicksCommand.execute(interaction);
      }
      case 'history': {
        const patshistoryCommand = await import('./patshistory.js');
        return await patshistoryCommand.execute(interaction);
      }
      case 'leaderboard': {
        const patsleaderboardCommand = await import('./patsleaderboard.js');
        return await patsleaderboardCommand.execute(interaction);
      }
      case 'reopen': {
        const patsreopenCommand = await import('./patsreopen.js');
        return await patsreopenCommand.execute(interaction);
      }
      case 'refreshspreads': {
        const patsrefreshspreadsCommand = await import('./patsrefreshspreads.js');
        return await patsrefreshspreadsCommand.execute(interaction);
      }
    }
  }
  
  // Show dashboard (for 'dashboard' subcommand)
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
      // Show statistics menu
      await interaction.deferUpdate();
      await showStatsMenu(interaction);
    } else if (interaction.customId === 'pats_no_session_stats_menu') {
      // Show statistics menu when no session
      await interaction.deferUpdate();
      await showStatsMenu(interaction);
    } else if (interaction.customId === 'pats_no_session_help') {
      // Show help menu when no session
      await interaction.deferUpdate();
      await showHelpMenu(interaction);
    } else if (interaction.customId === 'pats_stats_menu_my_stats') {
      // Show user's own stats
      await interaction.deferUpdate();
      await showUserStats(interaction);
    } else if (interaction.customId === 'pats_stats_menu_other_stats') {
      // Show player selection for viewing other stats
      await interaction.deferUpdate();
      await showPlayerSelection(interaction, false);
    } else if (interaction.customId === 'pats_stats_menu_past_sessions') {
      // Show past sessions browser
      await interaction.deferUpdate();
      await showPastSessionsBrowser(interaction);
    } else if (interaction.customId === 'pats_stats_menu_leaderboard') {
      // Show leaderboard
      const patsleaderboardCommand = await import('./patsleaderboard.js');
      await interaction.deferUpdate();
      return await patsleaderboardCommand.execute(interaction);
    } else if (interaction.customId.startsWith('pats_view_player_')) {
      // View specific player's stats from search results
      await interaction.deferUpdate();
      const userId = interaction.customId.replace('pats_view_player_', '');
      await showUserStats(interaction, userId);
    } else if (interaction.customId === 'pats_player_selection_back') {
      // Return to stats menu from player selection
      await interaction.deferUpdate();
      await showStatsMenu(interaction);
    } else if (interaction.customId === 'pats_stats_menu_back') {
      // Return to dashboard from stats menu
      await interaction.deferUpdate();
      await showDashboard(interaction);
    } else if (interaction.customId === 'pats_past_sessions_back') {
      // Return to past sessions browser
      await interaction.deferUpdate();
      await showPastSessionsBrowser(interaction);
    } else if (interaction.customId.startsWith('pats_view_historical_games_')) {
      // View games from historical session
      await interaction.deferUpdate();
      const sessionId = interaction.customId.replace('pats_view_historical_games_', '');
      await showHistoricalGames(interaction, sessionId);
    } else if (interaction.customId.startsWith('pats_view_historical_picks_')) {
      // View user's picks from historical session
      await interaction.deferUpdate();
      const sessionId = interaction.customId.replace('pats_view_historical_picks_', '');
      await showHistoricalPicks(interaction, sessionId);
    } else if (interaction.customId.startsWith('pats_historical_game_detail_')) {
      // View detailed game info from historical session
      await interaction.deferUpdate();
      const [sessionId, gameId] = interaction.customId.replace('pats_historical_game_detail_', '').split('_');
      await showHistoricalGameDetail(interaction, sessionId, gameId);
    } else if (interaction.customId.startsWith('pats_back_to_historical_')) {
      // Return to historical dashboard
      await interaction.deferUpdate();
      const sessionId = interaction.customId.replace('pats_back_to_historical_', '');
      await showHistoricalDashboard(interaction, sessionId);
    } else if (interaction.customId === 'pats_dashboard_refresh') {
      // Fetch fresh CBS scores and update session before showing dashboard
      
      // Try to defer, but if interaction is too old (>15 min), it will fail
      try {
        await interaction.deferUpdate();
      } catch (error) {
        // Interaction expired - can't update the old message
        // Best we can do is log it and inform the user
        console.log('⚠️ Interaction expired, cannot refresh. User needs to run /pats again.');
        if (!interaction.replied && !interaction.deferred) {
          try {
            await interaction.reply({
              content: '❌ This dashboard expired. Please run `/pats` again to get a fresh dashboard with updated scores.',
              ephemeral: true
            });
          } catch (replyError) {
            console.error('Could not send expiration message:', replyError);
          }
        }
        return;
      }
      
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
    } else if (interaction.customId === 'pats_dashboard_help') {
      // Show help menu
      await interaction.deferUpdate();
      await showHelpMenu(interaction);
    } else if (interaction.customId === 'pats_help_legend') {
      // Show emoji legend
      await interaction.deferUpdate();
      await showEmojiLegend(interaction);
    } else if (interaction.customId === 'pats_help_tutorial') {
      // Show tutorial
      await interaction.deferUpdate();
      await showTutorial(interaction);
    } else if (interaction.customId === 'pats_help_back') {
      // Return to dashboard from help
      await interaction.deferUpdate();
      await showDashboard(interaction);
    } else if (interaction.customId === 'pats_stats_back') {
      // Return to stats menu from individual stats
      await interaction.deferUpdate();
      await showStatsMenu(interaction);
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
    
    // Check for upcoming scheduled sessions
    const upcomingSessions = getUpcomingScheduledSessions();
    const nextSession = upcomingSessions.length > 0 
      ? upcomingSessions.sort((a, b) => new Date(a.firstGameTime) - new Date(b.firstGameTime))[0]
      : null;
    
    let description = '';
    
    if (nextSession) {
      // Use announcement time (when session starts) instead of first game time
      const sessionStartTime = nextSession.notifications?.announcement?.time 
        ? new Date(nextSession.notifications.announcement.time)
        : new Date(nextSession.firstGameTime);
      const unixTimestamp = Math.floor(sessionStartTime.getTime() / 1000);
      
      // Count the number of games (could be an array or a number)
      const gameCount = Array.isArray(nextSession.games) ? nextSession.games.length : nextSession.games;
      
      // Format date in relative format (e.g., "Tomorrow, December 2nd" or "Sunday, December 7th")
      const sessionDate = new Date(nextSession.scheduledDate);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const sessionDay = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());
      
      let relativeDate;
      if (sessionDay.getTime() === today.getTime()) {
        relativeDate = 'Today';
      } else if (sessionDay.getTime() === tomorrow.getTime()) {
        relativeDate = 'Tomorrow';
      } else {
        // Show day of week for dates within the next week
        relativeDate = sessionDate.toLocaleDateString('en-US', { weekday: 'long' });
      }
      
      const formattedDate = sessionDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
      const dateDisplay = sessionDay.getTime() === today.getTime() 
        ? relativeDate 
        : `${relativeDate}, ${formattedDate}`;
      
      description = `📅 **Next Scheduled Session:**\n${dateDisplay} • ${gameCount} game${gameCount !== 1 ? 's' : ''} • <t:${unixTimestamp}:R>`;
    } else {
      description = '📅 No sessions currently scheduled.';
    }
    
    const embed = new EmbedBuilder()
      .setTitle('🏀 Picks Against The Spread')
      .setDescription(description)
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
      
      // Add buttons to view detailed stats and help
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('pats_no_session_stats_menu')
          .setLabel('All Statistics')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📊'),
        new ButtonBuilder()
          .setCustomId('pats_no_session_help')
          .setLabel('Help')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('❓'),
        new ButtonBuilder()
          .setCustomId('pats_no_session_settings')
          .setLabel('Settings')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⚙️')
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

  // Add all games to dashboard with pick status
  if (session.games.length > 0) {
    let wins = 0;
    let losses = 0;
    let pushes = 0;
    let pending = 0;
    let completedGames = 0; // Track actual number of completed games (not win/loss count)
    
    // Sort games by commence time
    const sortedGames = [...session.games].sort((a, b) => {
      return new Date(a.commenceTime) - new Date(b.commenceTime);
    });
    
    const pickSummary = sortedGames.map((game, index) => {
      const pick = userPicks.find(p => p.gameId === game.id);
      
      // If no pick made, show as unpicked
      if (!pick) {
        const isLocked = new Date(game.commenceTime) < now;
        if (isLocked) {
          // Missed pick on started game
          return `${index + 1}. ❌ **No pick made** - ${game.awayTeam} @ ${game.homeTeam} (Missed)`;
        } else {
          // Haven't picked yet but still time
          return `${index + 1}. ⚠️ **No pick yet** - ${game.awayTeam} @ ${game.homeTeam}`;
        }
      }
      
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
          statusEmoji = '🟡';
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
        // Only show lock if game has actually started OR if it's significantly past commence time
        // If game.result exists but isn't final/live, game hasn't started yet
        if (game.result && !game.result.isLive && !game.result.isFinal) {
          // Has result object but not started - show scheduled icon
          statusEmoji = '📌';
        } else {
          // Past commence time and either started or should have started
          statusEmoji = '🔒';
        }
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
          // Don't show ISO timestamps as status
          let status = game.result.status || 'Live';
          if (status.match(/^\d{4}-\d{2}-\d{2}T/)) {
            status = 'Live';
          }
          scoreText = ` - ${awayAbbrev} ${game.result.awayScore} @ ${homeAbbrev} ${game.result.homeScore} (${status})`;
        }
        // Don't show scores for scheduled games
      }
      
      // Add start time for scheduled picks (📌)
      if (statusEmoji === '📌' && game.commenceTime) {
        const gameTime = new Date(game.commenceTime);
        const timeString = gameTime.toLocaleString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'America/Los_Angeles',
          timeZoneName: 'short'
        });
        scoreText = ` - ${timeString}`;
      }
      
      return `${index + 1}. ${statusEmoji} **${pickedTeam}** (${spreadText})${ddEmoji}${scoreText}`;
    }).filter(Boolean).join('\n');

    embed.addFields({
      name: `🎯 Your Picks`,
      value: pickSummary || 'No games available',
      inline: false
    });
    
    // Add record if any games are complete
    if (wins > 0 || losses > 0 || pushes > 0) {
      embed.addFields({
        name: '📊 Today\'s Record',
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
      .setLabel('All Statistics')
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
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('pats_dashboard_help')
      .setLabel('Help')
      .setEmoji('❓')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('pats_dashboard_settings')
      .setLabel('Settings')
      .setEmoji('⚙️')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.editReply({
    embeds: [embed],
    components: [buttons, secondRow]
  });
}

/**
 * Show statistics menu - choose whose stats to view
 */
async function showStatsMenu(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('📊 PATS Statistics')
    .setDescription('**View player statistics and performance**\n\nChoose whose stats you\'d like to view:')
    .setColor(0x5865F2)
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('pats_stats_menu_my_stats')
      .setLabel('My Stats')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('👤'),
    new ButtonBuilder()
      .setCustomId('pats_stats_menu_other_stats')
      .setLabel('View Other Player')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('👥'),
    new ButtonBuilder()
      .setCustomId('pats_stats_menu_leaderboard')
      .setLabel('Leaderboard')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🏆')
  );
  
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('pats_stats_menu_past_sessions')
      .setLabel('View Past Sessions')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📜'),
    new ButtonBuilder()
      .setCustomId('pats_stats_menu_back')
      .setLabel('Back to Dashboard')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🏠')
  );

  await interaction.editReply({
    embeds: [embed],
    components: [row1, row2]
  });
}

/**
 * Show player selection for viewing other player's stats
 */
async function showPlayerSelection(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('📊 View Other Player Stats')
    .setDescription('**Select a player to view their stats:**\n\nUse the dropdown menu below to select a player.')
    .setColor(0x5865F2)
    .setTimestamp();

  const { UserSelectMenuBuilder } = await import('discord.js');
  
  const userSelect = new UserSelectMenuBuilder()
    .setCustomId('pats_select_player_stats')
    .setPlaceholder('Select a player')
    .setMinValues(1)
    .setMaxValues(1);
  
  const selectRow = new ActionRowBuilder().addComponents(userSelect);
  
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('pats_player_selection_back')
      .setLabel('Back to Stats Menu')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀️')
  );

  await interaction.editReply({
    embeds: [embed],
    components: [selectRow, buttons]
  });
}

/**
 * Calculate Levenshtein distance for fuzzy matching
 */
function levenshteinDistance(str1, str2) {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  const len1 = s1.length;
  const len2 = s2.length;
  
  const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(0));
  
  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }
  
  return matrix[len2][len1];
}

/**
 * Search for players by username with fuzzy matching
 */
async function searchPlayers(interaction, searchQuery) {
  const { readPATSData } = await import('../utils/patsData.js');
  const data = readPATSData();
  
  // Get active session to check who has made picks
  const { getActiveSession, getUserPicks } = await import('../utils/patsData.js');
  const activeSession = getActiveSession();
  
  // Get all users who have played (have stats) OR have made picks in current session
  const playerIds = Object.keys(data.users).filter(userId => {
    const user = data.users[userId];
    
    // Check if user has any completed games (wins, losses, or pushes)
    const hasGames = (user.totalWins || 0) + (user.totalLosses || 0) + (user.totalPushes || 0) > 0;
    
    // Check if user has picks in current active session
    const hasCurrentPicks = activeSession && getUserPicks(activeSession.id, userId).length > 0;
    
    const included = hasGames || hasCurrentPicks;
    if (included) {
      console.log(`[PLAYER SEARCH] Including user: ${user.username || userId} (games: ${(user.totalWins || 0) + (user.totalLosses || 0) + (user.totalPushes || 0)}, sessions: ${user.sessions}, currentPicks: ${hasCurrentPicks})`);
    }
    
    return included;
  });
  
  console.log(`[PLAYER SEARCH] Total players to search: ${playerIds.length}`);

  if (playerIds.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle('🔍 Player Search')
      .setDescription('No players have participated in PATS yet.')
      .setColor(0x808080)
      .setTimestamp();

    const backButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('pats_search_player')
        .setLabel('Search Again')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔍'),
      new ButtonBuilder()
        .setCustomId('pats_player_selection_back')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('◀️')
    );

    await interaction.editReply({
      embeds: [embed],
      components: [backButton]
    });
    return;
  }

  // Fetch all player info with fuzzy match scoring
  const players = [];
  for (const userId of playerIds) {
    const user = data.users[userId];
    let displayName = user.username || userId;
    
    try {
      const member = await interaction.guild.members.fetch(userId);
      displayName = member.user.displayName || member.user.username;
    } catch (error) {
      // User might have left, use stored name
      console.log(`[PLAYER SEARCH] Could not fetch member ${userId}, using stored name: ${displayName}`);
    }
    
    console.log(`[PLAYER SEARCH] Checking user: ${displayName} (stored: ${user.username}) against query: ${searchQuery}`);
    
    // Calculate match score - check both display name AND stored username
    const lowerQuery = searchQuery.toLowerCase();
    const lowerName = displayName.toLowerCase();
    const lowerStoredName = (user.username || '').toLowerCase();
    
    // Exact match scores highest (check both names)
    if (lowerName === lowerQuery || lowerStoredName === lowerQuery) {
      players.push({ userId, displayName, user, score: 0 });
    }
    // Starts with query scores high (check both names)
    else if (lowerName.startsWith(lowerQuery) || lowerStoredName.startsWith(lowerQuery)) {
      players.push({ userId, displayName, user, score: 1 });
    }
    // Contains query scores medium (check both names)
    else if (lowerName.includes(lowerQuery) || lowerStoredName.includes(lowerQuery)) {
      console.log(`[PLAYER SEARCH] Contains match: ${displayName} (or stored: ${user.username})`);
      players.push({ userId, displayName, user, score: 2 });
    }
    // Use Levenshtein distance for fuzzy matching (check both names, use best match)
    else {
      const distanceDisplay = levenshteinDistance(searchQuery, displayName);
      const distanceStored = levenshteinDistance(searchQuery, user.username || '');
      const distance = Math.min(distanceDisplay, distanceStored);
      
      // More lenient threshold: allow up to 5 edits or 60% of the longer string length
      const maxDistanceDisplay = Math.max(5, Math.floor(Math.max(searchQuery.length, displayName.length) * 0.6));
      const maxDistanceStored = Math.max(5, Math.floor(Math.max(searchQuery.length, (user.username || '').length) * 0.6));
      const maxDistance = Math.max(maxDistanceDisplay, maxDistanceStored);
      
      if (distance <= maxDistance) {
        console.log(`[PLAYER SEARCH] Fuzzy match: ${displayName} (display distance: ${distanceDisplay}, stored distance: ${distanceStored}, threshold: ${maxDistance})`);
        players.push({ userId, displayName, user, score: distance + 3 });
      } else {
        console.log(`[PLAYER SEARCH] Rejected: ${displayName} (display distance: ${distanceDisplay}, stored distance: ${distanceStored}, threshold: ${maxDistance})`);
      }
    }
  }

  console.log(`[PLAYER SEARCH] Found ${players.length} matching players for query: ${searchQuery}`);
  
  // Sort by score (lower is better)
  players.sort((a, b) => a.score - b.score);

  if (players.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle('🔍 Player Search')
      .setDescription(`No players found matching **"${searchQuery}"**\n\nPossible reasons:\n• The player hasn't participated in PATS yet\n• Try a different spelling or username\n• Only players with at least 1 session can be viewed`)
      .setColor(0xFF6B6B)
      .setTimestamp();

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('pats_search_player')
        .setLabel('Search Again')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔍'),
      new ButtonBuilder()
        .setCustomId('pats_player_selection_back')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('◀️')
    );

    await interaction.editReply({
      embeds: [embed],
      components: [buttons]
    });
    return;
  }

  // Show top 5 results
  const topResults = players.slice(0, 5);
  
  const embed = new EmbedBuilder()
    .setTitle('🔍 Player Search Results')
    .setDescription(`**Search:** "${searchQuery}"\n\n${topResults.length === 1 ? 'Found 1 match:' : `Found ${topResults.length} matches:`}`)
    .setColor(0x5865F2)
    .setTimestamp();

  // Add field for each result
  topResults.forEach((player, index) => {
    const totalGames = player.user.totalWins + player.user.totalLosses;
    const winRate = totalGames > 0 
      ? ((player.user.totalWins / totalGames) * 100).toFixed(1)
      : '0.0';
    
    embed.addFields({
      name: `${index + 1}. ${player.displayName}`,
      value: `${player.user.sessions || 0} sessions • ${winRate}% win rate`,
      inline: false
    });
  });

  // Create buttons for top results (up to 5)
  const buttons = [];
  topResults.forEach((player, index) => {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`pats_view_player_${player.userId}`)
        .setLabel(`${index + 1}. ${player.displayName.substring(0, 70)}`)
        .setStyle(ButtonStyle.Primary)
    );
  });

  // Add search again and back buttons
  buttons.push(
    new ButtonBuilder()
      .setCustomId('pats_search_player')
      .setLabel('Search Again')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔍'),
    new ButtonBuilder()
      .setCustomId('pats_player_selection_back')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀️')
  );

  // Split into rows (5 buttons per row max)
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }

  await interaction.editReply({
    embeds: [embed],
    components: rows
  });
}

/**
 * Show user stats page
 */
async function showUserStats(interaction, targetUserId = null) {
  const userId = targetUserId || interaction.user.id;
  const stats = getUserStats(userId);
  const sessionStats = getCurrentSessionStats(userId);
  
  // Get username for display
  let displayName = interaction.user.displayName;
  let isOwnStats = true;
  
  if (targetUserId && targetUserId !== interaction.user.id) {
    isOwnStats = false;
    
    // Try to fetch the user from Discord first
    try {
      const targetUser = await interaction.client.users.fetch(targetUserId);
      displayName = targetUser.displayName || targetUser.username;
    } catch (error) {
      // If user can't be fetched, fall back to stored username
      const { readPATSData } = await import('../utils/patsData.js');
      const data = readPATSData();
      displayName = data.users[targetUserId]?.username || targetUserId;
    }
  }
  
  const embed = new EmbedBuilder()
    .setTitle(`📊 ${isOwnStats ? 'Your' : displayName + '\'s'} PATS Statistics`)
    .setDescription(`**${displayName}'s** overall performance`)
    .setColor(0x5865F2)
    .setTimestamp();

  // Overall stats
  const totalGames = stats.totalWins + stats.totalLosses;
  
  // Calculate average picks per session from actual session history
  const sessionHistory = getUserSessionHistory(userId, 999); // Get all sessions
  let totalPicksMade = 0;
  for (const session of sessionHistory) {
    // Count actual picks made in each session (wins + losses + pushes)
    const pickCount = session.wins + session.losses + session.pushes;
    totalPicksMade += pickCount;
  }
  const avgPicksPerSession = sessionHistory.length > 0 ? (totalPicksMade / sessionHistory.length).toFixed(1) : '0';
  
  embed.addFields({
    name: '🏆 Overall Record',
    value: [
      `**Record:** ${stats.totalWins}-${stats.totalLosses}-${stats.totalPushes}`,
      `**Win Rate:** ${stats.winPercentage.toFixed(1)}%`,
      `**Sessions Played:** ${stats.sessions}`,
      `**Avg Per Session:** ${avgPicksPerSession} picks`
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
      .setLabel('Back')
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

/**
 * Handle player selection from dropdown
 */
export async function handlePlayerSelection(interaction) {
  await interaction.deferUpdate();
  
  // Check if this is a past session selection, game detail selection, or player selection
  if (interaction.customId === 'pats_select_past_session') {
    const sessionId = interaction.values[0];
    await showHistoricalDashboard(interaction, sessionId);
  } else if (interaction.customId === 'pats_select_historical_game_detail') {
    const [sessionId, gameId] = interaction.values[0].split('_');
    await showHistoricalGameDetail(interaction, sessionId, gameId);
  } else {
    const selectedUserId = interaction.values[0];
    await showUserStats(interaction, selectedUserId);
  }
}

/**
 * Handle player search from modal
 */
export async function handlePlayerSearch(interaction, searchQuery) {
  await searchPlayers(interaction, searchQuery);
}

/**
 * Show user stats from player select menu
 */
export async function showUserStatsFromSelect(interaction, userId) {
  await showUserStats(interaction, userId);
}

/**
 * Show help menu
 */
async function showHelpMenu(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('❓ PATS Help & Information')
    .setDescription('**Picks Against The Spread (PATS)** - Learn how to play and understand all the symbols!')
    .setColor(0x5865F2)
    .addFields(
      {
        name: '📖 What is PATS?',
        value: 'PATS is a fun NBA betting game where you pick which teams will "cover the spread" in their games. You compete against other players to see who can make the best predictions!',
        inline: false
      },
      {
        name: '🎮 Quick Start',
        value: '1. View the available games on your dashboard\n2. Click "Make Picks" to choose your teams\n3. Optionally use your Double Down on one pick\n4. Watch the games and see if your picks cover!\n5. Check your stats and leaderboard position',
        inline: false
      }
    )
    .setTimestamp();

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('pats_help_legend')
      .setLabel('Emoji Legend')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔤'),
    new ButtonBuilder()
      .setCustomId('pats_help_tutorial')
      .setLabel('Full Tutorial')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📚'),
    new ButtonBuilder()
      .setCustomId('pats_help_back')
      .setLabel('Back to Dashboard')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🏠')
  );

  await interaction.editReply({
    embeds: [embed],
    components: [buttons]
  });
}

/**
 * Show emoji legend
 */
async function showEmojiLegend(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('🔤 PATS Emoji Legend')
    .setDescription('Here\'s what every emoji means in PATS:')
    .setColor(0x5865F2)
    .addFields(
      {
        name: '📊 Pick Status (Live Games)',
        value: [
          '**📈** = Your pick is winning (covering the spread)',
          '**📉** = Your pick is losing (not covering)',
          '**➖** = Push territory (exactly at the spread line)'
        ].join('\n'),
        inline: false
      },
      {
        name: '✅ Final Results',
        value: [
          '**✅** = Won - Your pick covered the spread!',
          '**❌** = Lost - Your pick didn\'t cover',
          '**🟡** = Push - Final score exactly at spread (no win/loss)'
        ].join('\n'),
        inline: false
      },
      {
        name: '🎯 Pick States',
        value: [
          '**📌** = Pick made, game hasn\'t started yet',
          '**🔒** = Game started, no pick made (automatic loss)',
          '**💰** = Double Down used on this pick (2x points!)'
        ].join('\n'),
        inline: false
      },
      {
        name: '📈 Other Symbols',
        value: [
          '**🟢** = Active session',
          '**🔴** = Closed session',
          '**⚠️** = Warning/Missed picks',
          '**🏆** = Leaderboard winner',
          '**🔥** = Hot streak',
          '**⭐** = Achievement/milestone'
        ].join('\n'),
        inline: false
      }
    )
    .setTimestamp();

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('pats_help_tutorial')
      .setLabel('View Tutorial')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📚'),
    new ButtonBuilder()
      .setCustomId('pats_help_back')
      .setLabel('Back to Dashboard')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🏠')
  );

  await interaction.editReply({
    embeds: [embed],
    components: [buttons]
  });
}

/**
 * Show tutorial
 */
async function showTutorial(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('📚 PATS Tutorial - How to Play')
    .setDescription('**Master the art of picking against the spread!**')
    .setColor(0x5865F2)
    .addFields(
      {
        name: '1️⃣ Understanding Spreads',
        value: 'The **spread** is the predicted margin of victory. If Lakers are -5.5, they must win by **more than 5.5 points** to "cover." If Celtics are +5.5, they can lose by up to 5 points and still cover.',
        inline: false
      },
      {
        name: '2️⃣ Making Your Picks',
        value: '• Click **"Make Picks"** on your dashboard\n• Review each game and its spread\n• Choose which team you think will cover\n• You must pick one team for every game\n• Picks lock when the game starts',
        inline: false
      },
      {
        name: '3️⃣ Double Down Power 💰',
        value: 'Use your **Double Down** on ONE pick per session:\n• If it wins, you get **2 wins** instead of 1\n• If it loses, you get **2 losses**\n• Pushes stay as 1 push\n• Use it wisely on your most confident pick!',
        inline: false
      },
      {
        name: '4️⃣ Scoring System',
        value: '• **Win**: Pick covers the spread ✅\n• **Loss**: Pick doesn\'t cover ❌\n• **Push**: Final score exactly at spread 🟡\n• Missed picks = automatic losses\n• Win percentage = Wins ÷ (Wins + Losses)',
        inline: false
      },
      {
        name: '5️⃣ During Games',
        value: 'Watch your dashboard during live games:\n• **📈** = Currently winning\n• **📉** = Currently losing\n• **➖** = Right at the push line\n\nRefresh to see live updates!',
        inline: false
      },
      {
        name: '6️⃣ After Games',
        value: '• Check your session record on the dashboard\n• View full stats with the **"My Stats"** button\n• See how you rank on the leaderboard\n• Review session history to track progress',
        inline: false
      },
      {
        name: '💡 Pro Tips',
        value: '• Make ALL picks before any games start\n• Research team injuries and recent performance\n• Don\'t just pick favorites - consider the spread\n• Save your Double Down for a lock\n• Check the refresh button during live games',
        inline: false
      }
    )
    .setFooter({ text: 'Good luck with your picks! 🍀' })
    .setTimestamp();

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('pats_help_legend')
      .setLabel('View Emoji Legend')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔤'),
    new ButtonBuilder()
      .setCustomId('pats_help_back')
      .setLabel('Back to Dashboard')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🏠')
  );

  await interaction.editReply({
    embeds: [embed],
    components: [buttons]
  });
}

/**
 * Show past sessions browser
 */
async function showPastSessionsBrowser(interaction) {
  console.log(`[PATS] Fetching session snapshots for user ${interaction.user.id}...`);
  const userSessions = getUserSessionSnapshots(interaction.user.id);
  console.log(`[PATS] Found ${userSessions.length} session snapshots for this user`);
  
  if (userSessions.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle('📜 Your Past Sessions')
      .setDescription('No past sessions found. Complete a PATS session to see it here!')
      .setColor(0x808080);
    
    const backButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('pats_stats_menu_back')
        .setLabel('Back to Stats Menu')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('◀️')
    );
    
    await interaction.editReply({
      embeds: [embed],
      components: [backButton]
    });
    return;
  }
  
  const embed = new EmbedBuilder()
    .setTitle('📜 Your Past Sessions')
    .setDescription(`View your complete dashboard from previous PATS sessions.\n\n**${userSessions.length} session${userSessions.length === 1 ? '' : 's'} available**`)
    .setColor(0x5865F2);
  
  // Show most recent 10 sessions
  const recentSessions = userSessions.slice(0, 10);
  const sessionList = recentSessions.map((session, index) => {
    const dateStr = new Date(session.date).toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
    
    const result = session.userResult || { wins: 0, losses: 0, pushes: 0 };
    const record = `${result.wins}-${result.losses}-${result.pushes}`;
    
    return `**${index + 1}.** ${dateStr} - ${record} (${session.userPicks.length} picks)`;
  }).join('\n');
  
  embed.addFields({
    name: '🗓️ Recent Sessions',
    value: sessionList,
    inline: false
  });
  
  // Create dropdown to select a session
  const sessionOptions = recentSessions.map((session, index) => {
    const dateStr = new Date(session.date).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
    const result = session.userResult || { wins: 0, losses: 0, pushes: 0 };
    const record = `${result.wins}-${result.losses}-${result.pushes}`;
    
    return {
      label: `${dateStr} - ${record}`,
      description: `${session.gameCount} games, ${session.userPicks.length} picks made`,
      value: session.sessionId
    };
  });
  
  const selectMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('pats_select_past_session')
      .setPlaceholder('Select a session to view')
      .addOptions(sessionOptions)
  );
  
  const backButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('pats_stats_menu_back')
      .setLabel('Back to Stats Menu')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀️')
  );
  
  await interaction.editReply({
    embeds: [embed],
    components: [selectMenu, backButton]
  });
}

/**
 * Show historical dashboard for a past session
 */
async function showHistoricalDashboard(interaction, sessionId) {
  const snapshot = loadSessionSnapshot(sessionId);
  
  if (!snapshot) {
    await interaction.editReply({
      content: '❌ Session data not found.',
      embeds: [],
      components: []
    });
    return;
  }
  
  const userId = interaction.user.id;
  const userPicks = snapshot.picks[userId] || [];
  const userResult = snapshot.results?.[userId] || { wins: 0, losses: 0, pushes: 0, missedPicks: 0 };
  
  const dateStr = new Date(snapshot.date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  
  const record = `${userResult.wins}-${userResult.losses}-${userResult.pushes}`;
  
  const embed = new EmbedBuilder()
    .setTitle(`📜 Historical Dashboard - ${dateStr}`)
    .setDescription(`**Final Results:** ${record}`)
    .setColor(userResult.wins > userResult.losses ? 0x00FF00 : userResult.wins < userResult.losses ? 0xFF0000 : 0xFFA500)
    .setTimestamp(new Date(snapshot.closedAt))
    .setFooter({ text: `Session ID: ${sessionId}` })
    .addFields(
      {
        name: '📊 Your Performance',
        value: [
          `**Record:** ${record}`,
          `**Picks Made:** ${userPicks.length}/${snapshot.games.length}`,
          userResult.missedPicks > 0 ? `**Missed Picks:** ${userResult.missedPicks}` : null
        ].filter(Boolean).join('\n'),
        inline: true
      },
      {
        name: '📅 Session Info',
        value: [
          `**Date:** ${snapshot.date}`,
          `**Total Games:** ${snapshot.games.length}`,
          `**Participants:** ${snapshot.participants.length}`
        ].join('\n'),
        inline: true
      }
    );
  
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pats_view_historical_games_${sessionId}`)
      .setLabel('View Games')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎮'),
    new ButtonBuilder()
      .setCustomId(`pats_view_historical_picks_${sessionId}`)
      .setLabel('Your Picks')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎯'),
    new ButtonBuilder()
      .setCustomId('pats_past_sessions_back')
      .setLabel('Back to Sessions')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀️')
  );
  
  await interaction.editReply({
    embeds: [embed],
    components: [buttons]
  });
}

/**
 * Show historical games list
 */
async function showHistoricalGames(interaction, sessionId) {
  const snapshot = loadSessionSnapshot(sessionId);
  
  if (!snapshot) {
    await interaction.editReply({
      content: '❌ Session data not found.',
      embeds: [],
      components: []
    });
    return;
  }
  
  const dateStr = new Date(snapshot.date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  
  const embed = new EmbedBuilder()
    .setTitle(`🎮 Games - ${dateStr}`)
    .setDescription(`All ${snapshot.games.length} games from this session with final scores and spreads.`)
    .setColor(0x5865F2)
    .setTimestamp(new Date(snapshot.closedAt));
  
  // Split games into chunks to avoid Discord's 1024 char limit per field
  const gamesPerField = 5;
  const gameChunks = [];
  
  for (let i = 0; i < snapshot.games.length && i < 15; i += gamesPerField) {
    const chunk = snapshot.games.slice(i, i + gamesPerField);
    const gamesList = chunk.map((game, index) => {
      const result = game.result;
      const homeSpread = game.homeSpread || 0;
      const awaySpread = game.awaySpread || 0;
      
      let statusText = '';
      if (result && result.status === 'Final') {
        const winner = result.homeScore > result.awayScore ? '🏠' : '✈️';
        statusText = ` • ${result.awayScore}-${result.homeScore} ${winner}`;
      }
      
      return `**${i + index + 1}.** ${game.awayTeam} @ ${game.homeTeam} (${awaySpread > 0 ? '+' : ''}${awaySpread}/${homeSpread > 0 ? '+' : ''}${homeSpread})${statusText}`;
    }).join('\n');
    
    gameChunks.push(gamesList);
  }
  
  // Add fields for each chunk
  gameChunks.forEach((chunk, index) => {
    const fieldName = index === 0 ? 'Games' : '\u200b'; // Use zero-width space for continuation fields
    embed.addFields({
      name: fieldName,
      value: chunk,
      inline: false
    });
  });
  
  // Create select menu for game details
  const gameOptions = snapshot.games.slice(0, 25).map((game, index) => {
    const result = game.result;
    const scoreText = result ? `${result.awayScore}-${result.homeScore}` : 'No result';
    
    return {
      label: `${game.awayTeam} @ ${game.homeTeam}`,
      description: scoreText,
      value: `${sessionId}_${game.id}`
    };
  });
  
  const selectMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('pats_select_historical_game_detail')
      .setPlaceholder('Select a game for detailed info')
      .addOptions(gameOptions)
  );
  
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pats_back_to_historical_${sessionId}`)
      .setLabel('Back to Dashboard')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀️')
  );
  
  await interaction.editReply({
    embeds: [embed],
    components: [selectMenu, buttons]
  });
}

/**
 * Show historical user picks
 */
async function showHistoricalPicks(interaction, sessionId) {
  const snapshot = loadSessionSnapshot(sessionId);
  
  if (!snapshot) {
    await interaction.editReply({
      content: '❌ Session data not found.',
      embeds: [],
      components: []
    });
    return;
  }
  
  const userId = interaction.user.id;
  const userPicks = snapshot.picks[userId] || [];
  const userResult = snapshot.results?.[userId] || { wins: 0, losses: 0, pushes: 0, missedPicks: 0 };
  
  const dateStr = new Date(snapshot.date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  
  const record = `${userResult.wins}-${userResult.losses}-${userResult.pushes}`;
  
  const embed = new EmbedBuilder()
    .setTitle(`🎯 Your Picks - ${dateStr}`)
    .setDescription(`**Final Record:** ${record}`)
    .setColor(userResult.wins > userResult.losses ? 0x00FF00 : userResult.wins < userResult.losses ? 0xFF0000 : 0xFFA500)
    .setTimestamp(new Date(snapshot.closedAt));
  
  if (userPicks.length === 0) {
    embed.addFields({
      name: 'No Picks Made',
      value: 'You did not make any picks in this session.',
      inline: false
    });
  } else {
    // Sort picks by game start time
    const sortedPicks = userPicks.map(pick => {
      const game = snapshot.games.find(g => g.id === pick.gameId);
      return { ...pick, game };
    }).sort((a, b) => new Date(a.game.commenceTime) - new Date(b.game.commenceTime));
    
    const picksList = sortedPicks.slice(0, 15).map(pick => {
      const game = pick.game;
      const result = game.result;
      const pickedTeam = pick.pick === 'home' ? game.homeTeam : game.awayTeam;
      const spread = pick.pick === 'home' ? game.homeSpread : game.awaySpread;
      
      let resultEmoji = '⏳';
      if (result && result.status === 'Final') {
        const homeScore = result.homeScore;
        const awayScore = result.awayScore;
        const adjustedHomeScore = homeScore + game.homeSpread;
        const adjustedAwayScore = awayScore + game.awaySpread;
        
        if (pick.pick === 'home') {
          if (adjustedHomeScore === awayScore) resultEmoji = '🟡'; // Push
          else if (adjustedHomeScore > awayScore) resultEmoji = '✅'; // Win
          else resultEmoji = '❌'; // Loss
        } else {
          if (adjustedAwayScore === homeScore) resultEmoji = '🟡'; // Push
          else if (adjustedAwayScore > homeScore) resultEmoji = '✅'; // Win
          else resultEmoji = '❌'; // Loss
        }
      }
      
      const ddText = pick.isDoubleDown ? ' 🔥 DD' : '';
      return `${resultEmoji} **${pickedTeam}** ${spread > 0 ? '+' : ''}${spread}${ddText}`;
    }).join('\n');
    
    embed.addFields({
      name: `Your Picks (${userPicks.length})`,
      value: picksList,
      inline: false
    });
    
    if (userResult.missedPicks > 0) {
      embed.addFields({
        name: '⚠️ Missed Picks',
        value: `You missed ${userResult.missedPicks} pick${userResult.missedPicks === 1 ? '' : 's'} (automatic loss${userResult.missedPicks === 1 ? '' : 'ses'})`,
        inline: false
      });
    }
  }
  
  embed.setFooter({ text: '✅ Win | ❌ Loss | 🟡 Push | 🔥 Double-Down' });
  
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pats_back_to_historical_${sessionId}`)
      .setLabel('Back to Dashboard')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀️')
  );
  
  await interaction.editReply({
    embeds: [embed],
    components: [buttons]
  });
}

/**
 * Show historical game detail with injuries and rosters
 */
async function showHistoricalGameDetail(interaction, sessionId, gameId) {
  const snapshot = loadSessionSnapshot(sessionId);
  
  if (!snapshot) {
    await interaction.editReply({
      content: '❌ Session data not found.',
      embeds: [],
      components: []
    });
    return;
  }
  
  const game = snapshot.games.find(g => g.id === gameId);
  if (!game) {
    await interaction.editReply({
      content: '❌ Game not found.',
      embeds: [],
      components: []
    });
    return;
  }
  
  const { homeSpread, awaySpread } = fixZeroSpreads(game);
  const result = game.result;
  
  const embed = new EmbedBuilder()
    .setTitle(`🏀 ${game.awayTeam} @ ${game.homeTeam}`)
    .setColor(0x5865F2)
    .addFields(
      {
        name: '🎯 Spread',
        value: [
          `**${game.awayTeam}:** ${awaySpread > 0 ? '+' : ''}${awaySpread}`,
          `**${game.homeTeam}:** ${homeSpread > 0 ? '+' : ''}${homeSpread}`
        ].join('\n'),
        inline: true
      }
    );
  
  if (result && result.status === 'Final') {
    embed.addFields({
      name: '📊 Final Score',
      value: [
        `**${game.awayTeam}:** ${result.awayScore}`,
        `**${game.homeTeam}:** ${result.homeScore}`
      ].join('\n'),
      inline: true
    });
    
    // Calculate spread result
    const adjustedHomeScore = result.homeScore + homeSpread;
    const adjustedAwayScore = result.awayScore + awaySpread;
    
    let spreadResult = '';
    if (adjustedHomeScore === adjustedAwayScore) {
      spreadResult = '🟡 **Push** (Tie after spread)';
    } else if (adjustedHomeScore > adjustedAwayScore) {
      spreadResult = `✅ **${game.homeTeam} covered**`;
    } else {
      spreadResult = `✅ **${game.awayTeam} covered**`;
    }
    
    embed.addFields({
      name: '🎯 Spread Result',
      value: spreadResult,
      inline: false
    });
  }
  
  // Load and display injury data if available
  const homeInjuryRef = snapshot.injuryRefs[game.homeTeam];
  const awayInjuryRef = snapshot.injuryRefs[game.awayTeam];
  
  if (homeInjuryRef || awayInjuryRef) {
    let injuryText = '';
    
    if (awayInjuryRef) {
      const injuryData = loadInjuryData(awayInjuryRef);
      if (injuryData && injuryData.data && injuryData.data.length > 0) {
        injuryText += `**${game.awayTeam}:**\n` + injuryData.data.slice(0, 3).map(inj => 
          `• ${inj.playerName} - ${inj.status}`
        ).join('\n');
        if (injuryData.data.length > 3) injuryText += `\n...and ${injuryData.data.length - 3} more`;
        injuryText += '\n\n';
      }
    }
    
    if (homeInjuryRef) {
      const injuryData = loadInjuryData(homeInjuryRef);
      if (injuryData && injuryData.data && injuryData.data.length > 0) {
        injuryText += `**${game.homeTeam}:**\n` + injuryData.data.slice(0, 3).map(inj => 
          `• ${inj.playerName} - ${inj.status}`
        ).join('\n');
        if (injuryData.data.length > 3) injuryText += `\n...and ${injuryData.data.length - 3} more`;
      }
    }
    
    if (injuryText) {
      embed.addFields({
        name: '🏥 Injuries (at session time)',
        value: injuryText,
        inline: false
      });
    }
  }
  
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pats_view_historical_games_${sessionId}`)
      .setLabel('Back to Games')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀️')
  );
  
  await interaction.editReply({
    embeds: [embed],
    components: [buttons]
  });
}

