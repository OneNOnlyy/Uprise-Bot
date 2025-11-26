import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function findTeamNames() {
  try {
    const url = 'https://www.cbssports.com/nba/injuries/';
    console.log('Finding team names on CBS Sports page...\n');

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const html = await response.text();
    const $ = cheerio.load(html);

    // Look for team names near each table
    $('table').each((tableIndex, table) => {
      const $table = $(table);
      
      // Get first player
      const firstPlayer = $table.find('tr').eq(1).find('td').eq(0).text().trim();
      
      console.log(`\n=== TABLE ${tableIndex} ===`);
      console.log(`First player: ${firstPlayer}`);
      
      // Look for team name in various parent elements
      let $current = $table;
      for (let i = 0; i < 10; i++) {
        $current = $current.parent();
        if (!$current.length) break;
        
        // Look for text nodes or headings with team names
        const text = $current.text();
        
        // Check for NBA team names
        const teamNames = [
          'Atlanta Hawks', 'Boston Celtics', 'Brooklyn Nets', 'Charlotte Hornets',
          'Chicago Bulls', 'Cleveland Cavaliers', 'Dallas Mavericks', 'Denver Nuggets',
          'Detroit Pistons', 'Golden State Warriors', 'Houston Rockets', 'Indiana Pacers',
          'LA Clippers', 'Los Angeles Clippers', 'LA Lakers', 'Los Angeles Lakers',
          'Memphis Grizzlies', 'Miami Heat', 'Milwaukee Bucks', 'Minnesota Timberwolves',
          'New Orleans Pelicans', 'New York Knicks', 'Oklahoma City Thunder', 'Orlando Magic',
          'Philadelphia 76ers', 'Phoenix Suns', 'Portland Trail Blazers', 'Sacramento Kings',
          'San Antonio Spurs', 'Toronto Raptors', 'Utah Jazz', 'Washington Wizards'
        ];
        
        for (const teamName of teamNames) {
          // Look for exact team name match (case insensitive)
          const regex = new RegExp(teamName, 'i');
          if (regex.test(text)) {
            // Make sure it's close to our table (within reasonable text distance)
            const beforeTable = $current.prevAll().addBack().text();
            if (beforeTable.includes(teamName) || beforeTable.length < 2000) {
              console.log(`  Found team name: ${teamName} (level ${i})`);
              
              // Show some context
              const $header = $current.find('h2, h3, h4, .team-name, [class*="team"]').first();
              if ($header.length) {
                console.log(`  Header: ${$header.text().trim().substring(0, 50)}`);
              }
              
              break;
            }
          }
        }
      }
      
      // Only show first 5 tables
      if (tableIndex >= 4) return false;
    });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

findTeamNames();
