import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function debugCBS() {
  const response = await fetch('https://www.cbssports.com/nba/scoreboard/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  const html = await response.text();
  const $ = cheerio.load(html);

  let gameIds = [];
  $('script').each((i, script) => {
    const scriptContent = $(script).html();
    if (scriptContent && scriptContent.includes('live-app-params')) {
      console.log('Found live-app-params script');
      const gameAbbrMatch = scriptContent.match(/"gameAbbr":"([^"]+)"/);
      if (gameAbbrMatch) {
        console.log('Game abbr found:', gameAbbrMatch[1]);
        gameIds = gameAbbrMatch[1].split('|');
        console.log('Game IDs:', gameIds);
      }
    }
  });

  console.log('Total game IDs found:', gameIds.length);
}

debugCBS();