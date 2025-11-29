import cron from 'node-cron';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { EmbedBuilder } from 'discord.js';
import { getCachedMatchupInfo } from '../utils/dataCache.js';
import { getActiveSession } from '../utils/patsData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TRACKING_FILE = path.join(__dirname, '../../data/injury-tracking.json');

// In-memory store for tracking data
let trackingData = {
  subscriptions: [] // { userId, gameId, homeTeam, awayTeam, lastSnapshot: { home: [], away: [] } }
};

/**
 * Load tracking data from file
 */
async function loadTrackingData() {
  try {
    const data = await fs.readFile(TRACKING_FILE, 'utf-8');
    trackingData = JSON.parse(data);
    console.log(`[Injury Tracking] Loaded ${trackingData.subscriptions.length} subscriptions`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('[Injury Tracking] No tracking file found, starting fresh');
      trackingData = { subscriptions: [] };
      await saveTrackingData();
    } else {
      console.error('[Injury Tracking] Error loading tracking data:', error);
    }
  }
}

/**
 * Save tracking data to file
 */
async function saveTrackingData() {
  try {
    await fs.writeFile(TRACKING_FILE, JSON.stringify(trackingData, null, 2));
  } catch (error) {
    console.error('[Injury Tracking] Error saving tracking data:', error);
  }
}

/**
 * Add a user's subscription to track a game's injuries
 */
export async function subscribeToInjuries(userId, gameId, homeTeam, awayTeam, initialSnapshot) {
  // Check if already subscribed
  const existing = trackingData.subscriptions.find(
    sub => sub.userId === userId && sub.gameId === gameId
  );

  if (existing) {
    return { success: false, message: 'You are already tracking injuries for this game.' };
  }

  trackingData.subscriptions.push({
    userId,
    gameId,
    homeTeam,
    awayTeam,
    lastSnapshot: initialSnapshot,
    subscribedAt: new Date().toISOString()
  });

  await saveTrackingData();
  console.log(`[Injury Tracking] User ${userId} subscribed to ${awayTeam} @ ${homeTeam}`);
  
  return { success: true, message: 'You will be notified of any injury changes for this matchup!' };
}

/**
 * Remove a user's subscription
 */
export async function unsubscribeFromInjuries(userId, gameId) {
  const index = trackingData.subscriptions.findIndex(
    sub => sub.userId === userId && sub.gameId === gameId
  );

  if (index === -1) {
    return { success: false, message: 'You are not tracking this game.' };
  }

  const sub = trackingData.subscriptions[index];
  trackingData.subscriptions.splice(index, 1);
  await saveTrackingData();
  
  console.log(`[Injury Tracking] User ${userId} unsubscribed from ${sub.awayTeam} @ ${sub.homeTeam}`);
  return { success: true, message: 'Stopped tracking injuries for this game.' };
}

/**
 * Check if user is subscribed to a game
 */
export function isSubscribed(userId, gameId) {
  return trackingData.subscriptions.some(
    sub => sub.userId === userId && sub.gameId === gameId
  );
}

/**
 * Compare two injury lists and find what changed
 */
function compareInjuries(oldList, newList) {
  const changes = {
    added: [],
    removed: [],
    statusChanged: [],
    commentChanged: []
  };

  // Create maps for easier lookup
  const oldMap = new Map(oldList.map(inj => [inj.player, inj]));
  const newMap = new Map(newList.map(inj => [inj.player, inj]));

  // Find added, status changed, and comment changed
  for (const [player, newInj] of newMap) {
    const oldInj = oldMap.get(player);
    if (!oldInj) {
      changes.added.push(newInj);
    } else {
      // Check for status change
      if (oldInj.status !== newInj.status) {
        changes.statusChanged.push({
          player,
          oldStatus: oldInj.status,
          newStatus: newInj.status,
          description: newInj.description,
          comment: newInj.comment
        });
      } 
      // Check for comment or description change (if status didn't change)
      else if ((oldInj.comment !== newInj.comment) || (oldInj.description !== newInj.description)) {
        changes.commentChanged.push({
          player,
          status: newInj.status,
          oldComment: oldInj.comment || oldInj.description,
          newComment: newInj.comment || newInj.description,
          description: newInj.description,
          comment: newInj.comment
        });
      }
    }
  }

  // Find removed
  for (const [player, oldInj] of oldMap) {
    if (!newMap.has(player)) {
      changes.removed.push(oldInj);
    }
  }

  return changes;
}

/**
 * Format injury changes for display
 */
function formatInjuryChanges(teamName, changes) {
  const lines = [];

  if (changes.added.length > 0) {
    lines.push('**🔴 New Injuries:**');
    changes.added.forEach(inj => {
      const desc = inj.description || 'Injury';
      lines.push(`• ${inj.player} - ${desc} (${inj.status})`);
      if (inj.comment) {
        lines.push(`  💬 ${inj.comment}`);
      }
    });
  }

  if (changes.statusChanged.length > 0) {
    lines.push('**⚠️ Status Updates:**');
    changes.statusChanged.forEach(change => {
      const desc = change.description || 'Injury';
      lines.push(`• ${change.player} - ${desc}`);
      lines.push(`  ${change.oldStatus} → ${change.newStatus}`);
      if (change.comment) {
        lines.push(`  💬 ${change.comment}`);
      }
    });
  }

  if (changes.commentChanged.length > 0) {
    lines.push('**📝 Updated Information:**');
    changes.commentChanged.forEach(change => {
      const desc = change.description || 'Injury';
      lines.push(`• ${change.player} - ${desc} (${change.status})`);
      if (change.oldComment && change.newComment) {
        lines.push(`  💬 Was: "${change.oldComment}"`);
        lines.push(`  💬 Now: "${change.newComment}"`);
      } else if (change.newComment) {
        lines.push(`  💬 ${change.newComment}`);
      }
    });
  }

  if (changes.removed.length > 0) {
    lines.push('**🟢 Removed from Report (Now Available):**');
    changes.removed.forEach(inj => {
      lines.push(`• ${inj.player}`);
    });
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

/**
 * Check all subscriptions for injury changes
 */
async function checkInjuryUpdates(client) {
  if (trackingData.subscriptions.length === 0) {
    return;
  }

  console.log(`[Injury Tracking] Checking ${trackingData.subscriptions.length} subscriptions...`);

  const session = getActiveSession();
  if (!session) {
    console.log('[Injury Tracking] No active session, skipping check');
    return;
  }

  const updatedSubscriptions = [];

  for (const sub of trackingData.subscriptions) {
    try {
      // Check if game still exists in session
      const game = session.games.find(g => g.id === sub.gameId);
      if (!game) {
        console.log(`[Injury Tracking] Game ${sub.gameId} not found, removing subscription`);
        continue; // Don't add to updated list (will be removed)
      }

      // Check if game has already started
      const gameTime = new Date(game.commenceTime);
      if (gameTime <= new Date()) {
        console.log(`[Injury Tracking] Game ${sub.awayTeam} @ ${sub.homeTeam} has started, removing subscription`);
        continue; // Don't notify about games that started
      }

      // Fetch current injury data
      const matchupInfo = await getCachedMatchupInfo(sub.homeTeam, sub.awayTeam, sub.gameId);

      if (!matchupInfo) {
        console.log(`[Injury Tracking] Could not fetch matchup info for ${sub.awayTeam} @ ${sub.homeTeam}`);
        updatedSubscriptions.push(sub); // Keep subscription
        continue;
      }

      const currentSnapshot = {
        home: matchupInfo.home?.injuries || [],
        away: matchupInfo.away?.injuries || []
      };

      // Compare with last snapshot
      const homeChanges = compareInjuries(sub.lastSnapshot.home, currentSnapshot.home);
      const awayChanges = compareInjuries(sub.lastSnapshot.away, currentSnapshot.away);

      const hasHomeChanges = homeChanges.added.length > 0 || homeChanges.removed.length > 0 || homeChanges.statusChanged.length > 0 || homeChanges.commentChanged.length > 0;
      const hasAwayChanges = awayChanges.added.length > 0 || awayChanges.removed.length > 0 || awayChanges.statusChanged.length > 0 || awayChanges.commentChanged.length > 0;

      if (hasHomeChanges || hasAwayChanges) {
        console.log(`[Injury Tracking] Changes detected for ${sub.awayTeam} @ ${sub.homeTeam}, notifying user ${sub.userId}`);

        // Send DM to user
        try {
          const user = await client.users.fetch(sub.userId);
          
          const embed = new EmbedBuilder()
            .setTitle('🚨 Injury Report Update')
            .setDescription(`**${sub.awayTeam} @ ${sub.homeTeam}**\n\nThe injury report has been updated for this matchup:`)
            .setColor(0xFFA500)
            .setTimestamp();

          if (hasAwayChanges) {
            const awayChangeText = formatInjuryChanges(sub.awayTeam, awayChanges);
            if (awayChangeText) {
              embed.addFields({
                name: `✈️ ${sub.awayTeam}`,
                value: awayChangeText,
                inline: false
              });
            }
          }

          if (hasHomeChanges) {
            const homeChangeText = formatInjuryChanges(sub.homeTeam, homeChanges);
            if (homeChangeText) {
              embed.addFields({
                name: `🏠 ${sub.homeTeam}`,
                value: homeChangeText,
                inline: false
              });
            }
          }

          embed.setFooter({ text: 'You are tracking this matchup for injury updates' });

          await user.send({ embeds: [embed] });
          console.log(`[Injury Tracking] Sent update notification to user ${sub.userId}`);

        } catch (error) {
          console.error(`[Injury Tracking] Error sending DM to user ${sub.userId}:`, error);
        }

        // Update snapshot
        sub.lastSnapshot = currentSnapshot;
      }

      updatedSubscriptions.push(sub);

    } catch (error) {
      console.error(`[Injury Tracking] Error checking subscription for ${sub.awayTeam} @ ${sub.homeTeam}:`, error);
      updatedSubscriptions.push(sub); // Keep subscription even if error
    }
  }

  // Update subscriptions list (removes games that ended)
  trackingData.subscriptions = updatedSubscriptions;
  await saveTrackingData();
}

/**
 * Initialize injury tracking system
 */
export async function initInjuryTracking(client) {
  console.log('[Injury Tracking] Initializing injury tracking system...');
  
  // Load existing tracking data
  await loadTrackingData();

  // Set up cron job to check every minute
  cron.schedule('* * * * *', async () => {
    try {
      await checkInjuryUpdates(client);
    } catch (error) {
      console.error('[Injury Tracking] Error in injury check cron:', error);
    }
  });

  console.log('[Injury Tracking] Injury tracking system initialized');
}

/**
 * Get all subscriptions for a user
 */
export function getUserSubscriptions(userId) {
  return trackingData.subscriptions.filter(sub => sub.userId === userId);
}

/**
 * Clean up old subscriptions (for games that ended)
 */
export async function cleanupOldSubscriptions() {
  const session = getActiveSession();
  if (!session) {
    trackingData.subscriptions = [];
    await saveTrackingData();
    return;
  }

  const validGameIds = new Set(session.games.map(g => g.id));
  const before = trackingData.subscriptions.length;
  
  trackingData.subscriptions = trackingData.subscriptions.filter(sub => 
    validGameIds.has(sub.gameId)
  );

  const removed = before - trackingData.subscriptions.length;
  if (removed > 0) {
    await saveTrackingData();
    console.log(`[Injury Tracking] Cleaned up ${removed} old subscriptions`);
  }
}
