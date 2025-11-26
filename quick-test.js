import { fetchCBSSportsScores } from './src/utils/oddsApi.js';

async function quickTest() {
  console.log('Testing CBS function...');
  const games = await fetchCBSSportsScores();
  console.log('Found', games.length, 'games');
  games.slice(0, 3).forEach(g => console.log(`${g.awayTeam} @ ${g.homeTeam} - ${g.status}`));
}

quickTest();