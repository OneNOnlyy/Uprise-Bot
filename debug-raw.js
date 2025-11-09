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

async function debugRawAPI() {
  console.log('Checking raw BallDontLie API response...\n');

  const today = new Date();
  const startDate = today.toISOString().split('T')[0];
  const endDate = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const url = `${BALLDONTLIE_API_BASE}/games?team_ids[]=${BLAZERS_TEAM_ID}&start_date=${startDate}&end_date=${endDate}&per_page=10`;

  console.log(`URL: ${url}\n`);

  const response = await fetch(url, { headers: getHeaders() });
  const data = await response.json();

  console.log(`Found ${data.data?.length || 0} games:\n`);

  data.data?.forEach((game, index) => {
    console.log(`${index + 1}. ${game.visitor_team.abbreviation} @ ${game.home_team.abbreviation}`);
    console.log(`   Raw date: ${game.date}`);
    console.log(`   Status: ${game.status}`);
    console.log('');
  });
}

debugRawAPI();
