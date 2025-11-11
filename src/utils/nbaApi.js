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
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    console.log(`🔍 Checking for game on ${todayStr}...`);
    
    const url = `${BALLDONTLIE_API_BASE}/games?team_ids[]=${BLAZERS_TEAM_ID}&start_date=${todayStr}&end_date=${todayStr}`;
    
    const response = await fetch(url, {
      headers: getHeaders()
    });
    
    if (!response.ok) {
      console.error(`BallDontLie API error: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data = await response.json();
    const games = data.data || [];
    
    return games.length > 0 ? games[0] : null;
  } catch (error) {
    console.error('Error fetching today\'s game:', error);
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
