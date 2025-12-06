import fetch from 'node-fetch';

const yesterday = '20251205';
const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${yesterday}`;
const res = await fetch(url);
const data = await res.json();

console.log('Games on Dec 5, 2025:');
data.events.forEach(e => {
  const teams = e.competitions[0].competitors.map(c => c.team.displayName);
  console.log(`  ${teams.join(' vs ')}`);
  if (teams.some(t => t.includes('Portland') || t.includes('Trail Blazers'))) {
    console.log('    ^^ PORTLAND GAME FOUND ^^');
    console.log(`    Game ID: ${e.id}`);
  }
});
