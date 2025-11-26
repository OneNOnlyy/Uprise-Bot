/**
 * Diagnostic script to examine ESPN odds page structure
 */
import puppeteer from 'puppeteer';
import fs from 'fs';

async function diagnoseESPNPage() {
  let browser;
  try {
    console.log('🔍 Diagnosing ESPN odds page structure...\n');
    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    console.log('Loading page...');
    await page.goto('https://www.espn.com/nba/odds', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Save screenshot
    await page.screenshot({ path: 'espn-odds-screenshot.png', fullPage: true });
    console.log('✅ Screenshot saved to espn-odds-screenshot.png\n');
    
    // Get page info
    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        tables: document.querySelectorAll('table').length,
        tbodyRows: document.querySelectorAll('tbody tr').length,
        allRows: document.querySelectorAll('tr').length,
        teamLinks: document.querySelectorAll('a[href*="/nba/team/"]').length,
        // Get first few visible text elements that might contain team names
        sampleText: Array.from(document.querySelectorAll('body *'))
          .filter(el => el.children.length === 0 && el.textContent.trim().length > 0)
          .slice(0, 50)
          .map(el => ({
            tag: el.tagName,
            text: el.textContent.trim().substring(0, 50),
            classes: el.className
          }))
      };
    });
    
    console.log('=== PAGE INFO ===');
    console.log(`Title: ${pageInfo.title}`);
    console.log(`URL: ${pageInfo.url}`);
    console.log(`Tables: ${pageInfo.tables}`);
    console.log(`Tbody Rows: ${pageInfo.tbodyRows}`);
    console.log(`All Rows: ${pageInfo.allRows}`);
    console.log(`Team Links: ${pageInfo.teamLinks}`);
    
    console.log('\n=== SAMPLE TEXT ELEMENTS ===');
    pageInfo.sampleText.forEach((item, idx) => {
      if (idx < 30 && (item.text.includes('Pistons') || item.text.includes('Lakers') || 
          item.text.includes('-') || item.text.match(/\d+\.5/))) {
        console.log(`${idx}. <${item.tag}> "${item.text}" (${item.classes})`);
      }
    });
    
    // Save HTML
    const html = await page.content();
    fs.writeFileSync('espn-odds-page.html', html);
    console.log('\n✅ Full HTML saved to espn-odds-page.html');
    
    // Look for specific patterns
    console.log('\n=== LOOKING FOR ODDS PATTERNS ===');
    const oddsPatterns = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const spreads = bodyText.match(/-?\d+\.5/g) || [];
      const teamMentions = bodyText.match(/(Lakers|Celtics|Warriors|Pistons|Heat)/g) || [];
      
      return {
        spreadCount: spreads.length,
        sampleSpreads: spreads.slice(0, 10),
        teamCount: teamMentions.length,
        sampleTeams: teamMentions.slice(0, 10)
      };
    });
    
    console.log(`Spread patterns found: ${oddsPatterns.spreadCount}`);
    console.log(`Samples: ${oddsPatterns.sampleSpreads.join(', ')}`);
    console.log(`Team mentions: ${oddsPatterns.teamCount}`);
    console.log(`Samples: ${oddsPatterns.sampleTeams.join(', ')}`);
    
    await browser.close();
    console.log('\n✅ Diagnostic complete!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (browser) await browser.close();
  }
}

diagnoseESPNPage();
