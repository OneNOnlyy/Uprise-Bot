/**
 * Detailed analysis of ESPN Bet page to find ONLY the Spread column
 */
import puppeteer from 'puppeteer';

async function analyzeColumns() {
  let browser;
  try {
    console.log('🔍 Analyzing ESPN Bet page columns...\n');
    
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
    
    // Find column headers and spreads
    const analysis = await page.evaluate(() => {
      // Find all column headers
      const headers = Array.from(document.querySelectorAll('th, [role="columnheader"]'))
        .map(el => el.textContent.trim())
        .filter(Boolean);
      
      console.log('Column headers found:', headers);
      
      // Count total games (team links / 2)
      const teamLinks = document.querySelectorAll('a[data-clubhouse-uid]');
      const totalGames = teamLinks.length / 2;
      
      // Count spreads with .5
      const allSpreads = Array.from(document.querySelectorAll('.FTMw.FuEs'))
        .map(el => el.textContent.trim());
      
      const spreadsEndingInHalf = allSpreads.filter(s => /^[+-]?\d+\.5$/.test(s));
      
      // Try to find which spreads are under "Spread" column
      // Look for header that says "Spread" or similar
      const spreadHeader = Array.from(document.querySelectorAll('th, [role="columnheader"]'))
        .find(el => el.textContent.trim().toLowerCase().includes('spread'));
      
      let spreadColumnIndex = -1;
      if (spreadHeader) {
        // Find the index of this column
        const allHeaders = Array.from(document.querySelectorAll('th, [role="columnheader"]'));
        spreadColumnIndex = allHeaders.indexOf(spreadHeader);
      }
      
      return {
        headers,
        totalGames,
        totalTeamLinks: teamLinks.length,
        allSpreadsCount: allSpreads.length,
        spreadsEndingInHalfCount: spreadsEndingInHalf.length,
        spreadColumnIndex,
        allSpreads: allSpreads.slice(0, 30),
        spreadsEndingInHalf: spreadsEndingInHalf.slice(0, 30)
      };
    });
    
    console.log('\n📊 Analysis Results:');
    console.log(`Column headers: ${analysis.headers.join(' | ')}`);
    console.log(`\nTotal team links: ${analysis.totalTeamLinks}`);
    console.log(`Expected games: ${analysis.totalGames}`);
    console.log(`\nAll spreads found: ${analysis.allSpreadsCount}`);
    console.log(`Spreads ending in .5: ${analysis.spreadsEndingInHalfCount}`);
    console.log(`Spread column index: ${analysis.spreadColumnIndex}`);
    
    console.log(`\nAll spreads (first 30): ${analysis.allSpreads.join(', ')}`);
    console.log(`\nSpreads ending in .5 (first 30): ${analysis.spreadsEndingInHalf.join(', ')}`);
    
    await new Promise(resolve => setTimeout(resolve, 10000));
    await browser.close();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (browser) await browser.close();
  }
}

analyzeColumns();
