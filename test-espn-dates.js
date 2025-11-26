import { getESPNGamesForDate } from './src/utils/oddsApi.js';

async function testDates() {
  console.log('Testing ESPN API with different dates:\n');
  
  const today = new Date();
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    
    console.log(`\n=== Day ${i}: ${dateStr} ===`);
    const games = await getESPNGamesForDate(dateStr);
    console.log(`Found ${games.length} games`);
    if (games.length > 0) {
      games.forEach((g, idx) => {
        console.log(`  ${idx + 1}. ${g.awayTeam} @ ${g.homeTeam} - ${new Date(g.commenceTime).toLocaleString()}`);
      });
    }
  }
}

testDates();
