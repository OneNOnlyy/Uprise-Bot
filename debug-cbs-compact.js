import https from 'https';
import * as cheerio from 'cheerio';

async function debugCBSCompact() {
  const url = 'https://www.cbssports.com/nba/scoreboard/?layout=compact';
  
  console.log('Fetching CBS compact layout...');
  
  const html = await new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    });
    
    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Timeout'));
    });
  });
  
  console.log('HTML length:', html.length);
  
  const $ = cheerio.load(html);
  
  console.log('\n=== Looking for game tables ===');
  console.log('.in-progress-table rows:', $('.in-progress-table tr').length);
  console.log('.final-table rows:', $('.final-table tr').length);
  
  console.log('\n=== Looking for any tables ===');
  console.log('All tables:', $('table').length);
  
  console.log('\n=== Checking for specific classes ===');
  console.log('.live-update:', $('.live-update').length);
  console.log('.game:', $('.game').length);
  console.log('[class*="game"]:', $('[class*="game"]').length);
  console.log('[class*="score"]:', $('[class*="score"]').length);
  
  console.log('\n=== First 500 chars of body text ===');
  console.log($('body').text().substring(0, 500));
  
  console.log('\n=== Looking for team abbreviations in HTML ===');
  const hasTeams = html.match(/\b[A-Z]{2,3}\s+\d+\b/g);
  if (hasTeams) {
    console.log('Found team patterns:', hasTeams.slice(0, 10));
  } else {
    console.log('No team patterns found');
  }
}

debugCBSCompact().catch(console.error);