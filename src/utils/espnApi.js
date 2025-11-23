import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const ESPN_API_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const BALLDONTLIE_API = 'https://api.balldontlie.io/v1';

// Map team names to ESPN IDs
const TEAM_NAME_TO_ESPN_ID = {
  'Atlanta Hawks': '1',
  'Boston Celtics': '2',
  'Brooklyn Nets': '17',
  'Charlotte Hornets': '30',
  'Chicago Bulls': '4',
  'Cleveland Cavaliers': '5',
  'Dallas Mavericks': '6',
  'Denver Nuggets': '7',
  'Detroit Pistons': '8',
  'Golden State Warriors': '9',
  'Houston Rockets': '10',
  'Indiana Pacers': '11',
  'LA Clippers': '12',
  'Los Angeles Clippers': '12',
  'Los Angeles Lakers': '13',
  'LA Lakers': '13',
  'Memphis Grizzlies': '29',
  'Miami Heat': '14',
  'Milwaukee Bucks': '15',
  'Minnesota Timberwolves': '16',
  'New Orleans Pelicans': '3',
  'New York Knicks': '18',
  'Oklahoma City Thunder': '25',
  'Orlando Magic': '19',
  'Philadelphia 76ers': '20',
  'Phoenix Suns': '21',
  'Portland Trail Blazers': '22',
  'Sacramento Kings': '23',
  'San Antonio Spurs': '24',
  'Toronto Raptors': '28',
  'Utah Jazz': '26',
  'Washington Wizards': '27'
};

// Map team abbreviations to ESPN URL slugs
const TEAM_ABBR_TO_ESPN_SLUG = {
  'ATL': 'atl/atlanta-hawks',
  'BOS': 'bos/boston-celtics',
  'BKN': 'bkn/brooklyn-nets',
  'BRK': 'bkn/brooklyn-nets',
  'CHA': 'cha/charlotte-hornets',
  'CHO': 'cha/charlotte-hornets',
  'CHI': 'chi/chicago-bulls',
  'CLE': 'cle/cleveland-cavaliers',
  'DAL': 'dal/dallas-mavericks',
  'DEN': 'den/denver-nuggets',
  'DET': 'det/detroit-pistons',
  'GSW': 'gs/golden-state-warriors',
  'GS': 'gs/golden-state-warriors',
  'HOU': 'hou/houston-rockets',
  'IND': 'ind/indiana-pacers',
  'LAC': 'lac/la-clippers',
  'LAL': 'lal/los-angeles-lakers',
  'LA': 'lal/los-angeles-lakers',
  'MEM': 'mem/memphis-grizzlies',
  'MIA': 'mia/miami-heat',
  'MIL': 'mil/milwaukee-bucks',
  'MIN': 'min/minnesota-timberwolves',
  'NOP': 'no/new-orleans-pelicans',
  'NO': 'no/new-orleans-pelicans',
  'NYK': 'ny/new-york-knicks',
  'NY': 'ny/new-york-knicks',
  'OKC': 'okc/oklahoma-city-thunder',
  'ORL': 'orl/orlando-magic',
  'PHI': 'phi/philadelphia-76ers',
  'PHX': 'phx/phoenix-suns',
  'POR': 'por/portland-trail-blazers',
  'SAC': 'sac/sacramento-kings',
  'SAS': 'sa/san-antonio-spurs',
  'SA': 'sa/san-antonio-spurs',
  'TOR': 'tor/toronto-raptors',
  'UTA': 'utah/utah-jazz',
  'UTAH': 'utah/utah-jazz',
  'WAS': 'wsh/washington-wizards',
  'WSH': 'wsh/washington-wizards'
};

// Map inconsistent abbreviations - ESPN uses different abbreviations in different APIs
const ABBR_ALIASES = {
  'WSH': 'WAS', // Team info API returns WSH, but scoreboard uses WAS
  'BRK': 'BKN',
  'CHO': 'CHA'
};

/**
 * Normalize team name for matching
 */
function normalizeTeamName(teamName) {
  // Try exact match first
  if (TEAM_NAME_TO_ESPN_ID[teamName]) {
    return teamName;
  }
  
  // Try variations
  const normalized = teamName.toLowerCase();
  
  // Handle LA/Los Angeles variations
  if (normalized.includes('clippers')) {
    return 'LA Clippers';
  }
  if (normalized.includes('lakers')) {
    return 'Los Angeles Lakers';
  }
  
  // Try to find a fuzzy match
  for (const [key, value] of Object.entries(TEAM_NAME_TO_ESPN_ID)) {
    if (key.toLowerCase() === normalized || 
        key.toLowerCase().includes(normalized) || 
        normalized.includes(key.toLowerCase())) {
      return key;
    }
  }
  
  return teamName;
}

/**
 * Scrape injuries from ESPN's injury report page
 */
async function scrapeInjuriesFromESPN(teamAbbr, teamName) {
  try {
    // Get the proper ESPN URL slug
    const urlSlug = TEAM_ABBR_TO_ESPN_SLUG[teamAbbr];
    
    if (!urlSlug) {
      console.warn(`[Scraper] No ESPN URL slug found for abbreviation: ${teamAbbr}`);
      return [];
    }
    
    const url = `https://www.espn.com/nba/team/injuries/_/name/${urlSlug}`;
    console.log(`[Scraper] Fetching injuries from: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      console.warn(`[Scraper] Failed to fetch injury page: ${response.status}`);
      return [];
    }
    
    const html = await response.text();
    console.log(`[Scraper] Received HTML length: ${html.length} chars`);
    
    // Check if the page contains "No injuries to report"
    if (html.includes('No injuries to report') || html.includes('no injuries')) {
      console.log(`[Scraper] Page indicates no injuries for ${teamName}`);
      return [];
    }
    
    const $ = cheerio.load(html);
    const injuries = [];
    
    // Debug: Check for various table-like structures
    const divTables = $('div[class*="Table"]').length;
    const actualTables = $('table').length;
    const rows = $('tr').length;
    const injuryCards = $('div[class*="Injury"], div[class*="injury"]').length;
    console.log(`[Scraper] Found: ${actualTables} <table>, ${divTables} div.Table, ${rows} <tr>, ${injuryCards} injury divs`);
    
    // Method 1: Try JSON data embedded in page (ESPN often includes this)
    $('script[type="application/json"]').each((i, elem) => {
      try {
        const jsonText = $(elem).html();
        if (jsonText && jsonText.includes('injury') || jsonText.includes('Injury')) {
          const data = JSON.parse(jsonText);
          console.log(`[Scraper] Found potential JSON data in script tag ${i}`);
          // Try to extract injury data from JSON if present
          if (data.page?.content?.injuries || data.injuries) {
            const injuryData = data.page?.content?.injuries || data.injuries;
            console.log(`[Scraper] Found ${injuryData.length || 0} injuries in JSON data`);
          }
        }
      } catch (e) {
        // Not valid JSON or doesn't contain injuries
      }
    });
    
    // Method 2: ESPN's div-based table structure (most common)
    $('.Table__TBODY .Table__TR, .ResponsiveTable tbody tr, tbody tr, div[class*="TableRow"]').each((i, row) => {
      const $row = $(row);
      
      // Get all cells
      const cells = $row.find('td, .Table__TD, div[class*="TableCell"]');
      
      if (cells.length >= 3) {
        // Column 0: Player name
        const playerName = $(cells[0]).find('a, .AnchorLink').text().trim() || $(cells[0]).text().trim();
        // Column 1: Injury/Comment
        const description = $(cells[1]).text().trim();
        // Column 2: Status
        const status = $(cells[2]).text().trim();
        
        if (playerName && playerName !== 'NAME' && playerName !== '' && 
            status && status !== 'STATUS' && status !== 'Date') {
          injuries.push({
            player: playerName,
            status: status,
            description: description || 'Injury'
          });
          console.log(`[Scraper] Table method: ${playerName} - ${status} (${description})`);
        }
      }
    });
    
    // Method 3: Try finding injury cards or list items (newer ESPN design)
    if (injuries.length === 0) {
      $('div[class*="PlayerCard"], li[class*="Athlete"], div[class*="InjuryCard"]').each((i, card) => {
        const $card = $(card);
        const playerName = $card.find('a[class*="AthleteName"], h3, h4, span[class*="Name"]').first().text().trim();
        const status = $card.find('span[class*="Status"], div[class*="Status"]').first().text().trim();
        const description = $card.find('span[class*="Injury"], div[class*="Injury"], span[class*="Comment"]').first().text().trim();
        
        if (playerName && status) {
          injuries.push({
            player: playerName,
            status: status,
            description: description || 'Injury'
          });
          console.log(`[Scraper] Card method: ${playerName} - ${status} (${description})`);
        }
      });
    }
    
    console.log(`[Scraper] Final count: ${injuries.length} injuries for ${teamName} via ESPN scraping`);
    return injuries;
    
  } catch (error) {
    console.error(`[Scraper] Error scraping ESPN injuries for ${teamName}:`, error.message);
    console.error(`[Scraper] Stack:`, error.stack);
    return [];
  }
}

/**
 * Fetch injuries from ESPN game summary endpoint (MOST RELIABLE!)
 */
async function fetchInjuriesFromGameSummary(teamName, teamAbbr) {
  try {
    // Normalize abbreviation - ESPN uses different abbreviations in different APIs
    const normalizedAbbr = ABBR_ALIASES[teamAbbr] || teamAbbr;
    console.log(`[Scraper] Team abbreviation: "${teamAbbr}" → normalized: "${normalizedAbbr}"`);
    
    // First get today's scoreboard to find game IDs - check yesterday, today and tomorrow (NBA games use ET)
    // Use PT/ET timezone aware dates since NBA games are in US timezones
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const yesterdayStr = yesterday.toISOString().split('T')[0].replace(/-/g, '');
    const todayStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const tomorrowStr = tomorrow.toISOString().split('T')[0].replace(/-/g, '');
    
    // Try today first
    let url = `${ESPN_API_BASE}/scoreboard?dates=${todayStr}`;
    console.log(`[Scraper] Fetching scoreboard for ${teamName} - checking ${todayStr}...`);
    
    let response = await fetch(url);
    if (!response.ok) {
      console.warn(`[Scraper] Scoreboard fetch failed: ${response.status}`);
      return [];
    }
    
    let data = await response.json();
    let gameId = null;
    
    console.log(`[Scraper] Found ${data.events?.length || 0} games on ${todayStr}`);
    
    // Find the game with this team
      if (data.events) {
        for (const event of data.events) {
          const competition = event.competitions?.[0];
          if (!competition) continue;
          
          console.log(`[Scraper] Event ${event.id}: ${competition.competitors?.map(c => `${c.team.displayName} (${c.team.abbreviation})`).join(' vs ')}`);
          
          for (const competitor of competition.competitors) {
            const compAbbr = competitor.team.abbreviation;
            const compName = competitor.team.displayName;
            
            console.log(`[Scraper]   Comparing: "${compAbbr}" === "${normalizedAbbr}" || "${compName}" === "${teamName}"`);
            
            if (compAbbr === normalizedAbbr || compName === teamName) {
              gameId = event.id;
              console.log(`[Scraper] ✓ Found game ID ${gameId} for ${teamName} on ${todayStr}`);
              break;
            }
          }
          
          if (gameId) break;
        }
      }
    
    // If not found, try tomorrow
    if (!gameId) {
      console.log(`[Scraper] Game not found on ${todayStr}, trying ${tomorrowStr}...`);
      url = `${ESPN_API_BASE}/scoreboard?dates=${tomorrowStr}`;
      response = await fetch(url);
      
      if (!response.ok) {
        console.warn(`[Scraper] Tomorrow scoreboard fetch failed: ${response.status}`);
        return [];
      }
      
      data = await response.json();
      console.log(`[Scraper] Found ${data.events?.length || 0} games on ${tomorrowStr}`);
      
      if (data.events) {
        for (const event of data.events) {
          const competition = event.competitions?.[0];
          if (!competition) continue;
          
          console.log(`[Scraper] Event ${event.id}: ${competition.competitors?.map(c => `${c.team.displayName} (${c.team.abbreviation})`).join(' vs ')}`);
          
          for (const competitor of competition.competitors) {
            const compAbbr = competitor.team.abbreviation;
            const compName = competitor.team.displayName;
            
            console.log(`[Scraper]   Comparing: "${compAbbr}" === "${normalizedAbbr}" || "${compName}" === "${teamName}"`);
            
            if (compAbbr === normalizedAbbr || compName === teamName) {
              gameId = event.id;
              console.log(`[Scraper] ✓ Found game ID ${gameId} for ${teamName} on ${tomorrowStr}`);
              break;
            }
          }
          
          if (gameId) break;
        }
      }
    }
    
    // If still not found, try yesterday (timezone issues)
    if (!gameId) {
      console.log(`[Scraper] Game not found on ${todayStr} or ${tomorrowStr}, trying ${yesterdayStr}...`);
      url = `${ESPN_API_BASE}/scoreboard?dates=${yesterdayStr}`;
      response = await fetch(url);
      
      if (!response.ok) {
        console.warn(`[Scraper] Yesterday scoreboard fetch failed: ${response.status}`);
        return [];
      }
      
      data = await response.json();
      console.log(`[Scraper] Found ${data.events?.length || 0} games on ${yesterdayStr}`);
      
      if (data.events) {
        for (const event of data.events) {
          const competition = event.competitions?.[0];
          if (!competition) continue;
          
          console.log(`[Scraper] Event ${event.id}: ${competition.competitors?.map(c => `${c.team.displayName} (${c.team.abbreviation})`).join(' vs ')}`);
          
          for (const competitor of competition.competitors) {
            const compAbbr = competitor.team.abbreviation;
            const compName = competitor.team.displayName;
            
            console.log(`[Scraper]   Comparing: "${compAbbr}" === "${normalizedAbbr}" || "${compName}" === "${teamName}"`);
            
            if (compAbbr === normalizedAbbr || compName === teamName) {
              gameId = event.id;
              console.log(`[Scraper] ✓ Found game ID ${gameId} for ${teamName} on ${yesterdayStr}`);
              break;
            }
          }
          
          if (gameId) break;
        }
      }
    }
    
    if (!gameId) {
      console.warn(`[Scraper] No game found for ${teamName} in scoreboard (${yesterdayStr}, ${todayStr}, or ${tomorrowStr})`);
      return [];
    }
    
    // Now fetch the game summary which has injuries
    const summaryUrl = `${ESPN_API_BASE}/summary?event=${gameId}`;
    console.log(`[Scraper] Fetching game summary: ${summaryUrl}`);
    
    const summaryResponse = await fetch(summaryUrl);
    if (!summaryResponse.ok) {
      console.warn(`[Scraper] Summary fetch failed: ${summaryResponse.status}`);
      return [];
    }
    
    const summaryData = await summaryResponse.json();
    const injuries = [];
    
    console.log(`[Scraper] Game summary has ${summaryData.injuries?.length || 0} team injury reports`);
    
    // Extract injuries for our team
    if (summaryData.injuries && Array.isArray(summaryData.injuries)) {
      for (const teamInjuries of summaryData.injuries) {
        const teamAbbreviation = teamInjuries.team.abbreviation;
        const teamDisplayName = teamInjuries.team.displayName;
        console.log(`[Scraper] Checking team: ${teamDisplayName} (${teamAbbreviation}) - looking for ${teamName} (${normalizedAbbr})`);
        
        if (teamInjuries.team.abbreviation === normalizedAbbr || 
            teamInjuries.team.displayName === teamName) {
          
          console.log(`[Scraper] ✓ MATCH! Found ${teamInjuries.injuries?.length || 0} injuries for ${teamName}`);
          
          if (teamInjuries.injuries && teamInjuries.injuries.length > 0) {
            for (const injury of teamInjuries.injuries) {
              // Extract description from various possible formats
              let description = 'Injury';
              
              if (typeof injury.details === 'string') {
                description = injury.details;
              } else if (injury.details?.type) {
                description = injury.details.type;
              } else if (injury.details?.detail) {
                description = injury.details.detail;
              } else if (injury.type) {
                description = injury.type;
              } else if (injury.comment) {
                description = injury.comment;
              }
              
              injuries.push({
                player: injury.longComment || injury.athlete?.displayName || 'Unknown',
                status: injury.status || 'Out',
                description: description
              });
              console.log(`[Scraper] Game Summary: ${injury.longComment || injury.athlete?.displayName} - ${injury.status} (${description})`);
            }
          } else {
            console.log(`[Scraper] ✓ MATCH but no injuries array for ${teamName}`);
          }
        } else {
          console.log(`[Scraper] ✗ No match: ${teamDisplayName} (${teamAbbreviation}) != ${teamName} (${normalizedAbbr})`);
        }
      }
    } else {
      console.log(`[Scraper] No injuries data in game summary`);
    }
    
    console.log(`[Scraper] Game summary injuries: ${injuries.length} for ${teamName}`);
    return injuries;
    
  } catch (error) {
    console.error(`[Scraper] Error fetching game summary injuries:`, error.message);
    return [];
  }
}

/**
 * Fetch injuries from BallDontLie API (free, no key required)
 */
async function fetchInjuriesFromBallDontLie(teamName) {
  try {
    // BallDontLie doesn't have injuries endpoint, try ESPN scoreboard instead
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`;
    console.log(`[Scraper] Fetching ESPN scoreboard for injuries: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[Scraper] ESPN scoreboard fetch failed: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    const injuries = [];
    
    console.log(`[Scraper] Scoreboard: Found ${data.events?.length || 0} events`);
    
    // Find games with our team
    if (data.events) {
      for (const event of data.events) {
        const homeTeam = event.competitions?.[0]?.competitors?.find(c => c.homeAway === 'home');
        const awayTeam = event.competitions?.[0]?.competitors?.find(c => c.homeAway === 'away');
        
        const homeTeamName = homeTeam?.team?.displayName || homeTeam?.team?.name;
        const awayTeamName = awayTeam?.team?.displayName || awayTeam?.team?.name;
        
        console.log(`[Scraper] Game: ${awayTeamName} @ ${homeTeamName}`);
        
        // Check if this game has our team
        let targetTeam = null;
        if (homeTeamName === teamName) {
          targetTeam = homeTeam;
          console.log(`[Scraper] Matched home team: ${teamName}`);
        } else if (awayTeamName === teamName) {
          targetTeam = awayTeam;
          console.log(`[Scraper] Matched away team: ${teamName}`);
        }
        
        if (targetTeam) {
          console.log(`[Scraper] Team has injuries property: ${!!targetTeam.injuries}`);
          console.log(`[Scraper] Injuries count: ${targetTeam.injuries?.length || 0}`);
          
          if (targetTeam.injuries && targetTeam.injuries.length > 0) {
            console.log(`[Scraper] Found injuries in scoreboard for ${teamName}`);
            for (const injury of targetTeam.injuries) {
              injuries.push({
                player: injury.athlete?.displayName || injury.athlete?.name || 'Unknown',
                status: injury.status || 'Out',
                description: injury.details?.type || injury.type || 'Injury'
              });
            }
          } else {
            // Check if injury data might be elsewhere in the structure
            console.log(`[Scraper] Target team keys:`, Object.keys(targetTeam).join(', '));
          }
        }
      }
    }
    
    console.log(`[Scraper] BallDontLie/Scoreboard injuries: ${injuries.length} for ${teamName}`);
    return injuries;
    
  } catch (error) {
    console.error(`[Scraper] Error fetching injuries from scoreboard:`, error.message);
    return [];
  }
}

/**
 * Scrape injuries from RotoWire (alternative source)
 */
async function scrapeInjuriesFromRotoWire(teamName) {
  try {
    // RotoWire has a comprehensive NBA injuries page
    const url = 'https://www.rotowire.com/basketball/injury-report.php';
    console.log(`[Scraper] Fetching RotoWire injuries from: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      console.warn(`[Scraper] RotoWire fetch failed: ${response.status}`);
      return [];
    }
    
    const html = await response.text();
    console.log(`[Scraper] RotoWire HTML length: ${html.length} chars`);
    const $ = cheerio.load(html);
    const injuries = [];
    
    // RotoWire uses divs with team sections
    let foundTeamSection = false;
    let sectionsChecked = 0;
    
    // Find all team injury sections - try multiple selectors
    const teamSections = $('.lineup.is-nba, .lineup__main.is-nba, div[class*="lineup"][class*="nba"]');
    console.log(`[Scraper] Found ${teamSections.length} potential team sections`);
    
    teamSections.each((i, section) => {
      const $section = $(section);
      sectionsChecked++;
      
      // Get team name from multiple possible locations
      const teamHeader = $section.find('.lineup__abbr, .lineup__mteam').text().trim();
      const teamAbbr = $section.find('.lineup__abbr').text().trim();
      
      console.log(`[Scraper] RotoWire section ${i}: Header="${teamHeader}", Abbr="${teamAbbr}"`);
      
      // Try to match by team name or abbreviation
      const teamLastWord = teamName.split(' ').pop().toLowerCase();
      const teamFirstWord = teamName.split(' ')[0].toLowerCase();
      const headerLower = teamHeader.toLowerCase();
      
      const isMatch = headerLower.includes(teamLastWord) ||
                     headerLower.includes(teamFirstWord) ||
                     teamName.toLowerCase().includes(headerLower) ||
                     headerLower.includes('knicks') && teamName.includes('Knicks') ||
                     headerLower.includes('magic') && teamName.includes('Magic');
      
      if (isMatch) {
        foundTeamSection = true;
        console.log(`[Scraper] ✓ Found matching team section for ${teamName}`);
        
        // Find all player rows in this section - try multiple selectors
        const playerRows = $section.find('tbody tr, .lineup__player, div[class*="player"]');
        console.log(`[Scraper] Found ${playerRows.length} potential player rows`);
        
        playerRows.each((j, row) => {
          const $row = $(row);
          
          // Try multiple selectors for player name
          const playerName = $row.find('a').first().text().trim() || 
                            $row.find('.injury-report__player-name, [class*="player-name"]').text().trim() ||
                            $row.find('td').first().text().trim();
                            
          // Try multiple selectors for status
          const status = $row.find('.injury-report__stat, [class*="stat"]').text().trim() ||
                        $row.find('td:nth-child(4), td:last-child').text().trim();
                        
          // Try multiple selectors for description
          const description = $row.find('.injury-report__injury, [class*="injury"]').text().trim() ||
                             $row.find('td:nth-child(2), td:nth-child(3)').text().trim();
          
          if (playerName && playerName.length > 2 && status && status.length > 0) {
            injuries.push({
              player: playerName,
              status: status,
              description: description || 'Injury'
            });
            console.log(`[Scraper] RotoWire found: ${playerName} - ${status} (${description})`);
          }
        });
      }
    });
    
    console.log(`[Scraper] Checked ${sectionsChecked} sections, found team: ${foundTeamSection}`);
    console.log(`[Scraper] Final RotoWire count: ${injuries.length} injuries for ${teamName}`);
    return injuries;
    
  } catch (error) {
    console.error(`[Scraper] Error scraping RotoWire:`, error.message);
    console.error(`[Scraper] Stack:`, error.stack);
    return [];
  }
}

/**
 * Get team information including record and injuries
 */
export async function getTeamInfo(teamName) {
  try {
    console.log(`[ESPN] Looking up team: "${teamName}"`);
    const normalizedName = normalizeTeamName(teamName);
    console.log(`[ESPN] Normalized to: "${normalizedName}"`);
    const teamId = TEAM_NAME_TO_ESPN_ID[normalizedName];
    
    if (!teamId) {
      console.error(`[ESPN] Unknown team name: "${teamName}" (normalized: "${normalizedName}")`);
      console.error(`[ESPN] Available teams:`, Object.keys(TEAM_NAME_TO_ESPN_ID).join(', '));
      return null;
    }
    
    console.log(`[ESPN] Found team ID: ${teamId} for ${normalizedName}`);

    const url = `${ESPN_API_BASE}/teams/${teamId}`;
    console.log(`[ESPN] Fetching from URL: ${url}`);
    const response = await fetch(url);
    
    console.log(`[ESPN] Response status: ${response.status}`);
    
    if (!response.ok) {
      console.error(`[ESPN] API error for ${teamName}: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data = await response.json();
    console.log(`[ESPN] Successfully fetched data for ${normalizedName}`);
    const team = data.team;
    
    if (!team) {
      console.error(`[ESPN] No team data in response for ${normalizedName}`);
      return null;
    }
    
    // Extract record
    const record = team.record?.items?.find(r => r.type === 'total');
    const wins = record?.stats?.find(s => s.name === 'wins')?.value || 0;
    const losses = record?.stats?.find(s => s.name === 'losses')?.value || 0;
    
    // Extract injuries - try multiple locations
    const injuries = [];
    
    // Check team.injuries
    if (team.injuries && team.injuries.length > 0) {
      console.log(`[ESPN] Found ${team.injuries.length} injuries in team.injuries`);
      team.injuries.forEach(injury => {
        injuries.push({
          player: injury.athlete?.displayName || 'Unknown',
          status: injury.status || 'Out',
          description: injury.details?.type || 'Injury'
        });
      });
    }
    
    // Try fetching from separate injuries endpoint
    if (injuries.length === 0) {
      try {
        const injuryUrl = `${ESPN_API_BASE}/teams/${teamId}/injuries`;
        console.log(`[ESPN] Trying injuries endpoint: ${injuryUrl}`);
        const injuryResponse = await fetch(injuryUrl);
        if (injuryResponse.ok) {
          const injuryData = await injuryResponse.json();
          if (injuryData.injuries && injuryData.injuries.length > 0) {
            console.log(`[ESPN] Found ${injuryData.injuries.length} injuries from injuries endpoint`);
            injuryData.injuries.forEach(injury => {
              injuries.push({
                player: injury.athlete?.displayName || 'Unknown',
                status: injury.status || 'Out',
                description: injury.details?.type || injury.type || 'Injury'
              });
            });
          }
        }
      } catch (injuryError) {
        console.warn(`[ESPN] Could not fetch injuries from separate endpoint:`, injuryError.message);
      }
    }
    
    console.log(`[ESPN] Total injuries found for ${normalizedName}: ${injuries.length}`);
    
    // If still no injuries, try alternative sources
    let scrapedInjuries = [];
    if (injuries.length === 0) {
      console.log(`[ESPN] No API injuries found, attempting alternative sources...`);
      console.log(`[ESPN] Team abbreviation: "${team.abbreviation}"`);
      
      // Try ESPN Game Summary first (most reliable - proven working!)
      scrapedInjuries = await fetchInjuriesFromGameSummary(normalizedName, team.abbreviation);
      
      // If game summary fails, try scoreboard
      if (scrapedInjuries.length === 0) {
        scrapedInjuries = await fetchInjuriesFromBallDontLie(normalizedName);
      }
      
      // If scoreboard fails, try ESPN page scraping
      if (scrapedInjuries.length === 0) {
        scrapedInjuries = await scrapeInjuriesFromESPN(team.abbreviation, normalizedName);
      }
      
      // If ESPN scraping fails, try RotoWire as last resort
      if (scrapedInjuries.length === 0) {
        scrapedInjuries = await scrapeInjuriesFromRotoWire(normalizedName);
      }
      
      if (scrapedInjuries.length > 0) {
        injuries.push(...scrapedInjuries);
        console.log(`[ESPN] Added ${scrapedInjuries.length} injuries via alternative sources`);
      }
    }
    
    const result = {
      name: team.displayName,
      abbreviation: team.abbreviation,
      logo: team.logos?.[0]?.href || null,
      record: `${wins}-${losses}`,
      wins: parseInt(wins),
      losses: parseInt(losses),
      injuries: injuries
    };
    
    console.log(`[ESPN] Returning team info for ${normalizedName}:`, JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error(`[ESPN] Error fetching team info for ${teamName}:`, error.message);
    console.error(`[ESPN] Stack:`, error.stack);
    return null;
  }
}

/**
 * Get injuries from ESPN scoreboard (more reliable)
 */
async function getInjuriesFromScoreboard(teamAbbr) {
  try {
    // Try current scoreboard (no date filter - gets current/upcoming games)
    const url = `${ESPN_API_BASE}/scoreboard`;
    console.log(`[ESPN] Fetching current scoreboard for injury data (team: ${teamAbbr})`);
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn(`[ESPN] Scoreboard response not OK: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    const injuries = [];
    
    console.log(`[ESPN] Scoreboard has ${data.events?.length || 0} events`);
    
    // Find games with this team
    if (data.events) {
      for (const event of data.events) {
        const competition = event.competitions?.[0];
        if (!competition) continue;
        
        for (const competitor of competition.competitors) {
          if (competitor.team.abbreviation === teamAbbr) {
            console.log(`[ESPN] Found ${teamAbbr} in scoreboard event ${event.id}`);
            
            // Check for injuries in this competitor
            if (competitor.injuries && competitor.injuries.length > 0) {
              console.log(`[ESPN] Found ${competitor.injuries.length} injuries for ${teamAbbr}`);
              competitor.injuries.forEach(injury => {
                const injuryData = {
                  player: injury.athlete?.displayName || injury.athlete?.fullName || 'Unknown',
                  status: injury.status || 'Out',
                  description: injury.details?.type || injury.type || 'Injury'
                };
                injuries.push(injuryData);
                console.log(`[ESPN] Scoreboard injury: ${injuryData.player} - ${injuryData.status} (${injuryData.description})`);
              });
            } else {
              console.log(`[ESPN] No injuries found in competitor data for ${teamAbbr}`);
            }
          }
        }
      }
    }
    
    console.log(`[ESPN] Total injuries from scoreboard for ${teamAbbr}: ${injuries.length}`);
    return injuries;
  } catch (error) {
    console.error(`[ESPN] Error getting injuries from scoreboard:`, error.message);
    return [];
  }
}

/**
 * Get matchup information for two teams
 */
export async function getMatchupInfo(homeTeam, awayTeam) {
  try {
    console.log(`[ESPN] Fetching team info for: Home=${homeTeam}, Away=${awayTeam}`);
    
    const [homeInfo, awayInfo] = await Promise.all([
      getTeamInfo(homeTeam),
      getTeamInfo(awayTeam)
    ]);
    
    // Try to supplement with scoreboard injuries if empty
    if (homeInfo && homeInfo.injuries.length === 0) {
      const scoreboardInjuries = await getInjuriesFromScoreboard(homeInfo.abbreviation);
      if (scoreboardInjuries.length > 0) {
        console.log(`[ESPN] Added ${scoreboardInjuries.length} injuries from scoreboard for ${homeTeam}`);
        homeInfo.injuries = scoreboardInjuries;
      }
    }
    
    if (awayInfo && awayInfo.injuries.length === 0) {
      const scoreboardInjuries = await getInjuriesFromScoreboard(awayInfo.abbreviation);
      if (scoreboardInjuries.length > 0) {
        console.log(`[ESPN] Added ${scoreboardInjuries.length} injuries from scoreboard for ${awayTeam}`);
        awayInfo.injuries = scoreboardInjuries;
      }
    }
    
    console.log(`[ESPN] Home info result:`, homeInfo ? 'Success' : 'Null');
    console.log(`[ESPN] Away info result:`, awayInfo ? 'Success' : 'Null');
    
    if (!homeInfo) {
      console.warn(`[ESPN] Could not fetch info for home team: ${homeTeam}`);
    }
    if (!awayInfo) {
      console.warn(`[ESPN] Could not fetch info for away team: ${awayTeam}`);
    }
    
    const result = {
      home: homeInfo,
      away: awayInfo
    };
    
    console.log(`[ESPN] Returning matchup info:`, JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('[ESPN] Error fetching matchup info:', error.message);
    console.error('[ESPN] Stack:', error.stack);
    // Return empty object structure instead of null
    return {
      home: null,
      away: null
    };
  }
}

/**
 * Format injuries for display
 */
export function formatInjuries(injuries) {
  if (!injuries || injuries.length === 0) {
    return '✅ No reported injuries';
  }
  
  return injuries.map(inj => {
    // Ensure description is a string
    let desc = inj.description;
    if (typeof desc === 'object' && desc !== null) {
      desc = desc.type || desc.detail || JSON.stringify(desc);
    }
    return `❌ ${inj.player} - ${inj.status} (${desc})`;
  }).join('\n');
}
