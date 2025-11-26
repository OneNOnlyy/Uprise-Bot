import fetch from 'node-fetch';
import fs from 'fs';

async function inspectRosterStructure() {
  const url = `http://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/lal/roster`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    // Save to file for inspection
    fs.writeFileSync('roster-response.json', JSON.stringify(data, null, 2));
    console.log('✅ Saved full response to roster-response.json');
    
    // Check the athletes structure
    console.log('\n📊 Athlete structure:');
    if (data.athletes && data.athletes.length > 0) {
      const firstAthlete = data.athletes[0];
      console.log('First athlete group keys:', Object.keys(firstAthlete));
      console.log('Position:', firstAthlete.position);
      console.log('Items:', firstAthlete.items);
      
      // Maybe the players are directly in the athletes array?
      console.log('\nFirst few athletes entries:');
      console.log(JSON.stringify(data.athletes.slice(0, 3), null, 2));
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

inspectRosterStructure();
