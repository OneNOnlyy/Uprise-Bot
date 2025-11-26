import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function debugCBSHeaders() {
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
      
      // Check for caption or team header
      const caption = $table.find('caption').text().trim();
      const prevH3 = $table.prevAll('h3').first().text().trim();
      const prevH2 = $table.prevAll('h2').first().text().trim();
      const prevDiv = $table.prevAll('div').first().text().trim().substring(0, 100);
      
      // Get parent elements to find team identifier
      const parent = $table.parent();
      const parentClass = parent.attr('class');
      const parentText = parent.text().trim().substring(0, 150);
      
      console.log(`\n=== TABLE ${tableIndex} ===`);
      if (caption) console.log(`Caption: ${caption}`);
      if (prevH3) console.log(`Previous H3: ${prevH3}`);
      if (prevH2) console.log(`Previous H2: ${prevH2}`);
      if (parentClass) console.log(`Parent class: ${parentClass}`);
      
      // Check data attributes on table
      const tableClass = $table.attr('class');
      const tableId = $table.attr('id');
      const dataAttrs = Object.keys($table.get(0).attribs || {}).filter(k => k.startsWith('data-'));
      
      if (tableClass) console.log(`Table class: ${tableClass}`);
      if (tableId) console.log(`Table ID: ${tableId}`);
      if (dataAttrs.length > 0) {
        dataAttrs.forEach(attr => {
          console.log(`${attr}: ${$table.attr(attr)}`);
        });
      }
      
      // Get first player to identify table
      const firstRow = $table.find('tr').eq(1);
      const firstPlayer = firstRow.find('td').eq(0).text().trim();
      if (firstPlayer) console.log(`First player: ${firstPlayer}`);
      
      // Only show first 3 tables in detail
      if (tableIndex < 3) {
        console.log(`\nFull HTML snippet:`);
        console.log($table.parent().html().substring(0, 500));
      }
    });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugCBSHeaders();
