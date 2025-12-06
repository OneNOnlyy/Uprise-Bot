/**
 * Debug script to see what each injury source returns for Portland Trail Blazers
 * Run with: node debug-portland-injuries.js
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const ESPN_API_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

console.log('='.repeat(80));
console.log('PORTLAND TRAIL BLAZERS INJURY DEBUG');
console.log('='.repeat(80));
console.log(`Time: ${new Date().toISOString()}\n`);

// Source 1: ESPN Injuries Page (should be primary)
async function checkESPNInjuriesPage() {
  console.log('\n' + '='.repeat(40));
  console.log('SOURCE 1: ESPN INJURIES PAGE');
  console.log('URL: https://www.espn.com/nba/injuries');
  console.log('='.repeat(40));
  
  try {
    const response = await fetch('https://www.espn.com/nba/injuries', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      console.log(`❌ Failed: ${response.status}`);
      return;
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Look for Portland section
    const allText = $('body').text();
    const hasPortland = allText.toLowerCase().includes('portland') || allText.toLowerCase().includes('blazers');
    console.log(`Contains "Portland" or "Blazers": ${hasPortland}`);
    
    // Try to find team sections
    const tables = $('table');
    console.log(`Found ${tables.length} tables on page`);
    
    // Look for any text containing Portland
    $('*').each((i, el) => {
      const text = $(el).clone().children().remove().end().text().trim();
      if (text.toLowerCase().includes('portland') || text.toLowerCase() === 'blazers') {
        console.log(`Found Portland reference: "${text.substring(0, 100)}"`);
      }
    });
    
    // Try to extract injuries for Portland
    let foundPortland = false;
    $('div, section, table').each((i, section) => {
      const sectionText = $(section).text().toLowerCase();
      if ((sectionText.includes('portland') || sectionText.includes('trail blazers')) && !foundPortland) {
        foundPortland = true;
        console.log('\n📋 PORTLAND SECTION FOUND:');
        
        // Find player rows
        $(section).find('tr, .player-row, [class*="player"]').each((j, row) => {
          const rowText = $(row).text().trim();
          if (rowText.length > 5 && rowText.length < 200) {
            console.log(`  Row ${j}: ${rowText.substring(0, 150)}`);
          }
        });
      }
    });
    
    if (!foundPortland) {
      console.log('❌ Could not find Portland section on page');
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

// Source 2: ESPN Game Summary API
async function checkGameSummaryAPI() {
  console.log('\n' + '='.repeat(40));
  console.log('SOURCE 2: ESPN GAME SUMMARY API');
  console.log('='.repeat(40));
  
  try {
    // First find today's Portland game
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const scoreboardUrl = `${ESPN_API_BASE}/scoreboard?dates=${today}`;
    console.log(`Scoreboard URL: ${scoreboardUrl}`);
    
    const scoreboardRes = await fetch(scoreboardUrl);
    const scoreboardData = await scoreboardRes.json();
    
    let portlandGameId = null;
    for (const event of scoreboardData.events || []) {
      const teams = event.competitions?.[0]?.competitors?.map(c => c.team.displayName) || [];
      console.log(`Game: ${teams.join(' vs ')}`);
      
      if (teams.some(t => t.includes('Trail Blazers') || t.includes('Portland'))) {
        portlandGameId = event.id;
        console.log(`✅ Found Portland game: ID ${portlandGameId}`);
        break;
      }
    }
    
    if (!portlandGameId) {
      console.log('❌ No Portland game found today');
      return;
    }
    
    // Get game summary
    const summaryUrl = `${ESPN_API_BASE}/summary?event=${portlandGameId}`;
    console.log(`Summary URL: ${summaryUrl}`);
    
    const summaryRes = await fetch(summaryUrl);
    const summaryData = await summaryRes.json();
    
    console.log(`\nInjury reports in summary: ${summaryData.injuries?.length || 0}`);
    
    for (const teamInjuries of summaryData.injuries || []) {
      const teamName = teamInjuries.team?.displayName;
      const teamAbbr = teamInjuries.team?.abbreviation;
      console.log(`\n📋 ${teamName} (${teamAbbr}):`);
      
      for (const injury of teamInjuries.injuries || []) {
        const player = injury.athlete?.displayName || 'Unknown';
        const status = typeof injury.status === 'object' ? injury.status.description : injury.status;
        const details = injury.details || injury.type || '';
        console.log(`  - ${player}: ${status} (${details})`);
      }
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

// Source 3: ESPN Scoreboard API
async function checkScoreboardAPI() {
  console.log('\n' + '='.repeat(40));
  console.log('SOURCE 3: ESPN SCOREBOARD API');
  console.log('='.repeat(40));
  
  try {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const url = `${ESPN_API_BASE}/scoreboard?dates=${today}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    for (const event of data.events || []) {
      const competition = event.competitions?.[0];
      const teams = competition?.competitors || [];
      
      const isPortlandGame = teams.some(t => 
        t.team.abbreviation === 'POR' || 
        t.team.displayName.includes('Trail Blazers')
      );
      
      if (isPortlandGame) {
        console.log(`\n📋 Portland Game Found:`);
        
        for (const team of teams) {
          console.log(`\n${team.team.displayName} (${team.team.abbreviation}):`);
          
          const injuries = team.injuries || [];
          if (injuries.length === 0) {
            console.log('  No injuries in scoreboard data');
          } else {
            for (const injury of injuries) {
              console.log(`  - ${JSON.stringify(injury)}`);
            }
          }
        }
      }
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

// Run all checks
async function main() {
  await checkESPNInjuriesPage();
  await checkGameSummaryAPI();
  await checkScoreboardAPI();
  
  console.log('\n' + '='.repeat(80));
  console.log('DEBUG COMPLETE');
  console.log('='.repeat(80));
}

main().catch(console.error);
