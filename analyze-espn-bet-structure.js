/**
 * Better diagnose ESPN Bet structure - find how teams and spreads are related
 */
import puppeteer from 'puppeteer';

async function analyzeStructure() {
  let browser;
  try {
    console.log('🔍 Analyzing ESPN Bet page structure...\n');
    
    browser = await puppeteer.launch({ 
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    await page.goto('https://www.espn.com/nba/odds', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Analyze structure of first few games
    const structure = await page.evaluate(() => {
      const games = [];
      const teamLinks = document.querySelectorAll('a[data-clubhouse-uid]');
      
      // Look at the first 4 team links (2 games)
      for (let i = 0; i < Math.min(4, teamLinks.length); i++) {
        const link = teamLinks[i];
        const teamName = link.querySelector('span')?.textContent;
        
        // Find nearest spread element
        let parent = link.parentElement;
        let depth = 0;
        let spread = null;
        
        // Walk up the DOM tree looking for spread
        while (parent && depth < 10) {
          const spreadEl = parent.querySelector('.FTMw.FuEs');
          if (spreadEl) {
            spread = spreadEl.textContent.trim();
            break;
          }
          parent = parent.parentElement;
          depth++;
        }
        
        // Also check siblings
        const row = link.closest('[class*="flex"]');
        if (row) {
          const spreadsInRow = Array.from(row.querySelectorAll('.FTMw.FuEs')).map(el => el.textContent.trim());
          games.push({
            index: i,
            team: teamName,
            spreadInRow: spreadsInRow,
            nearestSpread: spread
          });
        }
      }
      
      return games;
    });
    
    console.log('First 4 teams and their spreads:');
    structure.forEach(s => {
      console.log(`\n${s.index}. ${s.team}`);
      console.log(`   Spreads in row: [${s.spreadInRow.join(', ')}]`);
      console.log(`   Nearest spread: ${s.nearestSpread}`);
    });
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    await browser.close();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (browser) await browser.close();
  }
}

analyzeStructure();
