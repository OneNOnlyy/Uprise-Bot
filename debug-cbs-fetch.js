import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function debugCBSCompact() {
  const url = 'https://www.cbssports.com/nba/scoreboard/?layout=compact';
  
  console.log('Fetching CBS compact layout with fetch...');
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response ok:', response.ok);
    
    if (!response.ok) {
      console.error('Failed to fetch');
      return;
    }
    
    const html = await response.text();
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
    
    console.log('\n=== First 1000 chars of HTML ===');
    console.log(html.substring(0, 1000));
    
    console.log('\n=== Looking for team abbreviations in HTML ===');
    const hasTeams = html.match(/\b[A-Z]{2,3}\s+\d+\b/g);
    if (hasTeams) {
      console.log('Found team patterns:', hasTeams.slice(0, 10));
    } else {
      console.log('No team patterns found');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugCBSCompact();