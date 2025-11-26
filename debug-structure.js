import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function debugTableStructure() {
  try {
    const response = await fetch('https://www.cbssports.com/nba/injuries/');
    const html = await response.text();
    const $ = cheerio.load(html);

    $('table').each((i, table) => {
      const $table = $(table);

      // Extract player names from the table
      const players = [];
      $table.find('tr').each((_, row) => {
        const $row = $(row);
        const $cells = $row.find('td');
        if ($cells.length > 0) {
          const playerCell = $cells.first();
          const playerName = playerCell.text().trim();
          if (playerName && playerName !== 'Player') {
            players.push(playerName);
          }
        }
      });

      console.log(`Table ${i}:`);
      console.log(`  Players: ${players.slice(0, 3).join(', ')}${players.length > 3 ? '...' : ''}`);
      console.log('---');
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugTableStructure();