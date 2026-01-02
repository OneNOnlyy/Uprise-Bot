import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PATS_FILE = path.join(__dirname, 'data', 'pats.json');

console.log('Reading PATS data from:', PATS_FILE);
console.log('');

try {
  const data = JSON.parse(fs.readFileSync(PATS_FILE, 'utf8'));
  
  console.log('=== USER MONTHLY STATS DIAGNOSTIC ===\n');
  
  const userCount = Object.keys(data.users || {}).length;
  console.log(`Total users: ${userCount}\n`);
  
  // Check each user's monthly stats
  for (const [userId, user] of Object.entries(data.users || {})) {
    console.log(`\n👤 User: ${user.username || userId}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   All-Time Stats:`);
    console.log(`     - Wins: ${user.totalWins || 0}`);
    console.log(`     - Losses: ${user.totalLosses || 0}`);
    console.log(`     - Pushes: ${user.totalPushes || 0}`);
    console.log(`     - Sessions: ${user.sessions || 0}`);
    
    if (user.monthlyStats) {
      const monthKeys = Object.keys(user.monthlyStats);
      if (monthKeys.length > 0) {
        console.log(`   Monthly Stats:`);
        for (const [monthKey, stats] of Object.entries(user.monthlyStats)) {
          console.log(`     [${monthKey}]`);
          console.log(`       - Wins: ${stats.totalWins || 0}`);
          console.log(`       - Losses: ${stats.totalLosses || 0}`);
          console.log(`       - Pushes: ${stats.totalPushes || 0}`);
          console.log(`       - Sessions: ${stats.sessions || 0}`);
          console.log(`       - DD Used: ${stats.doubleDownsUsed || 0}`);
        }
      } else {
        console.log(`   ✅ Has monthlyStats (empty - will populate in future sessions)`);
      }
    } else {
      console.log(`   ⚠️  NO MONTHLY STATS OBJECT`);
    }
  }
  
  // Check active sessions
  console.log('\n\n=== ACTIVE SESSIONS ===');
  console.log(`Active sessions count: ${data.activeSessions?.length || 0}`);
  for (const session of data.activeSessions || []) {
    console.log(`\n📅 Session: ${session.id}`);
    console.log(`   Date: ${session.date}`);
    console.log(`   Status: ${session.status}`);
    console.log(`   Type: ${session.sessionType}`);
    console.log(`   Owner: ${session.ownerId || 'N/A'}`);
    console.log(`   Games: ${session.games?.length || 0}`);
    console.log(`   Picks: ${Object.keys(session.picks || {}).length} users`);
  }
  
  // Check recent history
  console.log('\n\n=== RECENT HISTORY (Last 3 Sessions) ===');
  const recentHistory = (data.history || []).slice(-3);
  for (const session of recentHistory) {
    console.log(`\n📜 Session: ${session.id}`);
    console.log(`   Date: ${session.date}`);
    console.log(`   Closed: ${session.closedAt}`);
    console.log(`   Type: ${session.sessionType}`);
    console.log(`   Owner: ${session.ownerId || 'N/A'}`);
    
    if (session.results) {
      console.log(`   Results:`);
      for (const [userId, result] of Object.entries(session.results)) {
        const username = data.users[userId]?.username || userId;
        console.log(`     - ${username}: ${result.wins}-${result.losses}-${result.pushes}`);
      }
    }
  }
  
} catch (error) {
  console.error('Error reading PATS data:', error);
}
