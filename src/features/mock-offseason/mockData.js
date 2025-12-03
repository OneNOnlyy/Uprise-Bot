/**
 * Mock Offseason - Data Management
 * Handles all data storage and retrieval for the Mock Offseason system
 * 
 * This is a completely separate system from PATS and other features
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data paths - completely separate from other systems
const DATA_DIR = path.join(__dirname, '../../../data/mock-offseason');
const LEAGUE_FILE = path.join(DATA_DIR, 'league-settings.json');
const TEAMS_DIR = path.join(DATA_DIR, 'teams');
const PLAYERS_DIR = path.join(DATA_DIR, 'players');
const TRANSACTIONS_DIR = path.join(DATA_DIR, 'transactions');

// CBA Constants (2024-25 Season)
export const CBA = {
  SALARY_CAP: 140588000,
  LUXURY_TAX: 170814000,
  FIRST_APRON: 178655000,
  SECOND_APRON: 189489000,
  NON_TAXPAYER_MLE: 12850000,
  TAXPAYER_MLE: 5180000,
  BI_ANNUAL_EXCEPTION: 4760000,
  ROOM_EXCEPTION: 7715000,
  MAX_CASH_IN_TRADE: 5880000,
  
  // Minimum salaries by years of experience
  MINIMUM_SALARIES: {
    0: 1157153,
    1: 1934215,
    2: 2195867,
    3: 2265127,
    4: 2365196,
    5: 2561042,
    6: 2756888,
    7: 2952734,
    8: 3148580,
    9: 3344426,
    10: 3340346
  }
};

// League phases
export const PHASES = {
  SETUP: 'setup',
  GM_LOTTERY: 'gm_lottery',
  PRE_DRAFT: 'pre_draft',
  DRAFT_LOTTERY: 'draft_lottery',
  DRAFT: 'draft',
  FREE_AGENCY_MORATORIUM: 'fa_moratorium',
  FREE_AGENCY: 'free_agency',
  TRAINING_CAMP: 'training_camp',
  REGULAR_SEASON: 'regular_season',
  TRADE_DEADLINE: 'trade_deadline',
  PLAYOFFS: 'playoffs',
  OFFSEASON: 'offseason'
};

// NBA Teams data
export const NBA_TEAMS = {
  ATL: { name: 'Atlanta Hawks', city: 'Atlanta', conference: 'Eastern', division: 'Southeast' },
  BOS: { name: 'Boston Celtics', city: 'Boston', conference: 'Eastern', division: 'Atlantic' },
  BKN: { name: 'Brooklyn Nets', city: 'Brooklyn', conference: 'Eastern', division: 'Atlantic' },
  CHA: { name: 'Charlotte Hornets', city: 'Charlotte', conference: 'Eastern', division: 'Southeast' },
  CHI: { name: 'Chicago Bulls', city: 'Chicago', conference: 'Eastern', division: 'Central' },
  CLE: { name: 'Cleveland Cavaliers', city: 'Cleveland', conference: 'Eastern', division: 'Central' },
  DAL: { name: 'Dallas Mavericks', city: 'Dallas', conference: 'Western', division: 'Southwest' },
  DEN: { name: 'Denver Nuggets', city: 'Denver', conference: 'Western', division: 'Northwest' },
  DET: { name: 'Detroit Pistons', city: 'Detroit', conference: 'Eastern', division: 'Central' },
  GSW: { name: 'Golden State Warriors', city: 'San Francisco', conference: 'Western', division: 'Pacific' },
  HOU: { name: 'Houston Rockets', city: 'Houston', conference: 'Western', division: 'Southwest' },
  IND: { name: 'Indiana Pacers', city: 'Indianapolis', conference: 'Eastern', division: 'Central' },
  LAC: { name: 'LA Clippers', city: 'Los Angeles', conference: 'Western', division: 'Pacific' },
  LAL: { name: 'Los Angeles Lakers', city: 'Los Angeles', conference: 'Western', division: 'Pacific' },
  MEM: { name: 'Memphis Grizzlies', city: 'Memphis', conference: 'Western', division: 'Southwest' },
  MIA: { name: 'Miami Heat', city: 'Miami', conference: 'Eastern', division: 'Southeast' },
  MIL: { name: 'Milwaukee Bucks', city: 'Milwaukee', conference: 'Eastern', division: 'Central' },
  MIN: { name: 'Minnesota Timberwolves', city: 'Minneapolis', conference: 'Western', division: 'Northwest' },
  NOP: { name: 'New Orleans Pelicans', city: 'New Orleans', conference: 'Western', division: 'Southwest' },
  NYK: { name: 'New York Knicks', city: 'New York', conference: 'Eastern', division: 'Atlantic' },
  OKC: { name: 'Oklahoma City Thunder', city: 'Oklahoma City', conference: 'Western', division: 'Northwest' },
  ORL: { name: 'Orlando Magic', city: 'Orlando', conference: 'Eastern', division: 'Southeast' },
  PHI: { name: 'Philadelphia 76ers', city: 'Philadelphia', conference: 'Eastern', division: 'Atlantic' },
  PHX: { name: 'Phoenix Suns', city: 'Phoenix', conference: 'Western', division: 'Pacific' },
  POR: { name: 'Portland Trail Blazers', city: 'Portland', conference: 'Western', division: 'Northwest' },
  SAC: { name: 'Sacramento Kings', city: 'Sacramento', conference: 'Western', division: 'Pacific' },
  SAS: { name: 'San Antonio Spurs', city: 'San Antonio', conference: 'Western', division: 'Southwest' },
  TOR: { name: 'Toronto Raptors', city: 'Toronto', conference: 'Eastern', division: 'Atlantic' },
  UTA: { name: 'Utah Jazz', city: 'Salt Lake City', conference: 'Western', division: 'Northwest' },
  WAS: { name: 'Washington Wizards', city: 'Washington', conference: 'Eastern', division: 'Southeast' }
};

/**
 * Ensure data directories exist
 */
async function ensureDirectories() {
  const dirs = [DATA_DIR, TEAMS_DIR, PLAYERS_DIR, TRANSACTIONS_DIR];
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory already exists
    }
  }
}

/**
 * Get the Mock Offseason league for a guild
 */
export async function getMockLeague(guildId) {
  await ensureDirectories();
  
  try {
    const data = await fs.readFile(LEAGUE_FILE, 'utf-8');
    const leagues = JSON.parse(data);
    return leagues[guildId] || null;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Save the Mock Offseason league for a guild
 */
export async function saveMockLeague(guildId, leagueData) {
  await ensureDirectories();
  
  let leagues = {};
  try {
    const data = await fs.readFile(LEAGUE_FILE, 'utf-8');
    leagues = JSON.parse(data);
  } catch (error) {
    // File doesn't exist yet
  }
  
  leagues[guildId] = {
    ...leagueData,
    updatedAt: new Date().toISOString()
  };
  
  await fs.writeFile(LEAGUE_FILE, JSON.stringify(leagues, null, 2));
  return leagues[guildId];
}

/**
 * Create a new Mock Offseason league
 */
export async function createMockLeague(guildId, seasonName, createdBy) {
  const league = {
    leagueId: `${guildId}_${Date.now()}`,
    guildId,
    seasonName,
    phase: PHASES.SETUP,
    phaseStartTime: null,
    phaseEndTime: null,
    createdBy,
    createdAt: new Date().toISOString(),
    
    // CBA Settings
    salaryCap: CBA.SALARY_CAP,
    luxuryTax: CBA.LUXURY_TAX,
    firstApron: CBA.FIRST_APRON,
    secondApron: CBA.SECOND_APRON,
    
    // GM Lottery settings
    lotterySettings: {
      enabled: true,
      registrationOpen: false,
      registeredUsers: [],
      lotteryOrder: [],
      currentPick: 0,
      selectionTimeLimit: 300000, // 5 minutes
      autoAssignOnTimeout: true
    },
    
    // Timing settings (in ms)
    timingConfig: {
      gmLotteryRegistration: 604800000, // 7 days
      gmLotteryPick: 300000, // 5 minutes
      draftPick: 180000, // 3 minutes
      draftPickTop5: 300000, // 5 minutes
      tradeProposalExpiration: 86400000, // 24 hours
      freeAgentOfferExpiration: 172800000, // 48 hours
      faMoratorium: 259200000, // 3 days
    },
    
    // Teams with GMs assigned
    teams: {},
    
    // Pending trades
    pendingTrades: [],
    
    // Transaction log
    transactions: [],
    
    // Settings
    settings: {
      requireCommissioner: true,
      allowMultiTeamTrades: true,
      maxTradePartners: 3,
      communityVeto: false,
      vetoThreshold: 0.66,
      hardCapEnforcement: true,
      stepienRuleEnforced: true
    },
    
    // Pause state
    isPaused: false,
    pausedAt: null
  };
  
  return await saveMockLeague(guildId, league);
}

/**
 * Get the team a user is GM of
 */
export async function getUserTeam(guildId, userId) {
  const league = await getMockLeague(guildId);
  if (!league) return null;
  
  for (const [teamId, teamData] of Object.entries(league.teams)) {
    if (teamData.gm === userId || (teamData.assistantGMs && teamData.assistantGMs.includes(userId))) {
      return { teamId, ...teamData, isAssistant: teamData.gm !== userId };
    }
  }
  return null;
}

/**
 * Get a specific team's data
 */
export async function getTeamData(guildId, teamId) {
  const league = await getMockLeague(guildId);
  if (!league || !league.teams[teamId]) return null;
  
  return { teamId, ...league.teams[teamId] };
}

/**
 * Assign a user as GM of a team
 */
export async function assignGM(guildId, userId, teamId) {
  const league = await getMockLeague(guildId);
  if (!league) throw new Error('No league exists');
  
  // Check if team exists
  if (!NBA_TEAMS[teamId]) throw new Error('Invalid team');
  
  // Check if user is already a GM
  const existingTeam = await getUserTeam(guildId, userId);
  if (existingTeam) throw new Error('User is already a GM');
  
  // Check if team already has a GM
  if (league.teams[teamId]?.gm) throw new Error('Team already has a GM');
  
  // Initialize team if needed
  if (!league.teams[teamId]) {
    league.teams[teamId] = {
      teamName: NBA_TEAMS[teamId].name,
      gm: null,
      assistantGMs: [],
      roster: [],
      draftPicks: [],
      capSpace: {
        totalSalary: 0,
        exceptions: {}
      },
      transactionHistory: []
    };
  }
  
  league.teams[teamId].gm = userId;
  league.teams[teamId].assignedAt = new Date().toISOString();
  league.teams[teamId].assignedVia = 'admin';
  
  await saveMockLeague(guildId, league);
  return league.teams[teamId];
}

/**
 * Remove a GM from their team
 */
export async function removeGM(guildId, userId) {
  const league = await getMockLeague(guildId);
  if (!league) throw new Error('No league exists');
  
  const userTeam = await getUserTeam(guildId, userId);
  if (!userTeam) throw new Error('User is not a GM');
  
  league.teams[userTeam.teamId].gm = null;
  league.teams[userTeam.teamId].assistantGMs = league.teams[userTeam.teamId].assistantGMs.filter(id => id !== userId);
  
  await saveMockLeague(guildId, league);
}

/**
 * Get the current league phase
 */
export async function getLeaguePhase(guildId) {
  const league = await getMockLeague(guildId);
  if (!league) return null;
  
  return {
    phase: league.phase,
    startTime: league.phaseStartTime,
    endTime: league.phaseEndTime,
    isPaused: league.isPaused
  };
}

/**
 * Advance to the next phase
 */
export async function advancePhase(guildId) {
  const league = await getMockLeague(guildId);
  if (!league) throw new Error('No league exists');
  
  const phaseOrder = Object.values(PHASES);
  const currentIndex = phaseOrder.indexOf(league.phase);
  const nextPhase = phaseOrder[currentIndex + 1] || PHASES.OFFSEASON;
  
  league.phase = nextPhase;
  league.phaseStartTime = new Date().toISOString();
  league.phaseEndTime = null; // Will be set based on timing config
  
  await saveMockLeague(guildId, league);
  return nextPhase;
}

/**
 * Add a transaction to the log
 */
export async function addTransaction(guildId, transaction) {
  const league = await getMockLeague(guildId);
  if (!league) throw new Error('No league exists');
  
  const txn = {
    id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    ...transaction
  };
  
  league.transactions.push(txn);
  
  // Also add to team's transaction history
  if (transaction.teams) {
    for (const teamId of transaction.teams) {
      if (league.teams[teamId]) {
        league.teams[teamId].transactionHistory = league.teams[teamId].transactionHistory || [];
        league.teams[teamId].transactionHistory.push(txn.id);
      }
    }
  }
  
  await saveMockLeague(guildId, league);
  return txn;
}

/**
 * Register user for GM lottery
 */
export async function registerForLottery(guildId, userId) {
  const league = await getMockLeague(guildId);
  if (!league) throw new Error('No league exists');
  if (!league.lotterySettings.registrationOpen) throw new Error('Lottery registration is not open');
  if (league.lotterySettings.registeredUsers.includes(userId)) throw new Error('Already registered');
  if (league.lotterySettings.registeredUsers.length >= 30) throw new Error('Lottery is full');
  
  league.lotterySettings.registeredUsers.push(userId);
  await saveMockLeague(guildId, league);
  
  return league.lotterySettings.registeredUsers.length;
}

/**
 * Unregister user from GM lottery
 */
export async function unregisterFromLottery(guildId, userId) {
  const league = await getMockLeague(guildId);
  if (!league) throw new Error('No league exists');
  if (!league.lotterySettings.registrationOpen) throw new Error('Lottery registration is not open');
  
  const index = league.lotterySettings.registeredUsers.indexOf(userId);
  if (index === -1) throw new Error('Not registered');
  
  league.lotterySettings.registeredUsers.splice(index, 1);
  await saveMockLeague(guildId, league);
  
  return league.lotterySettings.registeredUsers.length;
}

/**
 * Run the GM lottery drawing
 */
export async function runGMLottery(guildId) {
  const league = await getMockLeague(guildId);
  if (!league) throw new Error('No league exists');
  if (league.lotterySettings.registeredUsers.length === 0) throw new Error('No users registered');
  
  // Shuffle the registered users to create lottery order
  const shuffled = [...league.lotterySettings.registeredUsers];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  league.lotterySettings.lotteryOrder = shuffled;
  league.lotterySettings.registrationOpen = false;
  league.lotterySettings.currentPick = 1;
  league.phase = PHASES.GM_LOTTERY;
  league.phaseStartTime = new Date().toISOString();
  
  await saveMockLeague(guildId, league);
  return shuffled;
}

/**
 * Check if user is an admin (for Mock Offseason purposes)
 */
export function isAdmin(member) {
  return member.permissions.has('Administrator');
}

/**
 * Format currency
 */
export function formatCurrency(amount) {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  } else if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }
  return `$${amount.toLocaleString()}`;
}

/**
 * Format full currency (no abbreviation)
 */
export function formatFullCurrency(amount) {
  return `$${amount.toLocaleString()}`;
}
