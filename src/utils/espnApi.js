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
    const url = `https://www.espn.com/nba/team/injuries/_/name/${teamAbbr.toLowerCase()}`;
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
    const $ = cheerio.load(html);
    const injuries = [];
    
    // ESPN uses a table format for injuries
    $('.Table__TR').each((i, row) => {
      if (i === 0) return; // Skip header row
      
      const $row = $(row);
      const playerName = $row.find('.AnchorLink').first().text().trim();
      const status = $row.find('.Table__TD').eq(2).text().trim(); // Status column
      const description = $row.find('.Table__TD').eq(1).text().trim(); // Injury/Comment column
      
      if (playerName && status) {
        injuries.push({
          player: playerName,
          status: status || 'Out',
          description: description || 'Injury'
        });
      }
    });
    
    // Alternative: Try newer ESPN layout
    if (injuries.length === 0) {
      $('tr').each((i, row) => {
        const $row = $(row);
        const cells = $row.find('td');
        
        if (cells.length >= 3) {
          const playerName = $(cells[0]).text().trim();
          const description = $(cells[1]).text().trim();
          const status = $(cells[2]).text().trim();
          
          if (playerName && playerName !== 'NAME' && status) {
            injuries.push({
              player: playerName,
              status: status,
              description: description || 'Injury'
            });
          }
        }
      });
    }
    
    console.log(`[Scraper] Found ${injuries.length} injuries for ${teamName} via web scraping`);
    return injuries;
    
  } catch (error) {
    console.error(`[Scraper] Error scraping injuries for ${teamName}:`, error.message);
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
    console.log(`[Scraper] Fetching RotoWire injuries...`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      return [];
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    const injuries = [];
    
    // Find the team's section
    let foundTeam = false;
    $('.is-nba').each((i, section) => {
      const $section = $(section);
      const teamHeader = $section.find('.lineup__abbr').text().trim();
      
      // Check if this matches our team (by abbreviation or name)
      if (teamHeader && (teamName.includes(teamHeader) || teamHeader.includes(teamName.split(' ').pop()))) {
        foundTeam = true;
        
        $section.find('tbody tr').each((j, row) => {
          const $row = $(row);
          const playerName = $row.find('.injury-report__player-name a').text().trim();
          const status = $row.find('.injury-report__stat').first().text().trim();
          const description = $row.find('.injury-report__injury').text().trim();
          
          if (playerName && status) {
            injuries.push({
              player: playerName,
              status: status,
              description: description || 'Injury'
            });
          }
        });
      }
    });
    
    console.log(`[Scraper] Found ${injuries.length} injuries for ${teamName} from RotoWire`);
    return injuries;
    
  } catch (error) {
    console.error(`[Scraper] Error scraping RotoWire:`, error.message);
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
    
    // If still no injuries, try web scraping
    let scrapedInjuries = [];
    if (injuries.length === 0) {
      console.log(`[ESPN] No API injuries found, attempting web scraping...`);
      
      // Try ESPN scraping first
      scrapedInjuries = await scrapeInjuriesFromESPN(team.abbreviation, normalizedName);
      
      // If ESPN scraping fails, try RotoWire
      if (scrapedInjuries.length === 0) {
        scrapedInjuries = await scrapeInjuriesFromRotoWire(normalizedName);
      }
      
      if (scrapedInjuries.length > 0) {
        injuries.push(...scrapedInjuries);
        console.log(`[ESPN] Added ${scrapedInjuries.length} injuries via web scraping`);
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
    const url = `${ESPN_API_BASE}/scoreboard`;
    console.log(`[ESPN] Fetching scoreboard for injury data`);
    const response = await fetch(url);
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json();
    const injuries = [];
    
    // Find games with this team
    if (data.events) {
      for (const event of data.events) {
        const competition = event.competitions?.[0];
        if (!competition) continue;
        
        for (const competitor of competition.competitors) {
          if (competitor.team.abbreviation === teamAbbr) {
            // Check for injuries in this competitor
            if (competitor.injuries && competitor.injuries.length > 0) {
              competitor.injuries.forEach(injury => {
                injuries.push({
                  player: injury.athlete?.displayName || injury.athlete?.fullName || 'Unknown',
                  status: injury.status || 'Out',
                  description: injury.details?.type || injury.type || 'Injury'
                });
              });
            }
          }
        }
      }
    }
    
    return injuries;
  } catch (error) {
    console.warn(`[ESPN] Could not get injuries from scoreboard:`, error.message);
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
  
  return injuries.map(inj => `❌ ${inj.player} - ${inj.status} (${inj.description})`).join('\n');
}
