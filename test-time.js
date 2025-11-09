import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const BALLDONTLIE_API_BASE = 'https://api.balldontlie.io/v1';
const BLAZERS_TEAM_ID = 25;

function getHeaders() {
  return {
    'Authorization': process.env.BALLDONTLIE_API_KEY
  };
}

async function testTimeFields() {
  console.log('Testing BallDontLie API time fields...\n');

  const today = new Date();
  const startDate = today.toISOString().split('T')[0];
  const endDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const url = `${BALLDONTLIE_API_BASE}/games?team_ids[]=${BLAZERS_TEAM_ID}&start_date=${startDate}&end_date=${endDate}&per_page=5`;

  const response = await fetch(url, { headers: getHeaders() });
  const data = await response.json();

  console.log(`Found ${data.data?.length || 0} games:\n`);

  data.data?.forEach((game, index) => {
    console.log(`${index + 1}. ${game.visitor_team.abbreviation} @ ${game.home_team.abbreviation}`);
    console.log(`   date: ${game.date}`);
    console.log(`   time: ${game.time}`);
    console.log(`   status: ${game.status}`);

    // Test our parsing
    if (game.date && game.time) {
      const isoString = `${game.date}T${game.time}:00.000Z`;
      const gameTimeUTC = new Date(isoString);
      const pstTime = gameTimeUTC.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/Los_Angeles',
        timeZoneName: 'short'
      });
      const pstDate = gameTimeUTC.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/Los_Angeles'
      });
      console.log(`   Parsed: ${pstDate} at ${pstTime}`);
    }
    console.log('');
  });
}

testTimeFields();
