import { fetchCBSSportsScores } from './src/utils/oddsApi.js';

// Test CBS Sports score fetching
async function testCBSIntegration() {
  try {
    console.log('🧪 Testing CBS Sports score integration...\n');
    
    // Test with dates that might have NBA games
    const testDates = [new Date().toISOString().split('T')[0], '2024-10-22', '2024-10-23', '2024-10-24', '2024-10-25', '2024-10-26'];
    let games = [];
    let testDate = '';

    for (const date of testDates) {
      console.log(`Testing for date: ${date}`);
      games = await fetchCBSSportsScores(date);
      if (games.length > 0) {
        testDate = date;
        break;
      }
    }

    if (games.length === 0) {
      console.log('❌ No games found for any test dates');
      return;
    }

    console.log(`\n✅ Successfully fetched ${games.length} games for ${testDate}:\n`);
    
    games.forEach((game, idx) => {
      console.log(`${idx + 1}. ${game.awayTeam} ${game.awayScore || '-'} @ ${game.homeTeam} ${game.homeScore || '-'}`);
      console.log(`   Status: ${game.status}`);
      console.log(`   Final: ${game.isFinal}, Live: ${game.isLive}\n`);
    });
    
    // Test score matching
    console.log('\n📊 Testing score data quality:');
    const gamesWithScores = games.filter(g => g.awayScore !== null && g.homeScore !== null);
    const finalGames = games.filter(g => g.isFinal);
    const liveGames = games.filter(g => g.isLive);
    
    console.log(`  Games with scores: ${gamesWithScores.length}/${games.length}`);
    console.log(`  Final games: ${finalGames.length}`);
    console.log(`  Live games: ${liveGames.length}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testCBSIntegration();
