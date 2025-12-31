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
import { createPATSSession, getActiveGlobalSession, getActiveSessionForUser, getUserPicks, getUserStats, getUserMonthlyStats, getCurrentSessionStats, getLiveSessionLeaderboard, getUserSessionHistory, updateGameResult } from '../utils/patsData.js';
import { getTeamAbbreviation, fetchCBSSportsScores, getESPNGamesForDate } from '../utils/oddsApi.js';
import { getUserSessionSnapshots, loadSessionSnapshot, loadInjuryData, loadRosterData } from '../utils/sessionSnapshot.js';
import { getUpcomingScheduledSessions } from '../utils/sessionScheduler.js';
import { getCurrentSeason, getSeasonStandings, isUserInCurrentSeason, getSeasonHistory, getSessionsInSeason } from '../utils/patsSeasons.js';
import { fetchGamesForSession } from '../utils/dataCache.js';

function getPacificDateStr() {
  // YYYY-MM-DD in Pacific time
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

function getPacificDateStrWithOffset(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

function formatDashboardDate(dateStr) {
  // Input is a Pacific date key in YYYY-MM-DD.
  // Avoid `new Date(dateStr)` because it parses as UTC and can display as the prior day in Pacific.
  if (!dateStr || typeof dateStr !== 'string') return 'N/A';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateStr;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
  const monthText = MONTHS[month - 1] || match[2];
  return `${monthText} ${day}, ${year}`;
}

async function getNextNBAGameDayInfo() {
  const now = new Date();

  // Look ahead up to a week for the next day that still has upcoming games.
  for (let i = 0; i <= 7; i++) {
    const dateStr = getPacificDateStrWithOffset(i);
    const games = await getESPNGamesForDate(dateStr);
    if (!games || games.length === 0) continue;

    // If today, pick the earliest *upcoming* game. Otherwise, earliest of the day.
    const sorted = [...games].sort((a, b) => new Date(a.commenceTime) - new Date(b.commenceTime));
    const firstUpcoming = i === 0
      ? sorted.find(g => new Date(g.commenceTime) > now) || null
      : sorted[0];

    if (!firstUpcoming) {
      continue;
    }

    return {
      dateStr,
      gameCount: games.length,
      firstGameTime: new Date(firstUpcoming.commenceTime)
    };
  }

  return null;
}

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
      .setDescription('Refresh spreads from Odds API (Admin only)'))
  .addSubcommand(subcommand =>
    subcommand
      .setName('addplayer')
      .setDescription('Add a player to the PATS system (Admin only)')
      .addUserOption(option =>
        option.setName('player')
          .setDescription('The player to add')
          .setRequired(true))
      .addIntegerOption(option =>
        option.setName('wins')
          .setDescription('Initial wins (default: 0)')
          .setRequired(false)
          .setMinValue(0))
      .addIntegerOption(option =>
        option.setName('losses')
          .setDescription('Initial losses (default: 0)')
          .setRequired(false)
          .setMinValue(0))
      .addIntegerOption(option =>
        option.setName('pushes')
          .setDescription('Initial pushes (default: 0)')
          .setRequired(false)
          .setMinValue(0)))
  .addSubcommand(subcommand =>
    subcommand
      .setName('editplayer')
      .setDescription('Edit a player\'s record in the PATS system (Admin only)')
      .addUserOption(option =>
        option.setName('player')
          .setDescription('The player to edit')
          .setRequired(true))
      .addIntegerOption(option =>
        option.setName('wins')
          .setDescription('Set total wins')
          .setRequired(false)
          .setMinValue(0))
      .addIntegerOption(option =>
        option.setName('losses')
          .setDescription('Set total losses')
          .setRequired(false)
          .setMinValue(0))
      .addIntegerOption(option =>
        option.setName('pushes')
          .setDescription('Set total pushes')
          .setRequired(false)
          .setMinValue(0))
      .addIntegerOption(option =>
        option.setName('sessions')
          .setDescription('Set total sessions played')
          .setRequired(false)
          .setMinValue(0))
      .addIntegerOption(option =>
        option.setName('doubledown_wins')
          .setDescription('Set double down wins')
          .setRequired(false)
          .setMinValue(0))
      .addIntegerOption(option =>
        option.setName('doubledown_losses')
          .setDescription('Set double down losses')
          .setRequired(false)
          .setMinValue(0)))
  .addSubcommand(subcommand =>
    subcommand
      .setName('viewplayer')
      .setDescription('View player records in the PATS system (Admin only)')
      .addUserOption(option =>
        option.setName('player')
          .setDescription('Specific player to view (leave empty to view all)')
          .setRequired(false)))
  .addSubcommand(subcommand =>
    subcommand
      .setName('deleteplayer')
      .setDescription('Remove a player from the PATS system (Admin only)')
      .addUserOption(option =>
        option.setName('player')
          .setDescription('The player to remove')
          .setRequired(true)))
  .addSubcommand(subcommand =>
    subcommand
      .setName('season')
      .setDescription('Manage PATS Seasons (Admin only)'));

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
      case 'addplayer': {
        const patsaddplayerCommand = await import('./patsaddplayer.js');
        return await patsaddplayerCommand.execute(interaction);
      }
      case 'editplayer': {
        const patseditplayerCommand = await import('./patseditplayer.js');
        return await patseditplayerCommand.execute(interaction);
      }
      case 'viewplayer': {
        const patsviewplayerCommand = await import('./patsviewplayer.js');
        return await patsviewplayerCommand.execute(interaction);
      }
      case 'deleteplayer': {
        const patsdeleteplayerCommand = await import('./patsdeleteplayer.js');
        return await patsdeleteplayerCommand.execute(interaction);
      }
      case 'season': {
        const patsseasonCommand = await import('./patsseason.js');
        return await patsseasonCommand.execute(interaction);
      }
    }
  }
  
  // Show dashboard (for 'dashboard' subcommand)
  try {
    await interaction.deferReply({ ephemeral: true });
    
    // Fetch fresh CBS scores before showing dashboard
    const session = getActiveSessionForUser(interaction.user.id);
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
    // Start personal session (prompt)
    if (interaction.customId === 'pats_dashboard_personal_start') {
      await interaction.deferUpdate();

      // Don't create personal sessions if a global session is running
      const globalSession = getActiveGlobalSession();
      if (globalSession) {
        await showDashboard(interaction);
        return;
      }

      // If the user already has a personal session, just show it
      const existingPersonal = getActiveSessionForUser(interaction.user.id);
      if (existingPersonal) {
        await showDashboard(interaction);
        return;
      }

      const now = new Date();

      // Prefer today's games, but if none are pickable, prompt for tomorrow
      let dateStr = getPacificDateStr();
      let dayLabel = 'today';
      let games = await fetchGamesForSession(dateStr);
      let upcomingGames = (games || []).filter(g => new Date(g.commenceTime) >= now);

      if (!games || games.length === 0 || upcomingGames.length === 0) {
        dateStr = getPacificDateStrWithOffset(1);
        dayLabel = 'tomorrow';
        games = await fetchGamesForSession(dateStr);
        upcomingGames = (games || []).filter(g => new Date(g.commenceTime) >= now);
      }

      if (!games || games.length === 0 || upcomingGames.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('⏰ No Games Available')
          .setDescription(
            `There are **no upcoming NBA games** available to start a personal session for **today** or **tomorrow**.\n\n` +
            `Returning you to the dashboard...`
          )
          .setColor(0xED4245);

        await interaction.editReply({
          content: null,
          embeds: [embed],
          components: []
        });

        setTimeout(() => {
          showDashboard(interaction).catch(err => {
            console.error('[PATS] Failed to return to dashboard after no-games message:', err);
          });
        }, 5000);
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('🟢 Start Picking?')
        .setDescription(`Start your own personal picks session for **${dayLabel}**?\n\nThis will be private (no public announcement).`)
        .setColor(0x57F287);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`pats_personal_start_confirm_${dateStr}`)
          .setLabel(`Yes, start ${dayLabel}`)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('pats_personal_start_cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
      return;
    }

    if (interaction.customId === 'pats_personal_start_cancel') {
      await interaction.deferUpdate();
      await showDashboard(interaction);
      return;
    }

    // Start personal session (confirm for a specific date)
    if (interaction.customId.startsWith('pats_personal_start_confirm_')) {
      await interaction.deferUpdate();

      // Don't create personal sessions if a global session is running
      const globalSession = getActiveGlobalSession();
      if (globalSession) {
        await showDashboard(interaction);
        return;
      }

      // If the user already has a personal session, just show it
      const existingPersonal = getActiveSessionForUser(interaction.user.id);
      if (existingPersonal) {
        await showDashboard(interaction);
        return;
      }

      const dateStr = interaction.customId.replace('pats_personal_start_confirm_', '');
      const games = await fetchGamesForSession(dateStr);
      if (!games || games.length === 0) {
        await interaction.editReply({
          content: `❌ No NBA games found for ${dateStr}.`,
          embeds: [],
          components: []
        });
        return;
      }

      const now = new Date();
      const upcomingGames = games.filter(g => new Date(g.commenceTime) >= now);
      if (upcomingGames.length === 0) {
        // If the user tried to start for "today" but there are no pickable games left,
        // fall back to offering "tomorrow" instead.
        const pacificToday = getPacificDateStr();
        if (dateStr === pacificToday) {
          const tomorrowStr = getPacificDateStrWithOffset(1);
          const tomorrowGames = await fetchGamesForSession(tomorrowStr);
          const tomorrowUpcoming = (tomorrowGames || []).filter(g => new Date(g.commenceTime) >= now);

          if (tomorrowUpcoming.length > 0) {
            const embed = new EmbedBuilder()
              .setTitle('🟢 Start Picking?')
              .setDescription(
                `There are **no pickable NBA games left for today**.\n\n` +
                `Start your own personal picks session for **tomorrow**?\n\n` +
                `This will be private (no public announcement).`
              )
              .setColor(0x57F287);

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`pats_personal_start_confirm_${tomorrowStr}`)
                .setLabel('Yes, start tomorrow')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId('pats_personal_start_cancel')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
            );

            await interaction.editReply({ embeds: [embed], components: [row] });
            return;
          }
        }

        await showDashboard(interaction);
        return;
      }

      createPATSSession(dateStr, upcomingGames, [interaction.user.id], {
        isPersonal: true,
        ownerId: interaction.user.id,
        linkToSeason: false
      });

      await showDashboard(interaction);
      return;
    }

    if (interaction.customId === 'pats_dashboard_makepick') {
      await interaction.deferUpdate();
      const makepickCommand = await import('./makepick.js');
      await makepickCommand.handleMakepickFromDashboard(interaction);
    }
    else if (interaction.customId === 'pats_dashboard_view_all_picks') {
      const makepickCommand = await import('./makepick.js');
      await makepickCommand.handleViewMyPicks(interaction);
    }
    else if (interaction.customId === 'pats_dashboard_view_everyone_picks') {
      await interaction.deferUpdate();
      await showEveryonesPicks(interaction);
    }
    else if (interaction.customId === 'pats_dashboard_stats' || interaction.customId === 'pats_no_session_stats_menu') {
      await interaction.deferUpdate();
      await showStatsMenu(interaction);
    }
    else if (interaction.customId === 'pats_no_session_help' || interaction.customId === 'pats_dashboard_help') {
      await interaction.deferUpdate();
      await showHelpMenu(interaction);
    }
    else if (interaction.customId === 'pats_dashboard_settings' || interaction.customId === 'pats_no_session_settings') {
      await interaction.deferUpdate();
      const { showSettingsMenu } = await import('../utils/userPreferences.js');
      await showSettingsMenu(interaction);
    }
    else if (interaction.customId === 'pats_stats_menu_my_stats') {
      await interaction.deferUpdate();
      await showUserStats(interaction);
    }
    else if (interaction.customId === 'pats_stats_menu_other_stats') {
      await interaction.deferUpdate();
      await showPlayerSelection(interaction, false);
    }
    else if (interaction.customId === 'pats_stats_menu_past_sessions') {
      await interaction.deferUpdate();
      await showPastSessionsBrowser(interaction);
    }
    else if (interaction.customId === 'pats_stats_menu_leaderboard') {
      const patsleaderboardCommand = await import('./patsleaderboard.js');
      await interaction.deferUpdate();
      // Default to Monthly first
      return await patsleaderboardCommand.showLeaderboardFromStats(interaction, 'monthly');
    }
    else if (interaction.customId === 'pats_leaderboard_global_stats' || interaction.customId === 'pats_leaderboard_alltime_stats') {
      const patsleaderboardCommand = await import('./patsleaderboard.js');
      await interaction.deferUpdate();
      return await patsleaderboardCommand.showLeaderboardFromStats(interaction, 'alltime');
    }
    else if (interaction.customId === 'pats_leaderboard_blazers_stats' || interaction.customId === 'pats_leaderboard_monthly_stats') {
      const patsleaderboardCommand = await import('./patsleaderboard.js');
      await interaction.deferUpdate();
      return await patsleaderboardCommand.showLeaderboardFromStats(interaction, 'monthly');
    }
    else if (interaction.customId === 'pats_leaderboard_season_stats') {
      const patsleaderboardCommand = await import('./patsleaderboard.js');
      await interaction.deferUpdate();
      // Legacy season page removed; route to All-Time
      return await patsleaderboardCommand.showLeaderboardFromStats(interaction, 'alltime');
    }
    else if (interaction.customId === 'pats_leaderboard_global_cmd' || interaction.customId === 'pats_leaderboard_alltime_cmd') {
      const patsleaderboardCommand = await import('./patsleaderboard.js');
      await interaction.deferUpdate();
      return await patsleaderboardCommand.showLeaderboardStandalone(interaction, 'alltime');
    }
    else if (interaction.customId === 'pats_leaderboard_blazers_cmd' || interaction.customId === 'pats_leaderboard_monthly_cmd') {
      const patsleaderboardCommand = await import('./patsleaderboard.js');
      await interaction.deferUpdate();
      return await patsleaderboardCommand.showLeaderboardStandalone(interaction, 'monthly');
    }
    else if (interaction.customId === 'pats_leaderboard_season_cmd') {
      const patsleaderboardCommand = await import('./patsleaderboard.js');
      await interaction.deferUpdate();
      // Legacy season page removed; route to All-Time
      return await patsleaderboardCommand.showLeaderboardStandalone(interaction, 'alltime');
    }
    else if (interaction.customId === 'pats_leaderboard_back_to_stats') {
      await interaction.deferUpdate();
      return await showStatsMenu(interaction);
    }
    else if (interaction.customId.startsWith('pats_view_player_')) {
      await interaction.deferUpdate();
      const userId = interaction.customId.replace('pats_view_player_', '');
      await showUserStats(interaction, userId);
    }
    else if (interaction.customId === 'pats_player_selection_back') {
      await interaction.deferUpdate();
      await showStatsMenu(interaction);
    }
    else if (interaction.customId === 'pats_stats_menu_back') {
      await interaction.deferUpdate();
      await showDashboard(interaction);
    }
    else if (interaction.customId === 'pats_past_sessions_back') {
      await interaction.deferUpdate();
      await showPastSessionsBrowser(interaction);
    }
    else if (interaction.customId.startsWith('pats_view_historical_games_')) {
      await interaction.deferUpdate();
      const sessionId = interaction.customId.replace('pats_view_historical_games_', '');
      await showHistoricalGames(interaction, sessionId);
    }
    else if (interaction.customId.startsWith('pats_view_historical_picks_')) {
      await interaction.deferUpdate();
      const sessionId = interaction.customId.replace('pats_view_historical_picks_', '');
      await showHistoricalPicks(interaction, sessionId);
    }
    else if (interaction.customId.startsWith('pats_historical_game_detail_')) {
      await interaction.deferUpdate();
      const [sessionId, gameId] = interaction.customId.replace('pats_historical_game_detail_', '').split('_');
      await showHistoricalGameDetail(interaction, sessionId, gameId);
    }
    else if (interaction.customId.startsWith('pats_back_to_historical_')) {
      await interaction.deferUpdate();
      const sessionId = interaction.customId.replace('pats_back_to_historical_', '');
      await showHistoricalDashboard(interaction, sessionId);
    }
    else if (interaction.customId === 'pats_dashboard_refresh') {
      await interaction.deferUpdate();

      const session = getActiveSessionForUser(interaction.user.id);
      if (session) {
        try {
          console.log('🔄 Refreshing dashboard - fetching fresh scores...');
          const espnGames = await fetchCBSSportsScores(session.date);

          let updatedCount = 0;
          for (const sessionGame of session.games) {
            const awayAbbr = getTeamAbbreviation(sessionGame.awayTeam);
            const homeAbbr = getTeamAbbreviation(sessionGame.homeTeam);

            const espnGame = espnGames.find(eg => eg.awayTeam === awayAbbr && eg.homeTeam === homeAbbr);
            if (!espnGame) continue;

            if (espnGame.isLive) {
              const liveResult = {
                homeScore: espnGame.homeScore,
                awayScore: espnGame.awayScore,
                status: espnGame.status,
                isLive: true
              };
              updateGameResult(session.id, sessionGame.id, liveResult);
              updatedCount++;
            } else if (espnGame.isFinal) {
              if (!sessionGame.result || sessionGame.result.status !== 'Final') {
                const result = {
                  homeScore: espnGame.homeScore,
                  awayScore: espnGame.awayScore,
                  winner: espnGame.homeScore > espnGame.awayScore ? 'home' : 'away',
                  status: 'Final'
                };
                updateGameResult(session.id, sessionGame.id, result);
                updatedCount++;
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
    }
    else if (interaction.customId === 'pats_dashboard_help_settings') {
      await interaction.deferUpdate();
      await showHelpSettingsMenu(interaction);
    }
    else if (interaction.customId === 'pats_help_settings_help') {
      await interaction.deferUpdate();
      await showHelpMenu(interaction);
    }
    else if (interaction.customId === 'pats_help_settings_settings') {
      await interaction.deferUpdate();
      const { showSettingsMenu } = await import('../utils/userPreferences.js');
      await showSettingsMenu(interaction);
    }
    else if (interaction.customId === 'pats_help_settings_back') {
      await interaction.deferUpdate();
      await showDashboard(interaction);
    }
    else if (interaction.customId === 'pats_dashboard_season') {
      await interaction.deferUpdate();
      await showSeasonDetailView(interaction);
    }
    else if (interaction.customId === 'pats_season_detail_back') {
      await interaction.deferUpdate();
      await showDashboard(interaction);
    }
    else if (interaction.customId === 'pats_season_detail_standings') {
      await interaction.deferUpdate();
      await showSeasonLeaderboardView(interaction);
    }
    else if (interaction.customId === 'pats_season_leaderboard_back') {
      await interaction.deferUpdate();
      await showSeasonDetailView(interaction);
    }
    else if (interaction.customId === 'pats_season_detail_schedule') {
      await interaction.deferUpdate();
      await showSeasonScheduleView(interaction);
    }
    else if (interaction.customId === 'pats_season_detail_awards') {
      await interaction.deferUpdate();
      await showSeasonAwardsView(interaction);
    }
    else if (interaction.customId === 'pats_season_detail_past') {
      await interaction.deferUpdate();
      await showPastSeasonsBrowser(interaction);
    }
    else if (interaction.customId === 'pats_season_schedule_back' || interaction.customId === 'pats_season_awards_back' || interaction.customId === 'pats_past_seasons_back') {
      await interaction.deferUpdate();
      await showSeasonDetailView(interaction);
    }
    else if (interaction.customId === 'pats_help_legend') {
      await interaction.deferUpdate();
      await showEmojiLegend(interaction);
    }
    else if (interaction.customId === 'pats_help_tutorial') {
      await interaction.deferUpdate();
      await showTutorial(interaction);
    }
    else if (interaction.customId === 'pats_help_back') {
      await interaction.deferUpdate();
      await showHelpSettingsMenu(interaction);
    }
    else if (interaction.customId === 'pats_stats_back') {
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
  const session = getActiveSessionForUser(interaction.user.id);
  
  if (!session) {
    // Get user's current month stats to display
    const monthStats = getUserMonthlyStats(interaction.user.id);
    
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
      try {
        const nextNba = await getNextNBAGameDayInfo();
        if (nextNba) {
          const { dateStr, gameCount, firstGameTime } = nextNba;
          const unixTimestamp = Math.floor(firstGameTime.getTime() / 1000);

          // Relative day label
          const now = new Date();
          const todayStr = getPacificDateStr();
          const tomorrowStr = getPacificDateStrWithOffset(1);
          const relativeDay = dateStr === todayStr
            ? 'Today'
            : (dateStr === tomorrowStr ? 'Tomorrow' : new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Los_Angeles' }));

          description = [
            '📅 **Next NBA Games**',
            `**Day:** ${relativeDay} (${dateStr})`,
            `**Games:** ${gameCount} game${gameCount !== 1 ? 's' : ''}`, 
            `**First Tip-Off:** <t:${unixTimestamp}:t> (<t:${unixTimestamp}:R>)`
          ].join('\n');
        } else {
          description = '📅 No sessions scheduled, and no NBA games found in the next 7 days.';
        }
      } catch (error) {
        console.error('[PATS] Failed to fetch next NBA game day info:', error);
        description = '📅 No sessions currently scheduled.';
      }
    }
    
    const embed = new EmbedBuilder()
      .setTitle('🏀 Picks Against The Spread')
      .setDescription(description)
      .setColor(0x808080)
      .setTimestamp();

    // Show current month stats if user has any
    const hasMonthStats = monthStats.sessions > 0 || (monthStats.totalWins + monthStats.totalLosses + monthStats.totalPushes) > 0;
    
    if (hasMonthStats) {
      const totalGames = monthStats.totalWins + monthStats.totalLosses;
      embed.addFields({
        name: `📊 Current Month (${monthStats.monthKey || 'N/A'})`,
        value: [
          `**Record:** ${monthStats.totalWins}-${monthStats.totalLosses}-${monthStats.totalPushes}`,
          `**Win Rate:** ${monthStats.winPercentage.toFixed(1)}%`,
          `**Sessions Played:** ${monthStats.sessions}`
        ].join('\n'),
        inline: false
      });
      
      // Add season info if user is participating in current season
      const currentSeason = getCurrentSeason();
      if (currentSeason && isUserInCurrentSeason(interaction.user.id)) {
        const standings = getSeasonStandings(currentSeason.id);
        const userStanding = standings.find(s => s.oddsUserId === interaction.user.id);
        
        if (userStanding) {
          const rank = standings.indexOf(userStanding) + 1;
          
          // Calculate days remaining
          const endDate = new Date(currentSeason.endDate);
          const now = new Date();
          const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
          const daysText = daysRemaining > 0 ? `${daysRemaining} days left` : 'Ending soon';
          
          embed.addFields({
            name: `🏆 ${currentSeason.name}`,
            value: [
              `**Your Rank:** #${rank} of ${standings.length}`,
              `**Season Record:** ${userStanding.wins}-${userStanding.losses}-${userStanding.pushes} (${userStanding.winPercentage.toFixed(1)}%)`,
              `**${daysText}**`
            ].join('\n'),
            inline: false
          });
        }
      }
      
      // Add buttons to view detailed stats and help
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('pats_dashboard_personal_start')
          .setLabel('Start')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🟢'),
        new ButtonBuilder()
          .setCustomId('pats_no_session_stats_menu')
          .setLabel('Statistics')
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
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('pats_dashboard_personal_start')
          .setLabel('Start')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🟢')
      );

      await interaction.editReply({
        embeds: [embed],
        components: [buttons]
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
          `**Date:** ${formatDashboardDate(session.date)}`,
          `**Total Games:** ${totalGames}`,
          `**Status:** ${session.status === 'active' ? '🟢 Active' : '🔴 Closed'}`
        ].join('\n'),
        inline: true
      }
    );

  // Add season info if user is participating in current season
  const currentSeason = getCurrentSeason();
  if (currentSeason && isUserInCurrentSeason(interaction.user.id)) {
    const standings = getSeasonStandings(currentSeason.id);
    const userStanding = standings.find(s => s.oddsUserId === interaction.user.id);
    
    if (userStanding) {
      const rank = standings.indexOf(userStanding) + 1;
      const totalPicks = userStanding.wins + userStanding.losses + userStanding.pushes;
      
      // Calculate days remaining
      const endDate = new Date(currentSeason.endDate);
      const now = new Date();
      const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
      const daysText = daysRemaining > 0 ? `${daysRemaining} days left` : 'Ending soon';
      
      embed.addFields({
        name: `🏆 ${currentSeason.name}`,
        value: [
          `**Your Rank:** #${rank} of ${standings.length}`,
          `**Season Record:** ${userStanding.wins}-${userStanding.losses}-${userStanding.pushes} (${userStanding.winPercentage.toFixed(1)}%)`,
          `**${daysText}**`
        ].join('\n'),
        inline: false
      });
    }
  }

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
      .setLabel('Statistics')
      .setStyle(ButtonStyle.Success)
      .setEmoji('📊')
  );

  // Build second row buttons
  const secondRowButtons = [
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
      .setCustomId('pats_dashboard_help_settings')
      .setLabel('Help & Settings')
      .setEmoji('❓')
      .setStyle(ButtonStyle.Secondary)
  ];

  const secondRow = new ActionRowBuilder().addComponents(...secondRowButtons);

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
    .setDescription('**View player statistics and performance**\n\nIncludes **Current Month** and **All-Time**.\n\nChoose whose stats you\'d like to view:')
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
  const { getActiveSessions, getUserPicks } = await import('../utils/patsData.js');
  const activeSessions = getActiveSessions();
  
  // Get all users who have played (have stats) OR have made picks in current session
  const playerIds = Object.keys(data.users).filter(userId => {
    const user = data.users[userId];
    
    // Check if user has any completed games (wins, losses, or pushes)
    const hasGames = (user.totalWins || 0) + (user.totalLosses || 0) + (user.totalPushes || 0) > 0;
    
    // Check if user has picks in any active session
    const hasCurrentPicks = activeSessions.some(s => getUserPicks(s.id, userId).length > 0);
    
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
  const monthStats = getUserMonthlyStats(userId);
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

  // Current month stats
  embed.addFields({
    name: `📅 Current Month (${monthStats.monthKey || 'N/A'})`,
    value: [
      `**Record:** ${monthStats.totalWins}-${monthStats.totalLosses}-${monthStats.totalPushes}`,
      `**Win Rate:** ${monthStats.winPercentage.toFixed(1)}%`,
      `**Sessions Played:** ${monthStats.sessions}`
    ].join('\n'),
    inline: true
  });

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
    name: '🏆 All-Time Record',
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
  const session = getActiveSessionForUser(interaction.user.id);
  
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
  const activeSessions = (data.activeSessions || []).filter(s => s && s.status === 'active');
  const sessionData = activeSessions.find(s => s.id === session.id) || null;

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

  // Collect picks for this specific game across all active sessions that include this game.
  // This makes "Everyone's Picks" truly show any users' picks for the games you're picking for.
  const relevantSessions = activeSessions
    .filter(s => s?.date === session.date && Array.isArray(s.games) && s.games.some(g => g.id === game.id))
    .sort((a, b) => {
      // Prefer global picks if a user appears in multiple sessions
      const aType = a.sessionType === 'global' ? 0 : 1;
      const bType = b.sessionType === 'global' ? 0 : 1;
      return aType - bType;
    });

  const pickByUserId = new Map();
  for (const s of relevantSessions) {
    if (!s.picks) continue;
    for (const [userId, userPicksArray] of Object.entries(s.picks)) {
      if (pickByUserId.has(userId)) continue;
      const pickForGame = (userPicksArray || []).find(p => p.gameId === game.id);
      if (pickForGame) {
        pickByUserId.set(userId, pickForGame);
      }
    }
  }

  const gamePicks = [...pickByUserId.entries()].map(([userId, pick]) => ({ userId, pick }));

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
    // Pre-fetch all members to ensure mentions resolve properly
    const memberCache = new Map();
    for (const { userId } of gamePicks) {
      try {
        const member = await interaction.guild.members.fetch(userId);
        memberCache.set(userId, member);
      } catch {
        // User may have left server
        memberCache.set(userId, null);
      }
    }
    
    // Count picks for each team
    let homePicks = 0;
    let awayPicks = 0;
    const homePickDetails = [];
    const awayPickDetails = [];

    for (const { userId, pick } of gamePicks) {
      const ddTag = pick.isDoubleDown ? ' 💰' : '';
      
      // Use display name directly to avoid Discord client-side mention resolution issues
      const member = memberCache.get(userId);
      const userDisplay = member ? `**${member.displayName}**` : `Unknown User`;
      
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
        homePickDetails.push(`${userDisplay} (${spread})${ddTag}${resultEmoji}`);
      } else {
        awayPicks++;
        const spread = awaySpread > 0 ? `+${awaySpread}` : awaySpread;
        awayPickDetails.push(`${userDisplay} (${spread})${ddTag}${resultEmoji}`);
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
    const totalPlayers = pickByUserId.size;
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
 * Show combined Help & Settings menu
 */
export async function showHelpSettingsMenu(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('❓ Help & Settings')
    .setDescription('Choose what you\'d like to do:')
    .setColor(0x5865F2)
    .addFields(
      {
        name: '❓ Help',
        value: 'Learn how to play PATS, view emoji legend, and access tutorials',
        inline: false
      },
      {
        name: '⚙️ Your Settings',
        value: 'Customize your notification preferences and DM settings',
        inline: false
      }
    );

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('pats_help_settings_help')
      .setLabel('Help')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('❓'),
    new ButtonBuilder()
      .setCustomId('pats_help_settings_settings')
      .setLabel('Your Settings')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('⚙️'),
    new ButtonBuilder()
      .setCustomId('pats_help_settings_back')
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
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔙')
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
 * Show Season detail view for participants
 */
async function showSeasonDetailView(interaction) {
  const currentSeason = getCurrentSeason();
  
  // Safety check
  if (!currentSeason || !isUserInCurrentSeason(interaction.user.id)) {
    await interaction.editReply({
      content: '❌ You are not currently participating in a season.',
      embeds: [],
      components: []
    });
    return;
  }

  // Get user's rank and stats in the season
  const standings = getSeasonStandings(currentSeason.id);
  const userStanding = standings.find(s => s.userId === interaction.user.id);
  
  // Calculate days remaining
  const endDate = new Date(currentSeason.endDate);
  const startDate = new Date(currentSeason.startDate);
  const now = new Date();
  const daysRemaining = Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)));
  const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  const daysPassed = totalDays - daysRemaining;
  const progressPct = ((daysPassed / totalDays) * 100).toFixed(0);
  
  // Format user's record
  const totalGames = userStanding ? userStanding.wins + userStanding.losses + userStanding.pushes : 0;
  const winPct = userStanding && (userStanding.wins + userStanding.losses) > 0 
    ? ((userStanding.wins / (userStanding.wins + userStanding.losses)) * 100).toFixed(1) 
    : '0.0';
  
  // Get current leader
  const leader = standings.length > 0 ? standings[0] : null;
  const isLeader = leader && leader.userId === interaction.user.id;
  
  const embed = new EmbedBuilder()
    .setTitle(`📅 ${currentSeason.name}`)
    .setDescription(
      `**${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' })}**\n` +
      `⏳ ${daysRemaining} days remaining (${progressPct}% complete)`
    )
    .setColor(isLeader ? '#FFD700' : '#5865F2')
    .addFields(
      {
        name: '📊 Your Season Performance',
        value: [
          `**Rank:** ${isLeader ? '🏆 ' : ''}#${userStanding?.rank || 'Unranked'} of ${currentSeason.participants.length}`,
          `**Record:** ${userStanding ? userStanding.wins : 0}-${userStanding ? userStanding.losses : 0}-${userStanding ? userStanding.pushes : 0} (${winPct}%)`,
          `**Sessions:** ${userStanding?.sessionsPlayed || 0} played`
        ].join('\n'),
        inline: false
      }
    );

  // Add current leader info if user is not the leader
  if (leader && !isLeader) {
    const leaderWinPct = ((leader.wins / (leader.wins + leader.losses)) * 100).toFixed(1);
    embed.addFields({
      name: '👑 Current Leader',
      value: `<@${leader.userId}> - ${leader.wins}-${leader.losses}-${leader.pushes} (${leaderWinPct}%)`,
      inline: false
    });
  }

  // Button rows
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('pats_season_detail_standings')
      .setLabel('Full Standings')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🏆'),
    new ButtonBuilder()
      .setCustomId('pats_season_detail_schedule')
      .setLabel('View Schedule')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📅'),
    new ButtonBuilder()
      .setCustomId('pats_season_detail_awards')
      .setLabel('Awards')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🏅')
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('pats_season_detail_past')
      .setLabel('Past Seasons')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📜'),
    new ButtonBuilder()
      .setCustomId('pats_season_detail_back')
      .setLabel('Back to Dashboard')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔙')
  );

  await interaction.editReply({
    embeds: [embed],
    components: [row1, row2]
  });
}

/**
 * Show Season leaderboard view with back navigation
 */
async function showSeasonLeaderboardView(interaction) {
  const leaderboardCommand = await import('./patsleaderboard.js');
  const { embed, components } = await leaderboardCommand.buildLeaderboardEmbed(interaction, 'season', false);
  
  // Add back button to return to Season detail view
  const backButton = new ButtonBuilder()
    .setCustomId('pats_season_leaderboard_back')
    .setLabel('Back to Season')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('🔙');
  
  // Add back button to first row or create new row
  const rows = [...components];
  if (rows.length > 0 && rows[0].components.length < 5) {
    rows[0].components.push(backButton);
  } else {
    rows.push(new ActionRowBuilder().addComponents(backButton));
  }
  
  await interaction.editReply({
    embeds: [embed],
    components: rows
  });
}

/**
 * Show Season Schedule view
 */
async function showSeasonScheduleView(interaction) {
  const currentSeason = getCurrentSeason();
  if (!currentSeason) {
    await interaction.editReply({
      content: '❌ No active season found.',
      embeds: [],
      components: []
    });
    return;
  }

  const sessions = getSessionsInSeason(currentSeason.id);
  const snapshots = getUserSessionSnapshots(interaction.user.id);
  
  // Filter to sessions that have snapshots (completed sessions)
  const completedSessions = sessions.filter(sessionId => 
    snapshots.some(s => s.sessionId === sessionId)
  );

  const embed = new EmbedBuilder()
    .setTitle(`📅 ${currentSeason.name} - Schedule`)
    .setDescription(
      sessions.length === 0
        ? 'No sessions scheduled yet for this season.'
        : `**${completedSessions.length}** of **${sessions.length}** sessions completed`
    )
    .setColor('#5865F2');

  // Show recent completed sessions
  if (completedSessions.length > 0) {
    const recentSessions = completedSessions.slice(-10).reverse(); // Last 10, newest first
    const sessionList = [];
    
    for (const sessionId of recentSessions) {
      const snapshot = snapshots.find(s => s.sessionId === sessionId);
      if (snapshot) {
        const date = new Date(snapshot.timestamp).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          timeZone: 'America/Los_Angeles'
        });
        const userPick = snapshot.picks?.find(p => p.userId === interaction.user.id);
        const record = userPick ? `${userPick.wins}-${userPick.losses}-${userPick.pushes}` : 'Did not play';
        sessionList.push(`• ${date} - ${record}`);
      }
    }
    
    if (sessionList.length > 0) {
      embed.addFields({
        name: '📊 Recent Sessions',
        value: sessionList.join('\n'),
        inline: false
      });
    }
  }

  // Show upcoming scheduled sessions
  const upcomingSessions = getUpcomingScheduledSessions();
  if (upcomingSessions.length > 0) {
    const upcomingList = upcomingSessions.slice(0, 5).map(session => {
      const sessionDate = new Date(session.startTime);
      const dateStr = sessionDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'America/Los_Angeles'
      });
      return `• ${dateStr} - ${session.gameDetails.length} games`;
    });
    
    embed.addFields({
      name: '📆 Upcoming Sessions',
      value: upcomingList.join('\n'),
      inline: false
    });
  }

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('pats_season_schedule_back')
      .setLabel('Back to Season')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔙')
  );

  await interaction.editReply({
    embeds: [embed],
    components: [buttons]
  });
}

/**
 * Show Season Awards view
 */
async function showSeasonAwardsView(interaction) {
  const currentSeason = getCurrentSeason();
  if (!currentSeason) {
    await interaction.editReply({
      content: '❌ No active season found.',
      embeds: [],
      components: []
    });
    return;
  }

  const standings = getSeasonStandings(currentSeason.id);
  
  const embed = new EmbedBuilder()
    .setTitle(`🏅 ${currentSeason.name} - Awards`)
    .setDescription(
      currentSeason.status === 'completed' && currentSeason.awards
        ? '**Final Season Awards**'
        : '**Current Award Standings** (updated live)'
    )
    .setColor('#FFD700');

  // Show final awards if season is completed
  if (currentSeason.status === 'completed' && currentSeason.awards) {
    const awards = currentSeason.awards;
    
    if (awards.champion) {
      embed.addFields({
        name: '🏆 Season Champion',
        value: `<@${awards.champion.userId}> - ${awards.champion.wins}-${awards.champion.losses}-${awards.champion.pushes} (${awards.champion.winPercentage?.toFixed(1)}%)`,
        inline: false
      });
    }
    
    if (awards.sharpshooter) {
      embed.addFields({
        name: '🎯 Sharpshooter (Best Double Down)',
        value: `<@${awards.sharpshooter.userId}> - ${awards.sharpshooter.doubleDownRecord || 'N/A'}`,
        inline: false
      });
    }
    
    if (awards.volumeKing) {
      embed.addFields({
        name: '📈 Volume King (Most Picks)',
        value: `<@${awards.volumeKing.userId}> - ${awards.volumeKing.totalPicks} picks`,
        inline: false
      });
    }
  } else {
    // Show current leaders for each award category
    
    // Champion (best win %)
    const championLeader = standings.find(s => (s.wins + s.losses) >= 30);
    if (championLeader) {
      const winPct = ((championLeader.wins / (championLeader.wins + championLeader.losses)) * 100).toFixed(1);
      embed.addFields({
        name: '🏆 Champion Leader',
        value: `<@${championLeader.userId}> - ${championLeader.wins}-${championLeader.losses}-${championLeader.pushes} (${winPct}%)\n*Minimum 30 picks required*`,
        inline: false
      });
    } else {
      embed.addFields({
        name: '🏆 Champion',
        value: 'No one has reached 30 picks yet',
        inline: false
      });
    }
    
    // Volume King (most picks)
    const volumeLeader = standings.length > 0 ? standings.reduce((max, s) => 
      (s.wins + s.losses + s.pushes) > (max.wins + max.losses + max.pushes) ? s : max
    ) : null;
    
    if (volumeLeader) {
      const totalPicks = volumeLeader.wins + volumeLeader.losses + volumeLeader.pushes;
      embed.addFields({
        name: '📈 Volume King Leader',
        value: `<@${volumeLeader.userId}> - ${totalPicks} picks`,
        inline: false
      });
    }
  }

  embed.setFooter({ 
    text: currentSeason.status === 'completed' 
      ? 'Season completed - Awards finalized' 
      : 'Awards will be finalized when season ends'
  });

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('pats_season_awards_back')
      .setLabel('Back to Season')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔙')
  );

  await interaction.editReply({
    embeds: [embed],
    components: [buttons]
  });
}

/**
 * Show Past Seasons browser
 */
async function showPastSeasonsBrowser(interaction) {
  const history = getSeasonHistory();
  const currentSeason = getCurrentSeason();
  
  const embed = new EmbedBuilder()
    .setTitle('📜 Past Seasons')
    .setColor('#5865F2');

  if (history.length === 0) {
    embed.setDescription('No past seasons available yet.\n\nCompleted seasons will appear here.');
  } else {
    let description = '**Completed Seasons:**\n\n';
    
    for (const season of history.slice(0, 10)) {
      const champion = season.awards?.champion;
      const startDate = new Date(season.startDate).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
        timeZone: 'America/Los_Angeles'
      });
      
      description += `**${season.name}** (${startDate})\n`;
      
      if (champion) {
        const winPct = champion.winPercentage?.toFixed(1) || '0.0';
        description += `└ 🏆 <@${champion.userId}> - ${champion.wins}-${champion.losses}-${champion.pushes} (${winPct}%)\n`;
      } else {
        description += `└ No champion (minimum picks not reached)\n`;
      }
      
      description += `└ ${season.sessionCount || 0} sessions, ${season.participants?.length || 0} participants\n\n`;
    }
    
    embed.setDescription(description);
  }

  if (currentSeason) {
    embed.setFooter({ text: `Current Season: ${currentSeason.name}` });
  }

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('pats_past_seasons_back')
      .setLabel('Back to Season')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔙')
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
    const dateStr = formatDashboardDate(session.date);
    
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
    const dateStr = formatDashboardDate(session.date);
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

  const dateStr = formatDashboardDate(snapshot.date);
  
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
          `**Date:** ${formatDashboardDate(snapshot.date)}`,
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
  
  const dateStr = formatDashboardDate(snapshot.date);
  
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

  const dateStr = formatDashboardDate(snapshot.date);
  
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

