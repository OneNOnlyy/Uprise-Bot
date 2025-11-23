// Test with potentially wrong spread values
console.log('=== TESTING WRONG SPREAD SCENARIOS ===\n');

const testCases = [
  {
    name: 'CORRECT (Both spreads opposite)',
    awaySpread: -9,
    homeSpread: 9,
  },
  {
    name: 'BUG: Both spreads negative',
    awaySpread: -9,
    homeSpread: -9,
  },
  {
    name: 'BUG: Both spreads positive',
    awaySpread: 9,
    homeSpread: 9,
  },
  {
    name: 'BUG: Spreads swapped',
    awaySpread: 9,
    homeSpread: -9,
  },
  {
    name: 'BUG: Both spreads zero',
    awaySpread: 0,
    homeSpread: 0,
  }
];

const awayScore = 129;
const homeScore = 116;
const pickAway = true;

testCases.forEach(test => {
  const awaySpread = test.awaySpread;
  const homeSpread = test.homeSpread;
  
  const awayCovered = (awayScore + awaySpread) > homeScore;
  
  console.log(`\n${test.name}`);
  console.log(`  Away: ${awaySpread}, Home: ${homeSpread}`);
  console.log(`  Calculation: ${awayScore} + (${awaySpread}) = ${awayScore + awaySpread} vs ${homeScore}`);
  console.log(`  Result: ${awayCovered ? '✅ WIN' : '❌ LOSS'}`);
});

console.log('\n\n💡 If you saw "❌ LOSS" in your bot, check which scenario matches!');
