import { getFormattedGamesForDate } from './src/utils/oddsApi.js';

const games = await getFormattedGamesForDate('2025-11-23');

console.log('\n=== GAMES WITH SPREADS ===\n');
games.forEach(g => {
  console.log(`${g.awayTeam} @ ${g.homeTeam}`);
  console.log(`  Spreads: Away ${g.spreadDisplay.away} | Home ${g.spreadDisplay.home}`);
  console.log(`  Bookmaker: ${g.bookmaker}`);
  console.log(`  Favored: ${g.favored || 'Even'}\n`);
});

console.log(`Total games: ${games.length}`);
