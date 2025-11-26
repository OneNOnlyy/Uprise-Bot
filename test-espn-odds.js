import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';

async function testESPNOdds() {
  try {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    console.log('Navigating to ESPN odds page...');
    await page.goto('https://www.espn.com/nba/odds', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const html = await page.content();
    await browser.close();
    
    console.log('Parsing with Cheerio...');
    const $ = cheerio.load(html);
    
    // Look for game rows
    console.log('\n=== Searching for odds tables ===');
    
    // Try different selectors
    const tables = $('table').length;
    console.log(`Found ${tables} tables`);
    
    const rows = $('tbody tr').length;
    console.log(`Found ${rows} tbody rows`);
    
    // Sample first few rows
    console.log('\n=== First 3 rows ===');
    $('tbody tr').slice(0, 3).each((idx, row) => {
      const $row = $(row);
      console.log(`\nRow ${idx}:`);
      console.log('Text:', $row.text().substring(0, 150));
      console.log('Cells:', $row.find('td').length);
    });
    
    // Look for team names
    console.log('\n=== Looking for team info ===');
    const teamLinks = $('a[href*="/nba/team/"]').slice(0, 5);
    teamLinks.each((idx, el) => {
      console.log(`Team ${idx}:`, $(el).text());
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testESPNOdds();
