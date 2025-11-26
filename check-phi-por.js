import { fetchAllInjuryReports } from './src/utils/espnApi.js';

async function checkPHIandPOR() {
  console.log('Checking PHI and POR injuries...\n');
  
  const injuries = await fetchAllInjuryReports();
  
  console.log('\n=== PHILADELPHIA 76ERS (PHI) ===');
  const phiInjuries = injuries.get('PHI') || [];
  phiInjuries.forEach(inj => {
    console.log(`  ${inj.player} - ${inj.status} (${inj.description})`);
  });
  
  console.log('\n=== PORTLAND TRAIL BLAZERS (POR) ===');
  const porInjuries = injuries.get('POR') || [];
  porInjuries.forEach(inj => {
    console.log(`  ${inj.player} - ${inj.status} (${inj.description})`);
  });
}

checkPHIandPOR();
