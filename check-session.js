import { getActiveSession } from './src/utils/patsData.js';

const session = getActiveSession();
console.log('Active session:', session ? 'Yes' : 'No');
if (session) {
  console.log('Session date:', session.date);
  console.log('Games:', session.games.length);
}