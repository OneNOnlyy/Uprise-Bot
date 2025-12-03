/**
 * Mock Offseason - Player Data
 * Contains player database and roster management functions
 */

// 2026 Mock Draft Prospects (Top 60)
export const DRAFT_PROSPECTS_2026 = [
  // Top 10
  { id: 'cooper_flagg', name: 'Cooper Flagg', position: 'SF', school: 'Duke', height: '6\'9"', weight: '205', age: 19, mockRank: 1, tier: 'Elite', strengths: 'Two-way versatility, court vision, defensive instincts', weaknesses: 'Outside shooting consistency' },
  { id: 'ace_bailey', name: 'Ace Bailey', position: 'SF', school: 'Rutgers', height: '6\'9"', weight: '195', age: 19, mockRank: 2, tier: 'Elite', strengths: 'Elite scorer, length, athleticism', weaknesses: 'Defensive consistency' },
  { id: 'dylan_harper', name: 'Dylan Harper', position: 'PG', school: 'Rutgers', height: '6\'6"', weight: '205', age: 19, mockRank: 3, tier: 'Elite', strengths: 'Scoring guard, playmaking, size', weaknesses: 'Efficiency, shot selection' },
  { id: 'vj_edgecombe', name: 'VJ Edgecombe', position: 'SG', school: 'Baylor', height: '6\'5"', weight: '180', age: 19, mockRank: 4, tier: 'Elite', strengths: 'Elite athleticism, slashing, defensive potential', weaknesses: 'Perimeter shooting' },
  { id: 'kon_knueppel', name: 'Kon Knueppel', position: 'SG', school: 'Duke', height: '6\'6"', weight: '205', age: 20, mockRank: 5, tier: 'Star', strengths: 'Three-point shooting, IQ, cutting', weaknesses: 'Lateral quickness, creation' },
  { id: 'kasparas_jakucionis', name: 'Kasparas Jakucionis', position: 'PG', school: 'Illinois', height: '6\'5"', weight: '190', age: 20, mockRank: 6, tier: 'Star', strengths: 'Passing, size, basketball IQ', weaknesses: 'Athleticism, finishing' },
  { id: 'airious_bailey', name: 'Airious Bailey', position: 'SG', school: 'Alabama', height: '6\'6"', weight: '215', age: 19, mockRank: 7, tier: 'Star', strengths: 'Strong frame, finishing, defensive motor', weaknesses: 'Perimeter shooting range' },
  { id: 'tre_johnson', name: 'Tre Johnson', position: 'SG', school: 'Texas', height: '6\'5"', weight: '185', age: 19, mockRank: 8, tier: 'Star', strengths: 'Shot creation, scoring instincts', weaknesses: 'Playmaking, decision-making' },
  { id: 'egor_demin', name: 'Egor Demin', position: 'PG', school: 'BYU', height: '6\'9"', weight: '180', age: 19, mockRank: 9, tier: 'Star', strengths: 'Size, passing, court vision', weaknesses: 'Frame, physicality' },
  { id: 'nolan_traore', name: 'Nolan Traore', position: 'PG', school: 'International', height: '6\'5"', weight: '190', age: 18, mockRank: 10, tier: 'Star', strengths: 'Speed, playmaking, upside', weaknesses: 'Shooting, decision-making' },
  
  // 11-20
  { id: 'jeremiah_fears', name: 'Jeremiah Fears', position: 'PG', school: 'Oklahoma', height: '6\'4"', weight: '185', age: 19, mockRank: 11, tier: 'Lottery', strengths: 'Scoring ability, athleticism', weaknesses: 'Shot selection, efficiency' },
  { id: 'khaman_maluach', name: 'Khaman Maluach', position: 'C', school: 'Duke', height: '7\'2"', weight: '250', age: 19, mockRank: 12, tier: 'Lottery', strengths: 'Rim protection, size, lob threat', weaknesses: 'Perimeter skills, foul trouble' },
  { id: 'cameron_boozer', name: 'Cameron Boozer', position: 'PF', school: 'Duke', height: '6\'10"', weight: '235', age: 18, mockRank: 13, tier: 'Lottery', strengths: 'Footwork, post game, passing', weaknesses: 'Athleticism, perimeter defense' },
  { id: 'jalil_bethea', name: 'Jalil Bethea', position: 'SG', school: 'Miami', height: '6\'5"', weight: '185', age: 19, mockRank: 14, tier: 'Lottery', strengths: 'Shot-making, scoring instincts', weaknesses: 'Playmaking, consistency' },
  { id: 'jalen_haralson', name: 'Jalen Haralson', position: 'SF', school: 'Michigan', height: '6\'8"', weight: '205', age: 19, mockRank: 15, tier: 'Lottery', strengths: 'Versatility, IQ, two-way potential', weaknesses: 'Shot creation, explosiveness' },
  { id: 'collin_murray_boyles', name: 'Collin Murray-Boyles', position: 'PF', school: 'South Carolina', height: '6\'8"', weight: '225', age: 20, mockRank: 16, tier: 'Lottery', strengths: 'Toughness, rebounding, motor', weaknesses: 'Shooting range, handles' },
  { id: 'boogie_fland', name: 'Boogie Fland', position: 'PG', school: 'Arkansas', height: '6\'2"', weight: '170', age: 19, mockRank: 17, tier: 'Lottery', strengths: 'Speed, scoring, handle', weaknesses: 'Size, finishing over length' },
  { id: 'dink_pate', name: 'Dink Pate', position: 'SF', school: 'G League', height: '6\'9"', weight: '190', age: 19, mockRank: 18, tier: 'First Round', strengths: 'Length, athleticism, upside', weaknesses: 'Frame, strength, polish' },
  { id: 'labaron_philon', name: 'Labaron Philon', position: 'PG', school: 'Alabama', height: '6\'3"', weight: '180', age: 19, mockRank: 19, tier: 'First Round', strengths: 'Quickness, scoring, floater', weaknesses: 'Size, playmaking' },
  { id: 'tyler_betsey', name: 'Tyler Betsey', position: 'SG', school: 'Cal', height: '6\'5"', weight: '180', age: 20, mockRank: 20, tier: 'First Round', strengths: 'Shooting, movement, IQ', weaknesses: 'Athleticism, creation' },
  
  // 21-30
  { id: 'flory_bidunga', name: 'Flory Bidunga', position: 'C', school: 'G League', height: '6\'10"', weight: '230', age: 18, mockRank: 21, tier: 'First Round', strengths: 'Defensive upside, shot blocking, lob threat', weaknesses: 'Offensive polish, shooting' },
  { id: 'liam_mcneeley', name: 'Liam McNeeley', position: 'SF', school: 'UConn', height: '6\'7"', weight: '195', age: 20, mockRank: 22, tier: 'First Round', strengths: 'Shooting, size, floor spacing', weaknesses: 'Ball handling, athleticism' },
  { id: 'drake_powell', name: 'Drake Powell', position: 'SF', school: 'North Carolina', height: '6\'7"', weight: '215', age: 19, mockRank: 23, tier: 'First Round', strengths: 'Defense, length, slashing', weaknesses: 'Perimeter shooting' },
  { id: 'cayden_boozer', name: 'Cayden Boozer', position: 'PG', school: 'Duke', height: '6\'4"', weight: '185', age: 18, mockRank: 24, tier: 'First Round', strengths: 'Court vision, playmaking, leadership', weaknesses: 'Athleticism, shot creation' },
  { id: 'johnuel_fland', name: 'Johnuel Fland', position: 'PG', school: 'Kentucky', height: '6\'5"', weight: '175', age: 19, mockRank: 25, tier: 'First Round', strengths: 'Size at PG, passing vision', weaknesses: 'Scoring, frame' },
  { id: 'miles_byrd', name: 'Miles Byrd', position: 'SF', school: 'San Diego State', height: '6\'7"', weight: '200', age: 21, mockRank: 26, tier: 'First Round', strengths: '3&D potential, length', weaknesses: 'Age, upside' },
  { id: 'eric_dailey', name: 'Eric Dailey', position: 'SF', school: 'G League', height: '6\'8"', weight: '215', age: 20, mockRank: 27, tier: 'First Round', strengths: 'Versatility, scoring, two-way', weaknesses: 'Consistency, polish' },
  { id: 'derik_queen', name: 'Derik Queen', position: 'C', school: 'Maryland', height: '6\'10"', weight: '250', age: 19, mockRank: 28, tier: 'First Round', strengths: 'Passing big, touch, IQ', weaknesses: 'Mobility, rim protection' },
  { id: 'ben_saraf', name: 'Ben Saraf', position: 'PG', school: 'International', height: '6\'5"', weight: '195', age: 19, mockRank: 29, tier: 'First Round', strengths: 'Size, playmaking, vision', weaknesses: 'Athleticism, defense' },
  { id: 'rakease_passmore', name: 'Rakease Passmore', position: 'SG', school: 'UAB', height: '6\'6"', weight: '190', age: 20, mockRank: 30, tier: 'First Round', strengths: 'Athleticism, energy, potential', weaknesses: 'Shooting, polish' },
  
  // Second Round 31-45
  { id: 'jacob_toppin', name: 'Jacob Toppin', position: 'PF', school: 'Kentucky', height: '6\'9"', weight: '220', age: 23, mockRank: 31, tier: 'Second Round', strengths: 'Athleticism, energy', weaknesses: 'Age, shooting' },
  { id: 'oso_ighodaro', name: 'Oso Ighodaro', position: 'C', school: 'Marquette', height: '6\'10"', weight: '225', age: 22, mockRank: 32, tier: 'Second Round', strengths: 'Passing, IQ, touch', weaknesses: 'Scoring, physicality' },
  { id: 'jp_pegues', name: 'JP Pegues', position: 'PF', school: 'Auburn', height: '6\'7"', weight: '240', age: 22, mockRank: 33, tier: 'Second Round', strengths: 'Strength, rebounding, shooting', weaknesses: 'Athleticism, speed' },
  { id: 'chris_johnson', name: 'Chris Johnson', position: 'SG', school: 'Various', height: '6\'5"', weight: '185', age: 20, mockRank: 34, tier: 'Second Round', strengths: 'Shooting, movement', weaknesses: 'Playmaking, defense' },
  { id: 'tahaad_pettiford', name: 'Tahaad Pettiford', position: 'PG', school: 'Auburn', height: '6\'0"', weight: '170', age: 19, mockRank: 35, tier: 'Second Round', strengths: 'Speed, handle, quick twitch', weaknesses: 'Size, finishing' },
  { id: 'baye_fall', name: 'Baye Fall', position: 'C', school: 'Arkansas', height: '6\'11"', weight: '205', age: 20, mockRank: 36, tier: 'Second Round', strengths: 'Rim protection, mobility', weaknesses: 'Offensive game, fouling' },
  { id: 'tucker_deruf', name: 'Tucker DeRuf', position: 'C', school: 'Wisconsin', height: '6\'11"', weight: '245', age: 22, mockRank: 37, tier: 'Second Round', strengths: 'Rebounding, toughness, IQ', weaknesses: 'Athleticism, mobility' },
  { id: 'jase_richardson', name: 'Jase Richardson', position: 'SG', school: 'Michigan State', height: '6\'4"', weight: '180', age: 19, mockRank: 38, tier: 'Second Round', strengths: 'Shooting, bloodline', weaknesses: 'Creation, consistency' },
  { id: 'great_osobor', name: 'Great Osobor', position: 'PF', school: 'Utah', height: '6\'8"', weight: '220', age: 23, mockRank: 39, tier: 'Second Round', strengths: 'Rebounding, motor, versatility', weaknesses: 'Age, shooting' },
  { id: 'harrison_ingram', name: 'Harrison Ingram', position: 'SF', school: 'North Carolina', height: '6\'7"', weight: '230', age: 21, mockRank: 40, tier: 'Second Round', strengths: 'Versatility, passing, IQ', weaknesses: 'Athleticism, shooting' },
  { id: 'peyton_watson', name: 'Trey Robinson', position: 'C', school: 'Ohio State', height: '7\'0"', weight: '235', age: 19, mockRank: 41, tier: 'Second Round', strengths: 'Size, rim protection, upside', weaknesses: 'Offensive skills, fouling' },
  { id: 'adou_thiero', name: 'Adou Thiero', position: 'SF', school: 'Tennessee', height: '6\'8"', weight: '210', age: 20, mockRank: 42, tier: 'Second Round', strengths: 'Athleticism, defense, transition', weaknesses: 'Shooting, half-court offense' },
  { id: 'jahki_howard', name: 'Jahki Howard', position: 'SG', school: 'Kansas', height: '6\'6"', weight: '190', age: 18, mockRank: 43, tier: 'Second Round', strengths: 'Upside, scoring instincts', weaknesses: 'Consistency, decision-making' },
  { id: 'tommaso_baldasso', name: 'Tommaso Baldasso', position: 'PG', school: 'International', height: '6\'3"', weight: '175', age: 24, mockRank: 44, tier: 'Second Round', strengths: 'Shooting, IQ, experience', weaknesses: 'Age, athleticism' },
  { id: 'pj_hall', name: 'PJ Hall', position: 'C', school: 'Clemson', height: '6\'10"', weight: '240', age: 22, mockRank: 45, tier: 'Second Round', strengths: 'Scoring big, touch, post moves', weaknesses: 'Defense, mobility' },
];

// Sample NBA Roster (simplified for one team - will expand with API import)
export const SAMPLE_ROSTERS = {
  LAL: [
    { id: 'lebron_james', name: 'LeBron James', position: 'SF', salary: 47607350, yearsRemaining: 2, age: 39, overall: 95 },
    { id: 'anthony_davis', name: 'Anthony Davis', position: 'PF', salary: 43219440, yearsRemaining: 3, age: 31, overall: 93 },
    { id: 'austin_reaves', name: 'Austin Reaves', position: 'SG', salary: 12016854, yearsRemaining: 4, age: 26, overall: 79 },
    { id: 'dangelo_russell', name: 'D\'Angelo Russell', position: 'PG', salary: 18692307, yearsRemaining: 1, age: 28, overall: 78 },
    { id: 'rui_hachimura', name: 'Rui Hachimura', position: 'PF', salary: 17000000, yearsRemaining: 3, age: 26, overall: 76 },
    { id: 'gabe_vincent', name: 'Gabe Vincent', position: 'PG', salary: 11000000, yearsRemaining: 2, age: 28, overall: 74 },
    { id: 'jarred_vanderbilt', name: 'Jarred Vanderbilt', position: 'SF', salary: 10714286, yearsRemaining: 2, age: 25, overall: 75 },
    { id: 'christian_wood', name: 'Christian Wood', position: 'C', salary: 3000000, yearsRemaining: 1, age: 28, overall: 73 },
  ],
  BOS: [
    { id: 'jayson_tatum', name: 'Jayson Tatum', position: 'SF', salary: 34848340, yearsRemaining: 5, age: 26, overall: 96 },
    { id: 'jaylen_brown', name: 'Jaylen Brown', position: 'SG', salary: 31824806, yearsRemaining: 4, age: 28, overall: 91 },
    { id: 'derrick_white', name: 'Derrick White', position: 'PG', salary: 18357143, yearsRemaining: 3, age: 30, overall: 83 },
    { id: 'jrue_holiday', name: 'Jrue Holiday', position: 'PG', salary: 30000000, yearsRemaining: 3, age: 34, overall: 85 },
    { id: 'al_horford', name: 'Al Horford', position: 'C', salary: 9500000, yearsRemaining: 1, age: 38, overall: 78 },
    { id: 'kristaps_porzingis', name: 'Kristaps Porzingis', position: 'C', salary: 29268293, yearsRemaining: 2, age: 29, overall: 87 },
    { id: 'sam_hauser', name: 'Sam Hauser', position: 'SF', salary: 2019706, yearsRemaining: 3, age: 27, overall: 72 },
  ],
  // More teams will be added dynamically via import
};

// Free agent market (sample - will be populated based on league state)
export const SAMPLE_FREE_AGENTS = [
  { id: 'paul_george', name: 'Paul George', position: 'SF', age: 34, askingPrice: 40000000, tier: 'Max', overall: 88 },
  { id: 'demar_derozan', name: 'DeMar DeRozan', position: 'SG', age: 35, askingPrice: 25000000, tier: 'Star', overall: 85 },
  { id: 'jonas_valanciunas', name: 'Jonas Valanciunas', position: 'C', age: 32, askingPrice: 15000000, tier: 'Starter', overall: 79 },
  { id: 'malik_beasley', name: 'Malik Beasley', position: 'SG', age: 28, askingPrice: 8000000, tier: 'Role', overall: 75 },
  { id: 'tobias_harris', name: 'Tobias Harris', position: 'PF', age: 32, askingPrice: 18000000, tier: 'Starter', overall: 78 },
  { id: 'buddy_hield', name: 'Buddy Hield', position: 'SG', age: 31, askingPrice: 12000000, tier: 'Role', overall: 76 },
  { id: 'gary_trent_jr', name: 'Gary Trent Jr.', position: 'SG', age: 25, askingPrice: 15000000, tier: 'Starter', overall: 77 },
  { id: 'caleb_martin', name: 'Caleb Martin', position: 'SF', age: 29, askingPrice: 10000000, tier: 'Role', overall: 74 },
  { id: 'nic_claxton', name: 'Nic Claxton', position: 'C', age: 25, askingPrice: 20000000, tier: 'Starter', overall: 80 },
  { id: 'patrick_beverley', name: 'Patrick Beverley', position: 'PG', age: 36, askingPrice: 3000000, tier: 'Minimum', overall: 68 },
  { id: 'gary_payton_ii', name: 'Gary Payton II', position: 'SG', age: 32, askingPrice: 8000000, tier: 'Role', overall: 73 },
  { id: 'royce_oneale', name: 'Royce O\'Neale', position: 'SF', age: 31, askingPrice: 7000000, tier: 'Role', overall: 72 },
  { id: 'mo_bamba', name: 'Mo Bamba', position: 'C', age: 26, askingPrice: 10000000, tier: 'Role', overall: 74 },
  { id: 'monte_morris', name: 'Monte Morris', position: 'PG', age: 29, askingPrice: 5000000, tier: 'Role', overall: 71 },
  { id: 'tj_warren', name: 'TJ Warren', position: 'SF', age: 31, askingPrice: 4000000, tier: 'Role', overall: 70 },
];

/**
 * Get player tier based on overall rating
 */
export function getPlayerTier(overall) {
  if (overall >= 90) return 'Superstar';
  if (overall >= 85) return 'All-Star';
  if (overall >= 80) return 'Quality Starter';
  if (overall >= 75) return 'Solid Starter';
  if (overall >= 70) return 'Rotation Player';
  if (overall >= 65) return 'Bench Player';
  return 'End of Bench';
}

/**
 * Calculate trade value for a player
 */
export function calculateTradeValue(player) {
  let value = player.overall * 100;
  
  // Age adjustment
  if (player.age < 25) value *= 1.3;
  else if (player.age < 28) value *= 1.1;
  else if (player.age > 32) value *= 0.7;
  else if (player.age > 35) value *= 0.4;
  
  // Contract adjustment
  if (player.yearsRemaining > 3) value *= 0.9;
  if (player.yearsRemaining === 1) value *= 0.8; // Expiring
  
  // Salary vs value
  const expectedSalary = player.overall * 300000;
  if (player.salary > expectedSalary * 1.5) value *= 0.8;
  if (player.salary < expectedSalary * 0.5) value *= 1.2;
  
  return Math.round(value);
}

/**
 * Check if trade salaries match CBA rules
 */
export function validateTradeSalaries(outgoingSalary, incomingSalary, capSpace, isOverCap) {
  if (!isOverCap) {
    // Under cap teams can absorb salary into cap space
    return incomingSalary <= capSpace + outgoingSalary;
  }
  
  // Over cap teams must match salaries within 125% + $100K
  const maxIncoming = (outgoingSalary * 1.25) + 100000;
  return incomingSalary <= maxIncoming;
}

/**
 * Calculate cap hit for a trade
 */
export function calculateTradeCapImpact(currentSalary, outgoingPlayers, incomingPlayers) {
  const outgoingTotal = outgoingPlayers.reduce((sum, p) => sum + p.salary, 0);
  const incomingTotal = incomingPlayers.reduce((sum, p) => sum + p.salary, 0);
  
  return {
    outgoingTotal,
    incomingTotal,
    netChange: incomingTotal - outgoingTotal,
    newSalary: currentSalary - outgoingTotal + incomingTotal
  };
}
