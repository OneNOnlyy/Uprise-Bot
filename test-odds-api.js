/**
 * Quick test of Odds API integration
 */
import { getNBAGamesWithSpreads } from './src/utils/oddsApi.js';

async function testOddsAPI() {
  console.log('🧪 Testing Odds API integration...\n');
  
  try {
    const games = await getNBAGamesWithSpreads();
    
    console.log(`\n📊 Found ${games.length} games\n`);
    
    if (games.length > 0) {
      console.log('First game structure:');
      console.log(JSON.stringify(games[0], null, 2));
      
      console.log('\n\nAll games:');
      games.forEach((game, idx) => {
        // Handle both string and object formats
        const away = typeof game.awayTeam === 'string' ? game.awayTeam : (game.awayTeam?.abbr || game.awayTeam?.name || 'Unknown');
        const home = typeof game.homeTeam === 'string' ? game.homeTeam : (game.homeTeam?.abbr || game.homeTeam?.name || 'Unknown');
        
        console.log(`${idx + 1}. ${away} (${game.awaySpread || 'N/A'}) @ ${home} (${game.homeSpread || 'N/A'})`);
      });
      
      const gamesWithSpreads = games.filter(g => g.awaySpread !== null && g.homeSpread !== null && g.awaySpread !== 0);
      console.log(`\n✅ ${games.length} games total, ${gamesWithSpreads.length} with spreads`);
    } else {
      console.log('⚠️ No games found');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testOddsAPI();
