import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

// Test CBS Sports scoreboard scraping
async function testCBSScoreboard() {
  try {
    const url = 'https://www.cbssports.com/nba/scoreboard/';
    console.log('Testing CBS Sports scoreboard scraper...');
    console.log(`Fetching: ${url}\n`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      console.log('❌ Response not OK:', response.status);
      return;
    }

    const html = await response.text();
    console.log(`✅ Received HTML length: ${html.length} chars\n`);
    
    const $ = cheerio.load(html);
    
    // Look for game elements - CBS uses various selectors
    console.log('🔍 Searching for game elements...\n');
    
    // Try different selectors
    const selectors = [
      '.live-update',
      '.game-status',
      '.in-progress-game',
      '.final-state',
      '[class*="score"]',
      '[class*="game"]',
      '[class*="team"]'
    ];
    
    selectors.forEach(selector => {
      const elements = $(selector);
      if (elements.length > 0) {
        console.log(`Found ${elements.length} elements with selector: ${selector}`);
      }
    });
    
    // Try to find team names and scores
    console.log('\n📊 Looking for scores...\n');
    
    // Sample the HTML structure
    const bodyText = $('body').text();
    if (bodyText.includes('Final') || bodyText.includes('FINAL')) {
      console.log('✅ Found "Final" text in page');
    }
    
    // Look for script tags with JSON data (CBS often embeds data this way)
    $('script').each((i, script) => {
      const scriptContent = $(script).html();
      if (scriptContent && (scriptContent.includes('game') || scriptContent.includes('score'))) {
        console.log(`\n📜 Script ${i} contains game/score data (${scriptContent.length} chars)`);
        // Show a snippet
        const snippet = scriptContent.substring(0, 200);
        console.log(`Snippet: ${snippet}...`);
      }
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testCBSScoreboard();
