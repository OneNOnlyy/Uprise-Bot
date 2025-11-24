import cron from 'node-cron';
import fetch from 'node-fetch';
import { getActiveSession, updateGameResult, getUserPicks, updateLeaderboardCache, closePATSSession } from '../utils/patsData.js';
import { fetchCBSSportsScores, getTeamAbbreviation } from '../utils/oddsApi.js';

const BALLDONTLIE_API = 'https://api.balldontlie.io/v1';

/**
 * Fetch current game data from BallDontLie
 */
async function fetchGameData(date) {
  try {
    const dateStr = date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const url = `${BALLDONTLIE_API}/games?dates[]=${dateStr}`;
    
    const headers = process.env.BALLDONTLIE_API_KEY 
      ? { 'Authorization': process.env.BALLDONTLIE_API_KEY }
      : {};
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      console.error(`❌ BallDontLie API error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('❌ Error fetching game data:', error);
    return [];
  }
}

/**
 * Check if a game has ended and update results
 */
async function checkAndUpdateGameResults() {
  try {
    const session = getActiveSession();
    if (!session) {
      console.log('⏸️ No active PATS session to check');
      return;
    }

    console.log('🔍 Checking game results...');
    
    // Try CBS Sports first (more reliable for live scores)
    console.log('📡 Fetching from CBS Sports...');
    const cbsGames = await fetchCBSSportsScores(session.date);
    
    // Also fetch from BallDontLie as backup
    const sessionDate = new Date(session.date);
    const nextDay = new Date(sessionDate);
    nextDay.setDate(nextDay.getDate() + 1);
    
    const liveGamesToday = await fetchGameData(session.date);
    const liveGamesTomorrow = await fetchGameData(nextDay.toISOString().split('T')[0]);
    const ballDontLieGames = [...liveGamesToday, ...liveGamesTomorrow];
    
    console.log(`📥 Fetched ${cbsGames.length} games from CBS Sports`);
    console.log(`📥 Fetched ${ballDontLieGames.length} games from BallDontLie (${liveGamesToday.length} today + ${liveGamesTomorrow.length} tomorrow)`);
    
    let updatedCount = 0;
    
    for (const sessionGame of session.games) {
      // Always update live games, only skip if already marked as Final
      const skipUpdate = sessionGame.result && sessionGame.result.status === 'Final';
      
      // Try to match with CBS Sports data first (using abbreviations)
      const awayAbbr = getTeamAbbreviation(sessionGame.awayTeam);
      const homeAbbr = getTeamAbbreviation(sessionGame.homeTeam);
      
      const cbsGame = cbsGames.find(cg => 
        cg.awayTeam === awayAbbr && cg.homeTeam === homeAbbr
      );
      
      if (cbsGame && cbsGame.awayScore !== null && cbsGame.homeScore !== null) {
        console.log(`📊 [CBS] ${sessionGame.awayTeam} @ ${sessionGame.homeTeam}`);
        console.log(`   Status: "${cbsGame.status}", Away: ${cbsGame.awayScore}, Home: ${cbsGame.homeScore}`);
        
        if (cbsGame.isFinal && !skipUpdate) {
          console.log(`✅ [CBS] Game Final: ${sessionGame.awayTeam} ${cbsGame.awayScore} @ ${sessionGame.homeTeam} ${cbsGame.homeScore}`);
          
          const result = {
            homeScore: cbsGame.homeScore,
            awayScore: cbsGame.awayScore,
            winner: cbsGame.homeScore > cbsGame.awayScore ? 'home' : 'away',
            status: 'Final'
          };
          
          updateGameResult(session.id, sessionGame.id, result);
          updatedCount++;
        } else if (cbsGame.isLive && !skipUpdate) {
          console.log(`🏀 [CBS] Game in progress: ${sessionGame.awayTeam} ${cbsGame.awayScore} @ ${sessionGame.homeTeam} ${cbsGame.homeScore} - ${cbsGame.status}`);
          
          const liveResult = {
            homeScore: cbsGame.homeScore,
            awayScore: cbsGame.awayScore,
            status: cbsGame.status,
            isLive: true
          };
          
          updateGameResult(session.id, sessionGame.id, liveResult);
          updatedCount++; // Count live updates too
        } else if (skipUpdate) {
          console.log(`⏭️ [CBS] Skipping ${sessionGame.awayTeam} @ ${sessionGame.homeTeam} - already marked Final`);
        }
        
        continue; // Skip BallDontLie check if CBS had data
      }
      
      // Fallback to BallDontLie if CBS doesn't have the game
      const liveGame = ballDontLieGames.find(lg => {
        const homeMatch = lg.home_team.full_name === sessionGame.homeTeam || 
                         lg.home_team.name === sessionGame.homeTeam;
        const awayMatch = lg.visitor_team.full_name === sessionGame.awayTeam || 
                         lg.visitor_team.name === sessionGame.awayTeam;
        return homeMatch && awayMatch;
      });
      
      if (!liveGame) {
        console.log(`❓ No match found in CBS or BallDontLie for: ${sessionGame.awayTeam} @ ${sessionGame.homeTeam}`);
        continue;
      }
      
      // Debug: log the game status
      console.log(`📊 [BallDontLie] ${sessionGame.awayTeam} @ ${sessionGame.homeTeam}`);
      console.log(`   Status: "${liveGame.status}", Home: ${liveGame.home_team_score}, Away: ${liveGame.visitor_team_score}`);
      
      // Check if game is final (BallDontLie may use different status strings)
      const isFinal = liveGame.status === 'Final' || 
                      liveGame.status === 'final' || 
                      liveGame.status === 'completed' ||
                      liveGame.status === 'Completed';
      
      if (isFinal) {
        const homeScore = liveGame.home_team_score;
        const awayScore = liveGame.visitor_team_score;
        
        if (homeScore !== null && awayScore !== null) {
          console.log(`✅ [BallDontLie] Game Final: ${sessionGame.awayTeam} ${awayScore} @ ${sessionGame.homeTeam} ${homeScore}`);
          
          // Update result in session
          const result = {
            homeScore,
            awayScore,
            winner: homeScore > awayScore ? 'home' : 'away',
            status: 'Final'
          };
          
          updateGameResult(session.id, sessionGame.id, result);
          updatedCount++;
        }
      } else if (liveGame.status && liveGame.status !== 'Scheduled') {
        // Game is in progress - store live scores
        const homeScore = liveGame.home_team_score;
        const awayScore = liveGame.visitor_team_score;
        
        if (homeScore !== null && awayScore !== null) {
          console.log(`🏀 [BallDontLie] Game in progress: ${sessionGame.awayTeam} ${awayScore} @ ${sessionGame.homeTeam} ${homeScore} - ${liveGame.status}`);
          
          // Update live score in session (don't overwrite final results)
          if (!sessionGame.result || sessionGame.result.status !== 'Final') {
            const liveResult = {
              homeScore,
              awayScore,
              status: liveGame.status,
              isLive: true
            };
            
            updateGameResult(session.id, sessionGame.id, liveResult);
            updatedCount++; // Count BallDontLie live updates too
          }
        } else {
          console.log(`🏀 [BallDontLie] Game in progress: ${sessionGame.awayTeam} @ ${sessionGame.homeTeam} - ${liveGame.status} (scores not available yet)`);
        }
      }
    }
    
    if (updatedCount > 0) {
      console.log(`📊 Updated ${updatedCount} game result(s)`);
      // Update the leaderboard cache when results change
      updateLeaderboardCache();
      console.log(`🔄 Leaderboard cache updated`);
      
      // Re-fetch session to get updated game results
      const updatedSession = getActiveSession();
      
      if (updatedSession) {
        // Check if all games are now complete
        const allGamesComplete = updatedSession.games.every(game => game.result && game.result.status === 'Final');
        
        if (allGamesComplete) {
          console.log('🎉 All games complete! Automatically closing PATS session...');
          
          // Prepare game results for session closure
          const gameResults = updatedSession.games.map(game => ({
            gameId: game.id,
            homeScore: game.result.homeScore,
            awayScore: game.result.awayScore,
            winner: game.result.winner,
            status: game.result.status
          }));
          
          // Close the session
          const closed = closePATSSession(updatedSession.id, gameResults);
          
          if (closed) {
            console.log('✅ PATS session automatically closed successfully!');
            console.log(`📋 Final results: ${updatedSession.games.length} games completed`);
          } else {
            console.error('❌ Failed to close PATS session');
          }
        } else {
          const gamesWithResults = updatedSession.games.filter(g => g.result).length;
          console.log(`⏳ Session still active: ${gamesWithResults}/${updatedSession.games.length} games complete`);
        }
      }
    } else {
      console.log('⏳ No completed games yet');
    }
    
  } catch (error) {
    console.error('❌ Error checking game results:', error);
  }
}

/**
 * Schedule game result checking
 * Only runs during NBA game hours (8 AM - 11 PM Pacific Time)
 * Checks every 1 minute during this window for live score updates
 */
export function scheduleGameResultChecking() {
  // Check every 1 minute during game hours (8 AM - 11 PM PT)
  // Cron: '*/1 8-23 * * *' means every 1 minute between 8 AM and 11 PM
  const cronSchedule = '*/1 8-23 * * *';
  
  console.log('📅 Scheduling game result checking...');
  console.log('⏰ Will check every 1 minute during NBA hours (8 AM - 11 PM PT)');
  
  cron.schedule(cronSchedule, () => {
    const now = new Date();
    const hour = now.getHours();
    
    // Extra validation - only during reasonable game hours
    if (hour >= 8 && hour <= 23) {
      checkAndUpdateGameResults();
    }
  }, {
    timezone: "America/Los_Angeles"
  });
  
  // Also run a check immediately on startup if there's an active session
  setTimeout(() => {
    const session = getActiveSession();
    if (session) {
      console.log('🚀 Running initial game result check...');
      checkAndUpdateGameResults();
    }
  }, 5000); // Wait 5 seconds after startup
}

/**
 * Manual check for game results (can be called by admin command)
 */
export async function manualCheckGameResults() {
  console.log('🔄 Manual game result check initiated...');
  await checkAndUpdateGameResults();
}
