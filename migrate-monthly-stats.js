import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PATS_FILE = path.join(__dirname, 'data', 'pats.json');
const BACKUP_FILE = path.join(__dirname, 'data', 'pats.json.backup-before-monthly-migration');

console.log('=== PATS MONTHLY STATS MIGRATION ===\n');
console.log('This will add monthlyStats objects to all users who don\'t have them.\n');

try {
  // Read current data
  const data = JSON.parse(fs.readFileSync(PATS_FILE, 'utf8'));
  
  // Create backup
  console.log('📦 Creating backup...');
  fs.writeFileSync(BACKUP_FILE, JSON.stringify(data, null, 2));
  console.log(`✅ Backup created at: ${BACKUP_FILE}\n`);
  
  let migratedCount = 0;
  let alreadyHadCount = 0;
  
  console.log('🔄 Checking users...\n');
  
  for (const [userId, user] of Object.entries(data.users || {})) {
    if (!user.monthlyStats) {
      console.log(`✨ Adding monthlyStats to user: ${user.username || userId}`);
      user.monthlyStats = {};
      migratedCount++;
    } else {
      console.log(`✓ User already has monthlyStats: ${user.username || userId}`);
      alreadyHadCount++;
    }
    
    // Also ensure preferences exist
    if (!user.preferences) {
      user.preferences = {
        dmNotifications: {
          announcements: true,
          reminders: true,
          warnings: true,
          gameLocks: false
        }
      };
    }
    
    // Ensure doubledown stats exist
    if (user.doubleDownWins === undefined) user.doubleDownWins = 0;
    if (user.doubleDownLosses === undefined) user.doubleDownLosses = 0;
    if (user.doubleDownPushes === undefined) user.doubleDownPushes = 0;
    if (user.doubleDownsUsed === undefined) user.doubleDownsUsed = 0;
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   - Users migrated: ${migratedCount}`);
  console.log(`   - Users already had monthlyStats: ${alreadyHadCount}`);
  console.log(`   - Total users: ${Object.keys(data.users || {}).length}`);
  
  if (migratedCount > 0) {
    console.log('\n💾 Saving updated data...');
    fs.writeFileSync(PATS_FILE, JSON.stringify(data, null, 2));
    console.log('✅ Migration complete!');
    console.log(`\nNote: Existing users will have empty monthlyStats {} objects.`);
    console.log(`Their monthly stats will start accumulating from future sessions.`);
  } else {
    console.log('\n✨ No migration needed - all users already have monthlyStats!');
  }
  
} catch (error) {
  console.error('❌ Error during migration:', error);
  console.error('\nYou can restore from backup if needed:');
  console.error(`   cp "${BACKUP_FILE}" "${PATS_FILE}"`);
}
