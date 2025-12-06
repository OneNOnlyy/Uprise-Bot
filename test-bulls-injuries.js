import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function testBullsInjuries() {
  const url = 'https://www.espn.com/nba/injuries';
  console.log(`Fetching ${url}...`);
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Cache-Control': 'no-cache'
    }
  });
  
  if (!response.ok) {
    console.error(`Failed: ${response.status}`);
    return;
  }
  
  const html = await response.text();
  const $ = cheerio.load(html);
  
  // Find Bulls table
  const allTables = $('table, div[class*="Table"]');
  console.log(`Found ${allTables.length} tables`);
  
  let bullsTable = null;
  
  allTables.each((idx, table) => {
    const $table = $(table);
    const headerText = $table.find('h1, h2, h3, h4, h5, h6, div[class*="Header"], div[class*="Title"]').first().text().trim();
    
    if (headerText.toLowerCase().includes('chicago') || headerText.toLowerCase().includes('bulls')) {
      console.log(`\n✓ Found Bulls table (table ${idx})`);
      console.log(`Header: "${headerText}"\n`);
      bullsTable = $table;
      
      // Parse rows
      const rows = $table.find('tr, div[class*="Row"]').toArray();
      console.log(`Found ${rows.length} rows\n`);
      
      rows.forEach((row, rowIdx) => {
        const $row = $(row);
        let cells = $row.find('td');
        if (cells.length === 0) {
          cells = $row.find('div[class*="Cell"]');
        }
        
        console.log(`Row ${rowIdx}: ${cells.length} cells`);
        
        if (cells.length >= 5) {
          const playerName = $(cells.eq(0)).text().trim();
          const col1 = $(cells.eq(1)).text().trim();
          const col2 = $(cells.eq(2)).text().trim();
          const col3 = $(cells.eq(3)).text().trim();
          const col4 = $(cells.eq(4)).text().trim();
          
          console.log(`  [0] Name: "${playerName}"`);
          console.log(`  [1] Col1: "${col1}"`);
          console.log(`  [2] Col2: "${col2}"`);
          console.log(`  [3] Col3: "${col3}"`);
          console.log(`  [4] Col4: "${col4}"`);
          console.log('');
        }
      });
      
      return false; // Stop searching
    }
  });
  
  if (!bullsTable) {
    console.log('Bulls table not found');
  }
}

testBullsInjuries().catch(console.error);
