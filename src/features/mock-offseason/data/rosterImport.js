/**
 * Mock Offseason - Roster Import System
 * Imports NBA roster data and generates mock rosters
 */

import { getMockLeague, saveMockLeague, NBA_TEAMS } from '../mockData.js';
import { DRAFT_PROSPECTS_2026 } from './playerData.js';

/**
 * Sample NBA player data structure
 * In production, this would come from ESPN/NBA API
 */
const SAMPLE_PLAYERS = {
  // Superstars (90+)
  superstars: [
    { name: 'LeBron James', position: 'SF', age: 39, overall: 92, salary: 47607350 },
    { name: 'Stephen Curry', position: 'PG', age: 36, overall: 93, salary: 55761217 },
    { name: 'Kevin Durant', position: 'SF', age: 35, overall: 91, salary: 47649433 },
    { name: 'Giannis Antetokounmpo', position: 'PF', age: 29, overall: 96, salary: 48787676 },
    { name: 'Luka Doncic', position: 'PG', age: 25, overall: 95, salary: 40064220 },
    { name: 'Nikola Jokic', position: 'C', age: 29, overall: 97, salary: 51415938 },
    { name: 'Jayson Tatum', position: 'SF', age: 26, overall: 93, salary: 34848340 },
    { name: 'Joel Embiid', position: 'C', age: 30, overall: 94, salary: 51415938 },
    { name: 'Shai Gilgeous-Alexander', position: 'SG', age: 25, overall: 93, salary: 35697550 },
    { name: 'Anthony Davis', position: 'PF', age: 31, overall: 91, salary: 43219440 },
  ],
  // All-Stars (85-89)
  allStars: [
    { name: 'Devin Booker', position: 'SG', age: 27, overall: 88, salary: 36016200 },
    { name: 'Donovan Mitchell', position: 'SG', age: 27, overall: 87, salary: 35852778 },
    { name: 'Trae Young', position: 'PG', age: 25, overall: 86, salary: 43031940 },
    { name: 'Ja Morant', position: 'PG', age: 24, overall: 87, salary: 34005250 },
    { name: 'Anthony Edwards', position: 'SG', age: 22, overall: 89, salary: 13533900 },
    { name: 'De\'Aaron Fox', position: 'PG', age: 26, overall: 86, salary: 34009160 },
    { name: 'Tyrese Haliburton', position: 'PG', age: 24, overall: 87, salary: 5809439 },
    { name: 'Bam Adebayo', position: 'C', age: 26, overall: 86, salary: 34848340 },
    { name: 'Pascal Siakam', position: 'PF', age: 29, overall: 85, salary: 37893408 },
    { name: 'Domantas Sabonis', position: 'C', age: 28, overall: 85, salary: 30600000 },
  ],
  // Quality Starters (80-84)
  starters: [
    { name: 'Fred VanVleet', position: 'PG', age: 30, overall: 82, salary: 42846615 },
    { name: 'OG Anunoby', position: 'SF', age: 26, overall: 83, salary: 38866705 },
    { name: 'Mikal Bridges', position: 'SF', age: 27, overall: 81, salary: 24921875 },
    { name: 'Marcus Smart', position: 'PG', age: 30, overall: 80, salary: 20239510 },
    { name: 'Derrick White', position: 'SG', age: 29, overall: 81, salary: 18357143 },
    { name: 'Myles Turner', position: 'C', age: 28, overall: 80, salary: 19800000 },
    { name: 'Brook Lopez', position: 'C', age: 36, overall: 80, salary: 23000000 },
    { name: 'Jrue Holiday', position: 'PG', age: 33, overall: 84, salary: 36861707 },
    { name: 'Khris Middleton', position: 'SF', age: 32, overall: 82, salary: 35500000 },
    { name: 'Kristaps Porzingis', position: 'C', age: 28, overall: 83, salary: 36016200 },
  ],
  // Role Players (75-79)
  rolePlayers: [
    { name: 'Kyle Lowry', position: 'PG', age: 37, overall: 76, salary: 2019706 },
    { name: 'Bojan Bogdanovic', position: 'SF', age: 34, overall: 77, salary: 19550000 },
    { name: 'Kelly Oubre Jr.', position: 'SF', age: 28, overall: 77, salary: 2891467 },
    { name: 'Buddy Hield', position: 'SG', age: 31, overall: 76, salary: 18600000 },
    { name: 'Gary Trent Jr.', position: 'SG', age: 25, overall: 77, salary: 18560000 },
    { name: 'Bruce Brown', position: 'SG', age: 27, overall: 75, salary: 22000000 },
    { name: 'Bobby Portis', position: 'PF', age: 29, overall: 77, salary: 12350000 },
    { name: 'Isaiah Stewart', position: 'C', age: 22, overall: 75, salary: 4683240 },
    { name: 'Tre Jones', position: 'PG', age: 24, overall: 75, salary: 2019706 },
    { name: 'Josh Hart', position: 'SG', age: 29, overall: 76, salary: 12960000 },
  ],
  // Bench Players (70-74)
  benchPlayers: [
    { name: 'Patty Mills', position: 'PG', age: 35, overall: 72, salary: 3196448 },
    { name: 'Trey Murphy III', position: 'SF', age: 23, overall: 74, salary: 3378000 },
    { name: 'Caleb Martin', position: 'SF', age: 28, overall: 73, salary: 8916855 },
    { name: 'Ayo Dosunmu', position: 'SG', age: 24, overall: 73, salary: 2031307 },
    { name: 'Herbert Jones', position: 'SF', age: 26, overall: 74, salary: 2174052 },
    { name: 'Cole Anthony', position: 'PG', age: 24, overall: 74, salary: 5729835 },
    { name: 'Malik Monk', position: 'SG', age: 26, overall: 74, salary: 8250000 },
    { name: 'Grant Williams', position: 'PF', age: 25, overall: 73, salary: 12850000 },
    { name: 'Aaron Gordon', position: 'PF', age: 28, overall: 74, salary: 22846482 },
    { name: 'Jalen Brunson', position: 'PG', age: 27, overall: 74, salary: 26346667 },
  ],
  // Young Players (65-74, under 24)
  youngPlayers: [
    { name: 'Victor Wembanyama', position: 'C', age: 20, overall: 85, salary: 12200000 },
    { name: 'Chet Holmgren', position: 'PF', age: 21, overall: 82, salary: 10886400 },
    { name: 'Paolo Banchero', position: 'PF', age: 21, overall: 82, salary: 11607600 },
    { name: 'Evan Mobley', position: 'PF', age: 22, overall: 83, salary: 10607400 },
    { name: 'Jalen Green', position: 'SG', age: 22, overall: 80, salary: 10607400 },
    { name: 'Scoot Henderson', position: 'PG', age: 20, overall: 78, salary: 9723600 },
    { name: 'Brandon Miller', position: 'SF', age: 21, overall: 77, salary: 9800760 },
    { name: 'Jabari Smith Jr.', position: 'PF', age: 21, overall: 76, salary: 10050120 },
    { name: 'Keegan Murray', position: 'SF', age: 23, overall: 77, salary: 6293040 },
    { name: 'Jalen Williams', position: 'SF', age: 23, overall: 79, salary: 4041240 },
  ]
};

/**
 * Generate a realistic mock roster for a team
 */
function generateMockRoster(teamId, teamConfig, tierAssignment) {
  const roster = [];
  const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
  
  // Determine team tier based on assignment
  const tier = tierAssignment || 'average';
  
  // Build roster based on tier
  switch(tier) {
    case 'contender':
      // 2 superstars/all-stars, strong supporting cast
      roster.push(generatePlayer('superstar', positions[Math.floor(Math.random() * 3)]));
      roster.push(generatePlayer('allStar', positions[2 + Math.floor(Math.random() * 3)]));
      for (let i = 0; i < 3; i++) roster.push(generatePlayer('starter', positions[i % 5]));
      for (let i = 0; i < 5; i++) roster.push(generatePlayer('rolePlayer', positions[i % 5]));
      for (let i = 0; i < 5; i++) roster.push(generatePlayer('bench', positions[i % 5]));
      break;
      
    case 'playoff':
      // 1 all-star, good depth
      roster.push(generatePlayer('allStar', positions[Math.floor(Math.random() * 5)]));
      for (let i = 0; i < 4; i++) roster.push(generatePlayer('starter', positions[i % 5]));
      for (let i = 0; i < 5; i++) roster.push(generatePlayer('rolePlayer', positions[i % 5]));
      for (let i = 0; i < 5; i++) roster.push(generatePlayer('bench', positions[i % 5]));
      break;
      
    case 'average':
      // Balanced roster
      roster.push(generatePlayer('starter', positions[Math.floor(Math.random() * 5)]));
      for (let i = 0; i < 4; i++) roster.push(generatePlayer('rolePlayer', positions[i % 5]));
      for (let i = 0; i < 5; i++) roster.push(generatePlayer('rolePlayer', positions[i % 5]));
      for (let i = 0; i < 5; i++) roster.push(generatePlayer('bench', positions[i % 5]));
      break;
      
    case 'rebuilding':
      // Young players, lower salaries
      for (let i = 0; i < 3; i++) roster.push(generatePlayer('young', positions[i % 5]));
      for (let i = 0; i < 4; i++) roster.push(generatePlayer('rolePlayer', positions[i % 5]));
      for (let i = 0; i < 5; i++) roster.push(generatePlayer('bench', positions[i % 5]));
      for (let i = 0; i < 3; i++) roster.push(generatePlayer('minimum', positions[i % 5]));
      break;
      
    case 'lottery':
      // Very young, lots of cap space
      for (let i = 0; i < 5; i++) roster.push(generatePlayer('young', positions[i % 5]));
      for (let i = 0; i < 5; i++) roster.push(generatePlayer('bench', positions[i % 5]));
      for (let i = 0; i < 5; i++) roster.push(generatePlayer('minimum', positions[i % 5]));
      break;
  }
  
  return roster;
}

/**
 * Generate a player based on tier
 */
function generatePlayer(tier, position) {
  const pools = {
    superstar: { minOvr: 90, maxOvr: 97, minSal: 40000000, maxSal: 55000000 },
    allStar: { minOvr: 85, maxOvr: 89, minSal: 25000000, maxSal: 45000000 },
    starter: { minOvr: 80, maxOvr: 84, minSal: 15000000, maxSal: 30000000 },
    rolePlayer: { minOvr: 75, maxOvr: 79, minSal: 5000000, maxSal: 15000000 },
    bench: { minOvr: 70, maxOvr: 74, minSal: 2000000, maxSal: 8000000 },
    young: { minOvr: 72, maxOvr: 82, minSal: 3000000, maxSal: 12000000 },
    minimum: { minOvr: 65, maxOvr: 72, minSal: 1100000, maxSal: 2500000 }
  };
  
  const pool = pools[tier] || pools.bench;
  
  // Generate realistic name
  const firstNames = ['James', 'Michael', 'Chris', 'David', 'John', 'Marcus', 'Kyle', 'Tyler', 'Brandon', 'Josh', 'Derek', 'Aaron', 'Malik', 'Jamal', 'Darius', 'Kendrick', 'LaVonte', 'DeShawn', 'Tyrese', 'Jaylen'];
  const lastNames = ['Williams', 'Johnson', 'Brown', 'Davis', 'Smith', 'Jones', 'Wilson', 'Miller', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 'Thompson', 'Garcia', 'Robinson', 'Clark', 'Lewis', 'Walker'];
  
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  
  const overall = Math.floor(Math.random() * (pool.maxOvr - pool.minOvr + 1)) + pool.minOvr;
  const salary = Math.floor(Math.random() * (pool.maxSal - pool.minSal)) + pool.minSal;
  const age = tier === 'young' 
    ? Math.floor(Math.random() * 4) + 20 
    : Math.floor(Math.random() * 12) + 23;
  const yearsRemaining = Math.floor(Math.random() * 4) + 1;
  
  return {
    id: `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: `${firstName} ${lastName}`,
    position: position,
    age: age,
    overall: overall,
    salary: salary,
    yearsRemaining: yearsRemaining,
    skills: generateSkills(position, overall),
    height: generateHeight(position),
    weight: generateWeight(position)
  };
}

/**
 * Generate skills based on position and overall
 */
function generateSkills(position, overall) {
  const skillsByPosition = {
    PG: ['Ball Handling', 'Court Vision', 'Perimeter Defense', '3PT Shooting', 'Playmaking'],
    SG: ['3PT Shooting', 'Shot Creation', 'Off-Ball Movement', 'Perimeter Defense', 'Finishing'],
    SF: ['Versatility', '3PT Shooting', 'Defense', 'Rebounding', 'Slashing'],
    PF: ['Rebounding', 'Post Defense', 'Face-Up Game', 'Pick & Pop', 'Rim Protection'],
    C: ['Rim Protection', 'Rebounding', 'Post Moves', 'Screen Setting', 'Paint Defense']
  };
  
  const posSkills = skillsByPosition[position] || skillsByPosition.SF;
  const numSkills = overall >= 85 ? 4 : overall >= 75 ? 3 : 2;
  
  return posSkills.slice(0, numSkills);
}

/**
 * Generate height based on position
 */
function generateHeight(position) {
  const heights = {
    PG: ["6'0\"", "6'1\"", "6'2\"", "6'3\"", "6'4\""],
    SG: ["6'3\"", "6'4\"", "6'5\"", "6'6\""],
    SF: ["6'5\"", "6'6\"", "6'7\"", "6'8\"", "6'9\""],
    PF: ["6'7\"", "6'8\"", "6'9\"", "6'10\""],
    C: ["6'10\"", "6'11\"", "7'0\"", "7'1\"", "7'2\""]
  };
  const posHeights = heights[position] || heights.SF;
  return posHeights[Math.floor(Math.random() * posHeights.length)];
}

/**
 * Generate weight based on position
 */
function generateWeight(position) {
  const weights = {
    PG: { min: 175, max: 200 },
    SG: { min: 190, max: 215 },
    SF: { min: 210, max: 235 },
    PF: { min: 225, max: 255 },
    C: { min: 240, max: 280 }
  };
  const range = weights[position] || weights.SF;
  return Math.floor(Math.random() * (range.max - range.min)) + range.min;
}

/**
 * Team tier assignments based on recent NBA standings
 */
const TEAM_TIERS = {
  // Contenders
  BOS: 'contender', DEN: 'contender', MIL: 'contender', PHX: 'contender', 
  LAC: 'contender', GSW: 'playoff',
  
  // Playoff Teams
  MIA: 'playoff', NYK: 'playoff', CLE: 'playoff', PHI: 'playoff',
  MIN: 'playoff', SAC: 'playoff', LAL: 'playoff', DAL: 'playoff',
  OKC: 'playoff', IND: 'playoff', NOP: 'playoff', ORL: 'playoff',
  
  // Average Teams
  ATL: 'average', CHI: 'average', TOR: 'average', BKN: 'rebuilding',
  
  // Rebuilding
  MEM: 'rebuilding', POR: 'rebuilding', UTA: 'rebuilding', CHA: 'rebuilding',
  HOU: 'rebuilding',
  
  // Lottery Teams
  WAS: 'lottery', DET: 'lottery', SAS: 'lottery'
};

/**
 * Import rosters for all teams
 */
export async function importAllRosters(guildId) {
  const league = await getMockLeague(guildId);
  if (!league) {
    throw new Error('No league exists');
  }
  
  let importedCount = 0;
  
  for (const [teamId, teamConfig] of Object.entries(NBA_TEAMS)) {
    if (!league.teams[teamId]) {
      league.teams[teamId] = {
        ...teamConfig,
        id: teamId,
        gm: null,
        roster: [],
        draftPicks: [],
        totalSalary: 0
      };
    }
    
    // Generate roster
    const tier = TEAM_TIERS[teamId] || 'average';
    league.teams[teamId].roster = generateMockRoster(teamId, teamConfig, tier);
    
    // Calculate total salary
    league.teams[teamId].totalSalary = league.teams[teamId].roster.reduce(
      (sum, player) => sum + (player.salary || 0), 0
    );
    
    // Generate draft picks (teams own their own picks by default)
    const currentYear = new Date().getFullYear();
    league.teams[teamId].draftPicks = [];
    for (let year = currentYear + 1; year <= currentYear + 7; year++) {
      league.teams[teamId].draftPicks.push({ year, round: 1, originalTeam: teamId });
      league.teams[teamId].draftPicks.push({ year, round: 2, originalTeam: teamId });
    }
    
    importedCount++;
  }
  
  await saveMockLeague(guildId, league);
  
  return {
    success: true,
    teamsImported: importedCount,
    totalPlayers: Object.values(league.teams).reduce((sum, t) => sum + (t.roster?.length || 0), 0)
  };
}

/**
 * Import draft prospects
 */
export async function importProspects(guildId) {
  const league = await getMockLeague(guildId);
  if (!league) {
    throw new Error('No league exists');
  }
  
  // Copy prospects from playerData
  league.draftProspects = [...DRAFT_PROSPECTS_2026];
  
  await saveMockLeague(guildId, league);
  
  return {
    success: true,
    prospectsImported: league.draftProspects.length
  };
}

/**
 * Generate free agent market
 */
export async function generateFreeAgents(guildId) {
  const league = await getMockLeague(guildId);
  if (!league) {
    throw new Error('No league exists');
  }
  
  const freeAgents = [];
  const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
  
  // Generate 40-60 free agents of varying quality
  const numFAs = Math.floor(Math.random() * 20) + 40;
  
  for (let i = 0; i < numFAs; i++) {
    const tier = Math.random() < 0.05 ? 'allStar' 
      : Math.random() < 0.15 ? 'starter'
      : Math.random() < 0.40 ? 'rolePlayer'
      : Math.random() < 0.70 ? 'bench'
      : 'minimum';
    
    const player = generatePlayer(tier, positions[i % 5]);
    player.askingPrice = Math.round(player.salary * (0.9 + Math.random() * 0.3));
    player.interestedTeams = [];
    player.yearsWanted = Math.floor(Math.random() * 3) + 1;
    
    freeAgents.push(player);
  }
  
  league.freeAgents = freeAgents;
  await saveMockLeague(guildId, league);
  
  return {
    success: true,
    freeAgentsGenerated: freeAgents.length
  };
}

/**
 * Import all data at once
 */
export async function importAllData(guildId) {
  const results = {
    rosters: await importAllRosters(guildId),
    prospects: await importProspects(guildId),
    freeAgents: await generateFreeAgents(guildId)
  };
  
  return results;
}
