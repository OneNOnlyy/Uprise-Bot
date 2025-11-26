/**
 * Diagnose ESPN Bet odds page structure
 */
import puppeteer from 'puppeteer';
import fs from 'fs';

async function diagnoseESPNBet() {
  let browser;
  try {
    console.log('🔍 Diagnosing ESPN Bet Odds page structure...\n');
    
    browser = await puppeteer.launch({ 
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('📡 Loading ESPN Bet odds page...');
    await page.goto('https://www.espn.com/nba/odds', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait a bit for dynamic content
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Save full HTML
    const html = await page.content();
    fs.writeFileSync('espn-bet-odds.html', html);
    console.log('💾 HTML saved to: espn-bet-odds.html');
    
    // Get all text content with spread patterns
    const spreadsFound = await page.evaluate(() => {
      const spreads = [];
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      
      let node;
      while (node = walker.nextNode()) {
        const text = node.textContent.trim();
        // Look for spread patterns like -9.5, +3.5, etc.
        if (/^[+-]?\d+\.5$/.test(text)) {
          spreads.push({
            text: text,
            parent: node.parentElement?.className || 'unknown',
            html: node.parentElement?.outerHTML.substring(0, 200) || 'unknown'
          });
        }
      }
      return spreads;
    });
    
    console.log(`\n📊 Found ${spreadsFound.length} spread patterns ending in .5:\n`);
    spreadsFound.slice(0, 10).forEach((s, idx) => {
      console.log(`${idx + 1}. "${s.text}" in class: ${s.parent}`);
    });
    
    // Check for different table selectors
    const selectors = await page.evaluate(() => {
      return {
        'table': document.querySelectorAll('table').length,
        '.Table__TBODY': document.querySelectorAll('.Table__TBODY').length,
        '.Table__TR': document.querySelectorAll('.Table__TR').length,
        '[class*="Table"]': document.querySelectorAll('[class*="Table"]').length,
        '.competitors': document.querySelectorAll('.competitors').length,
        '[class*="competitor"]': document.querySelectorAll('[class*="competitor"]').length,
        '[class*="Odds"]': document.querySelectorAll('[class*="Odds"]').length,
        '.team-name': document.querySelectorAll('.team-name').length,
        'a': document.querySelectorAll('a').length
      };
    });
    
    console.log('\n🔍 Element counts by selector:');
    Object.entries(selectors).forEach(([sel, count]) => {
      console.log(`  ${sel}: ${count}`);
    });
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    await browser.close();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (browser) await browser.close();
  }
}

diagnoseESPNBet();
