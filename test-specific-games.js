import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function checkGames() {
  const games = [
    { id: 'NBA_20251123_MIA@PHI', name: 'MIA@PHI' },
    { id: 'NBA_20251123_LAL@UTA', name: 'LAL@UTA' },
    { id: 'NBA_20251123_SA@PHO', name: 'SA@PHO' }
  ];

  for (const game of games) {
    console.log(`\n=== ${game.name} ===`);
    const url = `https://www.cbssports.com/nba/gametracker/live/${game.id}`;

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });

      if (!response.ok) {
        console.log('❌ Response not OK:', response.status);
        continue;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      console.log('Body class:', $('body').attr('class'));
      console.log('Contains FINAL:', html.includes('FINAL'));
      console.log('Contains Final:', html.includes('Final'));

      const bodyText = $('body').text();
      const timeMatches = bodyText.match(/(\d+(?:st|nd|rd|th))\s+(\d+:\d+)/g);
      console.log('Time matches in body:', timeMatches);

      // Look for the specific time format
      const specificMatch = bodyText.match(/(\d+(?:st|nd|rd|th))\s+(\d+:\d+)/);
      if (specificMatch) {
        console.log('First time match:', specificMatch[0]);
      }

    } catch (error) {
      console.error('Error:', error.message);
    }

    // Delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

checkGames();