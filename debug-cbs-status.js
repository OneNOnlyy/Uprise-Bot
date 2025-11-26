import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

// Debug CBS game status detection
async function debugCBSStatus() {
  try {
    // Test with a game that should be live
    const gameId = 'NBA_20251123_POR@OKC';
    const url = `https://www.cbssports.com/nba/gametracker/live/${gameId}`;
    
    console.log(`Debugging CBS status detection for: ${gameId}\n`);
    console.log(`URL: ${url}\n`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      console.log('❌ Response not OK:', response.status);
      return;
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    
    console.log('🔍 Looking for status indicators...\n');
    
    // Check all possible status selectors
    const statusSelectors = [
      '.game-status',
      '[class*="status"]',
      '[class*="period"]',
      '[class*="quarter"]',
      '.in-progress-game',
      '.final-state',
      '[data-status]',
      '.score-and-status'
    ];
    
    statusSelectors.forEach(selector => {
      const elements = $(selector);
      if (elements.length > 0) {
        console.log(`\n📍 Selector: ${selector} (${elements.length} found)`);
        elements.slice(0, 5).each((i, el) => {
          const text = $(el).text().trim();
          const classes = $(el).attr('class');
          const dataStatus = $(el).attr('data-status');
          console.log(`  ${i + 1}. Text: "${text}"`);
          if (classes) console.log(`     Classes: ${classes}`);
          if (dataStatus) console.log(`     data-status: ${dataStatus}`);
        });
      }
    });
    
    // Look for "Final" text specifically
    console.log('\n\n🔍 Searching for "Final" or "FINAL" text...');
    const bodyText = $('body').text();
    const finalMatches = bodyText.match(/\bfinal\b/gi);
    if (finalMatches) {
      console.log(`Found ${finalMatches.length} instances of "final" in the page`);
    }
    
    // Look for quarter/period indicators
    console.log('\n🔍 Searching for quarter/period indicators...');
    const quarterMatches = bodyText.match(/\d+(st|nd|rd|th)\s*(quarter|qtr|period)?/gi);
    if (quarterMatches) {
      console.log(`Found quarter indicators:`, quarterMatches.slice(0, 10));
    }
    
    // Check for halftime
    const halftimeMatch = bodyText.match(/halftime|half time/gi);
    if (halftimeMatch) {
      console.log(`Found halftime indicator`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

debugCBSStatus();
