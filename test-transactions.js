import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function testTransactionsScraping() {
  try {
    const url = 'https://www.nba.com/players/transactions';
    
    console.log('🔍 Fetching NBA transactions page...');
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    if (!response.ok) {
      console.error(`❌ Failed: ${response.status}`);
      return;
    }
    
    const html = await response.text();
    console.log('\n📄 HTML Length:', html.length);
    
    // Save HTML to file for inspection
    const fs = await import('fs');
    fs.writeFileSync('transactions-page.html', html, 'utf8');
    console.log('✅ Saved HTML to transactions-page.html');
    
    const $ = cheerio.load(html);
    
    // Check for various class patterns
    console.log('\n🔍 Looking for transaction elements...');
    
    // Try to find any elements with "transaction" in class name
    const transactionElements = $('[class*="transaction" i], [class*="Transaction" i]');
    console.log(`Found ${transactionElements.length} elements with "transaction" in class`);
    
    // Try to find tables
    const tables = $('table');
    console.log(`Found ${tables.length} tables`);
    
    // Try to find specific structures
    const articles = $('article');
    console.log(`Found ${articles.length} articles`);
    
    // Check if it's a React/Next.js app with JSON data
    const scripts = $('script[type="application/json"]');
    console.log(`Found ${scripts.length} JSON scripts`);
    
    if (scripts.length > 0) {
      console.log('\n📊 Checking JSON data in scripts...');
      scripts.each((i, script) => {
        const content = $(script).html();
        if (content && content.includes('transaction')) {
          console.log(`Script ${i} contains transaction data (${content.length} chars)`);
          // Try to parse it
          try {
            const data = JSON.parse(content);
            console.log('Parsed JSON keys:', Object.keys(data));
          } catch (e) {
            console.log('Could not parse as JSON');
          }
        }
      });
    }
    
    // Check for __NEXT_DATA__ (Next.js apps)
    const nextData = $('#__NEXT_DATA__');
    if (nextData.length > 0) {
      console.log('\n🎯 Found __NEXT_DATA__!');
      const content = nextData.html();
      try {
        const data = JSON.parse(content);
        console.log('Next.js data structure:');
        console.log(JSON.stringify(data, null, 2).substring(0, 1000));
      } catch (e) {
        console.log('Could not parse Next.js data');
      }
    }
    
    // Look at the first 2000 characters to see structure
    console.log('\n📝 First 2000 characters of body:');
    console.log($('body').html().substring(0, 2000));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testTransactionsScraping();
