/**
 * Test ESPN odds scraping
 */
import puppeteer from 'puppeteer';

async function testESPNOddsScraping() {
  let browser;
  try {
    console.log('🌐 Testing ESPN odds scraping...\n');
    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    console.log('📡 Loading ESPN odds page...');
    await page.goto('https://www.espn.com/nba/odds', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait for dynamic content
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('🔍 Extracting odds data...\n');
    
    // Extract odds data
    const games = await page.evaluate(() => {
      const results = [];
      
      try {
        const rows = document.querySelectorAll('tbody tr');
        console.log(`Found ${rows.length} table rows`);
        
        rows.forEach((row, idx) => {
          try {
            const cells = row.querySelectorAll('td');
            if (cells.length < 4) return;
            
            // Team name
            const teamLink = cells[0].querySelector('a[href*="/nba/team/"]');
            if (!teamLink) return;
            
            const teamName = teamLink.textContent.trim();
            
            // Find spread
            let spread = null;
            let spreadText = '';
            
            for (let i = 1; i < Math.min(cells.length, 5); i++) {
              const cellText = cells[i].textContent.trim();
              const spreadMatch = cellText.match(/([+-]?\d+\.5)/);
              if (spreadMatch) {
                spread = parseFloat(spreadMatch[1]);
                spreadText = cellText;
                break;
              }
            }
            
            if (teamName && spread !== null) {
              results.push({
                rowIndex: idx,
                team: teamName,
                spread: spread,
                spreadText: spreadText,
                cellCount: cells.length
              });
            }
          } catch (e) {
            console.error(`Error parsing row ${idx}:`, e.message);
          }
        });
      } catch (e) {
        console.error('Error in page evaluate:', e.message);
      }
      
      return results;
    });
    
    console.log(`✅ Extracted ${games.length} team entries\n`);
    
    // Display results
    console.log('=== RAW DATA ===');
    games.forEach((g, idx) => {
      console.log(`${idx + 1}. ${g.team} - Spread: ${g.spread} (${g.spreadText})`);
    });
    
    // Group into games
    console.log('\n=== GROUPED INTO GAMES ===');
    const gamesList = [];
    for (let i = 0; i < games.length; i += 2) {
      if (i + 1 < games.length) {
        const awayTeam = games[i];
        const homeTeam = games[i + 1];
        
        const game = {
          awayTeam: awayTeam.team,
          homeTeam: homeTeam.team,
          awaySpread: awayTeam.spread,
          homeSpread: homeTeam.spread
        };
        
        gamesList.push(game);
        console.log(`Game ${gamesList.length}:`);
        console.log(`  ${game.awayTeam} (${game.awaySpread}) @ ${game.homeTeam} (${game.homeSpread})`);
      }
    }
    
    await browser.close();
    
    console.log(`\n✅ Total games: ${gamesList.length}`);
    
    if (gamesList.length > 0) {
      console.log('\n🎉 ESPN odds scraping is WORKING!');
    } else {
      console.log('\n⚠️  No games found - may need to adjust selectors');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (browser) await browser.close();
  }
}

testESPNOddsScraping();
