import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function checkMissingTables() {
  const url = 'https://www.cbssports.com/nba/injuries/';
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  const html = await response.text();
  const $ = cheerio.load(html);

  [9, 12, 13].forEach(tableIdx => {
    console.log(`\n=== TABLE ${tableIdx} ===`);
    const $table = $('table').eq(tableIdx);
    
    // Check closest TableBase
    const $tableBase = $table.closest('.TableBase');
    console.log(`Found TableBase: ${$tableBase.length > 0}`);
    
    // Look for TeamName
    const $teamName = $tableBase.find('.TeamName');
    console.log(`TeamName found: ${$teamName.length}, text: "${$teamName.text()}"`);
    
    // Look for team link
    const $teamLink = $tableBase.find('a[href*="/nba/teams/"]');
    console.log(`Team links found: ${$teamLink.length}`);
    $teamLink.each((i, link) => {
      const href = $(link).attr('href');
      console.log(`  Link ${i}: ${href}`);
    });
    
    // Get first player
    const firstPlayer = $table.find('tr').eq(1).find('td').eq(0).text().trim();
    console.log(`First player: ${firstPlayer}`);
  });
}

checkMissingTables();
