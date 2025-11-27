import fetch from 'node-fetch';

const BALLDONTLIE_API_BASE = 'https://api.balldontlie.io/v1';
const BLAZERS_TEAM_ID = 25; // Portland Trail Blazers team ID in BallDontLie API

/**
 * Get API headers with authentication
 */
function getHeaders() {
  return {
    'Authorization': process.env.BALLDONTLIE_API_KEY
  };
}

/**
 * Get upcoming Trail Blazers games
 */
export async function getUpcomingBlazersGames(daysAhead = 14, includePast = false) {
  try {
    const today = new Date();
    
    // If includePast is true, start from yesterday to catch today's games
    const startDate = new Date(today);
    if (includePast) {
      startDate.setDate(today.getDate() - 1);
    }
    const startDateStr = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
    
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + daysAhead);
    const endDateStr = endDate.toISOString().split('T')[0];
    
    console.log(`🔍 Fetching games from ${startDateStr} to ${endDateStr}...`);
    
    // Fetch games for the Trail Blazers
    const url = `${BALLDONTLIE_API_BASE}/games?team_ids[]=${BLAZERS_TEAM_ID}&start_date=${startDateStr}&end_date=${endDateStr}&per_page=100`;
    
    const response = await fetch(url, {
      headers: getHeaders()
    });
    
    if (!response.ok) {
      console.error(`BallDontLie API error: ${response.status} ${response.statusText}`);
      return [];
    }
    
    const data = await response.json();
    console.log(`✅ Found ${data.data?.length || 0} Trail Blazers games`);
    
    return data.data || [];
  } catch (error) {
    console.error('Error fetching games from BallDontLie API:', error);
    return [];
  }
}

/**
 * Get today's Trail Blazers game
 */
export async function getBlazersGameToday() {
  try {
    // Get today's date in Pacific Time (where Trail Blazers play)
    const todayPT = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
    const todayDate = new Date(todayPT);
    const todayStr = todayDate.toISOString().split('T')[0];
    
    // Also check yesterday to catch games that might span midnight UTC
    const yesterday = new Date(todayDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    console.log(`🔍 [NBA API] Checking for game on ${todayStr} (PT: ${todayPT})...`);
    console.log(`🔍 [NBA API] Also checking ${yesterdayStr} to catch timezone edge cases`);
    
    const url = `${BALLDONTLIE_API_BASE}/games?team_ids[]=${BLAZERS_TEAM_ID}&start_date=${yesterdayStr}&end_date=${todayStr}`;
    console.log(`🔗 [NBA API] Request URL: ${url}`);
    
    const response = await fetch(url, {
      headers: getHeaders()
    });
    
    if (!response.ok) {
      console.error(`❌ [NBA API] BallDontLie API error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error(`❌ [NBA API] Error response: ${errorText}`);
      return null;
    }
    
    const data = await response.json();
    const games = data.data || [];
    
    console.log(`📊 [NBA API] API returned ${games.length} games`);
    
    // Find today's game (filter to games happening today in PT)
    const todayGame = games.find(game => {
      if (!game.status) return false;
      
      const gameDate = new Date(game.status);
      const gameDatePT = gameDate.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
      const todayDatePT = todayDate.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
      
      return gameDatePT === todayDatePT;
    });
    
    if (todayGame) {
      console.log(`✅ [NBA API] Game found:`, {
        id: todayGame.id,
        home: todayGame.home_team?.full_name,
        away: todayGame.visitor_team?.full_name,
        status: todayGame.status,
        date: todayGame.date
      });
      return todayGame;
    }
    
    // If no game found with proper date matching, just return the first game (fallback)
    if (games.length > 0) {
      console.log(`⚠️ [NBA API] No exact match, returning first game as fallback`);
      console.log(`✅ [NBA API] Game found:`, {
        id: games[0].id,
        home: games[0].home_team?.full_name,
        away: games[0].visitor_team?.full_name,
        status: games[0].status,
        date: games[0].date
      });
      return games[0];
    }
    
    console.log(`ℹ️ [NBA API] No games found for ${yesterdayStr} to ${todayStr}`);
    return null;
  } catch (error) {
    console.error('❌ [NBA API] Error fetching today\'s game:', error);
    return null;
  }
}

/**
 * Format game information for display
 */
export function formatGameInfo(game) {
  if (!game) return null;
  
  try {
    const homeTeam = game.home_team;
    const awayTeam = game.visitor_team;
    const isHomeGame = homeTeam.id === BLAZERS_TEAM_ID;
    const opponent = isHomeGame ? awayTeam : homeTeam;
    
    // Parse game time - BallDontLie stores actual game time in the 'status' field as ISO string
    let gameTimeUTC = null;
    if (game.status) {
      gameTimeUTC = new Date(game.status);
    }
    
    const timeString = gameTimeUTC ? gameTimeUTC.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Los_Angeles',
      timeZoneName: 'short'
    }) : 'TBD';
    
    const dateString = gameTimeUTC ? gameTimeUTC.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'America/Los_Angeles'
    }) : 'TBD';
    
    return {
      opponent: opponent.full_name || opponent.name,
      isHomeGame,
      gameTime: timeString,
      gameDate: dateString,
      homeTeam: homeTeam.abbreviation,
      awayTeam: awayTeam.abbreviation,
      gameId: game.id,
      location: isHomeGame ? 'Home' : 'Away',
      fullDate: gameTimeUTC,
      homeTeamFull: homeTeam.full_name,
      awayTeamFull: awayTeam.full_name
    };
  } catch (error) {
    console.error('Error formatting game info:', error);
    return null;
  }
}
