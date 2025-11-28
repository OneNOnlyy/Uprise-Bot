import { fetchAllInjuryReports, getInjuriesForTeam } from './src/utils/espnApi.js';

async function test() {
  console.log('Testing Washington Wizards injuries from ESPN Injuries Page...\n');
  
  try {
    // Fetch all injury reports
    const injuryReports = await fetchAllInjuryReports();
    
    // Get Washington Wizards injuries
    const injuries = getInjuriesForTeam('WAS', injuryReports);
    
    console.log('\n✓ Result:', injuries);
    console.log(`\nFound ${injuries.length} injuries for Washington Wizards`);
    
    if (injuries.length > 0) {
      injuries.forEach(inj => {
        console.log(`- ${inj.player} (${inj.status}): ${inj.description || 'No description'}`);
        if (inj.comment) console.log(`  Comment: ${inj.comment}`);
        if (inj.updated) console.log(`  Est. Return: ${inj.updated}`);
      });
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

test();
