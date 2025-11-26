/**
 * Test the updated ESPN odds scraper
 */
import { getNBAGamesWithSpreads } from './src/utils/oddsApi.js';

async function testESPNOddsIntegration() {
  console.log('🧪 Testing ESPN odds integration (full flow)...\n');
  console.log('This will try ESPN first, then fallback to ActionNetwork/Covers if needed\n');
  
  try {
    const games = await getNBAGamesWithSpreads();
    
    console.log(`\n📊 RESULTS: ${games.length} games retrieved\n`);
    
    games.forEach((game, idx) => {
      const awayInfo = game.awayTeam.abbr || game.awayTeam.name || game.awayTeam;
      const homeInfo = game.homeTeam.abbr || game.homeTeam.name || game.homeTeam;
      const awaySpread = game.awaySpread || 'N/A';
      const homeSpread = game.homeSpread || 'N/A';
      
      console.log(`${idx + 1}. ${awayInfo} (${awaySpread}) @ ${homeInfo} (${homeSpread})`);
    });
    
    if (games.length > 0) {
      const gamesWithSpreads = games.filter(g => g.awaySpread !== null && g.homeSpread !== null);
      console.log(`\n✅ Retrieved ${games.length} games, ${gamesWithSpreads.length} with spreads`);
      console.log('🎉 ESPN odds integration working!');
    } else {
      console.log('\n⚠️  No games found');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }
}

testESPNOddsIntegration();

