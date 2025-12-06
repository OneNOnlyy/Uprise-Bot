import { getTeamInfo } from './src/utils/espnApi.js';

async function testBulls() {
  console.log('Testing Chicago Bulls injury data...\n');
  
  const teamInfo = await getTeamInfo('Chicago Bulls');
  
  console.log('\n=== FINAL RESULT ===');
  console.log(`Team: ${teamInfo?.name}`);
  console.log(`Record: ${teamInfo?.record}`);
  console.log(`Injuries Count: ${teamInfo?.injuries?.length || 0}\n`);
  
  if (teamInfo?.injuries?.length > 0) {
    console.log('Injuries:');
    teamInfo.injuries.forEach(inj => {
      console.log(`  • ${inj.player} - ${inj.status} (${inj.description})`);
      if (inj.comment) {
        console.log(`    Comment: ${inj.comment}`);
      }
      if (inj.updated) {
        console.log(`    Return: ${inj.updated}`);
      }
    });
  }
}

testBulls().catch(console.error);
