import cron from 'node-cron';
import { getActiveSessions, getUserPicks } from '../utils/patsData.js';
import { getUserPreferences } from '../utils/userPreferences.js';
import { EmbedBuilder } from 'discord.js';

const warnedGames = new Map(); // Track which games we've already warned about per session/user/game/time

/**
 * Check for games starting soon and send warnings to users who haven't picked
 */
async function checkGameWarnings(client) {
  try {
    const sessions = getActiveSessions();
    if (!sessions || sessions.length === 0) {
      return; // No active sessions
    }
    
    const now = new Date();
    
    for (const session of sessions) {
      if (!session || !session.games || session.games.length === 0) {
        continue;
      }

      // Get all participants who should receive warnings
      let participants = [];

      // First, get users who have made at least one pick in this session
      const allPicks = session.picks || {};
      const usersWithPicks = Object.keys(allPicks);

      // Second, get users who were tagged in the announcement (if session has participants)
      if (session.participants && session.participants.length > 0) {
        for (const participantId of session.participants) {
          try {
            // Try role lookup first (covers legacy/global sessions)
            let roleFound = false;
            for (const guild of client.guilds.cache.values()) {
              try {
                const role = await guild.roles.fetch(participantId);
                if (role) {
                  participants.push(...role.members.map(m => m.id));
                  roleFound = true;
                  break;
                }
              } catch {
                // Not a role in this guild
              }
            }

            if (!roleFound) {
              // Treat as userId (covers personal sessions)
              participants.push(participantId);
            }
          } catch (err) {
            console.error(`Error fetching participant ${participantId}:`, err.message);
          }
        }
      }

      // Combine both groups: users with picks + tagged users
      participants = [...new Set([...usersWithPicks, ...participants])];

      // Get session's default warning time (if set)
      const sessionWarningMinutes = session.warningMinutes || 30; // Default to 30 if not set in session

      // Check each participant
      for (const userId of participants) {
        try {
          // Check if user has preferences and warnings enabled
          const prefs = getUserPreferences(userId);
          if (!prefs.dmNotifications?.warnings) {
            continue;
          }

          // Get user's custom warning times or use session default
          let warningMinutes = [];
          if (prefs.warningMinutes === null || prefs.warningMinutes === undefined) {
            // User hasn't customized - use session default
            warningMinutes = [sessionWarningMinutes];
          } else if (Array.isArray(prefs.warningMinutes)) {
            // User has multiple custom times
            warningMinutes = prefs.warningMinutes;
          } else {
            // User has single custom time
            warningMinutes = [prefs.warningMinutes];
          }

          // Check each game for this user at each warning time
          for (const game of session.games) {
            // Skip if game already started or finished
            if (game.result?.isLive || game.result?.isFinal) {
              continue;
            }

            const gameTime = new Date(game.commenceTime);
            const timeUntilGame = gameTime - now;

            // Check each warning time for this game
            for (const warningMin of warningMinutes) {
              const warningThreshold = warningMin * 60 * 1000; // Convert to milliseconds
              const warningLowerBound = (warningMin - 1) * 60 * 1000; // 1-minute window

              // Check if game is within this specific warning window (e.g., between 30-29 minutes)
              if (timeUntilGame <= warningLowerBound || timeUntilGame > warningThreshold) {
                continue; // Not in this warning window
              }

              const warningKey = `${session.id}_${userId}_${game.id}_${warningMin}`;

              // Skip if we've already sent this specific warning
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
                  console.log(`⚠️ Sent warning to ${user.username} (${warningMin} min before) for game ${game.awayTeam} @ ${game.homeTeam}`);

                  // Mark this session/user/game/time combo as warned
                  warnedGames.set(warningKey, true);
                } catch (dmError) {
                  console.error(`Failed to send warning DM to user ${userId}:`, dmError.message);
                }
              }
            }
          }
        } catch (err) {
          console.error(`Error checking picks for user ${userId}:`, err.message);
        }
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
