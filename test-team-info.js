import { getTeamInfo } from './src/utils/espnApi.js';

async function testTeamInfo() {
  try {
    console.log('Testing getTeamInfo for Lakers...');
    const result = await getTeamInfo('LA Lakers');
    console.log('Result:', JSON.stringify(result, null, 2));
    console.log(`Injuries count: ${result?.injuries?.length || 0}`);
  } catch (error) {
    console.error('Error:', error);
  }
}

testTeamInfo();