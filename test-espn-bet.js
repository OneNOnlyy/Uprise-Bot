/**
 * Test ESPN Bet odds scraper
 */
import puppeteer from 'puppeteer';

async function testESPNBetScraper() {
  let browser;
  try {
    console.log('🧪 Testing ESPN Bet Odds scraper...\n');
    console.log('🌐 Scraping NBA odds from ESPN Bet Odds page...');
    
    browser = await puppeteer.launch({ 
      headless: false, // Set to false to see what's happening
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('📡 Loading ESPN Bet odds page...');
    await page.goto('https://www.espn.com/nba/odds', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait for the odds table to load
    await page.waitForSelector('.odds__table, [class*="Table"]', { timeout: 10000 }).catch(() => {
      console.warn('No odds table found on ESPN Bet page');
    });
    
    // Take a screenshot
    await page.screenshot({ path: 'espn-bet-odds-page.png', fullPage: true });
    console.log('📸 Screenshot saved: espn-bet-odds-page.png');
    
    // Log all table elements found
    const tableInfo = await page.evaluate(() => {
      return {
        tables: document.querySelectorAll('table').length,
        tableRows: document.querySelectorAll('.Table__TR, tr[class*="Table"]').length,
        teamLinks: document.querySelectorAll('.Table__Team, [class*="TeamName"], a[class*="AnchorLink"]').length
      };
    });
    
    console.log('\n📊 Page structure:');
    console.log(`  Tables found: ${tableInfo.tables}`);
    console.log(`  Table rows: ${tableInfo.tableRows}`);
    console.log(`  Team links: ${tableInfo.teamLinks}`);
    
    // Extract odds data
    const games = await page.evaluate(() => {
      const gamesList = [];
      
      // Find the "Today" section or first table only
      let container = document.body;
      const todaySection = Array.from(document.querySelectorAll('*')).find(el => 
        el.textContent.includes('Today') && el.querySelector('a[data-clubhouse-uid]')
      );
      if (todaySection) {
        container = todaySection;
        console.log('Found Today section!');
      } else {
        console.log('No Today section found, using full page');
      }
      
      // Get all team names in order (limit to first 20 for 10 games max)
      const teamLinks = Array.from(container.querySelectorAll('a[data-clubhouse-uid]')).slice(0, 20);
      const teams = teamLinks.map(link => link.querySelector('span')?.textContent?.trim()).filter(Boolean);
      
      // Get all spread elements from the same container
      const spreadElements = Array.from(container.querySelectorAll('.FTMw.FuEs'));
      const allSpreads = spreadElements.map(el => el.textContent.trim());
      
      // Filter to only spreads ending in .5 (ESPN BET format - avoids pushes)
      const spreadsWithHalf = allSpreads.filter(text => /^[+-]?\d+\.5$/.test(text));
      
      console.log(`Found ${teams.length} teams and ${spreadsWithHalf.length} spreads ending in .5`);
      console.log(`First 20 spreads ending in .5: ${spreadsWithHalf.slice(0, 20).join(', ')}`);
      
      // Limit to first 20 spreads for 10 games
      const spreadsLimited = spreadsWithHalf.slice(0, 20);
      
      // ESPN shows OPEN and SPREAD columns - take every other starting from index 1
      // Pattern: [away_open, away_spread, home_open, home_spread, ...]
      const spreadColumnOnly = spreadsLimited.filter((_, index) => index % 2 === 1);
      
      console.log(`Spread column only (odd indices): ${spreadColumnOnly.join(', ')}`);
      
      // Match teams with spreads (every 2 teams = 1 game, every 2 spreads = 1 game)
      const numGames = Math.min(Math.floor(teams.length / 2), Math.floor(spreadColumnOnly.length / 2));
      
      console.log(`Matching ${numGames} games...`);
      
      for (let i = 0; i < numGames; i++) {
        const awayTeam = teams[i * 2];
        const homeTeam = teams[i * 2 + 1];
        const awaySpread = parseFloat(spreadColumnOnly[i * 2]);
        const homeSpread = parseFloat(spreadColumnOnly[i * 2 + 1]);
        
        if (i < 3) {
          console.log(`Game ${i + 1}: ${awayTeam} (${awaySpread}) @ ${homeTeam} (${homeSpread})`);
        }
        
        if (awayTeam && homeTeam && !isNaN(awaySpread) && !isNaN(homeSpread)) {
          gamesList.push({
            awayTeam,
            awaySpread,
            homeTeam,
            homeSpread
          });
        }
      }
      
      return gamesList;
    });
    
    console.log(`\n✅ Scraped ${games.length} games with spreads from ESPN Bet odds\n`);
    
    if (games.length > 0) {
      console.log('📋 Games found:');
      games.forEach((game, idx) => {
        console.log(`${idx + 1}. ${game.awayTeam} (${game.awaySpread}) @ ${game.homeTeam} (${game.homeSpread})`);
      });
    } else {
      console.log('⚠️ No games found - check the screenshot and page structure');
    }
    
    // Wait a bit before closing so you can see the page
    await new Promise(resolve => setTimeout(resolve, 3000));
    await browser.close();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (browser) await browser.close();
  }
}

testESPNBetScraper();
