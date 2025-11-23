/**
 * Data caching system for PATS
 * Fetches and caches NBA game data (spreads, injuries, records) every minute
 * to improve responsiveness and reduce API calls
 */

import { getNBAGamesWithSpreads } from './oddsApi.js';
import { getMatchupInfo } from './espnApi.js';

// Cache storage
const cache = {
  games: null,
  gamesLastUpdated: null,
  matchupInfo: new Map(), // gameId -> matchupInfo
  matchupLastUpdated: new Map(), // gameId -> timestamp
  isRefreshing: false
};

// Cache settings
const CACHE_DURATION = 60 * 1000; // 1 minute
const MATCHUP_CACHE_DURATION = 60 * 1000; // 1 minute for matchup info

/**
 * Initialize the cache and start periodic refresh
 */
export function initializeCache() {
  console.log('[Cache] Initializing data cache system...');
  
  // Do initial fetch
  refreshGamesCache().then(() => {
    console.log('[Cache] Initial games cache loaded');
  });

  // Set up periodic refresh every minute
  setInterval(async () => {
    await refreshGamesCache();
  }, CACHE_DURATION);
}

/**
 * Refresh the games cache
 */
async function refreshGamesCache() {
  if (cache.isRefreshing) {
    console.log('[Cache] Already refreshing, skipping...');
    return;
  }

  try {
    cache.isRefreshing = true;
    console.log('[Cache] Refreshing games data...');
    
    const games = await getNBAGamesWithSpreads();
    
    if (games && games.length > 0) {
      cache.games = games;
      cache.gamesLastUpdated = Date.now();
      console.log(`[Cache] ✅ Cached ${games.length} games at ${new Date().toLocaleTimeString()}`);
    } else {
      console.log('[Cache] ⚠️ No games returned, keeping old cache');
    }
  } catch (error) {
    console.error('[Cache] ❌ Error refreshing games cache:', error.message);
  } finally {
    cache.isRefreshing = false;
  }
}

/**
 * Get cached games
 * Falls back to live fetch if cache is empty or stale
 */
export async function getCachedGames() {
  // If cache is empty, fetch immediately
  if (!cache.games) {
    console.log('[Cache] Cache empty, fetching games...');
    await refreshGamesCache();
  }
  
  // If cache is very stale (>5 minutes), trigger background refresh
  const cacheAge = Date.now() - (cache.gamesLastUpdated || 0);
  if (cacheAge > 5 * 60 * 1000) {
    console.log('[Cache] Cache is stale, triggering refresh...');
    refreshGamesCache(); // Don't await - let it run in background
  }
  
  return cache.games || [];
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
  console.log('[Cache] ✅ Cache cleared');
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
    isRefreshing: cache.isRefreshing
  };
}
