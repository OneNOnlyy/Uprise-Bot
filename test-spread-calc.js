// Test spread calculation logic
// This simulates the exact calculation in patsData.js

console.log('=== SPREAD CALCULATION TEST ===\n');

// Simulate Pistons @ Bucks game
const game = {
  id: 'test-game-1',
  awayTeam: 'Detroit Pistons',
  homeTeam: 'Milwaukee Bucks',
  awaySpread: -9,
  homeSpread: 9
};

// Final score: Pistons 129, Bucks 116
const result = {
  awayScore: 129,
  homeScore: 116,
  status: 'Final'
};

// User picked Away (Pistons)
const pick = {
  gameId: 'test-game-1',
  pick: 'away',
  isDoubleDown: false
};

console.log('📊 Game Info:');
console.log(`   ${game.awayTeam} @ ${game.homeTeam}`);
console.log(`   Away Spread: ${game.awaySpread}`);
console.log(`   Home Spread: ${game.homeSpread}`);
console.log('');

console.log('🏀 Final Score:');
console.log(`   ${game.awayTeam}: ${result.awayScore}`);
console.log(`   ${game.homeTeam}: ${result.homeScore}`);
console.log(`   Margin: ${game.awayTeam} by ${result.awayScore - result.homeScore} points`);
console.log('');

console.log('🎯 User Pick:');
console.log(`   Picked: ${pick.pick === 'away' ? game.awayTeam : game.homeTeam}`);
console.log(`   Spread: ${pick.pick === 'away' ? game.awaySpread : game.homeSpread}`);
console.log('');

// === EXACT CALCULATION FROM patsData.js ===
const homeScore = result.homeScore;
const awayScore = result.awayScore;
const margin = awayScore - homeScore;

console.log('[PATS] ========================================');
console.log(`[PATS] Game ${game.id}: ${game.awayTeam} ${awayScore} @ ${game.homeTeam} ${homeScore}`);
console.log(`[PATS] Margin: ${margin > 0 ? 'Away +' + margin : 'Home +' + Math.abs(margin)}`);
console.log(`[PATS] Spreads stored: Away=${game.awaySpread}, Home=${game.homeSpread}`);
console.log(`[PATS] User pick: ${pick.pick.toUpperCase()}`);

const awaySpread = game.awaySpread !== undefined ? game.awaySpread : 0;
const homeSpread = game.homeSpread !== undefined ? game.homeSpread : 0;

if (awaySpread === 0 && homeSpread === 0) {
  console.warn(`[PATS] WARNING: Both spreads are 0 for game ${game.id}!`);
}

let pickWon = false;
if (pick.pick === 'home') {
  const homeCovered = (homeScore + homeSpread) > awayScore;
  pickWon = homeCovered;
  console.log(`[PATS] HOME calculation: ${homeScore} + (${homeSpread}) = ${homeScore + homeSpread} vs ${awayScore} => ${pickWon ? '✅ WIN' : '❌ LOSS'}`);
} else {
  const awayCovered = (awayScore + awaySpread) > homeScore;
  pickWon = awayCovered;
  console.log(`[PATS] AWAY calculation: ${awayScore} + (${awaySpread}) = ${awayScore + awaySpread} vs ${homeScore} => ${pickWon ? '✅ WIN' : '❌ LOSS'}`);
}
console.log(`[PATS] ========================================`);
console.log('');

// Manual verification
console.log('🔍 Manual Verification:');
console.log(`   Pistons won by ${margin} points`);
console.log(`   Pistons spread: ${game.awaySpread} (need to win by more than ${Math.abs(game.awaySpread)})`);
console.log(`   ${margin} > ${Math.abs(game.awaySpread)} = ${margin > Math.abs(game.awaySpread)}`);
console.log(`   Expected Result: ${margin > Math.abs(game.awaySpread) ? '✅ WIN' : '❌ LOSS'}`);
console.log('');

console.log('📝 Summary:');
console.log(`   Calculated Result: ${pickWon ? '✅ WIN' : '❌ LOSS'}`);
console.log(`   Expected Result: ✅ WIN (Pistons won by 13, covering -9 spread)`);
console.log(`   Match: ${pickWon ? '✅ CORRECT' : '❌ BUG FOUND!'}`);
