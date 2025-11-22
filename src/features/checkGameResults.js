import cron from 'node-cron';
import fetch from 'node-fetch';
import { getActiveSession, updateGameResult, getUserPicks } from '../utils/patsData.js';

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
    
    // Fetch current game data for session date AND next day (timezone handling)
    const sessionDate = new Date(session.date);
    const nextDay = new Date(sessionDate);
    nextDay.setDate(nextDay.getDate() + 1);
    
    const liveGamesToday = await fetchGameData(session.date);
    const liveGamesTomorrow = await fetchGameData(nextDay.toISOString().split('T')[0]);
    const liveGames = [...liveGamesToday, ...liveGamesTomorrow];
    
    console.log(`📥 Fetched ${liveGames.length} games from BallDontLie (${liveGamesToday.length} today + ${liveGamesTomorrow.length} tomorrow)`);
    
    let updatedCount = 0;
    
    for (const sessionGame of session.games) {
      // Skip if already has result
      if (sessionGame.result) {
        continue;
      }
      
      // Find matching live game
      const liveGame = liveGames.find(lg => {
        const homeMatch = lg.home_team.full_name === sessionGame.homeTeam || 
                         lg.home_team.name === sessionGame.homeTeam;
        const awayMatch = lg.visitor_team.full_name === sessionGame.awayTeam || 
                         lg.visitor_team.name === sessionGame.awayTeam;
        return homeMatch && awayMatch;
      });
      
      if (!liveGame) {
        console.log(`❓ No match found for: ${sessionGame.awayTeam} @ ${sessionGame.homeTeam}`);
        // Debug: show what teams we're looking for vs what we have
        if (liveGames.length > 0) {
          const sampleGame = liveGames[0];
          console.log(`   Sample API team format: "${sampleGame.visitor_team.full_name}" (full_name) or "${sampleGame.visitor_team.name}" (name)`);
        }
        continue;
      }
      
      // Debug: log the game status
      console.log(`📊 ${sessionGame.awayTeam} @ ${sessionGame.homeTeam}`);
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
          console.log(`✅ Game Final: ${sessionGame.awayTeam} ${awayScore} @ ${sessionGame.homeTeam} ${homeScore}`);
          
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
        // Game is in progress
        console.log(`🏀 Game in progress: ${sessionGame.awayTeam} @ ${sessionGame.homeTeam} - ${liveGame.status}`);
      }
    }
    
    if (updatedCount > 0) {
      console.log(`📊 Updated ${updatedCount} game result(s)`);
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
 * Checks every 5 minutes during this window
 */
export function scheduleGameResultChecking() {
  // Check every 5 minutes during game hours (8 AM - 11 PM PT)
  // Cron: '*/5 8-23 * * *' means every 5 minutes between 8 AM and 11 PM
  const cronSchedule = '*/5 8-23 * * *';
  
  console.log('📅 Scheduling game result checking...');
  console.log('⏰ Will check every 5 minutes during NBA hours (8 AM - 11 PM PT)');
  
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
