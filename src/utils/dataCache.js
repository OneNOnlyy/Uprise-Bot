/**
 * Data caching system for PATS
 * Caches NBA game data fetched ONLY during session creation to conserve API calls
 * Odds API has a limit of 500 calls per month, so we only fetch once per session
 * 
 * IMPORTANT: Injuries and rosters are NEVER cached - always fetched fresh on-demand
 */

import { getMatchupInfo, getTeamInfo } from './espnApi.js';
import * as cron from 'node-cron';

// Cache storage (only for games/spreads from Odds API)
const cache = {
  games: null,
  gamesLastUpdated: null,
  gamesDate: null, // Track what date the games are for
  isFetchingGames: false
};

// No cache settings needed for injuries/rosters - always fresh

/**
 * Initialize the cache system (no auto-refresh for odds)
 */
export function initializeCache() {
  console.log('[Cache] ✅ Data cache system initialized (odds fetched only on session creation)');
}

/**
 * Fetch games with spreads ONCE for session creation
 * This is the ONLY time we call the Odds API to conserve API usage (500/month limit)
 */
export async function fetchGamesForSession(date = null) {
  if (cache.isFetchingGames) {
    console.log('[Cache] Already fetching games, waiting...');
    // Wait for the current fetch to complete
    while (cache.isFetchingGames) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return cache.games || [];
  }

  try {
    cache.isFetchingGames = true;
    const dateStr = date || new Date().toISOString().split('T')[0];
    console.log(`[Cache] 📊 Fetching games with spreads from Odds API for ${dateStr}...`);
    
    // Use getFormattedGamesForDate to get properly formatted games with spreads
    const { getFormattedGamesForDate } = await import('./oddsApi.js');
    const games = await getFormattedGamesForDate(date);
    
    if (games && games.length > 0) {
      cache.games = games;
      cache.gamesLastUpdated = Date.now();
      cache.gamesDate = dateStr;
      console.log(`[Cache] ✅ Fetched and cached ${games.length} games with spreads`);
      console.log(`[Cache] 💡 These spreads will be used for the entire session (no refreshes)`);
    } else {
      console.log('[Cache] ⚠️ No games returned from Odds API');
    }
    
    return games || [];
  } catch (error) {
    console.error('[Cache] ❌ Error fetching games from Odds API:', error.message);
    return [];
  } finally {
    cache.isFetchingGames = false;
  }
}

/**
 * Get cached games (NO auto-refresh, returns what's in cache)
 * Used for displaying games after session creation
 */
export function getCachedGames() {
  return cache.games || [];
}

/**
 * Clear the games cache (useful when starting a new session for a different date)
 */
export function clearGamesCache() {
  cache.games = null;
  cache.gamesLastUpdated = null;
  cache.gamesDate = null;
  console.log('[Cache] 🗑️ Games cache cleared');
}

/**
 * Get matchup info for a specific game
 * Always fetches fresh data - no caching for injuries/rosters
 */
export async function getCachedMatchupInfo(homeTeam, awayTeam, gameId = null, forceRefresh = false) {
  console.log(`[Data] Fetching fresh matchup info for ${awayTeam} @ ${homeTeam}...`);
  
  try {
    const matchupInfo = await getMatchupInfo(homeTeam, awayTeam);
    return matchupInfo;
  } catch (error) {
    console.error(`[Data] Error fetching matchup info for ${awayTeam} @ ${homeTeam}:`, error.message);
    throw error;
  }
}

/**
 * Prefetch matchup info for all games in a session
 * Note: No caching, but this can still warm up ESPN's servers
 */
export async function prefetchMatchupInfo(games) {
  console.log(`[Data] Prefetching matchup info for ${games.length} games (no caching)...`);
  
  const fetchPromises = games.map(game => 
    getCachedMatchupInfo(game.homeTeam, game.awayTeam, game.id)
      .catch(err => {
        console.error(`[Data] Failed to prefetch ${game.awayTeam} @ ${game.homeTeam}:`, err.message);
        return null;
      })
  );
  
  await Promise.all(fetchPromises);
  console.log('[Data] ✅ Matchup info prefetch complete');
}

/**
 * Clear the entire cache
 */
export function clearCache() {
  cache.games = null;
  cache.gamesLastUpdated = null;
  cache.gamesDate = null;
  console.log('[Cache] ✅ Cache cleared (games only - injuries/rosters never cached)');
}

/**
 * Get team info (ESPN scrape data)
 * Always fetches fresh data - no caching for injuries/rosters
 */
export async function getCachedTeamInfo(teamName) {
  console.log(`[Data] Fetching fresh team info for ${teamName} (ESPN scrape)...`);
  
  try {
    const teamInfo = await getTeamInfo(teamName);
    return teamInfo;
  } catch (error) {
    console.error(`[Data] Error fetching team info for ${teamName}:`, error.message);
    throw error;
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  const gamesAge = cache.gamesLastUpdated 
    ? Math.floor((Date.now() - cache.gamesLastUpdated) / 1000) 
    : null;
  
  return {
    gamesCount: cache.games?.length || 0,
    gamesAge: gamesAge ? `${gamesAge}s` : 'never',
    note: 'Injuries and rosters are never cached - always fetched fresh'
  };
}

/**
 * Get cached injury reports
 */
export function getCachedInjuryReports() {
  // Caching disabled - always return null to fetch fresh injury data
  return null;
}

/**
 * Fetch and cache injury reports - DEPRECATED, caching disabled
 */
export async function fetchAndCacheInjuryReports() {
  console.log('[Cache] Injury caching disabled - no action taken');
  return;
}

/**
 * Start automated injury report updates - DEPRECATED, caching disabled
 */
export function startInjuryReportUpdates() {
  console.log('[Cache] Injury caching disabled - automated updates skipped');
  // All injury report caching and auto-updates are disabled
  // Injuries are now fetched fresh on every request
}
