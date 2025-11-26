import fetch from 'node-fetch';

async function testRosterAPI() {
  const teams = ['atl', 'was', 'lal', 'bos'];
  
  for (const team of teams) {
    const url = `http://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${team}/roster`;
    console.log(`\n🔍 Testing: ${url}`);
    
    try {
      const response = await fetch(url);
      console.log(`Status: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Response keys:', Object.keys(data));
        
        if (data.athletes) {
          console.log(`Athletes groups: ${data.athletes.length}`);
          
          let totalPlayers = 0;
          for (const group of data.athletes) {
            console.log(`  Position: ${group.position}, Items: ${group.items?.length || 0}`);
            totalPlayers += group.items?.length || 0;
          }
          console.log(`Total players: ${totalPlayers}`);
          
          // Show first player as example
          if (data.athletes[0]?.items?.[0]) {
            console.log('Example player:', JSON.stringify(data.athletes[0].items[0], null, 2).substring(0, 500));
          }
        } else {
          console.log('No athletes array found');
          console.log('Data structure:', JSON.stringify(data, null, 2).substring(0, 1000));
        }
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
  }
}

testRosterAPI();
