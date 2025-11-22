import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../data');
const PATS_FILE = path.join(DATA_DIR, 'pats.json');

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
export function savePick(sessionId, userId, gameId, pick, spread) {
  const data = readPATSData();
  const session = data.activeSessions.find(s => s.id === sessionId);
  
  if (!session) {
    return false;
  }
  
  if (!session.picks[userId]) {
    session.picks[userId] = [];
  }
  
  // Remove existing pick for this game if any
  session.picks[userId] = session.picks[userId].filter(p => p.gameId !== gameId);
  
  // Add new pick
  session.picks[userId].push({
    gameId,
    pick, // 'home' or 'away'
    spread,
    timestamp: new Date().toISOString()
  });
  
  writePATSData(data);
  return true;
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
 * Close a PATS session and calculate results
 */
export function closePATSSession(sessionId, gameResults) {
  const data = readPATSData();
  const session = data.activeSessions.find(s => s.id === sessionId);
  
  if (!session) {
    return false;
  }
  
  // Update game results
  gameResults.forEach(result => {
    const game = session.games.find(g => g.id === result.gameId);
    if (game) {
      game.result = result; // { homeScore, awayScore, winner }
    }
  });
  
  // Calculate wins/losses for each user
  const userResults = {};
  
  // First, process all participants (including those with no picks)
  session.participants.forEach(userId => {
    const picks = session.picks[userId] || [];
    let wins = 0;
    let losses = 0;
    let missedPicks = 0;
    
    // Check each game in the session
    session.games.forEach(game => {
      const pick = picks.find(p => p.gameId === game.id);
      
      if (!pick) {
        // No pick made for this game - automatic loss
        losses++;
        missedPicks++;
      } else if (game.result) {
        // Pick was made, calculate result
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
          wins++;
        } else {
          losses++;
        }
      }
    });
    
    userResults[userId] = { wins, losses, missedPicks };
    
    // Update user stats
    if (!data.users[userId]) {
      data.users[userId] = { totalWins: 0, totalLosses: 0, sessions: 0 };
    }
    data.users[userId].totalWins += wins;
    data.users[userId].totalLosses += losses;
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
