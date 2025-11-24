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
      // Handle both camelCase (homeTeam) and snake_case (home_team) from different sources
      homeTeam: game.homeTeam || game.home_team,
      awayTeam: game.awayTeam || game.away_team,
      commenceTime: game.commenceTime || game.commence_time,
      timeString: game.timeString,
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
  
  // Allow live score updates to override previous statuses
  // Only prevent overwrites if BOTH existing and new are Final (confirmed final)
  if (game.result && game.result.status === 'Final' && result.status === 'Final') {
    // Both are final, no need to update
    return false;
  }
  
  // Track if we need to revert previous stats (if game was already processed)
  const hadPreviousResult = game.result && game.result.status === 'Final';
  const previousResult = hadPreviousResult ? { ...game.result } : null;
  
  // Allow updating live scores or setting final results
  game.result = result;
  
  // Only update user stats if game is FINAL (not for live updates)
  if (result.status !== 'Final') {
    writePATSData(data);
    return true;
  }
  
  // If we already processed this game as final, revert the old stats first
  if (hadPreviousResult) {
    console.log(`[PATS] Game ${gameId} was already final, reverting previous stats before applying new ones`);
    
    for (const userId in session.picks) {
      const picks = session.picks[userId];
      const pick = picks.find(p => p.gameId === gameId);
      
      if (!pick || !data.users[userId]) continue;
      
      const oldHomeScore = previousResult.homeScore;
      const oldAwayScore = previousResult.awayScore;
      const awaySpread = game.awaySpread !== undefined ? game.awaySpread : 0;
      const homeSpread = game.homeSpread !== undefined ? game.homeSpread : 0;
      const oldAdjustedHomeScore = oldHomeScore + homeSpread;
      const oldAdjustedAwayScore = oldAwayScore + awaySpread;
      
      // Revert the old result
      if (pick.pick === 'home') {
        if (oldAdjustedHomeScore === oldAwayScore) {
          data.users[userId].totalPushes -= 1;
          if (pick.isDoubleDown) data.users[userId].doubleDownPushes -= 1;
        } else if (oldAdjustedHomeScore > oldAwayScore) {
          data.users[userId].totalWins -= pick.isDoubleDown ? 2 : 1;
          if (pick.isDoubleDown) data.users[userId].doubleDownWins -= 1;
        } else {
          data.users[userId].totalLosses -= pick.isDoubleDown ? 2 : 1;
          if (pick.isDoubleDown) data.users[userId].doubleDownLosses -= 1;
        }
      } else {
        if (oldAdjustedAwayScore === oldHomeScore) {
          data.users[userId].totalPushes -= 1;
          if (pick.isDoubleDown) data.users[userId].doubleDownPushes -= 1;
        } else if (oldAdjustedAwayScore > oldHomeScore) {
          data.users[userId].totalWins -= pick.isDoubleDown ? 2 : 1;
          if (pick.isDoubleDown) data.users[userId].doubleDownWins -= 1;
        } else {
          data.users[userId].totalLosses -= pick.isDoubleDown ? 2 : 1;
          if (pick.isDoubleDown) data.users[userId].doubleDownLosses -= 1;
        }
      }
    }
  }
  
  // Calculate and update user stats immediately for this game (FINAL games only)
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
    
    // Spread betting: If a team has a -9 spread, they must win by MORE than 9 points
    // The spread is added to the team's score, so if away has -9, we add -9 to away score
    // Example: Away wins 113-100 (13 point win), away spread is -9
    //   adjustedAwayScore = 113 + (-9) = 104
    //   adjustedHomeScore = 100 + (+9) = 109
    //   104 > 109 = FALSE, so away pick loses (didn't cover the -9 spread)
    // Wait, that's wrong! Spreads should be opposite. Let me recalculate...
    
    // CORRECT: If away is -9, they need to win by MORE than 9
    // awayScore - homeScore > 9
    // awayScore > homeScore + 9
    // awayScore - 9 > homeScore
    // So: (awayScore + awaySpread) > homeScore when awaySpread = -9
    
    const margin = awayScore - homeScore; // Positive if away won
    
    console.log(`[PATS] ========================================`);
    console.log(`[PATS] Game ${gameId}: ${game.awayTeam} ${awayScore} @ ${game.homeTeam} ${homeScore}`);
    console.log(`[PATS] Margin: ${margin > 0 ? 'Away +' + margin : 'Home +' + Math.abs(margin)}`);
    console.log(`[PATS] Spreads stored: Away=${game.awaySpread}, Home=${game.homeSpread}`);
    console.log(`[PATS] User pick: ${pick.pick.toUpperCase()}`);
    
    // Safety check and use stored spread values
    const awaySpread = game.awaySpread !== undefined ? game.awaySpread : 0;
    const homeSpread = game.homeSpread !== undefined ? game.homeSpread : 0;
    
    if (awaySpread === 0 && homeSpread === 0) {
      console.warn(`[PATS] WARNING: Both spreads are 0 for game ${gameId}!`);
    }
    
    let pickWon = false;
    if (pick.pick === 'home') {
      // User picked home. Home covers if: homeScore + homeSpread > awayScore
      const homeCovered = (homeScore + homeSpread) > awayScore;
      pickWon = homeCovered;
      console.log(`[PATS] HOME calculation: ${homeScore} + (${homeSpread}) = ${homeScore + homeSpread} vs ${awayScore} => ${pickWon ? '✅ WIN' : '❌ LOSS'}`);
    } else {
      // User picked away. Away covers if: awayScore + awaySpread > homeScore
      const awayCovered = (awayScore + awaySpread) > homeScore;
      pickWon = awayCovered;
      console.log(`[PATS] AWAY calculation: ${awayScore} + (${awaySpread}) = ${awayScore + awaySpread} vs ${homeScore} => ${pickWon ? '✅ WIN' : '❌ LOSS'}`);
    }
    console.log(`[PATS] ========================================`);
    
    // Initialize user if doesn't exist
    if (!data.users[userId]) {
      data.users[userId] = { 
        totalWins: 0, 
        totalLosses: 0,
        totalPushes: 0,
        sessions: 0,
        doubleDownsUsed: 0,
        doubleDownWins: 0,
        doubleDownLosses: 0,
        doubleDownPushes: 0
      };
    }
    
    // Update overall stats - check for push first
    const adjustedHomeScore = homeScore + homeSpread;
    const adjustedAwayScore = awayScore + awaySpread;
    
    if (pick.pick === 'home') {
      if (adjustedHomeScore === awayScore) {
        // Push - tie
        data.users[userId].totalPushes += 1;
        if (pick.isDoubleDown) {
          data.users[userId].doubleDownPushes += 1;
        }
        console.log(`[PATS] 🟰 PUSH (${adjustedHomeScore} = ${awayScore})`);
      } else if (adjustedHomeScore > awayScore) {
        // Win
        data.users[userId].totalWins += pick.isDoubleDown ? 2 : 1;
        if (pick.isDoubleDown) {
          data.users[userId].doubleDownWins += 1;
        }
      } else {
        // Loss
        data.users[userId].totalLosses += pick.isDoubleDown ? 2 : 1;
        if (pick.isDoubleDown) {
          data.users[userId].doubleDownLosses += 1;
        }
      }
    } else {
      if (adjustedAwayScore === homeScore) {
        // Push - tie
        data.users[userId].totalPushes += 1;
        if (pick.isDoubleDown) {
          data.users[userId].doubleDownPushes += 1;
        }
        console.log(`[PATS] 🟰 PUSH (${adjustedAwayScore} = ${homeScore})`);
      } else if (adjustedAwayScore > homeScore) {
        // Win
        data.users[userId].totalWins += pick.isDoubleDown ? 2 : 1;
        if (pick.isDoubleDown) {
          data.users[userId].doubleDownWins += 1;
        }
      } else {
        // Loss
        data.users[userId].totalLosses += pick.isDoubleDown ? 2 : 1;
        if (pick.isDoubleDown) {
          data.users[userId].doubleDownLosses += 1;
        }
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
  // AND ensure overall stats are correctly updated for all games
  gameResults.forEach(result => {
    const game = session.games.find(g => g.id === result.gameId);
    if (game && !game.result) {
      game.result = result; // { homeScore, awayScore, winner }
      
      // This game result wasn't processed by updateGameResult, so we need to update stats now
      console.log(`[PATS] Session close: Processing game ${result.gameId} that wasn't updated in real-time`);
      
      for (const userId in session.picks) {
        const picks = session.picks[userId];
        const pick = picks.find(p => p.gameId === result.gameId);
        
        if (!data.users[userId]) {
          data.users[userId] = { 
            totalWins: 0, 
            totalLosses: 0,
            totalPushes: 0,
            sessions: 0,
            doubleDownsUsed: 0,
            doubleDownWins: 0,
            doubleDownLosses: 0,
            doubleDownPushes: 0
          };
        }
        
        if (!pick) {
          // Missed pick - add loss to overall stats
          data.users[userId].totalLosses += 1;
        } else {
          // Calculate pick result
          const homeScore = result.homeScore;
          const awayScore = result.awayScore;
          const awaySpread = game.awaySpread !== undefined ? game.awaySpread : 0;
          const homeSpread = game.homeSpread !== undefined ? game.homeSpread : 0;
          
          const adjustedHomeScore = homeScore + homeSpread;
          const adjustedAwayScore = awayScore + awaySpread;
          
          // Check for push, win, or loss
          if (pick.pick === 'home') {
            if (adjustedHomeScore === awayScore) {
              // Push
              data.users[userId].totalPushes += 1;
              if (pick.isDoubleDown) {
                data.users[userId].doubleDownPushes += 1;
              }
            } else if (adjustedHomeScore > awayScore) {
              // Win
              data.users[userId].totalWins += pick.isDoubleDown ? 2 : 1;
              if (pick.isDoubleDown) {
                data.users[userId].doubleDownWins += 1;
              }
            } else {
              // Loss
              data.users[userId].totalLosses += pick.isDoubleDown ? 2 : 1;
              if (pick.isDoubleDown) {
                data.users[userId].doubleDownLosses += 1;
              }
            }
          } else {
            if (adjustedAwayScore === homeScore) {
              // Push
              data.users[userId].totalPushes += 1;
              if (pick.isDoubleDown) {
                data.users[userId].doubleDownPushes += 1;
              }
            } else if (adjustedAwayScore > homeScore) {
              // Win
              data.users[userId].totalWins += pick.isDoubleDown ? 2 : 1;
              if (pick.isDoubleDown) {
                data.users[userId].doubleDownWins += 1;
              }
            } else {
              // Loss
              data.users[userId].totalLosses += pick.isDoubleDown ? 2 : 1;
              if (pick.isDoubleDown) {
                data.users[userId].doubleDownLosses += 1;
              }
            }
          }
        }
      }
    }
  });
  
  // Calculate wins/losses/pushes for each user (for session results record only)
  const userResults = {};
  
  // Process all participants (including those with no picks)
  session.participants.forEach(userId => {
    const picks = session.picks[userId] || [];
    let wins = 0;
    let losses = 0;
    let pushes = 0;
    let missedPicks = 0;
    
    // Initialize user if doesn't exist
    if (!data.users[userId]) {
      data.users[userId] = { 
        totalWins: 0, 
        totalLosses: 0,
        totalPushes: 0,
        sessions: 0,
        doubleDownsUsed: 0,
        doubleDownWins: 0,
        doubleDownLosses: 0,
        doubleDownPushes: 0
      };
    }
    
    // Check each game in the session
    session.games.forEach(game => {
      const pick = picks.find(p => p.gameId === game.id);
      
      if (!pick) {
        // No pick made for this game - automatic loss
        losses++;
        missedPicks++;
      } else if (game.result) {
        // Pick was made, calculate result (for session record)
        const homeScore = game.result.homeScore;
        const awayScore = game.result.awayScore;
        
        // Calculate if pick won/lost/pushed against the spread
        const awaySpread = game.awaySpread !== undefined ? game.awaySpread : 0;
        const homeSpread = game.homeSpread !== undefined ? game.homeSpread : 0;
        
        const adjustedHomeScore = homeScore + homeSpread;
        const adjustedAwayScore = awayScore + awaySpread;
        
        if (pick.pick === 'home') {
          if (adjustedHomeScore === awayScore) {
            pushes += 1; // Pushes don't count double
          } else if (adjustedHomeScore > awayScore) {
            wins += pick.isDoubleDown ? 2 : 1;
          } else {
            losses += pick.isDoubleDown ? 2 : 1;
          }
        } else {
          if (adjustedAwayScore === homeScore) {
            pushes += 1; // Pushes don't count double
          } else if (adjustedAwayScore > homeScore) {
            wins += pick.isDoubleDown ? 2 : 1;
          } else {
            losses += pick.isDoubleDown ? 2 : 1;
          }
        }
      }
    });
    
    userResults[userId] = { wins, losses, pushes, missedPicks };
    
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
 * Reopen a closed PATS session
 */
export function reopenPATSSession(sessionId) {
  const data = readPATSData();
  
  // Find session in history
  const sessionIndex = data.history.findIndex(s => s.id === sessionId);
  
  if (sessionIndex === -1) {
    return { success: false, error: 'Session not found in history' };
  }
  
  // Check if there's already an active session
  if (data.activeSessions.length > 0) {
    return { success: false, error: 'Cannot reopen: there is already an active session' };
  }
  
  const session = data.history[sessionIndex];
  
  // Revert user stats for this session
  session.participants.forEach(userId => {
    if (!data.users[userId]) return;
    
    const userResult = session.results?.[userId];
    if (userResult) {
      // Revert wins/losses/pushes
      data.users[userId].totalWins -= userResult.wins;
      data.users[userId].totalLosses -= userResult.losses;
      data.users[userId].totalPushes -= userResult.pushes;
      
      // Revert double-down stats
      if (userResult.doubleDownStats) {
        data.users[userId].doubleDownWins -= userResult.doubleDownStats.wins || 0;
        data.users[userId].doubleDownLosses -= userResult.doubleDownStats.losses || 0;
        data.users[userId].doubleDownPushes -= userResult.doubleDownStats.pushes || 0;
      }
      
      // Check if user used double-down in this session
      const picks = session.picks[userId] || [];
      const hasDoubleDown = picks.some(p => p.isDoubleDown);
      if (hasDoubleDown) {
        data.users[userId].doubleDownsUsed -= 1;
      }
    }
    
    // Decrement session count
    data.users[userId].sessions -= 1;
  });
  
  // Restore session to active
  session.status = 'active';
  delete session.results;
  delete session.closedAt;
  
  // Move back to active sessions
  data.activeSessions.push(session);
  data.history.splice(sessionIndex, 1);
  
  writePATSData(data);
  return { success: true, session };
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
      totalPushes: 0,
      sessions: 0,
      winPercentage: 0,
      currentStreak: 0,
      streakType: null,
      bestStreak: 0,
      doubleDownsUsed: 0,
      doubleDownWins: 0,
      doubleDownLosses: 0,
      doubleDownPushes: 0,
      doubleDownWinRate: 0
    };
  }
  
  const user = data.users[userId];
  const totalGames = user.totalWins + user.totalLosses; // Pushes don't count in win percentage
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
    totalPushes: user.totalPushes || 0,
    sessions: user.sessions,
    winPercentage: winPercentage,
    currentStreak: currentStreak,
    streakType: streakType,
    bestStreak: bestStreak,
    doubleDownsUsed: user.doubleDownsUsed || 0,
    doubleDownWins: user.doubleDownWins || 0,
    doubleDownLosses: user.doubleDownLosses || 0,
    doubleDownPushes: user.doubleDownPushes || 0,
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
  let pushes = 0;
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
      
      const awaySpread = game.awaySpread !== undefined ? game.awaySpread : 0;
      const homeSpread = game.homeSpread !== undefined ? game.homeSpread : 0;
      
      const adjustedHomeScore = homeScore + homeSpread;
      const adjustedAwayScore = awayScore + awaySpread;
      
      if (pick.pick === 'home') {
        if (adjustedHomeScore === awayScore) {
          pushes += 1;
        } else if (adjustedHomeScore > awayScore) {
          wins += pick.isDoubleDown ? 2 : 1;
        } else {
          losses += pick.isDoubleDown ? 2 : 1;
        }
      } else {
        if (adjustedAwayScore === homeScore) {
          pushes += 1;
        } else if (adjustedAwayScore > homeScore) {
          wins += pick.isDoubleDown ? 2 : 1;
        } else {
          losses += pick.isDoubleDown ? 2 : 1;
        }
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
    pushes,
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
    let pushes = 0;
    let pending = 0;
    
    for (const pick of picks) {
      const game = session.games.find(g => g.id === pick.gameId);
      if (!game) continue;
      
      // Check if game has result
      if (game.result && game.result.status === 'Final') {
        const homeScore = game.result.homeScore;
        const awayScore = game.result.awayScore;
        
        const awaySpread = game.awaySpread !== undefined ? game.awaySpread : 0;
        const homeSpread = game.homeSpread !== undefined ? game.homeSpread : 0;
        
        const adjustedHomeScore = homeScore + homeSpread;
        const adjustedAwayScore = awayScore + awaySpread;
        
        if (pick.pick === 'home') {
          if (adjustedHomeScore === awayScore) {
            pushes += 1;
          } else if (adjustedHomeScore > awayScore) {
            wins += pick.isDoubleDown ? 2 : 1;
          } else {
            losses += pick.isDoubleDown ? 2 : 1;
          }
        } else {
          if (adjustedAwayScore === homeScore) {
            pushes += 1;
          } else if (adjustedAwayScore > homeScore) {
            wins += pick.isDoubleDown ? 2 : 1;
          } else {
            losses += pick.isDoubleDown ? 2 : 1;
          }
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
    
    const totalComplete = wins + losses; // Pushes don't count in win percentage
    const winPercentage = totalComplete > 0 ? (wins / totalComplete * 100) : 0;
    
    standings.push({
      userId,
      wins,
      losses,
      pushes,
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

/**
 * Get user's session history
 */
export function getUserSessionHistory(userId, limit = 10) {
  const data = readPATSData();
  
  // Get all sessions where user participated
  const userSessions = data.history
    .filter(s => s.results && s.results[userId])
    .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt)) // Most recent first
    .slice(0, limit);
  
  return userSessions.map(session => ({
    id: session.id,
    date: session.date,
    closedAt: session.closedAt,
    wins: session.results[userId].wins,
    losses: session.results[userId].losses,
    missedPicks: session.results[userId].missedPicks,
    totalGames: session.games.length,
    picks: session.picks[userId] || [],
    games: session.games
  }));
}

/**
 * Add a new player to the system
 */
export function addPlayer(userId, username, initialStats = {}) {
  const data = readPATSData();
  
  if (data.users[userId]) {
    throw new Error('Player already exists in the system');
  }
  
  data.users[userId] = {
    username: username,
    totalWins: initialStats.totalWins || 0,
    totalLosses: initialStats.totalLosses || 0,
    totalPushes: initialStats.totalPushes || 0,
    sessions: initialStats.sessions || 0,
    doubleDownsUsed: initialStats.doubleDownsUsed || 0,
    doubleDownWins: initialStats.doubleDownWins || 0,
    doubleDownLosses: initialStats.doubleDownLosses || 0,
    doubleDownPushes: initialStats.doubleDownPushes || 0,
    addedAt: new Date().toISOString(),
    addedBy: 'admin'
  };
  
  writePATSData(data);
  console.log(`[PATS] Added player: ${username} (${userId})`);
  return data.users[userId];
}

/**
 * Update player record/stats
 */
export function updatePlayerRecord(userId, updates) {
  const data = readPATSData();
  
  if (!data.users[userId]) {
    throw new Error('Player not found in the system');
  }
  
  // Only allow updating specific fields
  const allowedFields = [
    'totalWins', 'totalLosses', 'totalPushes', 'sessions',
    'doubleDownsUsed', 'doubleDownWins', 'doubleDownLosses', 'doubleDownPushes',
    'username'
  ];
  
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      data.users[userId][key] = value;
    } else {
      console.warn(`[PATS] Attempted to update invalid field: ${key}`);
    }
  }
  
  data.users[userId].lastUpdated = new Date().toISOString();
  writePATSData(data);
  console.log(`[PATS] Updated player record: ${userId}`);
  return data.users[userId];
}

/**
 * Get player stats
 */
export function getPlayerStats(userId) {
  const data = readPATSData();
  
  if (!data.users[userId]) {
    return null;
  }
  
  return {
    ...data.users[userId],
    userId: userId
  };
}

/**
 * Get all players
 */
export function getAllPlayers() {
  const data = readPATSData();
  
  return Object.entries(data.users).map(([userId, stats]) => ({
    userId,
    ...stats
  }));
}

/**
 * Delete player from system
 */
export function deletePlayer(userId) {
  const data = readPATSData();
  
  if (!data.users[userId]) {
    throw new Error('Player not found in the system');
  }
  
  const username = data.users[userId].username || userId;
  delete data.users[userId];
  writePATSData(data);
  console.log(`[PATS] Deleted player: ${username} (${userId})`);
  return true;
}

