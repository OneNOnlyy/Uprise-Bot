import { getFormattedGamesForDate } from './src/utils/oddsApi.js';

async function testClippers() {
  console.log('Testing LA Clippers spread...\n');
  
  const games = await getFormattedGamesForDate('2025-11-23');
  
  // Find Clippers game
  const clippers = games.find(g => 
    g.homeTeam.toLowerCase().includes('clippers') || 
    g.awayTeam.toLowerCase().includes('clippers')
  );
  
  console.log('\n📊 Clippers game data:');
  console.log(JSON.stringify(clippers, null, 2));
  
  console.log('\n✅ All games:');
  games.forEach(g => {
    console.log(`${g.awayTeam} @ ${g.homeTeam}: Spread ${g.spread || 'MISSING'}`);
  });
}

testClippers();
