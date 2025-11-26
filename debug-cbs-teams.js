import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function debugCBSTeamIdentifiers() {
  try {
    const url = 'https://www.cbssports.com/nba/injuries/';
    console.log('Fetching CBS Sports injury page...\n');

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const html = await response.text();
    const $ = cheerio.load(html);

    console.log(`Total tables found: ${$('table').length}\n`);

    $('table').each((tableIndex, table) => {
      const $table = $(table);
      
      // Look for parent container with team info
      let $current = $table;
      for (let i = 0; i < 10; i++) {
        $current = $current.parent();
        if (!$current.length) break;
        
        const className = $current.attr('class') || '';
        const id = $current.attr('id') || '';
        
        // Look for team-related classes or data attributes
        const dataTeam = $current.attr('data-team');
        const dataTeamAbbr = $current.attr('data-team-abbr');
        
        // Check if there's a team logo image
        const teamLogo = $current.find('img').first();
        const logoSrc = teamLogo.attr('src') || '';
        const logoAlt = teamLogo.attr('alt') || '';
        
        // Check for team name in text
        const teamText = $current.find('a, span, div').filter((i, el) => {
          const text = $(el).text().trim();
          return text.match(/^(Lakers|Celtics|Warriors|Heat|Bulls|Pistons|Grizzlies|Pacers)/i);
        }).first().text().trim();
        
        if (dataTeam || dataTeamAbbr || logoAlt || teamText || className.includes('team')) {
          console.log(`\n=== TABLE ${tableIndex} - Level ${i} ===`);
          if (className) console.log(`Class: ${className}`);
          if (id) console.log(`ID: ${id}`);
          if (dataTeam) console.log(`data-team: ${dataTeam}`);
          if (dataTeamAbbr) console.log(`data-team-abbr: ${dataTeamAbbr}`);
          if (logoAlt) console.log(`Logo alt: ${logoAlt}`);
          if (logoSrc) console.log(`Logo src: ${logoSrc.substring(0, 100)}`);
          if (teamText) console.log(`Team text: ${teamText}`);
          
          // Get first player to cross-reference
          const firstPlayer = $table.find('tr').eq(1).find('td').eq(0).text().trim();
          console.log(`First player: ${firstPlayer}`);
          break;
        }
      }
      
      // Only process first 5 tables in detail
      if (tableIndex >= 5) return false;
    });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugCBSTeamIdentifiers();
