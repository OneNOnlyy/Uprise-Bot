// Test script to verify PATS history system is working
import { readPATSData, writePATSData, createPATSSession, closePATSSession, getUserSessionHistory } from './src/utils/patsData.js';
import { getUserSessionSnapshots } from './src/utils/sessionSnapshot.js';

console.log('🧪 Testing PATS History System\n');

// Read current state
console.log('📊 Current State:');
const data = readPATSData();
console.log(`   Active Sessions: ${data.activeSessions.length}`);
console.log(`   History: ${data.history.length}`);
console.log(`   Users: ${Object.keys(data.users).length}\n`);

// Check if there are any active sessions
if (data.activeSessions.length > 0) {
  console.log('⚠️  Active session exists. Closing it for testing...\n');
  const session = data.activeSessions[0];
  console.log(`   Session ID: ${session.id}`);
  console.log(`   Date: ${session.date}`);
  console.log(`   Games: ${session.games.length}`);
  console.log(`   Participants: ${session.participants.length}\n`);
  
  // Close the session
  const result = closePATSSession(session.id, []);
  
  if (result) {
    console.log('✅ Session closed successfully\n');
    
    // Wait a bit for snapshot creation
    setTimeout(async () => {
      // Verify history was saved
      const updatedData = readPATSData();
      console.log('📊 After Closure:');
      console.log(`   Active Sessions: ${updatedData.activeSessions.length}`);
      console.log(`   History: ${updatedData.history.length}\n`);
      
      if (updatedData.history.length > 0) {
        console.log('✅ History saved successfully!\n');
        
        // Check each participant's history
        const lastSession = updatedData.history[updatedData.history.length - 1];
        console.log(`📜 Last Session in History:`);
        console.log(`   ID: ${lastSession.id}`);
        console.log(`   Date: ${lastSession.date}`);
        console.log(`   Participants: ${lastSession.participants.length}\n`);
        
        // Test getUserSessionHistory for each participant
        for (const userId of lastSession.participants) {
          const userHistory = getUserSessionHistory(userId, 5);
          console.log(`👤 User ${userId}:`);
          console.log(`   Sessions in history: ${userHistory.length}`);
          if (userHistory.length > 0) {
            console.log(`   Latest session: ${userHistory[0].date} (${userHistory[0].wins}-${userHistory[0].losses}-${userHistory[0].pushes})`);
          }
        }
        console.log();
        
        // Test snapshot system
        console.log('📸 Testing Snapshot System:\n');
        for (const userId of lastSession.participants) {
          const snapshots = getUserSessionSnapshots(userId);
          console.log(`👤 User ${userId}:`);
          console.log(`   Snapshots available: ${snapshots.length}`);
          if (snapshots.length > 0) {
            console.log(`   Latest: ${snapshots[0].date}`);
          }
        }
        
      } else {
        console.log('❌ ERROR: History is still empty after closing session!');
        console.log('   This indicates a problem with the closePATSSession function.\n');
      }
      
    }, 2000); // Wait 2 seconds for async snapshot creation
    
  } else {
    console.log('❌ Failed to close session\n');
  }
  
} else {
  console.log('ℹ️  No active session to test with.');
  console.log('   Please start a PATS session with /patsstart first.\n');
  
  // Still test history retrieval if history exists
  if (data.history.length > 0) {
    console.log('📜 Existing History:');
    console.log(`   Total sessions: ${data.history.length}\n`);
    
    const lastSession = data.history[data.history.length - 1];
    console.log(`   Latest Session:`);
    console.log(`     ID: ${lastSession.id}`);
    console.log(`     Date: ${lastSession.date}`);
    console.log(`     Participants: ${lastSession.participants.length}`);
    console.log(`     Status: ${lastSession.status}`);
    console.log(`     Results: ${lastSession.results ? 'Yes' : 'No'}\n`);
    
    // Test user history
    if (lastSession.participants.length > 0) {
      const testUserId = lastSession.participants[0];
      const userHistory = getUserSessionHistory(testUserId, 5);
      console.log(`📊 getUserSessionHistory(${testUserId}):`);
      console.log(`   Found ${userHistory.length} sessions`);
      if (userHistory.length > 0) {
        userHistory.forEach((sess, i) => {
          console.log(`   ${i + 1}. ${sess.date}: ${sess.wins}-${sess.losses}-${sess.pushes} (${sess.picks.length} picks)`);
        });
      }
      console.log();
      
      // Test snapshots
      const snapshots = getUserSessionSnapshots(testUserId);
      console.log(`📸 getUserSessionSnapshots(${testUserId}):`);
      console.log(`   Found ${snapshots.length} snapshots`);
      if (snapshots.length > 0) {
        snapshots.slice(0, 3).forEach((snap, i) => {
          console.log(`   ${i + 1}. ${snap.date}: ${snap.gameCount} games`);
        });
      }
    }
  }
}
