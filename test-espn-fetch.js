import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function testESPNFetch() {
  console.log('Fetching ESPN odds page...');
  
  const response = await fetch('https://www.espn.com/nba/odds', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  
  const html = await response.text();
  console.log('HTML length:', html.length);
  
  const $ = cheerio.load(html);
  
  // Look for tables
  const tables = $('table');
  console.log(`\nFound ${tables.length} tables`);
  
  // Look for tbody rows
  const rows = $('tbody tr');
  console.log(`Found ${rows.length} tbody rows`);
  
  // Look for team names/links
  const teamLinks = $('a[href*="/nba/team/"]');
  console.log(`Found ${teamLinks.length} team links`);
  
  // Sample first few team links
  console.log('\n=== Sample Team Links ===');
  teamLinks.slice(0, 5).each((idx, el) => {
    const $el = $(el);
    console.log(`${idx}. ${$el.text()} - ${$el.attr('href')}`);
  });
  
  // Look for spread/odds patterns
  console.log('\n=== Looking for odds patterns ===');
  const text = $('body').text();
  const spreadPattern = text.match(/-?\d+\.5/g);
  if (spreadPattern) {
    console.log('Found spread patterns:', spreadPattern.slice(0, 10));
  }
  
  // Check if page is server-side rendered or client-side
  if (html.includes('window.__INITIAL_STATE__') || html.includes('window.__espnfitt__')) {
    console.log('\n⚠️  Page uses client-side rendering - may need Puppeteer');
  } else {
    console.log('\n✓ Page appears to have server-side content');
  }
}

testESPNFetch().catch(console.error);
