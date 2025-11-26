import fetch from 'node-fetch';

// Test CBS Sports API for live scores
async function testCBSAPI() {
  try {
    // CBS uses game IDs in format: NBA_YYYYMMDD_AWAY@HOME
    const today = '20251123';
    const gameId = `NBA_${today}_ORL@BOS`; // Orlando @ Boston
    
    // Try CBS API endpoints
    const endpoints = [
      `https://www.cbssports.com/nba/gametracker/live/NBA_${today}_ORL@BOS`,
      `https://api.cbssports.com/fantasy/stats/nba/game/${gameId}`,
      `https://www.cbssports.com/nba/live/game/NBA_${today}_ORL@BOS`,
      `https://www.cbssports.com/api/live/v3/nba/scoreboard/${today}`,
      `https://api.cbssports.com/api/v1/gametracker/nba/${gameId}`,
    ];
    
    for (const url of endpoints) {
      console.log(`\n🔍 Trying: ${url}`);
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, text/html'
          }
        });
        
        console.log(`   Status: ${response.status}`);
        
        if (response.ok) {
          const contentType = response.headers.get('content-type');
          console.log(`   Content-Type: ${contentType}`);
          
          if (contentType && contentType.includes('json')) {
            const data = await response.json();
            console.log(`   ✅ JSON Response:`, JSON.stringify(data).substring(0, 200));
          } else {
            const text = await response.text();
            console.log(`   ✅ Text Response (${text.length} chars):`, text.substring(0, 150));
          }
        }
      } catch (err) {
        console.log(`   ❌ Error: ${err.message}`);
      }
    }
    
    // Try the scoreboard endpoint with different formats
    console.log('\n\n🏀 Trying scoreboard endpoints:');
    const scoreboardEndpoints = [
      'https://www.cbssports.com/nba/scoreboard/json',
      `https://www.cbssports.com/nba/scoreboard/${today}`,
      'https://www.cbssports.com/api/nba/scoreboard',
    ];
    
    for (const url of scoreboardEndpoints) {
      console.log(`\n🔍 Trying: ${url}`);
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/json'
          }
        });
        
        console.log(`   Status: ${response.status}`);
        if (response.ok) {
          const text = await response.text();
          console.log(`   ✅ Response (${text.length} chars):`, text.substring(0, 200));
        }
      } catch (err) {
        console.log(`   ❌ Error: ${err.message}`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testCBSAPI();
