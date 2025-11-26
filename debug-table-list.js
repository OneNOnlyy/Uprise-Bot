import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function listAllTablesWithLogos() {
  try {
    const url = 'https://www.cbssports.com/nba/injuries/';
    console.log('Listing all tables with logo IDs and first players...\n');

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const html = await response.text();
    const $ = cheerio.load(html);

    $('table').each((tableIndex, table) => {
      const $table = $(table);
      
      // Get logo ID
      let logoId = null;
      let $parent = $table.parent();
      for (let i = 0; i < 5; i++) {
        $parent = $parent.parent();
        if (!$parent.length) break;
        
        const $logo = $parent.find('img[alt="team logo"]').first();
        if ($logo.length) {
          const logoSrc = $logo.attr('src') || '';
          const match = logoSrc.match(/team-logos\/(\d+)\.svg/);
          if (match) {
            logoId = match[1];
            break;
          }
        }
      }
      
      // Get first 3 players
      const players = [];
      $table.find('tr').slice(1, 4).each((i, row) => {
        const player = $(row).find('td').eq(0).text().trim();
        if (player) players.push(player);
      });
      
      console.log(`Table ${tableIndex}: Logo ID ${logoId || 'NONE'}`);
      if (players.length > 0) {
        players.forEach(p => console.log(`  - ${p}`));
      }
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

listAllTablesWithLogos();
