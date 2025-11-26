import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function checkScoreboard() {
  const url = 'https://www.cbssports.com/nba/scoreboard/';
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  const html = await response.text();
  const $ = cheerio.load(html);

  console.log('Scoreboard HTML length:', html.length);

  // Look at the live update elements more closely
  const liveElements = $('.live-update');
  console.log('Live update elements:', liveElements.length);

  liveElements.each((i, el) => {
    const text = $(el).text().trim();
    console.log(`\nLive element ${i}:`);
    console.log(`Raw text: "${text}"`);
    console.log(`Length: ${text.length}`);
    console.log(`Contains tab: ${text.includes('\t')}`);
    if (text.includes('\t')) {
      const parts = text.split('\t');
      console.log(`Split into ${parts.length} parts:`);
      parts.forEach((part, idx) => {
        console.log(`  ${idx}: "${part}"`);
      });
    }
  });
}

checkScoreboard();