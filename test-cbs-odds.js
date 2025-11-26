import { scrapeCBSSportsOdds } from './src/utils/oddsApi.js';

async function testCBSSportsOdds() {
  console.log('🧪 Testing CBS Sports Odds Scraper...\n');
  
  try {
    const spreads = await scrapeCBSSportsOdds();
    
    if (spreads.length === 0) {
      console.error('❌ No spreads returned');
      return;
    }
    
    console.log(`✅ Found ${spreads.length} games with spreads:\n`);
    
    spreads.forEach((game, index) => {
      console.log(`Game ${index + 1}:`);
      console.log(`  Away: ${game.awayTeam} ${game.awaySpread}`);
      console.log(`  Home: ${game.homeTeam} ${game.homeSpread}`);
      console.log('');
    });
    
    // Verify spreads are opposite signs
    const invalidGames = spreads.filter(game => {
      const awaySign = game.awaySpread >= 0 ? '+' : '-';
      const homeSign = game.homeSpread >= 0 ? '+' : '-';
      return awaySign === homeSign && game.awaySpread !== 0 && game.homeSpread !== 0;
    });
    
    if (invalidGames.length > 0) {
      console.warn('⚠️ Warning: Some games have matching signs (should be opposite):');
      invalidGames.forEach(game => {
        console.warn(`  ${game.awayTeam} ${game.awaySpread} / ${game.homeTeam} ${game.homeSpread}`);
      });
    }
    
    // Check for half-point spreads (.5 endings)
    const halfPointSpreads = spreads.filter(game => 
      game.awaySpread % 1 !== 0 || game.homeSpread % 1 !== 0
    );
    
    console.log(`\n📊 Stats:`);
    console.log(`  Total games: ${spreads.length}`);
    console.log(`  Games with .5 spreads: ${halfPointSpreads.length}`);
    console.log(`  Invalid spreads: ${invalidGames.length}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testCBSSportsOdds();
