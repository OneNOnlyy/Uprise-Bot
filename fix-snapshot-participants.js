import { fixSnapshotParticipants } from './src/utils/sessionSnapshot.js';

console.log('Starting snapshot participant fix...');
const fixed = fixSnapshotParticipants();
console.log(`Complete! Fixed ${fixed} snapshot(s).`);
