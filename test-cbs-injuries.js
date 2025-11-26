// Test CBS injury scraping
import { fetchAllInjuryReports } from './src/utils/espnApi.js';

async function testCBSInjuries() {
  try {
    console.log('Testing CBS injury scraping...');
    const injuries = await fetchAllInjuryReports();

    console.log(`\nFound ${injuries.size} teams with injuries:`);

    const injuryArray = [];
    injuries.forEach((teamInjuries, team) => {
      injuryArray.push({ team, injuries: teamInjuries });
    });

    injuryArray.forEach((team, index) => {
      console.log(`${index + 1}. ${team.team}: ${team.injuries.length} injuries`);
      if (team.injuries.length > 0) {
        console.log(`   First injury: ${team.injuries[0].player} - ${team.injuries[0].status}`);
      }
    });

    // Check for duplicates
    const teamCounts = {};
    injuryArray.forEach(team => {
      teamCounts[team.team] = (teamCounts[team.team] || 0) + 1;
    });

    console.log('\nTeam counts (should all be 1):');
    Object.entries(teamCounts).forEach(([team, count]) => {
      if (count > 1) {
        console.log(`   ${team}: ${count} (DUPLICATE!)`);
      }
    });

    const uniqueTeams = new Set(injuryArray.map(t => t.team));
    console.log(`\nUnique teams found: ${uniqueTeams.size}/30`);

    // List missing teams
    const allTeams = ['ATL', 'BKN', 'BOS', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW', 'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK', 'OKC', 'ORL', 'PHI', 'PHO', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS'];
    const missingTeams = allTeams.filter(team => !uniqueTeams.has(team));
    console.log(`\nMissing teams: ${missingTeams.join(', ')}`);

  } catch (error) {
    console.error('Error:', error);
  }
}

testCBSInjuries();