import fetch from 'node-fetch';

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';
const SPORT = 'basketball_nba';

/**
 * Get NBA games with spreads for a specific date
 */
export async function getNBAGamesWithSpreads(date = null) {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      console.error('ODDS_API_KEY not set in environment variables');
      return [];
    }

    // Format date as ISO string if provided, otherwise use today
    const dateStr = date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    
    const url = `${ODDS_API_BASE}/sports/${SPORT}/odds/?apiKey=${apiKey}&regions=us&markets=spreads,h2h&oddsFormat=american&dateFormat=iso`;
    
    console.log(`🔍 Fetching NBA odds for ${dateStr}...`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`Odds API error: ${response.status} ${response.statusText}`);
      return [];
    }
    
    const data = await response.json();
    
    // Filter games for the specified date
    const gamesOnDate = data.filter(game => {
      const gameDate = new Date(game.commence_time).toISOString().split('T')[0];
      return gameDate === dateStr;
    });
    
    console.log(`✅ Found ${gamesOnDate.length} NBA games with odds for ${dateStr}`);
    
    return gamesOnDate;
  } catch (error) {
    console.error('Error fetching NBA odds:', error);
    return [];
  }
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
