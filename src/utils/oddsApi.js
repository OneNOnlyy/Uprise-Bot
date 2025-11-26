/**
 * Odds API and NBA Game Fetching Module
 * 
 * API USAGE STRATEGY:
 * - The Odds API has a limit of 500 calls per month
 * - We use the Odds API as the PRIMARY source for games and spreads
 * - Fallback to web scraping (ESPN, ActionNetwork, Covers) if API fails
 * - Spreads are cached for the session duration (no refreshes during gameplay)
 * 
 * Data Sources (in priority order):
 * 1. The Odds API (primary - most reliable)
 * 2. BallDontLie API (for games list)
 * 3. Puppeteer web scraping (ESPN for games, ActionNetwork/Covers for spreads)
 * 4. Manual spreads file (fallback)
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';
const SPORT = 'basketball_nba';
const BALLDONTLIE_API = 'https://api.balldontlie.io/v1';
const CBS_SCOREBOARD_URL = 'https://www.cbssports.com/nba/scoreboard/?layout=compact';
const CBS_GAMETRACKER_URL = 'https://www.cbssports.com/nba/gametracker/live/';
const MANUAL_SPREADS_FILE = path.join(__dirname, '../../data/manual-spreads.json');

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

// ESPN API uses slightly different abbreviations - map them to our standard ones
const ESPN_TO_STANDARD_ABBR = {
  'SA': 'SAS',      // San Antonio
  'UTAH': 'UTA',    // Utah
  'GS': 'GSW',      // Golden State
  'NO': 'NOP',      // New Orleans
  'NY': 'NYK',      // New York
  'WSH': 'WAS'      // Washington
};

// Reverse mapping: our abbreviations to ESPN's
const STANDARD_TO_ESPN_ABBR = {
  'SAS': 'SA',
  'UTA': 'UTAH',
  'GSW': 'GS',
  'NOP': 'NO',
  'NYK': 'NY',
  'WAS': 'WSH'
};

/**
 * Get team abbreviation from full team name
 * @param {string} fullName - Full team name (e.g., "Boston Celtics")
 * @returns {string} - Team abbreviation (e.g., "BOS") or original name if not found
 */
export function getTeamAbbreviation(fullName) {
  return TEAM_ABBREVIATIONS[fullName] || fullName;
}

/**
 * Load manual spreads from JSON file
 */
function loadManualSpreads(date = null) {
  try {
    if (!fs.existsSync(MANUAL_SPREADS_FILE)) {
      return null;
    }
    
    const dateStr = date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const data = JSON.parse(fs.readFileSync(MANUAL_SPREADS_FILE, 'utf8'));
    
    if (data[dateStr] && data[dateStr].games) {
      console.log(`📋 Found ${data[dateStr].games.length} manually entered spreads for ${dateStr}`);
      return data[dateStr].games;
    }
    
    return null;
  } catch (error) {
    console.warn('Could not load manual spreads:', error.message);
    return null;
  }
}

/**
 * Scrape NBA games and spreads using Puppeteer (JavaScript rendering)
 */
async function scrapeESPNWithPuppeteer() {
  let browser;
  try {
    console.log('🌐 Launching browser to scrape ESPN with JavaScript rendering...');
    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('📡 Loading ESPN NBA scoreboard...');
    await page.goto('https://www.espn.com/nba/scoreboard', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait for games to load
    await page.waitForSelector('.ScoreCell', { timeout: 10000 }).catch(() => {
      console.warn('No ScoreCell elements found');
    });
    
    // Extract games data
    const games = await page.evaluate(() => {
      const gameElements = document.querySelectorAll('.ScoreCell');
      const results = [];
      
      gameElements.forEach((gameEl, index) => {
        try {
          const teams = gameEl.querySelectorAll('.ScoreCell__TeamName');
          if (teams.length >= 2) {
            const awayTeam = teams[0].textContent.trim();
            const homeTeam = teams[1].textContent.trim();
            
            if (awayTeam && homeTeam) {
              results.push({
                id: `espn_${index}`,
                awayTeam,
                homeTeam
              });
            }
          }
        } catch (e) {
          console.error('Error parsing game:', e);
        }
      });
      
      return results;
    });
    
    console.log(`✅ Found ${games.length} games from ESPN`);
    await browser.close();
    
    return games;
  } catch (error) {
    console.error('Error scraping ESPN with Puppeteer:', error.message);
    if (browser) await browser.close();
    return [];
  }
}

/**
 * Scrape spreads from Odds Shark with Puppeteer  
 */
async function scrapeOddsSharkWithPuppeteer() {
  let browser;
  try {
    console.log('🌐 Launching browser to scrape OddsShark...');
    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('📡 Loading OddsShark NBA odds...');
    await page.goto('https://www.oddsshark.com/nba/odds', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait for game data to load
    await page.waitForTimeout(3000);
    
    // Extract spreads
    const games = await page.evaluate(() => {
      const results = [];
      const gameRows = document.querySelectorAll('.game-matchup, [data-game], .game-row, tr.game');
      
      gameRows.forEach(row => {
        try {
          // Try multiple selectors to find team names and spreads
          const teamCells = row.querySelectorAll('.team, .team-name, td.team');
          const spreadCells = row.querySelectorAll('.spread, .line, td.spread, [data-spread]');
          
          if (teamCells.length >= 2 && spreadCells.length >= 2) {
            const awayTeam = teamCells[0].textContent.trim();
            const homeTeam = teamCells[1].textContent.trim();
            const awaySpreadText = spreadCells[0].textContent.trim();
            const homeSpreadText = spreadCells[1].textContent.trim();
            
            const awaySpread = parseFloat(awaySpreadText.replace(/[^-\d.]/g, ''));
            const homeSpread = parseFloat(homeSpreadText.replace(/[^-\d.]/g, ''));
            
            if (awayTeam && homeTeam && !isNaN(awaySpread) && !isNaN(homeSpread)) {
              results.push({
                awayTeam,
                homeTeam,
                awaySpread,
                homeSpread
              });
            }
          }
        } catch (e) {
          // Skip malformed rows
        }
      });
      
      return results;
    });
    
    console.log(`✅ Scraped ${games.length} games with spreads from OddsShark`);
    await browser.close();
    
    return games;
  } catch (error) {
    console.error('Error scraping OddsShark with Puppeteer:', error.message);
    if (browser) await browser.close();
    return [];
  }
}

/**
 * Scrape spreads from Covers.com with Puppeteer
 */
async function scrapeCoversWithPuppeteer() {
  let browser;
  try {
    console.log('🌐 Launching browser to scrape Covers.com...');
    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('📡 Loading Covers NBA odds...');
    await page.goto('https://www.covers.com/sport/basketball/nba/odds', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait for odds to load
    await page.waitForSelector('[data-game-id]', { timeout: 10000 }).catch(() => {
      console.warn('No game elements found on Covers');
    });
    
    // Extract spreads
    const games = await page.evaluate(() => {
      const gameCards = document.querySelectorAll('[data-game-id]');
      const results = [];
      
      gameCards.forEach(card => {
        try {
          const teams = card.querySelectorAll('.covers-CoversOddsTable-team-name');
          const spreads = card.querySelectorAll('.covers-CoversOddsTable-odds-handicap');
          
          if (teams.length >= 2 && spreads.length >= 2) {
            const awayTeam = teams[0].textContent.trim();
            const homeTeam = teams[1].textContent.trim();
            const awaySpreadText = spreads[0].textContent.trim();
            const homeSpreadText = spreads[1].textContent.trim();
            
            const awaySpread = parseFloat(awaySpreadText.replace(/[^-\d.]/g, ''));
            const homeSpread = parseFloat(homeSpreadText.replace(/[^-\d.]/g, ''));
            
            if (awayTeam && homeTeam && !isNaN(awaySpread) && !isNaN(homeSpread)) {
              results.push({
                awayTeam,
                homeTeam,
                awaySpread,
                homeSpread
              });
            }
          }
        } catch (e) {
          // Skip malformed cards
        }
      });
      
      return results;
    });
    
    console.log(`✅ Scraped ${games.length} games with spreads from Covers`);
    await browser.close();
    
    return games;
  } catch (error) {
    console.error('Error scraping Covers with Puppeteer:', error.message);
    if (browser) await browser.close();
    return [];
  }
}

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
    
    // Try ESPN odds page first (official source)
    let spreadGames = await scrapeESPNOdds();
    if (spreadGames.length === 0) {
      // Fallback to ActionNetwork
      console.log('ESPN odds failed, trying ActionNetwork...');
      spreadGames = await scrapeActionNetworkOdds();
    }
    if (spreadGames.length === 0) {
      // Final fallback to Covers
      console.log('ActionNetwork failed, trying Covers...');
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
 * Scrape NBA odds from ESPN Odds page
 * URL: https://www.espn.com/nba/odds
 * ESPN embeds odds data as JSON in the page source
 */
async function scrapeESPNOdds() {
  let browser;
  try {
    console.log('🌐 Scraping NBA odds from ESPN odds page...');
    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('📡 Loading ESPN odds page...');
    await page.goto('https://www.espn.com/nba/odds', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    // Extract odds data from embedded JSON
    const html = await page.content();
    await browser.close();
    
    // ESPN embeds odds data in a variable assignment before </script>
    // Pattern: oddstable:{"events":[...]}
    const jsonMatch = html.match(/"oddstable":\{[^}]*"events":\[(.+?)\],"oddsFooterText"/s);
    if (!jsonMatch) {
      console.error('Could not find ESPN odds events data in page');
      return [];
    }
    
    try {
      // Parse the events array
      const eventsJson = '[' + jsonMatch[1] + ']';
      const events = JSON.parse(eventsJson);
      const gamesList = [];
      
      if (!events || !Array.isArray(events) || events.length === 0) {
        console.warn('No games found in ESPN odds data');
        return [];
      }
      
      // Extract spread data from each game
      for (const event of events) {
        try {
          const competitors = event.competitors;
          if (!competitors || competitors.length < 2) continue;
          
          // Get team info
          const homeTeam = competitors.find(c => c.homeAway === 'home');
          const awayTeam = competitors.find(c => c.homeAway === 'away');
          
          if (!homeTeam || !awayTeam) continue;
          
          // Get spread from odds
          const odds = event.odds?.[0]; // First odds provider (ESPN BET)
          if (!odds) continue;
          
          const awaySpreadData = odds.pointSpread?.away?.close;
          const homeSpreadData = odds.pointSpread?.home?.close;
          
          if (!awaySpreadData || !homeSpreadData) continue;
          
          // Parse spread values (e.g., "-9.5", "+3.5")
          const awaySpread = parseFloat(awaySpreadData.line);
          const homeSpread = parseFloat(homeSpreadData.line);
          
          if (isNaN(awaySpread) || isNaN(homeSpread)) continue;
          
          gamesList.push({
            awayTeam: awayTeam.team.displayName,
            homeTeam: homeTeam.team.displayName,
            awaySpread: awaySpread,
            homeSpread: homeSpread
          });
          
          console.log(`  ${awayTeam.team.shortDisplayName} (${awaySpread}) @ ${homeTeam.team.shortDisplayName} (${homeSpread})`);
        } catch (e) {
          console.warn('Error parsing game:', e.message);
        }
      }
      
      console.log(`✅ Scraped ${gamesList.length} games with spreads from ESPN odds`);
      return gamesList;
      
    } catch (error) {
      console.error('Error parsing ESPN JSON data:', error.message);
      return [];
    }
    
  } catch (error) {
    console.error('Error scraping ESPN odds:', error.message);
    if (browser) await browser.close();
    return [];
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
      let homeSpread = match.homeSpread;
      let awaySpread = match.awaySpread;
      
      // FAIL-SAFE: If one spread is 0 but the other isn't, they should be inverse
      if (homeSpread !== 0 && awaySpread === 0) {
        awaySpread = -homeSpread;
        console.log(`🔧 Fixed zero spread: ${awayTeam} spread corrected from 0 to ${awaySpread}`);
      } else if (awaySpread !== 0 && homeSpread === 0) {
        homeSpread = -awaySpread;
        console.log(`🔧 Fixed zero spread: ${homeTeam} spread corrected from 0 to ${homeSpread}`);
      }
      
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
              { name: homeTeam, point: homeSpread },
              { name: awayTeam, point: awaySpread }
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
 * Format a game object with spread information
 */
export function formatGameWithSpread(game) {
  try {
    const homeTeam = game.home_team;
    const awayTeam = game.away_team;
    
    // Validate commence_time before creating Date
    if (!game.commence_time) {
      console.error(`Missing commence_time for game: ${awayTeam} @ ${homeTeam}`);
      return null;
    }
    
    const commenceTime = new Date(game.commence_time);
    
    // Validate the date is valid
    if (isNaN(commenceTime.getTime())) {
      console.error(`Invalid commence_time for game: ${awayTeam} @ ${homeTeam} (${game.commence_time})`);
      return null;
    }
    
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
      
      // FAIL-SAFE: If one spread is 0 but the other isn't, they should be inverse
      if (homeSpread !== 0 && awaySpread === 0) {
        awaySpread = -homeSpread;
        console.log(`🔧 Fixed zero spread: ${awayTeam} spread corrected from 0 to ${awaySpread}`);
      } else if (awaySpread !== 0 && homeSpread === 0) {
        homeSpread = -awaySpread;
        console.log(`🔧 Fixed zero spread: ${homeTeam} spread corrected from 0 to ${homeSpread}`);
      }
      
      // ADDITIONAL FAIL-SAFE: If both are 0 but it's clearly not a pick'em game
      if (homeSpread === 0 && awaySpread === 0 && spreadMarket.outcomes.length === 2) {
        console.warn(`⚠️ Both spreads are 0 for ${awayTeam} @ ${homeTeam} - this may be a pick'em game or data issue`);
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
 * Get NBA games with spreads for a specific date
 */
export async function getNBAGamesWithSpreads(date = null) {
  try {
    // Try The Odds API first (most reliable)
    const apiKey = process.env.ODDS_API_KEY;
    
    if (apiKey) {
      const url = `${ODDS_API_BASE}/sports/${SPORT}/odds/?apiKey=${apiKey}&regions=us&markets=spreads&oddsFormat=american&dateFormat=iso`;
      
      try {
        console.log('🔑 Using Odds API for games and spreads...');
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          // Check if response is valid array
          if (Array.isArray(data) && data.length > 0) {
            console.log(`✅ Found odds data from API for ${data.length} games`);
            
            // Format the games before filtering
            let formattedGames = data.map(formatGameWithSpread).filter(g => g !== null);
            
            // If a specific date was requested, filter games to only that date
            if (date) {
              const targetDate = date; // Already in YYYY-MM-DD format
              formattedGames = formattedGames.filter(game => {
                // Get the game's date in YYYY-MM-DD format (Pacific Time)
                const gameDate = new Date(game.commenceTime);
                const gameDateStr = gameDate.toLocaleString('en-US', { 
                  year: 'numeric', 
                  month: '2-digit', 
                  day: '2-digit',
                  timeZone: 'America/Los_Angeles'
                });
                // Convert MM/DD/YYYY to YYYY-MM-DD
                const [month, day, year] = gameDateStr.split(',')[0].split('/');
                const formattedGameDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                
                return formattedGameDate === targetDate;
              });
              
              console.log(`📅 Filtered to ${formattedGames.length} games for ${date}`);
            }
            
            return formattedGames;
          }
        } else {
          console.warn(`Odds API returned: ${response.status} ${response.statusText}`);
        }
      } catch (apiError) {
        console.error('Odds API error:', apiError.message);
      }
    } else {
      console.log('⚠️  No ODDS_API_KEY found in environment');
    }
    
    // Fallback: Try manual spreads as last resort
    const manualGames = loadManualSpreads(date);
    if (manualGames && manualGames.length > 0) {
      console.log('📋 Using manual spreads from file');
      // Convert manual spreads format to match API format
      return manualGames.map(game => ({
        id: `manual_${game.home_team}_${game.away_team}`,
        home_team: game.home_team,
        away_team: game.away_team,
        commence_time: new Date().toISOString(),
        bookmakers: [{
          title: 'Manual Entry',
          markets: [{
            key: 'spreads',
            outcomes: [
              { name: game.home_team, point: game.homeSpread },
              { name: game.away_team, point: game.awaySpread }
            ]
          }]
        }]
      }));
    }
    
    console.error('❌ All methods failed to retrieve games with spreads');
    return [];
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
 * Get all formatted games for a date
 */
export async function getFormattedGamesForDate(date = null) {
  const games = await getNBAGamesWithSpreads(date);
  // Games are already formatted by getNBAGamesWithSpreads, just return them
  return games;
}

/**
 * Get upcoming NBA games from ESPN API for scheduling
 * This is used by the scheduling system and doesn't require odds/spreads
 * @param {string} date - Date in YYYY-MM-DD format (optional, defaults to today)
 * @returns {Array} Array of games with basic info (no spreads needed)
 */
export async function getESPNGamesForDate(date = null) {
  try {
    // If date is provided in YYYY-MM-DD format, just remove hyphens
    // Otherwise, use today's date
    let dateStr;
    if (date) {
      // Remove hyphens from YYYY-MM-DD to get YYYYMMDD
      dateStr = date.replace(/-/g, '');
    } else {
      // Get today in YYYYMMDD format
      dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    }
    
    // Use ESPN's scoreboard API
    const espnUrl = `http://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`;
    
    console.log(`🏀 Fetching games from ESPN API for ${date || 'today'} (${dateStr})...`);

    const response = await fetch(espnUrl);
    
    if (!response.ok) {
      console.error(`ESPN API fetch failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const games = [];

    if (!data.events || data.events.length === 0) {
      return [];
    }

    for (const event of data.events) {
      try {
        const competition = event.competitions[0];
        const homeCompetitor = competition.competitors.find(c => c.homeAway === 'home');
        const awayCompetitor = competition.competitors.find(c => c.homeAway === 'away');
        
        if (!homeCompetitor || !awayCompetitor) continue;

        const awayTeam = awayCompetitor.team.displayName; // Full name
        const homeTeam = homeCompetitor.team.displayName; // Full name
        const awayAbbr = awayCompetitor.team.abbreviation;
        const homeAbbr = homeCompetitor.team.abbreviation;
        
        // Normalize ESPN abbreviations to our standard ones
        const normalizedAwayAbbr = ESPN_TO_STANDARD_ABBR[awayAbbr] || awayAbbr;
        const normalizedHomeAbbr = ESPN_TO_STANDARD_ABBR[homeAbbr] || homeAbbr;
        
        // Get game time
        const commenceTime = event.date; // ISO format

        games.push({
          id: event.id,
          awayTeam: awayTeam,
          homeTeam: homeTeam,
          awayAbbr: normalizedAwayAbbr,
          homeAbbr: normalizedHomeAbbr,
          commenceTime: commenceTime,
          bookmakers: [] // No odds needed for scheduling
        });

      } catch (error) {
        console.error(`Error parsing ESPN event:`, error.message);
      }
    }

    console.log(`✅ Fetched ${games.length} games from ESPN API`);
    return games;

  } catch (error) {
    console.error('Error fetching ESPN games:', error);
    return [];
  }
}

/**
 * Fetch live scores from ESPN API (much more reliable than CBS scraping)
 * @param {string} date - Date in YYYY-MM-DD format (optional, defaults to today)
 * @returns {Array} Array of games with scores
 */
export async function fetchCBSSportsScores(date = null) {
  try {
    const dateStr = date ? new Date(date).toISOString().split('T')[0].replace(/-/g, '') : new Date().toISOString().split('T')[0].replace(/-/g, '');
    
    // Use ESPN's scoreboard API - much more reliable
    const espnUrl = `http://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`;
    
    console.log(`🏀 Fetching scores from ESPN API for ${dateStr}...`);

    const response = await fetch(espnUrl);
    
    if (!response.ok) {
      console.error(`ESPN API fetch failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const games = [];

    if (!data.events || data.events.length === 0) {
      console.log('⚠️ No games found for this date');
      return [];
    }

    for (const event of data.events) {
      try {
        const competition = event.competitions[0];
        const homeCompetitor = competition.competitors.find(c => c.homeAway === 'home');
        const awayCompetitor = competition.competitors.find(c => c.homeAway === 'away');
        
        if (!homeCompetitor || !awayCompetitor) continue;

        const awayTeam = awayCompetitor.team.abbreviation;
        const homeTeam = homeCompetitor.team.abbreviation;
        const awayScore = parseInt(awayCompetitor.score) || 0;
        const homeScore = parseInt(homeCompetitor.score) || 0;
        
        // Normalize ESPN abbreviations to our standard ones
        const normalizedAwayTeam = ESPN_TO_STANDARD_ABBR[awayTeam] || awayTeam;
        const normalizedHomeTeam = ESPN_TO_STANDARD_ABBR[homeTeam] || homeTeam;
        
        // Get status
        const statusType = competition.status.type.name;
        const statusDetail = competition.status.type.detail;
        const statusShort = competition.status.type.shortDetail;
        
        let status = 'Scheduled';
        let isFinal = false;
        let isLive = false;
        
        // Check completed status first
        if (competition.status.type.completed === true) {
          status = 'Final';
          isFinal = true;
        } else if (statusType === 'STATUS_FINAL') {
          status = 'Final';
          isFinal = true;
        } else if (statusType === 'STATUS_IN_PROGRESS') {
          // Use the short detail which has format like "3rd 6:59"
          status = statusShort || statusDetail;
          isLive = true;
        } else if (statusType === 'STATUS_SCHEDULED') {
          // ESPN sometimes keeps status as SCHEDULED even when game has started
          // Check if we have real scores (both teams have points)
          if (awayScore > 0 || homeScore > 0) {
            console.log(`  ⚠️ Game marked as SCHEDULED but has scores: ${awayScore}-${homeScore}. Treating as LIVE.`);
            status = statusShort || statusDetail || 'In Progress';
            isLive = true;
          } else {
            status = 'Scheduled';
          }
        } else {
          // Unknown status, log it
          console.log(`  ⚠️ Unknown status type: ${statusType} for ${normalizedAwayTeam} @ ${normalizedHomeTeam}`);
        }

        games.push({
          id: event.id,
          awayTeam: normalizedAwayTeam,
          homeTeam: normalizedHomeTeam,
          awayScore: isLive || isFinal ? awayScore : null, // Only include scores if game started
          homeScore: isLive || isFinal ? homeScore : null,
          status,
          isFinal,
          isLive
        });

        const scoreDisplay = (isLive || isFinal) ? `${awayScore} @ ${homeScore}` : 'vs';
        console.log(`  ✅ ${normalizedAwayTeam} ${scoreDisplay} ${normalizedHomeTeam} (${status})`);

      } catch (error) {
        console.error(`Error parsing event:`, error.message);
      }
    }

    console.log(`✅ Fetched ${games.length} games from ESPN API`);
    return games;

  } catch (error) {
    console.error('Error fetching scores:', error);
    return [];
  }
}

/**
 * Fetch active roster (non-injured players) for a team from ESPN API
 * @param {string} teamAbbr - Team abbreviation (e.g., 'LAL', 'BOS') or full team name
 * @returns {Array} Array of active players with basic info
 */
export async function getTeamActiveRoster(teamAbbr) {
  try {
    // If we received a full team name, convert it to abbreviation
    let abbr = teamAbbr;
    
    // Check if it's a full team name (contains spaces or is longer than 3 chars)
    if (teamAbbr && (teamAbbr.includes(' ') || teamAbbr.length > 3)) {
      // Try to extract abbreviation from full name
      const teamNameMap = {
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
        'LA Lakers': 'LAL',
        'Los Angeles Lakers': 'LAL',
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
      
      abbr = teamNameMap[teamAbbr];
      if (!abbr) {
        console.error(`Could not find abbreviation for team: ${teamAbbr}`);
        return [];
      }
    }
    
    // Convert our standard abbreviations to ESPN format if needed
    const espnAbbr = STANDARD_TO_ESPN_ABBR[abbr] || abbr;
    
    // ESPN roster API endpoint
    const espnUrl = `http://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${espnAbbr.toLowerCase()}/roster`;
    
    console.log(`👥 Fetching roster for ${abbr} from ESPN API...`);

    const response = await fetch(espnUrl);
    
    if (!response.ok) {
      console.error(`ESPN Roster API failed: ${response.status} for ${espnUrl}`);
      return [];
    }

    const data = await response.json();
    const players = [];

    if (!data.athletes || data.athletes.length === 0) {
      console.log('⚠️ No roster data found');
      return [];
    }

    // Athletes array contains player objects directly
    for (const athlete of data.athletes) {
      try {
        // Only include active players (not injured/out)
        const isActive = !athlete.injuries || athlete.injuries.length === 0 || 
                        athlete.injuries.every(inj => inj.status !== 'Out');
        
        if (isActive) {
          players.push({
            name: athlete.displayName || athlete.fullName,
            number: athlete.jersey || 'N/A',
            position: athlete.position?.abbreviation || 'N/A',
            status: 'Active'
          });
        }
      } catch (error) {
        console.error('Error parsing player:', error.message);
      }
    }

    console.log(`✅ Fetched ${players.length} active players for ${abbr}`);
    return players;

  } catch (error) {
    console.error('Error fetching team roster:', error);
    return [];
  }
}
