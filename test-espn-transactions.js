// Try ESPN's transactions
import fetch from 'node-fetch';

async function tryESPN() {
  const url = 'http://site.api.espn.com/apis/site/v2/sports/basketball/nba/transactions';
  
  console.log(`🔍 Trying ESPN API: ${url}`);
  
  try {
    const response = await fetch(url);
    console.log(`Status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Success!');
      console.log(JSON.stringify(data, null, 2).substring(0, 3000));
      
      // Save full response
      const fs = await import('fs');
      fs.writeFileSync('espn-transactions.json', JSON.stringify(data, null, 2));
      console.log('\n💾 Saved to espn-transactions.json');
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

tryESPN();
