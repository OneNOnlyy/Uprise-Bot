import puppeteer from 'puppeteer';
import fs from 'fs';

async function saveCBSPage() {
  let browser;
  try {
    console.log('🌐 Loading CBS Sports odds page...');
    
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    console.log('📡 Navigating to page...');
    await page.goto('https://www.cbssports.com/nba/odds', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    console.log('⏳ Waiting for content to load...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('💾 Saving HTML...');
    const html = await page.content();
    fs.writeFileSync('cbs-odds-page.html', html);
    console.log(`✅ Saved ${html.length} bytes to cbs-odds-page.html`);
    
    await browser.close();
    console.log('✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (browser) await browser.close();
  }
}

saveCBSPage();
