import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

// Test detailed CBS Sports scoreboard scraping
async function testCBSScoreboardDetailed() {
  try {
    const url = 'https://www.cbssports.com/nba/scoreboard/';
    console.log('Testing detailed CBS Sports scoreboard scraping...\n');

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
    const $ = cheerio.load(html);
    
    // Extract game data from the script tag
    console.log('🔍 Looking for embedded game data...\n');
    
    $('script').each((i, script) => {
      const scriptContent = $(script).html();
      if (scriptContent && scriptContent.includes('live-app-params')) {
        console.log('✅ Found live-app-params script!\n');
        
        // Extract the gameAbbr parameter
        const gameAbbrMatch = scriptContent.match(/"gameAbbr":"([^"]+)"/);
        if (gameAbbrMatch) {
          const gameAbbr = gameAbbrMatch[1];
          console.log('📋 Game abbreviations found:');
          console.log(gameAbbr);
          console.log('\n');
          
          // Parse game IDs
          const games = gameAbbr.split('|');
          console.log(`Found ${games.length} games:\n`);
          games.forEach((game, idx) => {
            const parts = game.split('_');
            if (parts.length >= 3) {
              const date = parts[1]; // YYYYMMDD
              const matchup = parts[2]; // AWAY@HOME
              const [away, home] = matchup.split('@');
              console.log(`${idx + 1}. ${away} @ ${home} (Date: ${date})`);
            }
          });
        }
      }
    });
    
    // Now look for actual score data - CBS likely loads this via AJAX
    console.log('\n🏀 Looking for score elements...\n');
    
    // Check for live-update class which contains game data
    $('.live-update').each((i, element) => {
      const $el = $(element);
      const gameStatus = $el.find('.game-status').text().trim();
      const teams = $el.find('[class*="team"]');
      
      console.log(`\nGame ${i + 1}:`);
      console.log(`Status: ${gameStatus}`);
      
      teams.each((j, team) => {
        const $team = $(team);
        const teamName = $team.find('[class*="name"]').text().trim();
        const score = $team.find('[class*="score"]').text().trim();
        if (teamName || score) {
          console.log(`  Team ${j + 1}: ${teamName} - ${score}`);
        }
      });
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testCBSScoreboardDetailed();
