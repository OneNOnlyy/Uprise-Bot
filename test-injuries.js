// Quick test to check ESPN injury endpoints
async function testInjuryAPI() {
  try {
    console.log('\n=== TEST 1: ESPN Direct Injury Endpoint ===');
    const espnUrl = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/18/injuries';
    console.log('Testing:', espnUrl);
    
    const espnResponse = await fetch(espnUrl);
    console.log('Status:', espnResponse.status);
    
    if (espnResponse.ok) {
      const espnData = await espnResponse.json();
      console.log('Keys:', Object.keys(espnData));
      console.log('Full data:', JSON.stringify(espnData, null, 2));
    }
    
    console.log('\n=== TEST 2: ESPN Scoreboard ===');
    const scoreboardUrl = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
    console.log('Testing:', scoreboardUrl);
    
    const scoreboardResponse = await fetch(scoreboardUrl);
    console.log('Status:', scoreboardResponse.status);
    
    if (scoreboardResponse.ok) {
      const scoreboardData = await scoreboardResponse.json();
      console.log('Events:', scoreboardData.events?.length);
      
      if (scoreboardData.events && scoreboardData.events.length > 0) {
        const firstGame = scoreboardData.events[0];
        console.log('\nFirst game:', firstGame.name);
        console.log('Competition keys:', Object.keys(firstGame.competitions[0]));
        
        const competitors = firstGame.competitions[0].competitors;
        console.log('\nHome team keys:', Object.keys(competitors[0]));
        console.log('Home team:', competitors[0].team.displayName);
        console.log('Has injuries?:', !!competitors[0].injuries);
        
        if (competitors[0].injuries) {
          console.log('Home injuries:', competitors[0].injuries);
        }
        
        console.log('\nAway team:', competitors[1].team.displayName);
        console.log('Has injuries?:', !!competitors[1].injuries);
        
        if (competitors[1].injuries) {
          console.log('Away injuries:', competitors[1].injuries);
        }
      }
    }
    
    console.log('\n=== TEST 3: ESPN Summary Endpoint ===');
    const summaryUrl = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401704942';
    console.log('Testing:', summaryUrl);
    
    const summaryResponse = await fetch(summaryUrl);
    console.log('Status:', summaryResponse.status);
    
    if (summaryResponse.ok) {
      const summaryData = await summaryResponse.json();
      console.log('Keys:', Object.keys(summaryData));
      
      if (summaryData.injuries) {
        console.log('Injuries found:', summaryData.injuries);
      }
      
      if (summaryData.boxscore?.teams) {
        console.log('Boxscore teams:', summaryData.boxscore.teams.length);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testInjuryAPI();
