import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

// Test CBS Sports gametracker page for scores
async function testCBSGametracker() {
  try {
    const today = '20251123';
    // Test the games the user mentioned
    const gameIds = [
      `NBA_${today}_MIA@PHI`, // MIA game (user says over)
      `NBA_${today}_LAL@UTA`, // LAL game (user says 6:59 left in 3rd)
      `NBA_${today}_SA@PHO`   // SA game (user says 9:53 left in 3rd)
    ];
    
    for (const gameId of gameIds) {
      console.log(`\n=== Testing ${gameId} ===`);
      const url = `https://www.cbssports.com/nba/gametracker/live/${gameId}`;
      
      console.log(`URL: ${url}`);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        console.log('❌ Response not OK:', response.status);
        continue;
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      
      console.log(`✅ Loaded HTML (${html.length} chars)`);
      
      // Check body class for status
      const bodyClass = $('body').attr('class');
      console.log(`Body class: ${bodyClass}`);
      
      // Look for status elements
      const statusSelectors = [
        '.game-period-status',
        '.status',
        '.game-status',
        '[class*="status"]',
        '.period',
        '.quarter'
      ];
      
      statusSelectors.forEach(selector => {
        const elements = $(selector);
        if (elements.length > 0) {
          console.log(`Found ${elements.length} elements with selector: ${selector}`);
          elements.slice(0, 2).each((i, el) => {
            const text = $(el).text().trim();
            if (text) {
              console.log(`  ${i + 1}. "${text}"`);
            }
          });
        }
      });
      
      // Look for score elements
      const scoreElements = $('[class*="score"]');
      if (scoreElements.length > 0) {
        console.log(`Found ${scoreElements.length} score elements:`);
        scoreElements.slice(0, 4).each((i, el) => {
          const text = $(el).text().trim();
          if (text && text.match(/\d+/)) {
            console.log(`  Score ${i + 1}: "${text}"`);
          }
        });
      }
      
      // Check for FINAL or live indicators
      const bodyText = $('body').text();
      if (bodyText.includes('FINAL') || bodyText.includes('Final')) {
        console.log('✅ Game appears to be FINAL');
      } else if (bodyText.includes('3rd') || bodyText.includes('Quarter')) {
        console.log('🏀 Game appears to be live in 3rd quarter');
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

testCBSGametracker();
