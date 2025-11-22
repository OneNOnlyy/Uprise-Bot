import fetch from 'node-fetch';

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';
const SPORT = 'basketball_nba';
const BALLDONTLIE_API = 'https://api.balldontlie.io/v1';

/**
 * Get NBA games from BallDontLie API for a specific date
 */
async function getNBAGamesFromBallDontLie(date) {
  try {
    const dateStr = date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    
    const url = `${BALLDONTLIE_API}/games?dates[]=${dateStr}`;
    const headers = process.env.BALLDONTLIE_API_KEY 
      ? { 'Authorization': process.env.BALLDONTLIE_API_KEY }
      : {};
    
    console.log(`🔍 Fetching NBA games from BallDontLie for ${dateStr}...`);
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      console.error(`BallDontLie API error: ${response.status} ${response.statusText}`);
      return [];
    }
    
    const data = await response.json();
    console.log(`✅ Found ${data.data.length} NBA games for ${dateStr}`);
    
    return data.data;
  } catch (error) {
    console.error('Error fetching NBA games:', error);
    return [];
  }
}

/**
 * Get NBA games with spreads for a specific date
 */
export async function getNBAGamesWithSpreads(date = null) {
  try {
    // Get games from BallDontLie
    const games = await getNBAGamesFromBallDontLie(date);
    
    if (games.length === 0) {
      return [];
    }
    
    // Get odds from The Odds API
    const apiKey = process.env.ODDS_API_KEY;
    let oddsData = [];
    
    if (apiKey) {
      const url = `${ODDS_API_BASE}/sports/${SPORT}/odds/?apiKey=${apiKey}&regions=us&markets=spreads&oddsFormat=american&dateFormat=iso`;
      
      try {
        const response = await fetch(url);
        if (response.ok) {
          oddsData = await response.json();
          console.log(`✅ Found odds data for ${oddsData.length} games`);
        }
      } catch (error) {
        console.warn('Could not fetch odds data, continuing without spreads:', error.message);
      }
    } else {
      console.warn('ODDS_API_KEY not set, spreads will not be available');
    }
    
    // Combine games with odds
    return games.map(game => ({
      id: game.id.toString(),
      home_team: game.home_team.full_name,
      away_team: game.visitor_team.full_name,
      commence_time: game.status || game.date, // Use status (actual game time) if available, fallback to date
      bookmakers: findOddsForGame(game, oddsData)
    }));
  } catch (error) {
    console.error('Error fetching NBA games with spreads:', error);
    return [];
  }
}

/**
 * Find odds data for a specific game
 */
function findOddsForGame(game, oddsData) {
  if (!oddsData || oddsData.length === 0) return [];
  
  // Try to match by team names
  const homeTeam = game.home_team.full_name;
  const awayTeam = game.visitor_team.full_name;
  
  const matchingOdds = oddsData.find(odds => 
    (odds.home_team === homeTeam && odds.away_team === awayTeam) ||
    (odds.home_team.includes(game.home_team.name) && odds.away_team.includes(game.visitor_team.name))
  );
  
  return matchingOdds?.bookmakers || [];
}

/**
 * Format game data with spread information
 */
export function formatGameWithSpread(game) {
  try {
    const homeTeam = game.home_team;
    const awayTeam = game.away_team;
    const commenceTime = new Date(game.commence_time);
    
    // Get spread from first bookmaker (usually most reliable)
    const spreadMarket = game.bookmakers?.[0]?.markets?.find(m => m.key === 'spreads');
    const h2hMarket = game.bookmakers?.[0]?.markets?.find(m => m.key === 'h2h');
    
    let homeSpread = 0;
    let awaySpread = 0;
    let favored = null;
    
    if (spreadMarket && spreadMarket.outcomes) {
      const homeOutcome = spreadMarket.outcomes.find(o => o.name === homeTeam);
      const awayOutcome = spreadMarket.outcomes.find(o => o.name === awayTeam);
      
      homeSpread = homeOutcome?.point || 0;
      awaySpread = awayOutcome?.point || 0;
      
      // Determine favored team (negative spread = favored)
      if (homeSpread < 0) {
        favored = 'home';
      } else if (awaySpread < 0) {
        favored = 'away';
      }
    }
    
    return {
      id: game.id,
      homeTeam,
      awayTeam,
      commenceTime: commenceTime.toISOString(),
      timeString: commenceTime.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short'
      }),
      homeSpread,
      awaySpread,
      favored,
      bookmaker: game.bookmakers?.[0]?.title || 'N/A',
      spreadDisplay: {
        home: homeSpread > 0 ? `+${homeSpread}` : homeSpread.toString(),
        away: awaySpread > 0 ? `+${awaySpread}` : awaySpread.toString()
      }
    };
  } catch (error) {
    console.error('Error formatting game with spread:', error);
    return null;
  }
}

/**
 * Get all formatted games for a date
 */
export async function getFormattedGamesForDate(date = null) {
  const games = await getNBAGamesWithSpreads(date);
  return games.map(formatGameWithSpread).filter(g => g !== null);
}
