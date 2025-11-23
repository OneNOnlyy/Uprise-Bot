import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

// Test the CBS Sports scraper
async function testCBSScraper() {
  try {
    const url = 'https://www.cbssports.com/nba/injuries/';
    console.log('Testing CBS Sports injury scraper...');

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      console.log('Response not OK:', response.status);
      return;
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const injuries = [];

    // CBS Sports organizes injuries in tables, one per team
    $('table').each((tableIndex, table) => {
      const $table = $(table);
      const rows = $table.find('tr');

      if (rows.length < 2) return; // Skip empty tables

      let tableInjuries = [];

      rows.each((rowIndex, row) => {
        if (rowIndex === 0) return; // Skip header row

        const $row = $(row);
        const cells = $row.find('td');

        if (cells.length >= 5) {
          const playerName = $(cells[0]).text().trim();
          const position = $(cells[1]).text().trim();
          const updated = $(cells[2]).text().trim();
          const injury = $(cells[3]).text().trim();
          const status = $(cells[4]).text().trim();

          // Extract clean player name (CBS often duplicates like "L. KennardLuke Kennard")
          const cleanPlayerName = playerName.replace(/^[A-Z]\.\s*[A-Za-z]+\s*/, '');

          if (cleanPlayerName && status) {
            tableInjuries.push({
              player: cleanPlayerName,
              status: status,
              description: injury || 'Injury',
              position: position,
              updated: updated
            });
          }
        }
      });

      if (tableInjuries.length > 0) {
        injuries.push(...tableInjuries);
        console.log(`Found ${tableInjuries.length} injuries in table ${tableIndex}`);
      }
    });

    console.log(`Total injuries scraped: ${injuries.length}`);

    // Show first 10 injuries as examples
    injuries.slice(0, 10).forEach((inj, i) => {
      console.log(`${i + 1}. ${inj.player} - ${inj.status} (${inj.description})`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testCBSScraper();