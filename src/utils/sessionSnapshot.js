import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCachedInjuryReports } from './dataCache.js';
import { getTeamActiveRoster, getTeamAbbreviation } from './oddsApi.js';
import { getInjuriesForTeam } from './espnApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../data');
const SNAPSHOTS_DIR = path.join(DATA_DIR, 'snapshots');
const SNAPSHOT_INDEX_FILE = path.join(DATA_DIR, 'snapshot-index.json');

/**
 * Ensure snapshot directory exists
 */
function ensureSnapshotDirectory() {
  console.log(`[SNAPSHOT] Ensuring snapshot directory exists...`);
  if (!fs.existsSync(DATA_DIR)) {
    console.log(`[SNAPSHOT] Creating DATA_DIR: ${DATA_DIR}`);
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    console.log(`[SNAPSHOT] Creating SNAPSHOTS_DIR: ${SNAPSHOTS_DIR}`);
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }
  if (!fs.existsSync(SNAPSHOT_INDEX_FILE)) {
    console.log(`[SNAPSHOT] Creating snapshot index file`);
    fs.writeFileSync(SNAPSHOT_INDEX_FILE, JSON.stringify({ sessions: [] }, null, 2));
  }
  console.log(`[SNAPSHOT] Snapshot directory ready`);
}

/**
 * Read snapshot index
 */
function readSnapshotIndex() {
  ensureSnapshotDirectory();
  const data = fs.readFileSync(SNAPSHOT_INDEX_FILE, 'utf8');
  return JSON.parse(data);
}

/**
 * Write snapshot index
 */
function writeSnapshotIndex(index) {
  ensureSnapshotDirectory();
  fs.writeFileSync(SNAPSHOT_INDEX_FILE, JSON.stringify(index, null, 2));
}

/**
 * Create a unique hash for injury/roster data to avoid duplication
 */
function createDataHash(data) {
  return Buffer.from(JSON.stringify(data)).toString('base64').substring(0, 16);
}

/**
 * Save injury data if not already saved
 * Returns the hash reference
 */
function saveInjuryData(teamName, injuryData) {
  if (!injuryData || injuryData.length === 0) {
    return null;
  }
  
  const hash = createDataHash({ team: teamName, data: injuryData });
  const injuryFile = path.join(SNAPSHOTS_DIR, `injury-${hash}.json`);
  
  if (!fs.existsSync(injuryFile)) {
    fs.writeFileSync(injuryFile, JSON.stringify({
      team: teamName,
      data: injuryData,
      savedAt: new Date().toISOString()
    }, null, 2));
    console.log(`[SNAPSHOT] Saved new injury data for ${teamName} (${hash})`);
  }
  
  return hash;
}

/**
 * Save roster data if not already saved
 * Returns the hash reference
 */
function saveRosterData(teamName, rosterData) {
  if (!rosterData || rosterData.length === 0) {
    return null;
  }
  
  const hash = createDataHash({ team: teamName, data: rosterData });
  const rosterFile = path.join(SNAPSHOTS_DIR, `roster-${hash}.json`);
  
  if (!fs.existsSync(rosterFile)) {
    fs.writeFileSync(rosterFile, JSON.stringify({
      team: teamName,
      data: rosterData,
      savedAt: new Date().toISOString()
    }, null, 2));
    console.log(`[SNAPSHOT] Saved new roster data for ${teamName} (${hash})`);
  }
  
  return hash;
}

/**
 * Load injury data by hash
 */
export function loadInjuryData(hash) {
  if (!hash) return null;
  
  const injuryFile = path.join(SNAPSHOTS_DIR, `injury-${hash}.json`);
  if (!fs.existsSync(injuryFile)) {
    console.warn(`[SNAPSHOT] Injury data not found: ${hash}`);
    return null;
  }
  
  const data = fs.readFileSync(injuryFile, 'utf8');
  return JSON.parse(data);
}

/**
 * Load roster data by hash
 */
export function loadRosterData(hash) {
  if (!hash) return null;
  
  const rosterFile = path.join(SNAPSHOTS_DIR, `roster-${hash}.json`);
  if (!fs.existsSync(rosterFile)) {
    console.warn(`[SNAPSHOT] Roster data not found: ${hash}`);
    return null;
  }
  
  const data = fs.readFileSync(rosterFile, 'utf8');
  return JSON.parse(data);
}

/**
 * Create a complete session snapshot
 * Captures all game data, user picks, injuries, rosters, etc.
 */
export async function createSessionSnapshot(session) {
  console.log(`[SNAPSHOT] Creating snapshot for session ${session.id}...`);
  
  try {
    // Collect all unique teams from the session
    const teams = new Set();
    session.games.forEach(game => {
      teams.add(game.homeTeam);
      teams.add(game.awayTeam);
    });
    
    console.log(`[SNAPSHOT] Collecting data for ${teams.size} teams...`);
    
    // Fetch and save injury data for all teams (deduplicated)
    const injuryRefs = {};
    const rosterRefs = {};
    
    // Get cached injury reports
    const allInjuryReports = getCachedInjuryReports();
    
    for (const team of teams) {
      try {
        // Get injury data from cached reports
        const teamInjuries = getInjuriesForTeam(team, allInjuryReports);
        if (teamInjuries && teamInjuries.length > 0) {
          injuryRefs[team] = saveInjuryData(team, teamInjuries);
        }
        
        // Get roster data - need team abbreviation
        const teamAbbr = getTeamAbbreviation(team);
        const roster = await getTeamActiveRoster(teamAbbr);
        if (roster && roster.length > 0) {
          rosterRefs[team] = saveRosterData(team, roster);
        }
      } catch (error) {
        console.error(`[SNAPSHOT] Error fetching data for ${team}:`, error.message);
      }
    }
    
    // Build the snapshot structure
    const snapshot = {
      sessionId: session.id,
      date: session.date,
      closedAt: session.closedAt,
      status: session.status,
      
      // Game data with final results
      games: session.games.map(game => ({
        id: game.id,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        commenceTime: game.commenceTime,
        timeString: game.timeString,
        homeSpread: game.homeSpread,
        awaySpread: game.awaySpread,
        favored: game.favored,
        spreadDisplay: game.spreadDisplay,
        result: game.result // Final scores
      })),
      
      // User picks and results
      picks: session.picks,
      results: session.results,
      // Use actual participants (users who made picks) instead of session.participants (eligible users)
      participants: Object.keys(session.picks),
      
      // References to injury/roster data (deduplicated)
      injuryRefs,
      rosterRefs,
      
      // Metadata
      createdAt: session.createdAt,
      snapshotCreatedAt: new Date().toISOString()
    };
    
    // Save snapshot to file
    const snapshotFile = path.join(SNAPSHOTS_DIR, `session-${session.id}.json`);
    fs.writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2));
    
    // Update index
    const index = readSnapshotIndex();
    
    // Remove existing entry if any
    index.sessions = index.sessions.filter(s => s.sessionId !== session.id);
    
    // Add new entry
    index.sessions.unshift({
      sessionId: session.id,
      date: session.date,
      closedAt: session.closedAt,
      gameCount: session.games.length,
      participantCount: session.participants.length,
      totalPicks: Object.values(session.picks).reduce((sum, picks) => sum + picks.length, 0)
    });
    
    // Keep only last 100 sessions in index
    if (index.sessions.length > 100) {
      const removed = index.sessions.slice(100);
      // Delete old snapshot files
      removed.forEach(s => {
        const oldFile = path.join(SNAPSHOTS_DIR, `session-${s.sessionId}.json`);
        if (fs.existsSync(oldFile)) {
          fs.unlinkSync(oldFile);
          console.log(`[SNAPSHOT] Deleted old snapshot: ${s.sessionId}`);
        }
      });
      index.sessions = index.sessions.slice(0, 100);
    }
    
    writeSnapshotIndex(index);
    
    console.log(`[SNAPSHOT] Successfully created snapshot for session ${session.id}`);
    return true;
    
  } catch (error) {
    console.error(`[SNAPSHOT] Error creating snapshot:`, error);
    return false;
  }
}

/**
 * Load a session snapshot by session ID
 */
export function loadSessionSnapshot(sessionId) {
  const snapshotFile = path.join(SNAPSHOTS_DIR, `session-${sessionId}.json`);
  
  if (!fs.existsSync(snapshotFile)) {
    console.warn(`[SNAPSHOT] Snapshot not found for session ${sessionId}`);
    return null;
  }
  
  const data = fs.readFileSync(snapshotFile, 'utf8');
  return JSON.parse(data);
}

/**
 * Get list of all available session snapshots
 */
export function getSnapshotIndex() {
  const index = readSnapshotIndex();
  return index.sessions;
}

/**
 * Get session snapshots for a specific user
 */
export function getUserSessionSnapshots(userId) {
  console.log(`[SNAPSHOT] Getting snapshots for user ${userId}`);
  const index = readSnapshotIndex();
  console.log(`[SNAPSHOT] Total sessions in index: ${index.sessions.length}`);
  
  const userSessions = [];
  
  for (const sessionInfo of index.sessions) {
    const snapshot = loadSessionSnapshot(sessionInfo.sessionId);
    if (snapshot && snapshot.participants.includes(userId)) {
      userSessions.push({
        ...sessionInfo,
        userPicks: snapshot.picks[userId] || [],
        userResult: snapshot.results?.[userId] || null
      });
    }
  }
  
  console.log(`[SNAPSHOT] User participated in ${userSessions.length} sessions`);
  return userSessions;
}

/**
 * Fix existing snapshots to use actual participants (users who made picks)
 * instead of session.participants (eligible users)
 */
export function fixSnapshotParticipants() {
  console.log(`[SNAPSHOT] Fixing existing snapshot participants...`);
  ensureSnapshotDirectory();
  
  const files = fs.readdirSync(SNAPSHOTS_DIR);
  const snapshotFiles = files.filter(f => f.startsWith('session-') && f.endsWith('.json'));
  
  let fixedCount = 0;
  
  for (const file of snapshotFiles) {
    try {
      const filePath = path.join(SNAPSHOTS_DIR, file);
      const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // Get actual participants from picks
      const actualParticipants = Object.keys(snapshot.picks || {});
      
      // Only update if different
      if (JSON.stringify(snapshot.participants?.sort()) !== JSON.stringify(actualParticipants.sort())) {
        console.log(`[SNAPSHOT] Fixing ${file}: ${snapshot.participants?.length || 0} -> ${actualParticipants.length} participants`);
        snapshot.participants = actualParticipants;
        fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
        fixedCount++;
      }
    } catch (error) {
      console.error(`[SNAPSHOT] Error fixing ${file}:`, error.message);
    }
  }
  
  console.log(`[SNAPSHOT] Fixed ${fixedCount} snapshots`);
  return fixedCount;
}
