import { fetchAllInjuryReports, getInjuriesForTeam } from './src/utils/espnApi.js';

async function test() {
  console.log('Testing Milwaukee Bucks and New York Knicks injuries...\n');
  
  try {
    // Fetch all injury reports
    const injuryReports = await fetchAllInjuryReports();
    
    // Get Bucks injuries
    console.log('\n========== MILWAUKEE BUCKS ==========');
    const bucksInjuries = getInjuriesForTeam('MIL', injuryReports);
    console.log(`Found ${bucksInjuries.length} injuries for Milwaukee Bucks:`);
    bucksInjuries.forEach(inj => {
      console.log(`  - ${inj.player} (${inj.status}): ${inj.description}`);
    });
    
    // Get Knicks injuries
    console.log('\n========== NEW YORK KNICKS ==========');
    const knicksInjuries = getInjuriesForTeam('NYK', injuryReports);
    console.log(`Found ${knicksInjuries.length} injuries for New York Knicks:`);
    knicksInjuries.forEach(inj => {
      console.log(`  - ${inj.player} (${inj.status}): ${inj.description}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

test();
