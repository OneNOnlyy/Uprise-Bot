import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../data');
const PATS_FILE = path.join(DATA_DIR, 'pats.json');

// Cache for session leaderboard (updated max once per minute)
let leaderboardCache = null;
let lastLeaderboardUpdate = 0;
const LEADERBOARD_CACHE_DURATION = 60000; // 1 minute in milliseconds

/**
 * Ensure data directory and file exist
 */
function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  if (!fs.existsSync(PATS_FILE)) {
    const initialData = {
      activeSessions: [],
      users: {},
      history: []
    };
    fs.writeFileSync(PATS_FILE, JSON.stringify(initialData, null, 2));
  }
}

/**
 * Read PATS data
 */
export function readPATSData() {
  ensureDataFile();
  const data = fs.readFileSync(PATS_FILE, 'utf8');
  return JSON.parse(data);
}

/**
 * Write PATS data
 */
export function writePATSData(data) {
  ensureDataFile();
  fs.writeFileSync(PATS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Create a new PATS session
 */
export function createPATSSession(date, games, participants) {
  const data = readPATSData();
  
  const session = {
    id: Date.now().toString(),
    date: date,
    games: games.map(game => ({
      id: game.id,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      commenceTime: game.commenceTime,
      homeSpread: game.homeSpread || 0,
      awaySpread: game.awaySpread || 0,
      favored: game.favored || null,
      spreadDisplay: game.spreadDisplay || {
        home: game.homeSpread ? (game.homeSpread > 0 ? `+${game.homeSpread}` : game.homeSpread.toString()) : 'N/A',
        away: game.awaySpread ? (game.awaySpread > 0 ? `+${game.awaySpread}` : game.awaySpread.toString()) : 'N/A'
      },
      result: null // Will be filled after game
    })),
    participants: participants,
    picks: {}, // userId: [{ gameId, pick, spread }]
    status: 'active',
    createdAt: new Date().toISOString()
  };
  
  data.activeSessions.push(session);
  writePATSData(data);
  
  return session;
}

/**
 * Get active PATS session
 */
export function getActiveSession() {
  const data = readPATSData();
  return data.activeSessions.find(s => s.status === 'active');
}

/**
 * Save a user's pick
 */
export function savePick(sessionId, userId, gameId, pick, spread, isDoubleDown = false) {
  const data = readPATSData();
  const session = data.activeSessions.find(s => s.id === sessionId);
  
  if (!session) {
    return false;
  }
  
  if (!session.picks[userId]) {
    session.picks[userId] = [];
  }
  
  // Check if user already has a double-down
  const existingDoubleDown = session.picks[userId].find(p => p.isDoubleDown);
  if (isDoubleDown && existingDoubleDown && existingDoubleDown.gameId !== gameId) {
    return { error: 'You already have a double-down on another game!' };
  }
  
  // Remove existing pick for this game if any
  session.picks[userId] = session.picks[userId].filter(p => p.gameId !== gameId);
  
  // Add new pick
  session.picks[userId].push({
    gameId,
    pick, // 'home' or 'away'
    spread,
    isDoubleDown: isDoubleDown || false,
    timestamp: new Date().toISOString()
  });
  
  writePATSData(data);
  return { success: true };
}

/**
 * Get user's picks for a session
 */
export function getUserPicks(sessionId, userId) {
  const data = readPATSData();
  const session = data.activeSessions.find(s => s.id === sessionId);
  
  if (!session || !session.picks[userId]) {
    return [];
  }
  
  return session.picks[userId];
}

/**
 * Update game result
 */
export function updateGameResult(sessionId, gameId, result) {
  const data = readPATSData();
  const session = data.activeSessions.find(s => s.id === sessionId);
  
  if (!session) {
    return false;
  }
  
  const game = session.games.find(g => g.id === gameId);
  if (!game) {
    return false;
  }
  
  // Check if game already has a result (avoid double-counting)
  if (game.result) {
    return false;
  }
  
  // Update game result
  game.result = result;
  
  // Calculate and update user stats immediately for this game
  for (const userId in session.picks) {
    const picks = session.picks[userId];
    const pick = picks.find(p => p.gameId === gameId);
    
    if (!pick) {
      // User didn't make a pick for this game - add a loss
      if (!data.users[userId]) {
        data.users[userId] = { 
          totalWins: 0, 
          totalLosses: 0, 
          sessions: 0,
          doubleDownsUsed: 0,
          doubleDownWins: 0,
          doubleDownLosses: 0
        };
      }
      data.users[userId].totalLosses += 1;
      continue;
    }
    
    // Calculate if pick won against the spread
    const homeScore = result.homeScore;
    const awayScore = result.awayScore;
    const adjustedHomeScore = homeScore + game.homeSpread;
    const adjustedAwayScore = awayScore + game.awaySpread;
    
    let pickWon = false;
    if (pick.pick === 'home') {
      pickWon = adjustedHomeScore > adjustedAwayScore;
    } else {
      pickWon = adjustedAwayScore > adjustedHomeScore;
    }
    
    // Initialize user if doesn't exist
    if (!data.users[userId]) {
      data.users[userId] = { 
        totalWins: 0, 
        totalLosses: 0, 
        sessions: 0,
        doubleDownsUsed: 0,
        doubleDownWins: 0,
        doubleDownLosses: 0
      };
    }
    
    // Update overall stats
    if (pickWon) {
      data.users[userId].totalWins += pick.isDoubleDown ? 2 : 1;
      if (pick.isDoubleDown) {
        data.users[userId].doubleDownWins += 1;
      }
    } else {
      data.users[userId].totalLosses += pick.isDoubleDown ? 2 : 1;
      if (pick.isDoubleDown) {
        data.users[userId].doubleDownLosses += 1;
      }
    }
  }
  
  writePATSData(data);
  return true;
}

/**
 * Close a PATS session and calculate results
 */
export function closePATSSession(sessionId, gameResults) {
  const data = readPATSData();
  const session = data.activeSessions.find(s => s.id === sessionId);
  
  if (!session) {
    return false;
  }
  
  // Update any remaining game results that weren't already updated
  gameResults.forEach(result => {
    const game = session.games.find(g => g.id === result.gameId);
    if (game && !game.result) {
      game.result = result; // { homeScore, awayScore, winner }
    }
  });
  
  // Calculate wins/losses for each user (for session results record only)
  const userResults = {};
  
  // Process all participants (including those with no picks)
  session.participants.forEach(userId => {
    const picks = session.picks[userId] || [];
    let wins = 0;
    let losses = 0;
    let missedPicks = 0;
    
    // Initialize user if doesn't exist
    if (!data.users[userId]) {
      data.users[userId] = { 
        totalWins: 0, 
        totalLosses: 0, 
        sessions: 0,
        doubleDownsUsed: 0,
        doubleDownWins: 0,
        doubleDownLosses: 0
      };
    }
    
    // Check each game in the session
    session.games.forEach(game => {
      const pick = picks.find(p => p.gameId === game.id);
      
      if (!pick) {
        // No pick made for this game - automatic loss
        losses++;
        missedPicks++;
        
        // Only add to overall stats if game result wasn't already processed
        // (games without picks wouldn't have been processed by updateGameResult)
        if (game.result && game.result.status === 'Final') {
          // This will be counted as 1 loss per missed game
          // Note: updateGameResult already handles this for games that finished,
          // but we need to ensure all participants get the loss
          const alreadyCounted = true; // Assume updateGameResult handled it
          if (!alreadyCounted) {
            data.users[userId].totalLosses += 1;
          }
        }
      } else if (game.result) {
        // Pick was made, calculate result (for session record)
        const homeScore = game.result.homeScore;
        const awayScore = game.result.awayScore;
        
        // Calculate if pick won against the spread
        const adjustedHomeScore = homeScore + game.homeSpread;
        const adjustedAwayScore = awayScore + game.awaySpread;
        
        let pickWon = false;
        if (pick.pick === 'home') {
          pickWon = adjustedHomeScore > adjustedAwayScore;
        } else {
          pickWon = adjustedAwayScore > adjustedHomeScore;
        }
        
        if (pickWon) {
          wins += pick.isDoubleDown ? 2 : 1;
        } else {
          losses += pick.isDoubleDown ? 2 : 1;
        }
        
        // Note: Overall stats already updated by updateGameResult in real-time
        // We don't add to totalWins/totalLosses here to avoid double-counting
      }
    });
    
    userResults[userId] = { wins, losses, missedPicks };
    
    // Track double-down usage (increment once per session when user uses DD)
    const userDoubleDown = picks.find(p => p.isDoubleDown);
    if (userDoubleDown) {
      // Check if we haven't already incremented doubleDownsUsed for this session
      // We increment this once at session close regardless of when stats were calculated
      data.users[userId].doubleDownsUsed += 1;
    }
    
    // Increment session count (this only happens at session close)
    data.users[userId].sessions += 1;
  });
  
  session.status = 'closed';
  session.results = userResults;
  session.closedAt = new Date().toISOString();
  
  // Move to history
  data.history.push(session);
  data.activeSessions = data.activeSessions.filter(s => s.id !== sessionId);
  
  writePATSData(data);
  return userResults;
}

/**
 * Get leaderboard
 */
export function getLeaderboard() {
  const data = readPATSData();
  
  const leaderboard = Object.keys(data.users).map(userId => ({
    userId,
    ...data.users[userId],
    winPercentage: data.users[userId].totalWins / (data.users[userId].totalWins + data.users[userId].totalLosses) * 100 || 0
  }));
  
  // Sort by win percentage, then by total wins
  leaderboard.sort((a, b) => {
    if (b.winPercentage !== a.winPercentage) {
      return b.winPercentage - a.winPercentage;
    }
    return b.totalWins - a.totalWins;
  });
  
  return leaderboard;
}

/**
 * Get user's overall stats
 */
export function getUserStats(userId) {
  const data = readPATSData();
  
  if (!data.users[userId]) {
    return {
      totalWins: 0,
      totalLosses: 0,
      sessions: 0,
      winPercentage: 0,
      currentStreak: 0,
      streakType: null,
      bestStreak: 0,
      doubleDownsUsed: 0,
      doubleDownWins: 0,
      doubleDownLosses: 0,
      doubleDownWinRate: 0
    };
  }
  
  const user = data.users[userId];
  const totalGames = user.totalWins + user.totalLosses;
  const winPercentage = totalGames > 0 ? (user.totalWins / totalGames * 100) : 0;
  
  // Calculate double-down win rate
  const ddTotal = (user.doubleDownWins || 0) + (user.doubleDownLosses || 0);
  const ddWinRate = ddTotal > 0 ? ((user.doubleDownWins || 0) / ddTotal * 100) : 0;
  
  // Calculate streaks from history
  let currentStreak = 0;
  let streakType = null;
  let bestStreak = 0;
  let tempStreak = 0;
  let lastResult = null;
  
  // Get all sessions this user participated in, sorted by date
  const userSessions = data.history
    .filter(s => s.results && s.results[userId])
    .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));
  
  for (const session of userSessions) {
    const result = session.results[userId];
    const sessionWon = result.wins > result.losses;
    
    // Current streak (most recent)
    if (currentStreak === 0) {
      currentStreak = 1;
      streakType = sessionWon ? 'win' : 'loss';
      lastResult = sessionWon;
    } else if (lastResult === sessionWon) {
      currentStreak++;
    } else {
      // Streak broken
      break;
    }
    
    // Best streak calculation
    if (sessionWon) {
      tempStreak++;
      bestStreak = Math.max(bestStreak, tempStreak);
    } else {
      tempStreak = 0;
    }
  }
  
  return {
    totalWins: user.totalWins,
    totalLosses: user.totalLosses,
    sessions: user.sessions,
    winPercentage: winPercentage,
    currentStreak: currentStreak,
    streakType: streakType,
    bestStreak: bestStreak,
    doubleDownsUsed: user.doubleDownsUsed || 0,
    doubleDownWins: user.doubleDownWins || 0,
    doubleDownLosses: user.doubleDownLosses || 0,
    doubleDownWinRate: ddWinRate
  };
}

/**
 * Get user's current session stats
 */
export function getCurrentSessionStats(userId) {
  const session = getActiveSession();
  if (!session) {
    return null;
  }
  
  const picks = session.picks[userId] || [];
  const now = new Date();
  
  let wins = 0;
  let losses = 0;
  let pending = 0;
  let doubleDownGame = null;
  
  for (const pick of picks) {
    const game = session.games.find(g => g.id === pick.gameId);
    if (!game) continue;
    
    if (pick.isDoubleDown) {
      doubleDownGame = game;
    }
    
    // Check if game has result
    if (game.result && game.result.status === 'Final') {
      const homeScore = game.result.homeScore;
      const awayScore = game.result.awayScore;
      
      const adjustedHomeScore = homeScore + game.homeSpread;
      const adjustedAwayScore = awayScore + game.awaySpread;
      
      let pickWon = false;
      if (pick.pick === 'home') {
        pickWon = adjustedHomeScore > adjustedAwayScore;
      } else {
        pickWon = adjustedAwayScore > adjustedHomeScore;
      }
      
      if (pickWon) {
        wins += pick.isDoubleDown ? 2 : 1;
      } else {
        losses += pick.isDoubleDown ? 2 : 1;
      }
    } else if (new Date(game.commenceTime) < now) {
      // Game is locked but no result yet
      pending++;
    }
  }
  
  // Check for missed picks
  const lockedGames = session.games.filter(g => new Date(g.commenceTime) < now);
  const pickedGameIds = picks.map(p => p.gameId);
  const missedCount = lockedGames.filter(g => !pickedGameIds.includes(g.id)).length;
  
  return {
    wins,
    losses,
    pending,
    totalPicks: picks.length,
    totalGames: session.games.length,
    missedPicks: missedCount,
    doubleDownGame
  };
}

/**
 * Get live session leaderboard (cached for 1 minute)
 * Shows current standings for active session with real-time win/loss tracking
 */
export function getLiveSessionLeaderboard(forceUpdate = false) {
  const now = Date.now();
  
  // Return cached data if within cache duration
  if (!forceUpdate && leaderboardCache && (now - lastLeaderboardUpdate) < LEADERBOARD_CACHE_DURATION) {
    return leaderboardCache;
  }
  
  const session = getActiveSession();
  if (!session) {
    leaderboardCache = null;
    return null;
  }
  
  const standings = [];
  
  // Calculate stats for all participants
  for (const userId in session.picks) {
    const picks = session.picks[userId];
    let wins = 0;
    let losses = 0;
    let pending = 0;
    
    for (const pick of picks) {
      const game = session.games.find(g => g.id === pick.gameId);
      if (!game) continue;
      
      // Check if game has result
      if (game.result && game.result.status === 'Final') {
        const homeScore = game.result.homeScore;
        const awayScore = game.result.awayScore;
        
        const adjustedHomeScore = homeScore + game.homeSpread;
        const adjustedAwayScore = awayScore + game.awaySpread;
        
        let pickWon = false;
        if (pick.pick === 'home') {
          pickWon = adjustedHomeScore > adjustedAwayScore;
        } else {
          pickWon = adjustedAwayScore > adjustedHomeScore;
        }
        
        if (pickWon) {
          wins += pick.isDoubleDown ? 2 : 1;
        } else {
          losses += pick.isDoubleDown ? 2 : 1;
        }
      } else if (new Date(game.commenceTime) < new Date()) {
        // Game is locked but no result yet
        pending++;
      }
    }
    
    // Check for missed picks on locked games
    const lockedGames = session.games.filter(g => new Date(g.commenceTime) < new Date());
    const pickedGameIds = picks.map(p => p.gameId);
    const missedCount = lockedGames.filter(g => !pickedGameIds.includes(g.id)).length;
    losses += missedCount;
    
    const totalComplete = wins + losses;
    const winPercentage = totalComplete > 0 ? (wins / totalComplete * 100) : 0;
    
    standings.push({
      userId,
      wins,
      losses,
      pending,
      totalPicks: picks.length,
      missedPicks: missedCount,
      winPercentage,
      totalComplete
    });
  }
  
  // Sort by win percentage (min 1 completed game), then by wins
  standings.sort((a, b) => {
    if (a.totalComplete === 0 && b.totalComplete === 0) {
      return b.totalPicks - a.totalPicks; // Most picks made
    }
    if (a.totalComplete === 0) return 1;
    if (b.totalComplete === 0) return -1;
    
    if (b.winPercentage !== a.winPercentage) {
      return b.winPercentage - a.winPercentage;
    }
    return b.wins - a.wins;
  });
  
  leaderboardCache = {
    standings,
    session,
    lastUpdate: now
  };
  lastLeaderboardUpdate = now;
  
  return leaderboardCache;
}

/**
 * Force update the leaderboard cache (called when game results are updated)
 */
export function updateLeaderboardCache() {
  return getLiveSessionLeaderboard(true);
}

