import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function debugMissingTeams() {
  try {
    const url = 'https://www.cbssports.com/nba/injuries/';
    console.log('Checking for POR and PHI injuries...\n');

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const html = await response.text();
    const $ = cheerio.load(html);

    // Look for ALL team logos and their IDs
    const logoMap = new Map();
    $('img[alt="team logo"]').each((i, img) => {
      const src = $(img).attr('src') || '';
      const match = src.match(/team-logos\/(\d+)\.svg/);
      if (match) {
        const id = match[1];
        // Try to find team name nearby
        const $parent = $(img).closest('.TableBase, [class*="team"]');
        const teamText = $parent.text().substring(0, 200);
        logoMap.set(id, teamText.substring(0, 100));
      }
    });

    console.log('All team logos found:');
    logoMap.forEach((text, id) => {
      console.log(`  ID ${id}: ${text.substring(0, 50).trim()}...`);
    });

    console.log('\n\nSearching for Portland and Philadelphia specifically...');
    
    // Search for "Portland" or "Trail Blazers" or "76ers" or "Philadelphia" in page
    const bodyText = $('body').text();
    
    if (bodyText.includes('Portland') || bodyText.includes('Trail Blazers') || bodyText.includes('Blazers')) {
      console.log('\n✓ Found Portland/Trail Blazers/Blazers in page text');
      
      // Find the table with Portland players
      $('table').each((tableIndex, table) => {
        const $table = $(table);
        const tableText = $table.text();
        
        // Known Portland players
        const porPlayers = ['Anfernee Simons', 'Jerami Grant', 'Deandre Ayton', 'Scoot Henderson', 'Shaedon Sharpe', 'Robert Williams'];
        
        for (const player of porPlayers) {
          if (tableText.includes(player)) {
            console.log(`\nTable ${tableIndex} contains ${player} (Portland player)`);
            
            // Get logo ID for this table
            const $parent = $table.parent();
            for (let i = 0; i < 5; i++) {
              const $container = $parent.parents().eq(i);
              const $logo = $container.find('img[alt="team logo"]').first();
              if ($logo.length) {
                const logoSrc = $logo.attr('src') || '';
                const match = logoSrc.match(/team-logos\/(\d+)\.svg/);
                if (match) {
                  console.log(`  Logo ID: ${match[1]}`);
                  
                  // Show first few players in this table
                  const players = [];
                  $table.find('tr').slice(1, 6).each((i, row) => {
                    const player = $(row).find('td').eq(0).text().trim();
                    if (player) players.push(player);
                  });
                  console.log(`  Players: ${players.join(', ')}`);
                }
                break;
              }
            }
            break;
          }
        }
      });
    } else {
      console.log('\n✗ Portland/Trail Blazers not found in page');
    }
    
    if (bodyText.includes('Philadelphia') || bodyText.includes('76ers') || bodyText.includes('Sixers') || bodyText.includes('Embiid')) {
      console.log('\n✓ Found Philadelphia/76ers/Sixers/Embiid in page text');
      
      // Find the table with Philly players
      $('table').each((tableIndex, table) => {
        const $table = $(table);
        const tableText = $table.text();
        
        // Known Philly players
        const phiPlayers = ['Joel Embiid', 'Tyrese Maxey', 'Paul George', 'KJ Martin', 'Caleb Martin'];
        
        for (const player of phiPlayers) {
          if (tableText.includes(player)) {
            console.log(`\nTable ${tableIndex} contains ${player} (Philadelphia player)`);
            
            // Get logo ID for this table
            const $parent = $table.parent();
            for (let i = 0; i < 5; i++) {
              const $container = $parent.parents().eq(i);
              const $logo = $container.find('img[alt="team logo"]').first();
              if ($logo.length) {
                const logoSrc = $logo.attr('src') || '';
                const match = logoSrc.match(/team-logos\/(\d+)\.svg/);
                if (match) {
                  console.log(`  Logo ID: ${match[1]}`);
                  
                  // Show first few players in this table
                  const players = [];
                  $table.find('tr').slice(1, 6).each((i, row) => {
                    const player = $(row).find('td').eq(0).text().trim();
                    if (player) players.push(player);
                  });
                  console.log(`  Players: ${players.join(', ')}`);
                }
                break;
              }
            }
            break;
          }
        }
      });
    } else {
      console.log('\n✗ Philadelphia/76ers/Embiid not found in page');
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugMissingTeams();
