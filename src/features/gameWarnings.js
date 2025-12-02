import cron from 'node-cron';
import { getActiveSession, getUserPicks } from '../utils/patsData.js';
import { getUserPreferences } from '../utils/userPreferences.js';
import { EmbedBuilder } from 'discord.js';

const warnedGames = new Map(); // Track which games we've already warned about per user: Map<userId_gameId, true>

/**
 * Check for games starting soon and send warnings to users who haven't picked
 */
async function checkGameWarnings(client) {
  try {
    const session = getActiveSession();
    if (!session) {
      return; // No active session
    }
    
    const now = new Date();
    
    // Get all participants who should receive warnings
    let participants = [];
        
        // First, get users who have made at least one pick in this session
        const allPicks = session.picks || {};
        const usersWithPicks = Object.keys(allPicks);
        
        // Second, get users who were tagged in the announcement (if session has participants)
        if (session.participants && session.participants.length > 0) {
          for (const participantId of session.participants) {
            try {
              // Check if it's a role ID (18-20 digits)
              if (participantId.length >= 17) {
                // Try to get role members
                for (const guild of client.guilds.cache.values()) {
                  try {
                    const role = await guild.roles.fetch(participantId);
                    if (role) {
                      participants.push(...role.members.map(m => m.id));
                      break;
                    }
                  } catch (err) {
                    // Role not in this guild, try next
                  }
                }
              } else {
                // Assume it's a user ID
                participants.push(participantId);
              }
            } catch (err) {
              console.error(`Error fetching participant ${participantId}:`, err.message);
            }
          }
        }
        
    // Combine both groups: users with picks + tagged users
    participants = [...new Set([...usersWithPicks, ...participants])];
    
    // Check each participant
    for (const userId of participants) {
      try {
        // Check if user has preferences and warnings enabled
        const prefs = getUserPreferences(userId);
        if (!prefs.dmNotifications?.warnings) {
          continue;
        }
        
        // Get user's custom warning time (default to 30 if not set)
        const userWarningMinutes = prefs.warningMinutes || 30;
        const warningThreshold = userWarningMinutes * 60 * 1000; // Convert to milliseconds
        
        // Check each game for this user
        for (const game of session.games) {
          // Skip if game already started or finished
          if (game.result?.isLive || game.result?.isFinal) {
            continue;
          }
          
          const gameTime = new Date(game.commenceTime);
          const timeUntilGame = gameTime - now;
          
          // Check if game is within this user's warning window
          if (timeUntilGame <= 0 || timeUntilGame > warningThreshold) {
            continue; // Game already started or not in warning window yet
          }
          
          const warningKey = `${userId}_${game.id}`;
          
          // Skip if we've already warned this user about this game
          if (warnedGames.has(warningKey)) {
            continue;
          }
          
          // Get user's picks for this session
          const userPicks = getUserPicks(session.id, userId);
            
          // Check if user has picked THIS specific game
          const hasPickedThisGame = userPicks.some(p => p.gameId === game.id);
          
          if (!hasPickedThisGame) {
            // Send warning DM
            try {
              const user = await client.users.fetch(userId);
              
              const minutesRemaining = Math.floor(timeUntilGame / 60000);
              const embed = new EmbedBuilder()
                .setTitle('⚠️ Game Starting Soon!')
                .setDescription(`You haven't made a pick for this game yet!`)
                .setColor('#FFA500')
                .addFields(
                  {
                    name: '🏀 Matchup',
                    value: `${game.awayTeam} @ ${game.homeTeam}`,
                    inline: false
                  },
                  {
                    name: '⏰ Time Until Game',
                    value: `${minutesRemaining} minute${minutesRemaining === 1 ? '' : 's'}`,
                    inline: false
                  },
                  {
                    name: '📊 Spreads',
                    value: `${game.awayTeam}: ${game.awaySpread > 0 ? '+' : ''}${game.awaySpread}\n${game.homeTeam}: ${game.homeSpread > 0 ? '+' : ''}${game.homeSpread}`,
                    inline: false
                  }
                )
                .setFooter({ text: 'Use /pats dashboard to make your pick now!' });
              
              await user.send({ embeds: [embed] });
              console.log(`⚠️ Sent warning to ${user.username} (${userWarningMinutes} min before) for game ${game.awayTeam} @ ${game.homeTeam}`);
              
              // Mark this user/game combo as warned
              warnedGames.set(warningKey, true);
            } catch (dmError) {
              console.error(`Failed to send warning DM to user ${userId}:`, dmError.message);
            }
          }
        }
      } catch (err) {
        console.error(`Error checking picks for user ${userId}:`, err.message);
      }
    }
    
    // Clean up old warning keys (for completed sessions)
    if (warnedGames.size > 5000) {
      warnedGames.clear();
    }
  } catch (error) {
    console.error('Error checking game warnings:', error);
  }
}

/**
 * Initialize the game warnings cron job
 */
export function initGameWarnings(client) {
  console.log('🔔 Initializing game warnings system...');
  
  // Run every minute to check for games starting soon
  cron.schedule('* * * * *', () => {
    checkGameWarnings(client);
  });
  
  console.log('✅ Game warnings system initialized (checking every minute)');
}
