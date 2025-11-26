import { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
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
      await showPlayerSelection(interaction);
    } else if (interaction.customId === 'pats_stats_menu_back') {
      // Return to dashboard from stats menu
      await interaction.deferUpdate();
      await showDashboard(interaction);
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
          return `${index + 1}. ⚪ **No pick yet** - ${game.awayTeam} @ ${game.homeTeam}`;
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

  const buttons = new ActionRowBuilder().addComponents(
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
      .setCustomId('pats_stats_menu_back')
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
 * Show player selection for viewing other player's stats
 */
async function showPlayerSelection(interaction) {
  const { readPATSData } = await import('../utils/patsData.js');
  const data = readPATSData();
  
  // Get all users who have played
  const playerIds = Object.keys(data.users)
    .filter(userId => userId !== interaction.user.id) // Exclude current user
    .filter(userId => {
      const user = data.users[userId];
      return (user.sessions || 0) > 0; // Only show players with at least 1 session
    });

  if (playerIds.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle('📊 View Other Player Stats')
      .setDescription('No other players have participated in PATS yet.')
      .setColor(0x808080)
      .setTimestamp();

    const backButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('pats_stats_menu_back')
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

  // Fetch Discord usernames from guild
  const players = [];
  for (const userId of playerIds) {
    const user = data.users[userId];
    let displayName = user.username || userId;
    
    // Try to fetch actual Discord username
    try {
      const member = await interaction.guild.members.fetch(userId);
      displayName = member.user.username;
    } catch (error) {
      // User might have left the server, use stored username or ID
      console.log(`[PATS] Could not fetch member ${userId}:`, error.message);
    }
    
    players.push({
      userId,
      username: displayName,
      sessions: user.sessions || 0,
      winRate: user.totalWins && user.totalLosses 
        ? ((user.totalWins / (user.totalWins + user.totalLosses)) * 100).toFixed(1)
        : '0.0'
    });
  }

  // Sort by win rate
  players.sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate));

  const embed = new EmbedBuilder()
    .setTitle('📊 View Other Player Stats')
    .setDescription('**Select a player to view their statistics:**')
    .setColor(0x5865F2)
    .setTimestamp();

  // Create dropdown menu with players (max 25 options)
  const options = players.slice(0, 25).map(player => ({
    label: player.username,
    description: `${player.sessions} sessions • ${player.winRate}% win rate`,
    value: player.userId
  }));

  const selectMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('pats_player_select')
      .setPlaceholder('Choose a player...')
      .addOptions(options)
  );

  const backButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('pats_stats_menu_back')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀️')
  );

  await interaction.editReply({
    embeds: [embed],
    components: [selectMenu, backButton]
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
    const { readPATSData } = await import('../utils/patsData.js');
    const data = readPATSData();
    displayName = data.users[targetUserId]?.username || targetUserId;
  }
  
  const embed = new EmbedBuilder()
    .setTitle(`📊 ${isOwnStats ? 'Your' : displayName + '\'s'} PATS Statistics`)
    .setDescription(`**${displayName}'s** overall performance`)
    .setColor(0x5865F2)
    .setTimestamp();

  // Overall stats
  const totalGames = stats.totalWins + stats.totalLosses;
  
  // Calculate average picks per session correctly
  // totalWins and totalLosses count double downs as 2 points
  // But we want actual number of picks made
  // Actual picks = (wins - extra DD wins) + (losses - extra DD losses) + pushes
  const ddWinPoints = stats.doubleDownWins || 0; // Each DD win adds 1 extra point
  const ddLossPoints = stats.doubleDownLosses || 0; // Each DD loss adds 1 extra point
  const actualPickCount = totalGames + stats.totalPushes - ddWinPoints - ddLossPoints;
  const avgPicksPerSession = stats.sessions > 0 ? (actualPickCount / stats.sessions).toFixed(1) : '0';
  
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

/**
 * Handle player selection from dropdown
 */
export async function handlePlayerSelection(interaction) {
  await interaction.deferUpdate();
  const selectedUserId = interaction.values[0];
  await showUserStats(interaction, selectedUserId);
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
          '**🟰** = Push - Final score exactly at spread (no win/loss)'
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
        value: '• **Win**: Pick covers the spread ✅\n• **Loss**: Pick doesn\'t cover ❌\n• **Push**: Final score exactly at spread 🟰\n• Missed picks = automatic losses\n• Win percentage = Wins ÷ (Wins + Losses)',
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
