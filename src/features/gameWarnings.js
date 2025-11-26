import cron from 'node-cron';
import { getActiveSession, getUserPicks } from '../utils/patsData.js';
import { getUserPreferences } from '../utils/userPreferences.js';
import { EmbedBuilder } from 'discord.js';

const MINUTES_BEFORE_WARNING = 15; // Warn users 15 minutes before game starts
const warnedGames = new Set(); // Track which games we've already warned about

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
    const warningThreshold = MINUTES_BEFORE_WARNING * 60 * 1000; // Convert to milliseconds
    
    // Check each game
    for (const game of session.games) {
      // Skip if game already started or finished
      if (game.result?.isLive || game.result?.isFinal) {
        continue;
      }
      
      const gameTime = new Date(game.commenceTime);
      const timeUntilGame = gameTime - now;
      
      // Check if game is within warning window (15 minutes before)
      if (timeUntilGame > 0 && timeUntilGame <= warningThreshold) {
        const warningKey = `${session.id}_${game.id}`;
        
        // Skip if we've already warned about this game
        if (warnedGames.has(warningKey)) {
          continue;
        }
        
        console.log(`⚠️ Game starting in ${Math.floor(timeUntilGame / 60000)} minutes: ${game.awayTeam} @ ${game.homeTeam}`);
        
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
        
        console.log(`⚠️ Checking ${participants.length} participants for picks on game ${game.id}`);
        
        // Check each participant
        let warningsSent = 0;
        for (const userId of participants) {
          try {
            // Check if user has preferences and warnings enabled
            const prefs = getUserPreferences(userId);
            if (!prefs.warnings) {
              continue;
            }
            
            // Check if user has made ANY picks in this session
            const userPicks = getUserPicks(session.id, userId);
            
            // Only send warning if:
            // 1. User has made at least one pick (engaged with the session), OR
            // 2. User was tagged in the announcement (participant)
            const hasAnyPicks = userPicks.length > 0;
            const wasTagged = session.participants && session.participants.length > 0;
            
            if (!hasAnyPicks && !wasTagged) {
              // Skip users who haven't engaged and weren't tagged
              continue;
            }
            
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
                  .setFooter({ text: 'Use /pats to make your pick now!' });
                
                await user.send({ embeds: [embed] });
                warningsSent++;
                console.log(`⚠️ Sent warning to ${user.username} for game ${game.awayTeam} @ ${game.homeTeam}`);
              } catch (dmError) {
                console.error(`Failed to send warning DM to user ${userId}:`, dmError.message);
              }
            }
          } catch (err) {
            console.error(`Error checking picks for user ${userId}:`, err.message);
          }
        }
        
        console.log(`⚠️ Sent ${warningsSent} warning(s) for game ${game.awayTeam} @ ${game.homeTeam}`);
        
        // Mark this game as warned
        warnedGames.add(warningKey);
        
        // Clean up old warning keys (for completed sessions)
        if (warnedGames.size > 1000) {
          warnedGames.clear();
        }
      }
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
