import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import { readPATSData, writePATSData } from './patsData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store active season cron jobs
const seasonCronJobs = new Map();

// ============================================
// SEASON CRUD OPERATIONS
// ============================================

/**
 * Get default season schedule config
 */
export function getDefaultSeasonScheduleConfig() {
  return {
    // Channel Settings
    announcementChannelId: null,
    resultsChannelId: null,
    
    // Auto-scheduling Settings
    autoSchedule: false,
    scheduleDaysAhead: 2,
    minGamesForSession: 3,
    sessionStartOffset: 60, // Minutes before first game
    
    // Announcement Settings
    announceBeforeStart: 60, // Minutes before session
    announcementMessage: null,
    
    // Reminder Settings
    reminders: {
      enabled: true,
      minutes: [60, 30],
      dmEnabled: true
    },
    
    // Warning Settings
    warnings: {
      enabled: true,
      minutes: [30, 10],
      dmEnabled: true
    },
    
    // Game Lock Settings
    gameLockAlerts: {
      enabled: true,
      dmEnabled: false
    },
    
    // Auto-Close Settings
    autoClose: {
      enabled: true,
      delayMinutes: 180
    }
  };
}

/**
 * Initialize seasons object in data if it doesn't exist
 */
export function ensureSeasonsStructure(data) {
  if (!data.seasons) {
    data.seasons = {
      current: null,
      history: []
    };
  }
  return data;
}

/**
 * Create a new season
 * @param {string} name - Season name (e.g., "December 2025")
 * @param {string} type - Season type: "weekly", "biweekly", "monthly", "custom"
 * @param {string} startDate - ISO date string for start
 * @param {string} endDate - ISO date string for end
 * @param {string[]} participants - Array of user IDs
 * @param {object} scheduleConfig - Schedule configuration (optional)
 * @returns {object} Created season object
 */
export function createSeason(name, type, startDate, endDate, participants = [], scheduleConfig = null) {
  const data = readPATSData();
  ensureSeasonsStructure(data);
  
  // Check if there's already an active season
  if (data.seasons.current && data.seasons.current.status === 'active') {
    throw new Error('A season is already active. End the current season before creating a new one.');
  }
  
  // Generate season ID (YYYY-MM format for monthly, or custom format)
  const startDateObj = new Date(startDate);
  const seasonId = type === 'monthly' 
    ? `${startDateObj.getFullYear()}-${String(startDateObj.getMonth() + 1).padStart(2, '0')}`
    : `${startDateObj.getFullYear()}-${String(startDateObj.getMonth() + 1).padStart(2, '0')}-${Date.now()}`;
  
  const season = {
    id: seasonId,
    name: name,
    type: type,
    startDate: new Date(startDate).toISOString(),
    endDate: new Date(endDate).toISOString(),
    status: 'active',
    createdAt: new Date().toISOString(),
    participants: participants,
    sessions: [],
    standings: {},
    scheduleConfig: scheduleConfig || getDefaultSeasonScheduleConfig(),
    scheduledSessions: [],
    skippedDates: []
  };
  
  // Initialize standings for all participants
  for (const userId of participants) {
    season.standings[userId] = createEmptyStandings();
  }
  
  data.seasons.current = season;
  writePATSData(data);
  
  console.log(`[SEASONS] Created season: ${name} (${seasonId})`);
  return season;
}

/**
 * Create empty standings object for a user
 */
function createEmptyStandings() {
  return {
    wins: 0,
    losses: 0,
    pushes: 0,
    totalPicks: 0,
    ddWins: 0,
    ddLosses: 0,
    ddPushes: 0,
    sessionsPlayed: 0,
    currentStreak: 0,
    longestWinStreak: 0,
    lastWeekRecord: { wins: 0, losses: 0, pushes: 0 }
  };
}

/**
 * Get the current active season
 * @returns {object|null} Current season or null
 */
export function getCurrentSeason() {
  const data = readPATSData();
  ensureSeasonsStructure(data);
  
  if (data.seasons.current && data.seasons.current.status === 'active') {
    return data.seasons.current;
  }
  return null;
}

/**
 * Get a season by ID (current or from history)
 * @param {string} seasonId - Season ID
 * @returns {object|null} Season object or null
 */
export function getSeasonById(seasonId) {
  const data = readPATSData();
  ensureSeasonsStructure(data);
  
  // Check current season
  if (data.seasons.current && data.seasons.current.id === seasonId) {
    return data.seasons.current;
  }
  
  // Check history
  return data.seasons.history.find(s => s.id === seasonId) || null;
}

/**
 * Update season properties
 * @param {string} seasonId - Season ID
 * @param {object} updates - Properties to update
 * @returns {object|null} Updated season or null
 */
export function updateSeason(seasonId, updates) {
  const data = readPATSData();
  ensureSeasonsStructure(data);
  
  let season = null;
  
  if (data.seasons.current && data.seasons.current.id === seasonId) {
    season = data.seasons.current;
  } else {
    const historyIndex = data.seasons.history.findIndex(s => s.id === seasonId);
    if (historyIndex !== -1) {
      season = data.seasons.history[historyIndex];
    }
  }
  
  if (!season) {
    return null;
  }
  
  // Apply updates (don't allow changing id)
  const { id, ...allowedUpdates } = updates;
  Object.assign(season, allowedUpdates);
  
  writePATSData(data);
  return season;
}

/**
 * End the current season
 * @param {boolean} calculateAwards - Whether to calculate awards
 * @returns {object} Archived season with awards
 */
export function endSeason(calculateAwards = true) {
  const data = readPATSData();
  ensureSeasonsStructure(data);
  
  if (!data.seasons.current) {
    throw new Error('No active season to end.');
  }
  
  const season = data.seasons.current;
  season.status = 'completed';
  season.completedAt = new Date().toISOString();
  
  // Calculate final stats
  season.stats = {
    totalSessions: season.sessions.length,
    totalPicks: Object.values(season.standings).reduce((sum, s) => sum + s.totalPicks, 0),
    totalParticipants: season.participants.length
  };
  
  // Calculate awards if requested
  if (calculateAwards) {
    season.awards = calculateSeasonAwards(season);
  }
  
  // Store final standings
  season.finalStandings = JSON.parse(JSON.stringify(season.standings));
  
  // Move to history
  data.seasons.history.unshift(season);
  data.seasons.current = null;
  
  writePATSData(data);
  
  console.log(`[SEASONS] Ended season: ${season.name}`);
  return season;
}

/**
 * Get all season history
 * @returns {object[]} Array of completed seasons
 */
export function getSeasonHistory() {
  const data = readPATSData();
  ensureSeasonsStructure(data);
  return data.seasons.history || [];
}

// ============================================
// PARTICIPANT MANAGEMENT
// ============================================

/**
 * Add a participant to the current season
 * @param {string} userId - Discord user ID
 * @returns {boolean} Success
 */
export function addSeasonParticipant(userId) {
  const data = readPATSData();
  ensureSeasonsStructure(data);
  
  if (!data.seasons.current) {
    throw new Error('No active season.');
  }
  
  if (data.seasons.current.participants.includes(userId)) {
    return false; // Already a participant
  }
  
  data.seasons.current.participants.push(userId);
  data.seasons.current.standings[userId] = createEmptyStandings();
  
  writePATSData(data);
  console.log(`[SEASONS] Added participant ${userId} to season ${data.seasons.current.name}`);
  return true;
}

/**
 * Remove a participant from the current season
 * @param {string} userId - Discord user ID
 * @returns {boolean} Success
 */
export function removeSeasonParticipant(userId) {
  const data = readPATSData();
  ensureSeasonsStructure(data);
  
  if (!data.seasons.current) {
    throw new Error('No active season.');
  }
  
  const index = data.seasons.current.participants.indexOf(userId);
  if (index === -1) {
    return false; // Not a participant
  }
  
  data.seasons.current.participants.splice(index, 1);
  // Keep standings for historical purposes, just remove from active list
  
  writePATSData(data);
  console.log(`[SEASONS] Removed participant ${userId} from season ${data.seasons.current.name}`);
  return true;
}

/**
 * Get all participants in the current season
 * @returns {string[]} Array of user IDs
 */
export function getSeasonParticipants() {
  const season = getCurrentSeason();
  return season ? season.participants : [];
}

/**
 * Check if a user is in the current season
 * @param {string} userId - Discord user ID
 * @returns {boolean}
 */
export function isUserInCurrentSeason(userId) {
  const season = getCurrentSeason();
  return season ? season.participants.includes(userId) : false;
}

/**
 * Bulk add participants to the current season
 * @param {string[]} userIds - Array of user IDs
 * @returns {number} Number of users added
 */
export function bulkAddParticipants(userIds) {
  const data = readPATSData();
  ensureSeasonsStructure(data);
  
  if (!data.seasons.current) {
    throw new Error('No active season.');
  }
  
  let addedCount = 0;
  for (const userId of userIds) {
    if (!data.seasons.current.participants.includes(userId)) {
      data.seasons.current.participants.push(userId);
      data.seasons.current.standings[userId] = createEmptyStandings();
      addedCount++;
    }
  }
  
  writePATSData(data);
  console.log(`[SEASONS] Bulk added ${addedCount} participants to season ${data.seasons.current.name}`);
  return addedCount;
}

// ============================================
// STANDINGS & STATS
// ============================================

/**
 * Update season standings for a user after a pick result
 * @param {string} userId - Discord user ID
 * @param {object} result - { win: boolean, push: boolean, isDoubleDown: boolean }
 */
export function updateSeasonStandings(userId, result) {
  const data = readPATSData();
  ensureSeasonsStructure(data);
  
  if (!data.seasons.current) {
    return; // No active season, nothing to update
  }
  
  // Ensure user has standings (in case they were added mid-season)
  if (!data.seasons.current.standings[userId]) {
    data.seasons.current.standings[userId] = createEmptyStandings();
  }
  
  const standings = data.seasons.current.standings[userId];
  
  // Update basic stats
  standings.totalPicks++;
  
  if (result.push) {
    standings.pushes++;
    if (result.isDoubleDown) standings.ddPushes++;
    // Push doesn't affect streak
  } else if (result.win) {
    standings.wins++;
    if (result.isDoubleDown) standings.ddWins++;
    
    // Update streak
    if (standings.currentStreak >= 0) {
      standings.currentStreak++;
      if (standings.currentStreak > standings.longestWinStreak) {
        standings.longestWinStreak = standings.currentStreak;
      }
    } else {
      standings.currentStreak = 1;
    }
  } else {
    standings.losses++;
    if (result.isDoubleDown) standings.ddLosses++;
    
    // Reset streak to negative (loss streak)
    if (standings.currentStreak <= 0) {
      standings.currentStreak--;
    } else {
      standings.currentStreak = -1;
    }
  }
  
  // Check if this is in the final week of the season
  const now = new Date();
  const endDate = new Date(data.seasons.current.endDate);
  const daysUntilEnd = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
  
  if (daysUntilEnd <= 7) {
    if (result.push) {
      standings.lastWeekRecord.pushes++;
    } else if (result.win) {
      standings.lastWeekRecord.wins++;
    } else {
      standings.lastWeekRecord.losses++;
    }
  }
  
  writePATSData(data);
}

/**
 * Record that a user participated in a session
 * @param {string} userId - Discord user ID
 */
export function recordSeasonSessionParticipation(userId) {
  const data = readPATSData();
  ensureSeasonsStructure(data);
  
  if (!data.seasons.current) return;
  
  if (!data.seasons.current.standings[userId]) {
    data.seasons.current.standings[userId] = createEmptyStandings();
  }
  
  data.seasons.current.standings[userId].sessionsPlayed++;
  writePATSData(data);
}

/**
 * Link a session to the current season
 * @param {string} sessionId - Session ID
 */
export function linkSessionToSeason(sessionId) {
  const data = readPATSData();
  ensureSeasonsStructure(data);
  
  if (!data.seasons.current) return;
  
  if (!data.seasons.current.sessions.includes(sessionId)) {
    data.seasons.current.sessions.push(sessionId);
    writePATSData(data);
    console.log(`[SEASONS] Linked session ${sessionId} to season ${data.seasons.current.name}`);
  }
}

/**
 * Get season standings sorted by win rate
 * @param {string} seasonId - Season ID (optional, defaults to current)
 * @returns {object[]} Array of { userId, ...standings, winRate }
 */
export function getSeasonStandings(seasonId = null) {
  const season = seasonId ? getSeasonById(seasonId) : getCurrentSeason();
  if (!season) return [];
  
  const standings = [];
  for (const [userId, stats] of Object.entries(season.standings)) {
    const totalGames = stats.wins + stats.losses;
    const winRate = totalGames > 0 ? stats.wins / totalGames : 0;
    
    standings.push({
      userId,
      ...stats,
      winRate
    });
  }
  
  // Sort by win rate (descending), then by total picks (descending)
  standings.sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    return b.totalPicks - a.totalPicks;
  });
  
  return standings;
}

/**
 * Get user's season stats
 * @param {string} userId - Discord user ID
 * @param {string} seasonId - Season ID (optional, defaults to current)
 * @returns {object|null} User's season standings
 */
export function getUserSeasonStats(userId, seasonId = null) {
  const season = seasonId ? getSeasonById(seasonId) : getCurrentSeason();
  if (!season) return null;
  
  return season.standings[userId] || null;
}

// ============================================
// AWARDS CALCULATION
// ============================================

/**
 * Calculate season awards
 * @param {object} season - Season object
 * @returns {object} Awards object
 */
export function calculateSeasonAwards(season) {
  const awards = {
    champion: null,
    sharpshooter: null,
    volumeKing: null,
    hotStreak: null,
    comebackKid: null,
    rookieOfSeason: null
  };
  
  const standings = Object.entries(season.standings);
  if (standings.length === 0) return awards;
  
  // Get all users data for rookie checking
  const data = readPATSData();
  
  // CHAMPION - Best win rate with minimum 30 picks
  const championCandidates = standings
    .filter(([_, stats]) => stats.totalPicks >= 30)
    .map(([userId, stats]) => ({
      userId,
      winRate: (stats.wins + stats.losses) > 0 ? stats.wins / (stats.wins + stats.losses) : 0,
      stats
    }))
    .sort((a, b) => {
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.stats.totalPicks - a.stats.totalPicks;
    });
  
  if (championCandidates.length > 0) {
    const winner = championCandidates[0];
    awards.champion = {
      userId: winner.userId,
      username: data.users[winner.userId]?.username || 'Unknown',
      winRate: winner.winRate,
      record: {
        wins: winner.stats.wins,
        losses: winner.stats.losses,
        pushes: winner.stats.pushes
      },
      totalPicks: winner.stats.totalPicks
    };
  }
  
  // SHARPSHOOTER - Best DD record with minimum 5 double-downs
  const sharpshooterCandidates = standings
    .filter(([_, stats]) => (stats.ddWins + stats.ddLosses + stats.ddPushes) >= 5)
    .map(([userId, stats]) => ({
      userId,
      ddTotal: stats.ddWins + stats.ddLosses,
      ddWinRate: (stats.ddWins + stats.ddLosses) > 0 ? stats.ddWins / (stats.ddWins + stats.ddLosses) : 0,
      stats
    }))
    .sort((a, b) => {
      if (b.ddWinRate !== a.ddWinRate) return b.ddWinRate - a.ddWinRate;
      return b.ddTotal - a.ddTotal;
    });
  
  if (sharpshooterCandidates.length > 0) {
    const winner = sharpshooterCandidates[0];
    awards.sharpshooter = {
      userId: winner.userId,
      username: data.users[winner.userId]?.username || 'Unknown',
      ddWinRate: winner.ddWinRate,
      ddRecord: {
        wins: winner.stats.ddWins,
        losses: winner.stats.ddLosses,
        pushes: winner.stats.ddPushes
      }
    };
  }
  
  // VOLUME KING - Most total picks
  const volumeCandidates = standings
    .map(([userId, stats]) => ({ userId, totalPicks: stats.totalPicks, stats }))
    .sort((a, b) => b.totalPicks - a.totalPicks);
  
  if (volumeCandidates.length > 0 && volumeCandidates[0].totalPicks > 0) {
    const winner = volumeCandidates[0];
    awards.volumeKing = {
      userId: winner.userId,
      username: data.users[winner.userId]?.username || 'Unknown',
      totalPicks: winner.totalPicks
    };
  }
  
  // HOT STREAK - Longest win streak
  const streakCandidates = standings
    .map(([userId, stats]) => ({ userId, longestWinStreak: stats.longestWinStreak, stats }))
    .sort((a, b) => b.longestWinStreak - a.longestWinStreak);
  
  if (streakCandidates.length > 0 && streakCandidates[0].longestWinStreak > 0) {
    const winner = streakCandidates[0];
    awards.hotStreak = {
      userId: winner.userId,
      username: data.users[winner.userId]?.username || 'Unknown',
      streakLength: winner.longestWinStreak
    };
  }
  
  // COMEBACK KID - Best final week record with minimum 10 picks
  const comebackCandidates = standings
    .filter(([_, stats]) => {
      const lastWeekTotal = stats.lastWeekRecord.wins + stats.lastWeekRecord.losses;
      return lastWeekTotal >= 10;
    })
    .map(([userId, stats]) => {
      const lastWeekTotal = stats.lastWeekRecord.wins + stats.lastWeekRecord.losses;
      return {
        userId,
        lastWeekWinRate: lastWeekTotal > 0 ? stats.lastWeekRecord.wins / lastWeekTotal : 0,
        lastWeekRecord: stats.lastWeekRecord,
        stats
      };
    })
    .sort((a, b) => b.lastWeekWinRate - a.lastWeekWinRate);
  
  if (comebackCandidates.length > 0) {
    const winner = comebackCandidates[0];
    awards.comebackKid = {
      userId: winner.userId,
      username: data.users[winner.userId]?.username || 'Unknown',
      finalWeekRecord: winner.lastWeekRecord,
      finalWeekWinRate: winner.lastWeekWinRate
    };
  }
  
  // ROOKIE OF SEASON - Only for Season 2+, best new player
  if (season.id !== '2025-11' && data.seasons.history.length > 0) {
    // Find users who joined this season (first season they participated in)
    const rookies = standings
      .filter(([userId, _]) => {
        const user = data.users[userId];
        return user && user.firstSeasonId === season.id;
      })
      .filter(([_, stats]) => stats.totalPicks >= 15)
      .map(([userId, stats]) => ({
        userId,
        winRate: (stats.wins + stats.losses) > 0 ? stats.wins / (stats.wins + stats.losses) : 0,
        stats
      }))
      .sort((a, b) => {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        return b.stats.totalPicks - a.stats.totalPicks;
      });
    
    if (rookies.length > 0) {
      const winner = rookies[0];
      awards.rookieOfSeason = {
        userId: winner.userId,
        username: data.users[winner.userId]?.username || 'Unknown',
        winRate: winner.winRate,
        record: {
          wins: winner.stats.wins,
          losses: winner.stats.losses,
          pushes: winner.stats.pushes
        },
        totalPicks: winner.stats.totalPicks
      };
    }
  }
  
  return awards;
}

/**
 * Check if user is a rookie for a season
 * @param {string} userId - Discord user ID
 * @param {string} seasonId - Season ID
 * @returns {boolean}
 */
export function isRookie(userId, seasonId) {
  const data = readPATSData();
  const user = data.users[userId];
  return user && user.firstSeasonId === seasonId;
}

/**
 * Get award eligibility status for a user
 * @param {string} userId - Discord user ID
 * @returns {object} Eligibility status for each award
 */
export function getAwardEligibility(userId) {
  const season = getCurrentSeason();
  if (!season) return null;
  
  const stats = season.standings[userId];
  if (!stats) return null;
  
  const totalDD = stats.ddWins + stats.ddLosses + stats.ddPushes;
  const lastWeekPicks = stats.lastWeekRecord.wins + stats.lastWeekRecord.losses;
  
  return {
    champion: {
      eligible: stats.totalPicks >= 30,
      current: stats.totalPicks,
      required: 30,
      remaining: Math.max(0, 30 - stats.totalPicks)
    },
    sharpshooter: {
      eligible: totalDD >= 5,
      current: totalDD,
      required: 5,
      remaining: Math.max(0, 5 - totalDD)
    },
    volumeKing: {
      eligible: true, // No minimum
      current: stats.totalPicks
    },
    hotStreak: {
      eligible: true, // No minimum
      current: stats.longestWinStreak
    },
    comebackKid: {
      eligible: lastWeekPicks >= 10,
      current: lastWeekPicks,
      required: 10,
      remaining: Math.max(0, 10 - lastWeekPicks)
    },
    rookie: {
      eligible: isRookie(userId, season.id),
      isRookie: isRookie(userId, season.id)
    }
  };
}

// ============================================
// SCHEDULE MANAGEMENT
// ============================================

/**
 * Get the season schedule
 * @param {string} seasonId - Season ID (optional, defaults to current)
 * @returns {object[]} Array of scheduled sessions
 */
export function getSeasonSchedule(seasonId = null) {
  const season = seasonId ? getSeasonById(seasonId) : getCurrentSeason();
  if (!season) return [];
  return season.scheduledSessions || [];
}

/**
 * Add a scheduled session to the season
 * @param {string} date - Date string (YYYY-MM-DD)
 * @param {string} scheduledStart - ISO datetime for session start
 * @param {number} estimatedGames - Expected number of games
 * @returns {object} Created scheduled session
 */
export function addScheduledSession(date, scheduledStart, estimatedGames) {
  const data = readPATSData();
  ensureSeasonsStructure(data);
  
  if (!data.seasons.current) {
    throw new Error('No active season.');
  }
  
  // Check if session already exists for this date
  const existing = data.seasons.current.scheduledSessions.find(s => s.date === date);
  if (existing) {
    throw new Error(`Session already scheduled for ${date}`);
  }
  
  const config = data.seasons.current.scheduleConfig;
  const startTime = new Date(scheduledStart);
  const announcementTime = new Date(startTime.getTime() - (config.announceBeforeStart * 60 * 1000));
  
  const scheduledSession = {
    date,
    scheduledStart: startTime.toISOString(),
    announcementTime: announcementTime.toISOString(),
    estimatedGames,
    status: 'scheduled',
    sessionId: null,
    skippedReason: null
  };
  
  data.seasons.current.scheduledSessions.push(scheduledSession);
  
  // Sort by date
  data.seasons.current.scheduledSessions.sort((a, b) => 
    new Date(a.date) - new Date(b.date)
  );
  
  writePATSData(data);
  console.log(`[SEASONS] Added scheduled session for ${date}`);
  return scheduledSession;
}

/**
 * Update a scheduled session
 * @param {string} date - Date string (YYYY-MM-DD)
 * @param {object} updates - Properties to update
 * @returns {object|null} Updated session or null
 */
export function updateScheduledSession(date, updates) {
  const data = readPATSData();
  ensureSeasonsStructure(data);
  
  if (!data.seasons.current) return null;
  
  const session = data.seasons.current.scheduledSessions.find(s => s.date === date);
  if (!session) return null;
  
  Object.assign(session, updates);
  writePATSData(data);
  return session;
}

/**
 * Remove a scheduled session
 * @param {string} date - Date string (YYYY-MM-DD)
 * @returns {boolean} Success
 */
export function removeScheduledSession(date) {
  const data = readPATSData();
  ensureSeasonsStructure(data);
  
  if (!data.seasons.current) return false;
  
  const index = data.seasons.current.scheduledSessions.findIndex(s => s.date === date);
  if (index === -1) return false;
  
  data.seasons.current.scheduledSessions.splice(index, 1);
  writePATSData(data);
  console.log(`[SEASONS] Removed scheduled session for ${date}`);
  return true;
}

/**
 * Skip a date in the season
 * @param {string} date - Date string (YYYY-MM-DD)
 * @param {string} reason - Reason for skipping
 */
export function skipDate(date, reason) {
  const data = readPATSData();
  ensureSeasonsStructure(data);
  
  if (!data.seasons.current) {
    throw new Error('No active season.');
  }
  
  // Add to skipped dates
  const existing = data.seasons.current.skippedDates.find(s => s.date === date);
  if (!existing) {
    data.seasons.current.skippedDates.push({ date, reason });
  }
  
  // Remove from scheduled sessions if exists
  const schedIndex = data.seasons.current.scheduledSessions.findIndex(s => s.date === date);
  if (schedIndex !== -1) {
    data.seasons.current.scheduledSessions[schedIndex].status = 'skipped';
    data.seasons.current.scheduledSessions[schedIndex].skippedReason = reason;
  }
  
  writePATSData(data);
  console.log(`[SEASONS] Skipped date ${date}: ${reason}`);
}

/**
 * Check if a date is skipped
 * @param {string} date - Date string (YYYY-MM-DD)
 * @returns {boolean}
 */
export function isDateSkipped(date) {
  const season = getCurrentSeason();
  if (!season) return false;
  return season.skippedDates.some(s => s.date === date);
}

// ============================================
// HISTORY & NAVIGATION
// ============================================

/**
 * Get all sessions within a season
 * @param {string} seasonId - Season ID
 * @returns {string[]} Array of session IDs
 */
export function getSessionsInSeason(seasonId) {
  const season = getSeasonById(seasonId);
  return season ? season.sessions : [];
}

/**
 * Get season info for display
 * @param {string} seasonId - Season ID (optional, defaults to current)
 * @returns {object|null} Season summary info
 */
export function getSeasonInfo(seasonId = null) {
  const season = seasonId ? getSeasonById(seasonId) : getCurrentSeason();
  if (!season) return null;
  
  const now = new Date();
  const endDate = new Date(season.endDate);
  const startDate = new Date(season.startDate);
  
  const daysTotal = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  const daysPassed = Math.ceil((now - startDate) / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)));
  
  return {
    id: season.id,
    name: season.name,
    type: season.type,
    status: season.status,
    startDate: season.startDate,
    endDate: season.endDate,
    daysTotal,
    daysPassed: Math.min(daysPassed, daysTotal),
    daysRemaining,
    sessionsCompleted: season.sessions.length,
    participantCount: season.participants.length,
    totalPicks: Object.values(season.standings).reduce((sum, s) => sum + s.totalPicks, 0)
  };
}

// ============================================
// USER FIRST SEASON TRACKING
// ============================================

/**
 * Record user's first season participation (for rookie tracking)
 * @param {string} userId - Discord user ID
 */
export function recordFirstSeasonParticipation(userId) {
  const data = readPATSData();
  
  if (!data.users[userId]) return;
  if (data.users[userId].firstSeasonId) return; // Already recorded
  
  const currentSeason = getCurrentSeason();
  if (currentSeason) {
    data.users[userId].firstSeasonId = currentSeason.id;
    data.users[userId].firstEverPick = data.users[userId].firstEverPick || new Date().toISOString();
    writePATSData(data);
    console.log(`[SEASONS] Recorded first season for user ${userId}: ${currentSeason.id}`);
  }
}

/**
 * Update schedule config for current season
 * @param {object} config - New schedule config
 * @returns {object} Updated config
 */
export function updateSeasonScheduleConfig(config) {
  const data = readPATSData();
  ensureSeasonsStructure(data);
  
  if (!data.seasons.current) {
    throw new Error('No active season.');
  }
  
  data.seasons.current.scheduleConfig = {
    ...data.seasons.current.scheduleConfig,
    ...config
  };
  
  writePATSData(data);
  return data.seasons.current.scheduleConfig;
}

/**
 * Update schedule settings for a specific season
 * @param {string} seasonId - Season ID
 * @param {object} settings - New schedule settings
 * @returns {object} Updated settings
 */
export function updateSeasonScheduleSettings(seasonId, settings) {
  const data = readPATSData();
  ensureSeasonsStructure(data);
  
  let season = null;
  
  if (data.seasons.current && data.seasons.current.id === seasonId) {
    season = data.seasons.current;
  } else {
    season = data.seasons.history.find(s => s.id === seasonId);
  }
  
  if (!season) {
    throw new Error('Season not found.');
  }
  
  if (!season.schedule) {
    season.schedule = {};
  }
  
  season.schedule = {
    ...season.schedule,
    ...settings
  };
  
  writePATSData(data);
  console.log(`[SEASONS] Updated schedule settings for season ${seasonId}:`, settings);
  return season.schedule;
}

// ============================================
// SEASON AUTO-SCHEDULING
// ============================================

/**
 * Check if a session is already scheduled for a given date
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {boolean} True if session already scheduled
 */
export function isSessionScheduledForDate(date) {
  const data = readPATSData();
  
  // Check current active session
  if (data.activeSession && data.activeSession.date === date) {
    return true;
  }
  
  // Check scheduled sessions (from sessionScheduler)
  try {
    const scheduledSessionsPath = path.join(__dirname, '../../data/scheduled-sessions.json');
    if (fs.existsSync(scheduledSessionsPath)) {
      const scheduledData = JSON.parse(fs.readFileSync(scheduledSessionsPath, 'utf8'));
      const hasScheduled = scheduledData.sessions.some(s => s.scheduledDate === date);
      if (hasScheduled) return true;
    }
  } catch (error) {
    console.error('[SEASONS] Error checking scheduled sessions:', error);
  }
  
  return false;
}

/**
 * Get the next date that needs a session scheduled
 * @param {number} daysAhead - How many days ahead to check (default 2)
 * @returns {string|null} Date in YYYY-MM-DD format, or null if all scheduled
 */
export function getNextUnscheduledDate(daysAhead = 2) {
  const currentSeason = getCurrentSeason();
  if (!currentSeason) return null;
  
  const now = new Date();
  const seasonEnd = new Date(currentSeason.endDate);
  
  for (let i = 0; i <= daysAhead; i++) {
    const checkDate = new Date(now);
    checkDate.setDate(checkDate.getDate() + i);
    
    // Don't schedule past season end
    if (checkDate > seasonEnd) break;
    
    const dateStr = checkDate.toISOString().split('T')[0];
    
    if (!isSessionScheduledForDate(dateStr)) {
      return dateStr;
    }
  }
  
  return null;
}

/**
 * Auto-schedule a session for a given date based on season config
 * @param {object} client - Discord client for sending notifications
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {Function} getGamesForDate - Function to get games for a date
 * @param {Function} addScheduledSession - Function to add a scheduled session
 * @returns {object|null} Created session or null if not possible
 */
export async function autoScheduleSessionForDate(client, date, getGamesForDate, addScheduledSession) {
  const currentSeason = getCurrentSeason();
  if (!currentSeason) {
    console.log('[SEASONS] No active season for auto-scheduling');
    return null;
  }
  
  // Check if auto-schedule is enabled
  if (!currentSeason.schedule?.enabled) {
    console.log('[SEASONS] Auto-scheduling is disabled for this season');
    return null;
  }
  
  // Check if already scheduled
  if (isSessionScheduledForDate(date)) {
    console.log(`[SEASONS] Session already scheduled for ${date}`);
    return null;
  }
  
  // Check if date is within season bounds
  const checkDate = new Date(date);
  const seasonStart = new Date(currentSeason.startDate);
  const seasonEnd = new Date(currentSeason.endDate);
  
  if (checkDate < seasonStart || checkDate > seasonEnd) {
    console.log(`[SEASONS] Date ${date} is outside season bounds`);
    return null;
  }
  
  console.log(`[SEASONS] Auto-scheduling session for ${date}...`);
  
  // Fetch games for the date
  const games = await getGamesForDate(date);
  
  if (!games || games.length === 0) {
    console.log(`[SEASONS] No games found for ${date}`);
    return null;
  }
  
  const minGames = currentSeason.schedule?.minGames || 3;
  if (games.length < minGames) {
    console.log(`[SEASONS] Only ${games.length} games found for ${date}, need at least ${minGames}`);
    return null;
  }
  
  // Get season schedule config
  const config = currentSeason.schedule || {};
  const channelId = config.channelId;
  
  if (!channelId) {
    console.log('[SEASONS] No announcement channel configured for season');
    return null;
  }
  
  // Calculate times
  const firstGameTime = new Date(Math.min(...games.map(g => new Date(g.commenceTime))));
  const sessionStartOffset = config.sessionStartMinutes || 60;
  const announcementOffset = config.announcementMinutes || 60;
  
  // Session starts X minutes before first game
  const sessionStartTime = new Date(firstGameTime.getTime() - (sessionStartOffset * 60 * 1000));
  // Announcement goes out X minutes before session starts
  const announcementTime = new Date(sessionStartTime.getTime() - (announcementOffset * 60 * 1000));
  
  // Build game details
  const gameDetails = games.map(game => ({
    id: game.id,
    awayTeam: game.awayTeam,
    homeTeam: game.homeTeam,
    awayAbbr: game.awayAbbr,
    homeAbbr: game.homeAbbr,
    startTime: game.commenceTime
  }));
  
  // Get guild ID from channel
  let guildId = null;
  try {
    const channel = await client.channels.fetch(channelId);
    guildId = channel.guild.id;
  } catch (error) {
    console.error('[SEASONS] Error fetching channel:', error);
    return null;
  }
  
  // Build participant lists from season
  const roleIds = [];
  const userIds = currentSeason.participants || [];
  
  // Create session config
  const sessionConfig = {
    guildId: guildId,
    channelId: channelId,
    scheduledDate: date,
    firstGameTime: firstGameTime.toISOString(),
    games: games.length,
    gameDetails: gameDetails,
    participantType: 'users',
    roleIds: roleIds,
    userIds: userIds,
    notifications: {
      announcement: {
        enabled: true,
        time: announcementTime.toISOString()
      },
      reminder: {
        enabled: config.reminders?.enabled ?? true,
        minutesBefore: config.reminders?.minutes?.[0] || 60
      },
      warning: {
        enabled: config.warnings?.enabled ?? true,
        minutesBefore: config.warnings?.minutes?.[0] || 30
      }
    },
    createdBy: 'auto',
    createdByUsername: 'Season Auto-Scheduler',
    seasonId: currentSeason.id,
    seasonName: currentSeason.name
  };
  
  // Add the scheduled session
  const session = addScheduledSession(sessionConfig);
  
  console.log(`[SEASONS] ✅ Auto-scheduled session ${session.id} for ${date} with ${games.length} games`);
  console.log(`[SEASONS]    Announcement: ${announcementTime.toLocaleString()}`);
  console.log(`[SEASONS]    Session Start: ${sessionStartTime.toLocaleString()}`);
  console.log(`[SEASONS]    First Game: ${firstGameTime.toLocaleString()}`);
  
  return session;
}

/**
 * Run the auto-scheduler check
 * This checks for any dates that need sessions scheduled
 * @param {object} client - Discord client
 * @param {Function} getGamesForDate - Function to get games for a date
 * @param {Function} addScheduledSession - Function to add a scheduled session
 * @param {Function} scheduleSessionJobs - Function to schedule cron jobs for a session
 * @param {object} handlers - Notification handlers
 */
export async function runAutoSchedulerCheck(client, getGamesForDate, addScheduledSession, scheduleSessionJobs, handlers) {
  const currentSeason = getCurrentSeason();
  if (!currentSeason) {
    console.log('[SEASONS] No active season - skipping auto-schedule check');
    return;
  }
  
  if (!currentSeason.schedule?.enabled) {
    console.log('[SEASONS] Auto-scheduling disabled for current season');
    return;
  }
  
  console.log('[SEASONS] Running auto-scheduler check...');
  
  const daysAhead = currentSeason.schedule?.scheduleDaysAhead || 2;
  
  // Check today and future days
  for (let i = 0; i <= daysAhead; i++) {
    const checkDate = new Date();
    checkDate.setDate(checkDate.getDate() + i);
    const dateStr = checkDate.toISOString().split('T')[0];
    
    // Check if within season bounds
    const seasonEnd = new Date(currentSeason.endDate);
    if (checkDate > seasonEnd) {
      console.log(`[SEASONS] Date ${dateStr} is past season end - stopping check`);
      break;
    }
    
    if (!isSessionScheduledForDate(dateStr)) {
      console.log(`[SEASONS] No session scheduled for ${dateStr} - attempting to auto-schedule`);
      
      const session = await autoScheduleSessionForDate(
        client, 
        dateStr, 
        getGamesForDate, 
        addScheduledSession
      );
      
      if (session && scheduleSessionJobs && handlers) {
        // Schedule cron jobs for the new session
        scheduleSessionJobs(session, handlers, true); // isNewSession = true for auto-scheduled sessions
      }
    }
  }
  
  console.log('[SEASONS] Auto-scheduler check complete');
}

/**
 * Initialize the season auto-scheduler cron job
 * Runs every hour to check for sessions that need scheduling
 * @param {object} client - Discord client
 * @param {Function} getGamesForDate - Function to get games for a date
 * @param {Function} addScheduledSession - Function to add a scheduled session
 * @param {Function} scheduleSessionJobs - Function to schedule cron jobs for a session
 * @param {object} handlers - Notification handlers
 */
export function initializeSeasonAutoScheduler(client, getGamesForDate, addScheduledSession, scheduleSessionJobs, handlers) {
  console.log('[SEASONS] Initializing season auto-scheduler...');
  
  // Stop any existing cron job
  const existingJob = seasonCronJobs.get('auto_scheduler');
  if (existingJob) {
    existingJob.stop();
    seasonCronJobs.delete('auto_scheduler');
  }
  
  // Run immediately on startup
  setTimeout(async () => {
    await runAutoSchedulerCheck(client, getGamesForDate, addScheduledSession, scheduleSessionJobs, handlers);
  }, 5000); // Wait 5 seconds after startup
  
  // Schedule to run every hour at minute 0
  // This gives us good coverage for scheduling sessions in advance
  const job = cron.schedule('0 * * * *', async () => {
    console.log('[SEASONS] Hourly auto-scheduler check triggered');
    await runAutoSchedulerCheck(client, getGamesForDate, addScheduledSession, scheduleSessionJobs, handlers);
  }, { timezone: 'America/Los_Angeles' });
  
  seasonCronJobs.set('auto_scheduler', job);
  console.log('[SEASONS] ✅ Season auto-scheduler initialized (runs hourly)');
}

/**
 * Stop the season auto-scheduler
 */
export function stopSeasonAutoScheduler() {
  const job = seasonCronJobs.get('auto_scheduler');
  if (job) {
    job.stop();
    seasonCronJobs.delete('auto_scheduler');
    console.log('[SEASONS] Season auto-scheduler stopped');
  }
}

/**
 * Check if auto-scheduler is running
 * @returns {boolean} True if running
 */
export function isAutoSchedulerRunning() {
  return seasonCronJobs.has('auto_scheduler');
}

// Export loadPATSData and savePATSData aliases for compatibility
export { readPATSData as loadPATSData, writePATSData as savePATSData };
