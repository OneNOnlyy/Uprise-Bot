import puppeteer from 'puppeteer';
import fs from 'fs';

async function debugCBSStructure() {
  let browser;
  try {
    console.log('🌐 Loading CBS Sports odds page...\n');
    
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page.goto('https://www.cbssports.com/nba/odds', {
      waitUntil: 'networkidle0',
      timeout: 30000
    });
    
    // Wait a bit for dynamic content
    await page.waitForTimeout(3000);
    
    // Save the full HTML
    const html = await page.content();
    fs.writeFileSync('cbs-odds-page.html', html);
    console.log('✅ Saved HTML to cbs-odds-page.html\n');
    
    // Get all table rows
    const rows = await page.evaluate(() => {
      const allRows = document.querySelectorAll('tr, [class*="TableBase-bodyTr"], [class*="row"]');
      return Array.from(allRows).slice(0, 30).map((row, index) => ({
        index,
        tagName: row.tagName,
        className: row.className,
        innerHTML: row.innerHTML.substring(0, 500)
      }));
    });
    
    console.log(`Found ${rows.length} rows:\n`);
    rows.forEach(row => {
      console.log(`Row ${row.index} (${row.tagName}):`);
      console.log(`  Class: ${row.className}`);
      console.log(`  HTML: ${row.innerHTML}\n`);
    });
    
    // Look for spread values specifically
    console.log('\n📊 Looking for spread patterns...\n');
    const spreads = await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      const spreadPatterns = [];
      
      allElements.forEach((el, index) => {
        const text = el.textContent?.trim();
        if (text && /^[+-]?\d+\.?\d*$/.test(text)) {
          const num = parseFloat(text);
          if (!isNaN(num) && Math.abs(num) < 50 && Math.abs(num) > 0) {
            spreadPatterns.push({
              index,
              text,
              tagName: el.tagName,
              className: el.className,
              parent: el.parentElement?.tagName,
              parentClass: el.parentElement?.className
            });
          }
        }
      });
      
      return spreadPatterns.slice(0, 50);
    });
    
    console.log(`Found ${spreads.length} potential spread values:\n`);
    spreads.forEach(spread => {
      console.log(`  ${spread.text} - <${spread.tagName}> class="${spread.className}"`);
      console.log(`    Parent: <${spread.parent}> class="${spread.parentClass}"\n`);
    });
    
    await browser.close();
  } catch (error) {
    console.error('❌ Error:', error);
    if (browser) await browser.close();
  }
}

debugCBSStructure();
