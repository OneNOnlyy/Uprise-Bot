import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';
const SPORT = 'basketball_nba';
const BALLDONTLIE_API = 'https://api.balldontlie.io/v1';

// Team name mappings for scraping
const TEAM_ABBREVIATIONS = {
  'Atlanta Hawks': 'ATL',
  'Boston Celtics': 'BOS',
  'Brooklyn Nets': 'BKN',
  'Charlotte Hornets': 'CHA',
  'Chicago Bulls': 'CHI',
  'Cleveland Cavaliers': 'CLE',
  'Dallas Mavericks': 'DAL',
  'Denver Nuggets': 'DEN',
  'Detroit Pistons': 'DET',
  'Golden State Warriors': 'GSW',
  'Houston Rockets': 'HOU',
  'Indiana Pacers': 'IND',
  'LA Clippers': 'LAC',
  'Los Angeles Clippers': 'LAC',
  'Los Angeles Lakers': 'LAL',
  'LA Lakers': 'LAL',
  'Memphis Grizzlies': 'MEM',
  'Miami Heat': 'MIA',
  'Milwaukee Bucks': 'MIL',
  'Minnesota Timberwolves': 'MIN',
  'New Orleans Pelicans': 'NOP',
  'New York Knicks': 'NYK',
  'Oklahoma City Thunder': 'OKC',
  'Orlando Magic': 'ORL',
  'Philadelphia 76ers': 'PHI',
  'Phoenix Suns': 'PHX',
  'Portland Trail Blazers': 'POR',
  'Sacramento Kings': 'SAC',
  'San Antonio Spurs': 'SAS',
  'Toronto Raptors': 'TOR',
  'Utah Jazz': 'UTA',
  'Washington Wizards': 'WAS'
};

/**
 * Scrape NBA games and spreads from ESPN (when APIs fail)
 */
async function scrapeESPNGamesAndSpreads() {
  try {
    console.log('🕷️ Scraping NBA schedule and spreads from ESPN...');
    const url = 'https://www.espn.com/nba/scoreboard';
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      console.error('ESPN scoreboard scrape failed:', response.status);
      return [];
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    const games = [];
    
    // ESPN's scoreboard has games in ScoreCell components
    $('.ScoreCell').each((i, gameElement) => {
      try {
        const awayTeam = $(gameElement).find('.ScoreCell__TeamName--shortDisplayName').first().text().trim();
        const homeTeam = $(gameElement).find('.ScoreCell__TeamName--shortDisplayName').last().text().trim();
        const gameLink = $(gameElement).find('a').first().attr('href');
        const gameId = gameLink ? gameLink.match(/gameId\/(\d+)/)?.[1] : `espn_${i}`;
        
        if (awayTeam && homeTeam) {
          games.push({
            id: gameId || `game_${i}`,
            awayTeam,
            homeTeam,
            awaySpread: null,
            homeSpread: null
          });
        }
      } catch (e) {
        console.warn('Error parsing ESPN game:', e.message);
      }
    });
    
    console.log(`✅ Found ${games.length} games from ESPN scoreboard`);
    
    // Try multiple sources for spreads
    let spreadsFound = false;
    
    // Try ActionNetwork first (most reliable)
    let spreadGames = await scrapeActionNetworkOdds();
    if (spreadGames.length === 0) {
      // Fallback to Covers
      spreadGames = await scrapeCoversOdds();
    }
    
    // Match spreads to games
    for (const game of games) {
      const match = spreadGames.find(cg => 
        (cg.awayTeam.includes(game.awayTeam) || game.awayTeam.includes(cg.awayTeam.split(' ').pop())) &&
        (cg.homeTeam.includes(game.homeTeam) || game.homeTeam.includes(cg.homeTeam.split(' ').pop()))
      );
      
      if (match) {
        game.awaySpread = match.awaySpread;
        game.homeSpread = match.homeSpread;
        spreadsFound = true;
        console.log(`  Matched spreads for ${game.awayTeam} @ ${game.homeTeam}: ${game.awaySpread}/${game.homeSpread}`);
      }
    }
    
    if (!spreadsFound) {
      console.warn('⚠️ Could not find spreads from any source');
    }
    
    return games;
  } catch (error) {
    console.error('Error scraping ESPN games and spreads:', error.message);
    return [];
  }
}

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
 * Scrape NBA spreads from ESPN
 */
async function scrapeESPNSpreads() {
  try {
    console.log('🕷️ Scraping NBA spreads from ESPN...');
    const url = 'https://www.espn.com/nba/lines';
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      console.error('ESPN scrape failed:', response.status);
      return {};
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    const spreads = {};
    
    // ESPN shows spreads in a table format
    $('.Table__TR').each((i, row) => {
      try {
        const teamName = $(row).find('.Table__Team a').text().trim();
        const spreadText = $(row).find('.spread').text().trim();
        
        if (teamName && spreadText) {
          // Parse spread (e.g., "-5.5" or "+3.0")
          const spread = parseFloat(spreadText);
          if (!isNaN(spread)) {
            spreads[teamName] = spread;
            console.log(`  Found: ${teamName} ${spread}`);
          }
        }
      } catch (e) {
        // Skip malformed rows
      }
    });
    
    console.log(`✅ Scraped ${Object.keys(spreads).length} team spreads from ESPN`);
    return spreads;
  } catch (error) {
    console.error('Error scraping ESPN spreads:', error.message);
    return {};
  }
}

/**
 * Scrape NBA spreads from ActionNetwork (more reliable)
 */
async function scrapeActionNetworkOdds() {
  try {
    console.log('🕷️ Scraping NBA spreads from ActionNetwork...');
    const url = 'https://www.actionnetwork.com/nba/odds';
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      console.error('ActionNetwork scrape failed:', response.status);
      return [];
    }
    
    const html = await response.text();
    
    // ActionNetwork often has JSON data embedded in the page
    const jsonMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        const games = [];
        
        // Navigate through the data structure to find games
        // This structure may vary, so we'll log it to see what we get
        console.log('Found embedded JSON data');
        
        // Try to extract games from props
        const pageProps = data?.props?.pageProps;
        if (pageProps && pageProps.games) {
          for (const game of pageProps.games) {
            if (game.away_team && game.home_team && game.spread) {
              games.push({
                awayTeam: game.away_team,
                homeTeam: game.home_team,
                awaySpread: game.spread.away,
                homeSpread: game.spread.home
              });
            }
          }
        }
        
        if (games.length > 0) {
          console.log(`✅ Scraped ${games.length} games from ActionNetwork`);
          return games;
        }
      } catch (e) {
        console.warn('Could not parse ActionNetwork JSON:', e.message);
      }
    }
    
    // Fallback to HTML parsing
    const $ = cheerio.load(html);
    const games = [];
    
    $('[data-testid="game-card"]').each((i, card) => {
      try {
        const awayTeam = $(card).find('[data-testid="away-team-name"]').text().trim();
        const homeTeam = $(card).find('[data-testid="home-team-name"]').text().trim();
        const awaySpread = $(card).find('[data-testid="away-spread"]').text().trim();
        const homeSpread = $(card).find('[data-testid="home-spread"]').text().trim();
        
        if (awayTeam && homeTeam && awaySpread && homeSpread) {
          const awaySpreadNum = parseFloat(awaySpread.replace(/[^-\d.]/g, ''));
          const homeSpreadNum = parseFloat(homeSpread.replace(/[^-\d.]/g, ''));
          
          if (!isNaN(awaySpreadNum) && !isNaN(homeSpreadNum)) {
            games.push({
              awayTeam,
              homeTeam,
              awaySpread: awaySpreadNum,
              homeSpread: homeSpreadNum
            });
          }
        }
      } catch (e) {
        // Skip malformed cards
      }
    });
    
    console.log(`✅ Scraped ${games.length} games from ActionNetwork (HTML)`);
    return games;
  } catch (error) {
    console.error('Error scraping ActionNetwork:', error.message);
    return [];
  }
}

/**
 * Scrape NBA spreads from Covers.com
 */
async function scrapeCoversOdds() {
  try {
    console.log('🕷️ Scraping NBA spreads from Covers.com...');
    const url = 'https://www.covers.com/sport/basketball/nba/odds';
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      console.error('Covers scrape failed:', response.status);
      return {};
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    const games = [];
    
    // Covers uses a specific table structure for odds
    $('.cmg_matchup_game_box').each((i, gameBox) => {
      try {
        const awayTeam = $(gameBox).find('.cmg_matchup_list_team_name').first().text().trim();
        const homeTeam = $(gameBox).find('.cmg_matchup_list_team_name').last().text().trim();
        const awaySpread = $(gameBox).find('.covers-CoversOddsTable-handicap').first().text().trim();
        const homeSpread = $(gameBox).find('.covers-CoversOddsTable-handicap').last().text().trim();
        
        if (awayTeam && homeTeam && awaySpread && homeSpread) {
          const awaySpreadNum = parseFloat(awaySpread.replace(/[^-\d.]/g, ''));
          const homeSpreadNum = parseFloat(homeSpread.replace(/[^-\d.]/g, ''));
          
          if (!isNaN(awaySpreadNum) && !isNaN(homeSpreadNum)) {
            games.push({
              awayTeam,
              homeTeam,
              awaySpread: awaySpreadNum,
              homeSpread: homeSpreadNum
            });
            console.log(`  Found: ${awayTeam} @ ${homeTeam} - Spreads: ${awaySpreadNum}/${homeSpreadNum}`);
          }
        }
      } catch (e) {
        // Skip malformed games
      }
    });
    
    console.log(`✅ Scraped ${games.length} games from Covers`);
    return games;
  } catch (error) {
    console.error('Error scraping Covers odds:', error.message);
    return [];
  }
}

/**
 * Match scraped spreads to games
 */
function matchScrapedSpreadsToGames(games, scrapedGames) {
  const results = [];
  
  for (const game of games) {
    const homeTeam = game.home_team.full_name;
    const awayTeam = game.visitor_team.full_name;
    
    // Try to find matching game in scraped data
    const match = scrapedGames.find(sg => {
      const homeMatch = sg.homeTeam.includes(game.home_team.name) || 
                        game.home_team.name.includes(sg.homeTeam.split(' ').pop());
      const awayMatch = sg.awayTeam.includes(game.visitor_team.name) ||
                        game.visitor_team.name.includes(sg.awayTeam.split(' ').pop());
      return homeMatch && awayMatch;
    });
    
    if (match) {
      results.push({
        id: game.id.toString(),
        home_team: homeTeam,
        away_team: awayTeam,
        commence_time: game.status || game.date,
        bookmakers: [{
          title: 'Scraped',
          markets: [{
            key: 'spreads',
            outcomes: [
              { name: homeTeam, point: match.homeSpread },
              { name: awayTeam, point: match.awaySpread }
            ]
          }]
        }]
      });
    } else {
      // No spread found, add game with null spreads
      results.push({
        id: game.id.toString(),
        home_team: homeTeam,
        away_team: awayTeam,
        commence_time: game.status || game.date,
        bookmakers: []
      });
    }
  }
  
  return results;
}

/**
 * Get NBA games with spreads for a specific date
 */
export async function getNBAGamesWithSpreads(date = null) {
  try {
    // Try getting games from BallDontLie first
    let games = await getNBAGamesFromBallDontLie(date);
    
    // If BallDontLie fails, scrape from ESPN
    if (games.length === 0) {
      console.log('📡 BallDontLie failed, scraping games from ESPN...');
      const scrapedGames = await scrapeESPNGamesAndSpreads();
      
      if (scrapedGames.length > 0) {
        // Convert scraped format to BallDontLie-like format
        return scrapedGames.map(g => ({
          id: g.id,
          home_team: g.homeTeam,
          away_team: g.awayTeam,
          commence_time: new Date().toISOString(),
          bookmakers: g.homeSpread !== null && g.awaySpread !== null ? [{
            title: 'Scraped',
            markets: [{
              key: 'spreads',
              outcomes: [
                { name: g.homeTeam, point: g.homeSpread },
                { name: g.awayTeam, point: g.awaySpread }
              ]
            }]
          }] : []
        }));
      }
      
      console.warn('⚠️ All game sources failed');
      return [];
    }
    
    // Try The Odds API for spreads
    const apiKey = process.env.ODDS_API_KEY;
    let oddsData = [];
    let usedScraping = false;
    
    if (apiKey) {
      const url = `${ODDS_API_BASE}/sports/${SPORT}/odds/?apiKey=${apiKey}&regions=us&markets=spreads&oddsFormat=american&dateFormat=iso`;
      
      try {
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          // Check if response is valid array
          if (Array.isArray(data)) {
            oddsData = data;
            console.log(`✅ Found odds data from API for ${oddsData.length} games`);
          } else if (data.message) {
            console.warn('❌ Odds API error:', data.message);
            oddsData = [];
          }
        } else {
          console.warn('❌ Odds API returned error:', response.status);
        }
      } catch (error) {
        console.warn('❌ Could not fetch from Odds API:', error.message);
      }
    } else {
      console.warn('⚠️ ODDS_API_KEY not set');
    }
    
    // If API failed or returned no data, try web scraping
    if (oddsData.length === 0) {
      console.log('📡 Falling back to web scraping for spreads...');
      
      // Try ActionNetwork first (most reliable for spreads)
      let scrapedGames = await scrapeActionNetworkOdds();
      
      // Fallback to Covers if ActionNetwork fails
      if (scrapedGames.length === 0) {
        console.log('📡 ActionNetwork failed, trying Covers...');
        scrapedGames = await scrapeCoversOdds();
      }
      
      if (scrapedGames.length > 0) {
        usedScraping = true;
        console.log(`✅ Using scraped spreads for ${scrapedGames.length} games`);
        return matchScrapedSpreadsToGames(games, scrapedGames);
      } else {
        console.warn('⚠️ All web scraping sources failed, continuing without spreads');
      }
    }
    
    // Combine games with odds (from API)
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
      
      // Fix: If one spread is 0 but the other isn't, they should be inverse
      if (homeSpread !== 0 && awaySpread === 0) {
        awaySpread = -homeSpread;
      } else if (awaySpread !== 0 && homeSpread === 0) {
        homeSpread = -awaySpread;
      }
      
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
        home: homeSpread >= 0 ? `+${homeSpread}` : homeSpread.toString(),
        away: awaySpread >= 0 ? `+${awaySpread}` : awaySpread.toString()
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
