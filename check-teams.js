import fs from 'fs';

const data = JSON.parse(fs.readFileSync('data/pats.json', 'utf8'));
const session = data.sessions.find(s => s.status === 'active');

if (session) {
  console.log('Session games:');
  session.games.forEach(g => {
    console.log(`  ${g.awayTeam} @ ${g.homeTeam}`);
  });
} else {
  console.log('No active session');
}
