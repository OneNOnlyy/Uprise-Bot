/**
 * Data caching system for PATS
 * Caches NBA game data fetched ONLY during session creation to conserve API calls
 * Odds API has a limit of 500 calls per month, so we only fetch once per session
 */

import { getNBAGamesWithSpreads } from './oddsApi.js';
import { getMatchupInfo, getTeamInfo } from './espnApi.js';

// Cache storage
const cache = {
  games: null,
  gamesLastUpdated: null,
  gamesDate: null, // Track what date the games are for
  matchupInfo: new Map(), // gameId -> matchupInfo
  matchupLastUpdated: new Map(), // gameId -> timestamp
  teamInfo: new Map(), // teamName -> teamInfo (ESPN scrapes)
  teamLastUpdated: new Map(), // teamName -> timestamp
  isFetchingGames: false
};

// Cache settings
const MATCHUP_CACHE_DURATION = 60 * 1000; // 1 minute for matchup info
const TEAM_CACHE_DURATION = 60 * 1000; // 1 minute for team info (ESPN scrapes)

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
    
    const games = await getNBAGamesWithSpreads(date);
    
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
 * Get cached matchup info for a specific game
 * Falls back to live fetch if not cached or stale
 */
export async function getCachedMatchupInfo(homeTeam, awayTeam, gameId = null) {
  const cacheKey = gameId || `${homeTeam}_${awayTeam}`;
  
  // Check if we have cached data
  const cachedData = cache.matchupInfo.get(cacheKey);
  const lastUpdated = cache.matchupLastUpdated.get(cacheKey) || 0;
  const cacheAge = Date.now() - lastUpdated;
  
  // If cache is fresh (less than 1 minute old), return it
  if (cachedData && cacheAge < MATCHUP_CACHE_DURATION) {
    console.log(`[Cache] Using cached matchup info for ${awayTeam} @ ${homeTeam} (${Math.floor(cacheAge / 1000)}s old)`);
    return cachedData;
  }
  
  // Cache is stale or missing, fetch new data
  console.log(`[Cache] Fetching fresh matchup info for ${awayTeam} @ ${homeTeam}...`);
  try {
    const matchupInfo = await getMatchupInfo(homeTeam, awayTeam);
    
    // Cache the result
    cache.matchupInfo.set(cacheKey, matchupInfo);
    cache.matchupLastUpdated.set(cacheKey, Date.now());
    
    return matchupInfo;
  } catch (error) {
    console.error(`[Cache] Error fetching matchup info for ${awayTeam} @ ${homeTeam}:`, error.message);
    
    // If we have stale cached data, return it as fallback
    if (cachedData) {
      console.log(`[Cache] Using stale cache as fallback (${Math.floor(cacheAge / 1000)}s old)`);
      return cachedData;
    }
    
    throw error;
  }
}

/**
 * Prefetch matchup info for all games in a session
 * Call this when a PATS session starts to warm up the cache
 */
export async function prefetchMatchupInfo(games) {
  console.log(`[Cache] Prefetching matchup info for ${games.length} games...`);
  
  const fetchPromises = games.map(game => 
    getCachedMatchupInfo(game.homeTeam, game.awayTeam, game.id)
      .catch(err => {
        console.error(`[Cache] Failed to prefetch ${game.awayTeam} @ ${game.homeTeam}:`, err.message);
        return null;
      })
  );
  
  await Promise.all(fetchPromises);
  console.log('[Cache] ✅ Matchup info prefetch complete');
}

/**
 * Clear the entire cache (useful for testing or troubleshooting)
 */
export function clearCache() {
  cache.games = null;
  cache.gamesLastUpdated = null;
  cache.matchupInfo.clear();
  cache.matchupLastUpdated.clear();
  cache.teamInfo.clear();
  cache.teamLastUpdated.clear();
  console.log('[Cache] ✅ Cache cleared');
}

/**
 * Get cached team info (ESPN scrape data)
 * Falls back to live fetch if not cached or stale
 */
export async function getCachedTeamInfo(teamName) {
  // Check if we have cached data
  const cachedData = cache.teamInfo.get(teamName);
  const lastUpdated = cache.teamLastUpdated.get(teamName) || 0;
  const cacheAge = Date.now() - lastUpdated;
  
  // If cache is fresh (less than 1 minute old), return it
  if (cachedData && cacheAge < TEAM_CACHE_DURATION) {
    console.log(`[Cache] Using cached team info for ${teamName} (${Math.floor(cacheAge / 1000)}s old)`);
    return cachedData;
  }
  
  // Cache is stale or missing, fetch new data
  console.log(`[Cache] Fetching fresh team info for ${teamName} (ESPN scrape)...`);
  try {
    const teamInfo = await getTeamInfo(teamName);
    
    // Cache the result
    cache.teamInfo.set(teamName, teamInfo);
    cache.teamLastUpdated.set(teamName, Date.now());
    
    return teamInfo;
  } catch (error) {
    console.error(`[Cache] Error fetching team info for ${teamName}:`, error.message);
    
    // If we have stale cached data, return it as fallback
    if (cachedData) {
      console.log(`[Cache] Using stale team cache as fallback (${Math.floor(cacheAge / 1000)}s old)`);
      return cachedData;
    }
    
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
    matchupsCached: cache.matchupInfo.size,
    teamsCached: cache.teamInfo.size,
    isRefreshing: cache.isRefreshing
  };
}
