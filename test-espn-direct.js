import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

// Copy of scrapeInjuriesFromESPNInjuriesPage for testing
async function testESPNInjuriesPage(teamAbbr, teamName) {
  try {
    const url = 'https://www.espn.com/nba/injuries';
    console.log(`[ESPN Injuries Page] Fetching ${url} for team ${teamAbbr} (${teamName})...`);
    
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[ESPN Injuries Page] Failed to fetch: ${response.status}`);
      return [];
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    const injuries = [];
    
    // Create variations of team name to search for
    const cityName = teamName
      .replace(/ Hawks?$/, '')
      .replace(/ Celtics$/, '')
      .replace(/ Nets$/, '')
      .replace(/ Hornets$/, '')
      .replace(/ Bulls$/, '')
      .replace(/ Cavaliers$/, '')
      .replace(/ Mavericks$/, '')
      .replace(/ Nuggets$/, '')
      .replace(/ Pistons$/, '')
      .replace(/ Warriors$/, '')
      .replace(/ Rockets$/, '')
      .replace(/ Pacers$/, '')
      .replace(/ Clippers$/, '')
      .replace(/ Lakers$/, '')
      .replace(/ Grizzlies$/, '')
      .replace(/ Heat$/, '')
      .replace(/ Bucks$/, '')
      .replace(/ Timberwolves$/, '')
      .replace(/ Pelicans$/, '')
      .replace(/ Knicks$/, '')
      .replace(/ Thunder$/, '')
      .replace(/ Magic$/, '')
      .replace(/ 76ers$/, '')
      .replace(/ Suns$/, '')
      .replace(/ Trail Blazers$/, '')
      .replace(/ Kings$/, '')
      .replace(/ Spurs$/, '')
      .replace(/ Raptors$/, '')
      .replace(/ Jazz$/, '')
      .replace(/ Wizards$/, '')
      .trim();
    
    const teamNameVariations = [
      teamName,
      cityName,
      teamAbbr
    ];
    
    console.log(`[ESPN Injuries Page] Looking for team variations: ${teamNameVariations.join(', ')}`);
    
    // NEW APPROACH: Find ALL potential team headers on the page first
    // Then extract rows between our team header and the next team header
    
    // Get all 30 NBA team names for header identification
    const ALL_TEAM_KEYWORDS = [
      'Atlanta', 'Boston', 'Brooklyn', 'Charlotte', 'Chicago', 'Cleveland', 
      'Dallas', 'Denver', 'Detroit', 'Golden State', 'Houston', 'Indiana', 
      'LA Clippers', 'LA Lakers', 'Memphis', 'Miami', 'Milwaukee', 'Minnesota', 
      'New Orleans', 'New York', 'Oklahoma City', 'Orlando', 'Philadelphia', 
      'Phoenix', 'Portland', 'Sacramento', 'San Antonio', 'Toronto', 'Utah', 'Washington'
    ];
    
    // Find all elements on the page and filter for team headers
    const allTeamHeaders = [];
    const allElements = $('*').toArray();
    
    console.log(`[ESPN Injuries Page] Scanning ${allElements.length} elements for team headers...`);
    
    allElements.forEach((elem) => {
      const $elem = $(elem);
      const text = $elem.text().trim();
      
      // Check if this element's text matches any team keyword
      if (text.length > 0 && text.length < 150) {
        for (const keyword of ALL_TEAM_KEYWORDS) {
          if (text === keyword || text.includes(keyword)) {
            // Check if we already have a parent of this element (avoid duplicates)
            const isDuplicate = allTeamHeaders.some(existing => 
              existing.element[0] === $elem.parent()[0] || 
              $elem[0] === existing.element.parent()[0]
            );
            
            if (!isDuplicate) {
              allTeamHeaders.push({
                text: text,
                element: $elem
              });
            }
            break;
          }
        }
      }
    });
    
    console.log(`[ESPN Injuries Page] Found ${allTeamHeaders.length} potential team headers`);
    
    // Find our team's header
    let ourTeamHeaderIndex = -1;
    let ourTeamHeader = null;
    
    for (let i = 0; i < allTeamHeaders.length; i++) {
      const header = allTeamHeaders[i];
      const matchesOurTeam = teamNameVariations.some(variation => {
        const lowerText = header.text.toLowerCase();
        const lowerVar = variation.toLowerCase();
        return lowerText === lowerVar || 
               (lowerText.includes(lowerVar) && header.text.length < lowerVar.length + 30);
      });
      
      if (matchesOurTeam) {
        ourTeamHeaderIndex = i;
        ourTeamHeader = header;
        console.log(`[ESPN Injuries Page] ✓ Found our team header at position ${i}: "${header.text}"`);
        break;
      }
    }
    
    if (!ourTeamHeader) {
      console.log(`[ESPN Injuries Page] Could not find ${teamName} on page`);
      console.log(`[ESPN Injuries Page] Tried variations: ${teamNameVariations.join(', ')}`);
      console.log(`[ESPN Injuries Page] Found 0 injuries for ${teamName}`);
      return [];
    }
    
    // Get the next team's header (or null if we're the last team)
    const nextTeamHeader = allTeamHeaders[ourTeamHeaderIndex + 1] || null;
    
    console.log(`[ESPN Injuries Page] Extracting injuries between "${ourTeamHeader.text}" and ${nextTeamHeader ? `"${nextTeamHeader.text}"` : 'end of page'}`);
    
    // NEW APPROACH: Instead of walking siblings, find all rows on the page and filter by position
    // Get all potential injury rows on the entire page
    const allRows = $('tr, div[class*="Row"], div[class*="TR"]').toArray();
    console.log(`[ESPN Injuries Page] Found ${allRows.length} total rows on page`);
    
    // Since Cheerio doesn't support compareDocumentPosition, we'll use a different approach:
    // Find our header's position in ALL elements, then find rows between it and next header
    const ourHeaderPosition = allElements.indexOf(ourTeamHeader.element[0]);
    const nextHeaderPosition = nextTeamHeader ? allElements.indexOf(nextTeamHeader.element[0]) : allElements.length;
    
    console.log(`[ESPN Injuries Page] Our header is at element index ${ourHeaderPosition}, next header at ${nextHeaderPosition}`);
    
    // Debug: Show what elements are between the headers
    console.log(`[ESPN Injuries Page] Elements between headers (positions ${ourHeaderPosition} to ${nextHeaderPosition}):`);
    for (let i = ourHeaderPosition + 1; i < nextHeaderPosition && i < ourHeaderPosition + 10; i++) {
      const elem = allElements[i];
      const $elem = $(elem);
      const tagName = elem.tagName || elem.name || 'unknown';
      const className = $(elem).attr('class') || 'no-class';
      const text = $elem.text().substring(0, 60).trim();
      console.log(`  Position ${i}: <${tagName}> class="${className}", text="${text}"`);
    }
    
    // Debug: Show first few rows and their positions
    console.log(`[ESPN Injuries Page] First 5 rows positions:`);
    allRows.slice(0, 5).forEach((row, idx) => {
      const rowPosition = allElements.indexOf(row);
      const rowText = $(row).text().substring(0, 60);
      console.log(`  Row ${idx}: position=${rowPosition}, text="${rowText}"`);
    });
    
    // Filter rows that appear between the two header positions
    const allRowElements = allRows.filter(row => {
      const rowPosition = allElements.indexOf(row);
      const isBetween = rowPosition > ourHeaderPosition && rowPosition < nextHeaderPosition;
      return isBetween && rowPosition !== -1;
    });
    
    console.log(`[ESPN Injuries Page] Found ${allRowElements.length} rows between headers`);
    
    // Debug: If we found rows, show first 3
    if (allRowElements.length > 0) {
      console.log(`[ESPN Injuries Page] First 3 filtered rows:`);
      allRowElements.slice(0, 3).forEach((row, idx) => {
        const rowText = $(row).text().substring(0, 80);
        const cells = $(row).find('td, div[class*="Cell"], div[class*="TD"]');
        console.log(`  Row ${idx}: ${cells.length} cells, text="${rowText}"`);
      });
    }
    
    return injuries;
    
  } catch (error) {
    console.error(`[ESPN Injuries Page] Error:`, error.message);
    return [];
  }
}

// Test
testESPNInjuriesPage('WAS', 'Washington Wizards').then(injuries => {
  console.log('\n=== TEST COMPLETE ===');
  console.log(`Found ${injuries.length} injuries`);
  process.exit(0);
});
