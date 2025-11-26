// Let's try the NBA's stats API directly
import fetch from 'node-fetch';

async function tryNBAAPIs() {
  // Try various NBA API endpoints
  const endpoints = [
    'https://stats.nba.com/stats/transactions',
    'https://cdn.nba.com/static/json/transactions.json',
    'https://data.nba.com/data/10s/v2015/json/mobile_teams/nba/2024/transactions.json',
    'https://www.nba.com/stats/transactions',
    'https://www.nba.com/api/transactions',
  ];
  
  for (const url of endpoints) {
    try {
      console.log(`\n🔍 Trying: ${url}`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/html',
          'Referer': 'https://www.nba.com/players/transactions'
        }
      });
      
      console.log(`Status: ${response.status}`);
      
      if (response.ok) {
        const text = await response.text();
        console.log(`✅ Success! Length: ${text.length}`);
        console.log('First 500 chars:', text.substring(0, 500));
        
        // Try to parse as JSON
        try {
          const json = JSON.parse(text);
          console.log('JSON keys:', Object.keys(json));
        } catch (e) {
          console.log('Not JSON, HTML response');
        }
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }
}

tryNBAAPIs();
