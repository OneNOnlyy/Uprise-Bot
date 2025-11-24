import { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionFlagsBits
} from 'discord.js';
import { readPATSData } from '../utils/patsData.js';

/**
 * FAIL-SAFE: Fix spreads where one is 0 but the other isn't (they should be inverse)
 */
function fixZeroSpreads(game) {
  let homeSpread = game.homeSpread !== undefined ? game.homeSpread : 0;
  let awaySpread = game.awaySpread !== undefined ? game.awaySpread : 0;
  
  if (homeSpread !== 0 && awaySpread === 0) {
    awaySpread = -homeSpread;
  } else if (awaySpread !== 0 && homeSpread === 0) {
    homeSpread = -awaySpread;
  }
  
  return { homeSpread, awaySpread };
}

export const data = new SlashCommandBuilder()
  .setName('patshistory')
  .setDescription('View complete PATS session history (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    await showHistoryOverview(interaction);
  } catch (error) {
    console.error('Error executing patshistory command:', error);
    await interaction.editReply({
      content: '❌ An error occurred while loading session history.',
    });
  }
}

/**
 * Handle history navigation button interactions
 */
export async function handleHistoryButton(interaction) {
  try {
    if (interaction.customId === 'history_overview') {
      await interaction.deferUpdate();
      await showHistoryOverview(interaction);
    } else if (interaction.customId.startsWith('history_session_')) {
      await interaction.deferUpdate();
      const sessionId = interaction.customId.replace('history_session_', '');
      await showSessionDetail(interaction, sessionId);
    } else if (interaction.customId.startsWith('history_user_')) {
      await interaction.deferUpdate();
      const parts = interaction.customId.split('_');
      const sessionId = parts[2];
      const userId = parts[3];
      await showUserSessionDetail(interaction, sessionId, userId);
    } else if (interaction.customId.startsWith('history_game_')) {
      await interaction.deferUpdate();
      const parts = interaction.customId.split('_');
      const sessionId = parts[2];
      const gameId = parts[3];
      await showGameDetail(interaction, sessionId, gameId);
    }
  } catch (error) {
    console.error('Error handling history button:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ Error processing your request.',
        ephemeral: true
      });
    }
  }
}

/**
 * Handle session selection dropdown
 */
export async function handleSessionSelect(interaction) {
  try {
    await interaction.deferUpdate();
    const sessionId = interaction.values[0];
    await showSessionDetail(interaction, sessionId);
  } catch (error) {
    console.error('Error handling session select:', error);
  }
}

/**
 * Handle user selection dropdown
 */
export async function handleUserSelect(interaction) {
  try {
    await interaction.deferUpdate();
    const [sessionId, userId] = interaction.values[0].split('|');
    await showUserSessionDetail(interaction, sessionId, userId);
  } catch (error) {
    console.error('Error handling user select:', error);
  }
}

/**
 * Handle game selection dropdown
 */
export async function handleGameSelect(interaction) {
  try {
    await interaction.deferUpdate();
    const [sessionId, gameId] = interaction.values[0].split('|');
    await showGameDetail(interaction, sessionId, gameId);
  } catch (error) {
    console.error('Error handling game select:', error);
  }
}

/**
 * Show overview of all sessions
 */
async function showHistoryOverview(interaction) {
  const data = readPATSData();
  
  // Include both active and closed sessions
  const allSessions = [
    ...data.activeSessions.map(s => ({ ...s, isActive: true })),
    ...data.history.map(s => ({ ...s, isActive: false }))
  ].sort((a, b) => {
    // Sort by closedAt for closed sessions, or by creation date for active
    const dateA = a.closedAt ? new Date(a.closedAt) : new Date(a.date);
    const dateB = b.closedAt ? new Date(b.closedAt) : new Date(b.date);
    return dateB - dateA;
  });

  const embed = new EmbedBuilder()
    .setTitle('📜 Complete PATS History')
    .setDescription('All completed PATS sessions')
    .setColor(0x5865F2)
    .setTimestamp();

  if (allSessions.length === 0) {
    embed.setDescription('No completed sessions yet.');
    await interaction.editReply({ embeds: [embed], components: [] });
    return;
  }

  // Show last 15 sessions in overview
  const recentSessions = allSessions.slice(0, 15);
  const sessionList = recentSessions.map((session, index) => {
    const dateStr = session.closedAt 
      ? new Date(session.closedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : `${session.date} (Active)`;
    const participantCount = session.participants.length;
    const gameCount = session.games.length;
    
    // Calculate total picks made
    let totalPicks = 0;
    for (const userId in session.picks) {
      totalPicks += session.picks[userId].length;
    }
    
    const statusEmoji = session.isActive ? '🟢' : '⚫';
    return `${statusEmoji} **${index + 1}. ${dateStr}** - ${participantCount} players • ${gameCount} games • ${totalPicks} picks`;
  }).join('\n');

  embed.addFields({
    name: '📊 Recent Sessions (Last 15)',
    value: sessionList,
    inline: false
  });

  // Overall stats
  const totalSessions = allSessions.length;
  let totalParticipants = new Set();
  let totalPicks = 0;
  let totalGames = 0;

  allSessions.forEach(session => {
    session.participants.forEach(userId => totalParticipants.add(userId));
    totalGames += session.games.length;
    for (const userId in session.picks) {
      totalPicks += session.picks[userId].length;
    }
  });

  embed.addFields({
    name: '📈 All-Time Stats',
    value: [
      `**Total Sessions:** ${totalSessions}`,
      `**Unique Participants:** ${totalParticipants.size}`,
      `**Total Games:** ${totalGames}`,
      `**Total Picks:** ${totalPicks}`
    ].join('\n'),
    inline: false
  });

  // Create dropdown to select a specific session
  const sessionOptions = recentSessions.slice(0, 25).map((session, index) => {
    const dateStr = session.closedAt
      ? new Date(session.closedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : `${session.date} (Active)`;
    const statusLabel = session.isActive ? '🟢 Active' : 'Closed';
    return {
      label: `${dateStr} - ${session.participants.length} players`,
      description: `${statusLabel} • ${session.games.length} games • ID: ${session.id.toString().slice(0, 8)}`,
      value: session.id
    };
  });

  const selectMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('history_session_select')
      .setPlaceholder('Select a session to view details')
      .addOptions(sessionOptions)
  );

  await interaction.editReply({
    embeds: [embed],
    components: [selectMenu]
  });
}

/**
 * Show detailed view of a specific session
 */
async function showSessionDetail(interaction, sessionId) {
  const data = readPATSData();
  
  // Check both active and history
  let session = data.history.find(s => s.id === sessionId);
  let isActive = false;
  
  if (!session) {
    session = data.activeSessions.find(s => s.id === sessionId);
    isActive = true;
  }

  if (!session) {
    await interaction.editReply({
      content: '❌ Session not found.',
      embeds: [],
      components: []
    });
    return;
  }

  const statusEmoji = isActive ? '🟢' : '⚫';
  const statusText = isActive ? 'Active' : 'Closed';
  
  const embed = new EmbedBuilder()
    .setTitle(`${statusEmoji} Session Details - ${session.date}`)
    .setDescription(`Session ID: \`${session.id}\`\nStatus: **${statusText}**`)
    .setColor(isActive ? 0x00FF00 : 0x5865F2)
    .setTimestamp(session.closedAt ? new Date(session.closedAt) : null);

  // Session info
  const infoFields = [
    `**Date:** ${session.date}`,
    `**Games:** ${session.games.length}`,
    `**Participants:** ${session.participants.length}`
  ];
  
  if (session.closedAt) {
    infoFields.splice(1, 0, `**Closed:** ${new Date(session.closedAt).toLocaleString('en-US')}`);
  }
  
  embed.addFields({
    name: '📅 Session Info',
    value: infoFields.join('\n'),
    inline: true
  });

  // Games list
  const gamesList = session.games.map((game, index) => {
    const result = game.result;
    if (result) {
      return `${index + 1}. ${game.awayTeam} ${result.awayScore} @ ${game.homeTeam} ${result.homeScore}`;
    }
    return `${index + 1}. ${game.awayTeam} @ ${game.homeTeam} (No result)`;
  }).join('\n');

  embed.addFields({
    name: '🏀 Games',
    value: gamesList.length > 1024 ? gamesList.substring(0, 1021) + '...' : gamesList,
    inline: false
  });

  // Leaderboard for this session
  const leaderboard = session.participants
    .map(userId => {
      const result = session.results[userId];
      if (!result) return null;
      
      const totalComplete = result.wins + result.losses + (result.pushes || 0);
      const totalDecisive = result.wins + result.losses;
      const winPct = totalDecisive > 0 ? ((result.wins / totalDecisive) * 100).toFixed(1) : '0.0';
      
      return {
        userId,
        wins: result.wins,
        losses: result.losses,
        pushes: result.pushes || 0,
        missedPicks: result.missedPicks || 0,
        winPct: parseFloat(winPct),
        totalComplete
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.winPct !== a.winPct) return b.winPct - a.winPct;
      return b.wins - a.wins;
    });

  const leaderboardText = await Promise.all(
    leaderboard.slice(0, 10).map(async (entry, index) => {
      try {
        const user = await interaction.client.users.fetch(entry.userId);
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        const record = `${entry.wins}-${entry.losses}-${entry.pushes}`;
        const missedText = entry.missedPicks > 0 ? ` • ${entry.missedPicks} missed` : '';
        return `${medal} **${user.username}** - ${record} (${entry.winPct}%)${missedText}`;
      } catch {
        return `${index + 1}. Unknown User - ${entry.wins}-${entry.losses}-${entry.pushes}`;
      }
    })
  );

  embed.addFields({
    name: '🏆 Session Leaderboard',
    value: leaderboardText.join('\n') || 'No results',
    inline: false
  });

  // Create dropdown to select a user's picks
  const userOptions = leaderboard.slice(0, 25).map((entry, index) => {
    const pickCount = session.picks[entry.userId]?.length || 0;
    return {
      label: `#${index + 1} - ${pickCount} picks • ${entry.wins}-${entry.losses}-${entry.pushes}`,
      description: `View detailed picks for this user`,
      value: `${session.id}|${entry.userId}`
    };
  });

  // Create dropdown to select a game to see who picked what
  const gameOptions = session.games.slice(0, 25).map((game, index) => {
    const result = game.result;
    const scoreText = result ? `${result.awayScore}-${result.homeScore}` : 'Final';
    return {
      label: ` ${game.awayTeam} @ ${game.homeTeam}`,
      description: `${scoreText} • View all picks for this game`,
      value: `${session.id}|${game.id}`
    };
  });

  const components = [];
  
  if (gameOptions.length > 0) {
    const gameSelectMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('history_game_select')
        .setPlaceholder('Select a game to see all picks')
        .addOptions(gameOptions)
    );
    components.push(gameSelectMenu);
  }
  
  if (userOptions.length > 0) {
    const userSelectMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('history_user_select')
        .setPlaceholder('Select a user to view their picks')
        .addOptions(userOptions)
    );
    components.push(userSelectMenu);
  }

  const backButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('history_overview')
      .setLabel('Back to Overview')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀️')
  );
  components.push(backButton);

  await interaction.editReply({
    embeds: [embed],
    components
  });
}

/**
 * Show detailed view of a user's picks in a specific session
 */
async function showUserSessionDetail(interaction, sessionId, userId) {
  const data = readPATSData();
  
  // Check both active and history
  let session = data.history.find(s => s.id === sessionId);
  if (!session) {
    session = data.activeSessions.find(s => s.id === sessionId);
  }

  if (!session) {
    await interaction.editReply({
      content: '❌ Session not found.',
      embeds: [],
      components: []
    });
    return;
  }

  let user;
  try {
    user = await interaction.client.users.fetch(userId);
  } catch {
    user = { username: 'Unknown User', displayName: 'Unknown User' };
  }

  const picks = session.picks[userId] || [];
  const result = session.results[userId];

  const embed = new EmbedBuilder()
    .setTitle(`🎯 ${user.username}'s Picks`)
    .setDescription(`**Session:** ${session.date}\n**Record:** ${result?.wins || 0}-${result?.losses || 0}-${result?.pushes || 0}`)
    .setColor(0x5865F2)
    .setTimestamp(new Date(session.closedAt));

  // Overall result
  const totalComplete = (result?.wins || 0) + (result?.losses || 0) + (result?.pushes || 0);
  const totalDecisive = (result?.wins || 0) + (result?.losses || 0);
  const winPct = totalDecisive > 0 ? (((result?.wins || 0) / totalDecisive) * 100).toFixed(1) : '0.0';
  
  embed.addFields({
    name: '📊 Session Result',
    value: [
      `**Record:** ${result?.wins || 0}-${result?.losses || 0}${pushText}`,
      `**Win Rate:** ${winPct}%`,
      `**Picks Made:** ${picks.length}/${session.games.length}`,
      result?.missedPicks > 0 ? `**Missed:** ${result.missedPicks} ⚠️` : null
    ].filter(Boolean).join('\n'),
    inline: true
  });

  // Detailed picks
  if (picks.length > 0) {
    const pickDetails = picks.map((pick, index) => {
      const game = session.games.find(g => g.id === pick.gameId);
      if (!game) return null;

      const pickedTeam = pick.pick === 'home' ? game.homeTeam : game.awayTeam;
      
      // Use corrected spread, not the old saved value
      const fixedSpreads = fixZeroSpreads(game);
      const correctedSpread = pick.pick === 'home' ? fixedSpreads.homeSpread : fixedSpreads.awaySpread;
      const spreadText = correctedSpread > 0 ? `+${correctedSpread}` : correctedSpread.toString();
      
      const ddEmoji = pick.isDoubleDown ? ' 💰' : '';
      
      if (!game.result) {
        return `${index + 1}. ❓ **${pickedTeam}** (${spreadText})${ddEmoji} - No result`;
      }

      const homeScore = game.result.homeScore;
      const awayScore = game.result.awayScore;
      
      // Use corrected spreads for calculations too
      const awaySpread = fixedSpreads.awaySpread;
      const homeSpread = fixedSpreads.homeSpread;
      
      // Calculate adjusted scores
      const adjustedHomeScore = homeScore + homeSpread;
      const adjustedAwayScore = awayScore + awaySpread;
      
      // Determine result based on which side user picked
      let userAdjustedScore, opponentScore;
      if (pick.pick === 'home') {
        userAdjustedScore = adjustedHomeScore;
        opponentScore = awayScore;
      } else {
        userAdjustedScore = adjustedAwayScore;
        opponentScore = homeScore;
      }
      
      // Three-way check: push, win, or loss
      let statusEmoji;
      if (userAdjustedScore === opponentScore) {
        statusEmoji = '🟰';
      } else if (userAdjustedScore > opponentScore) {
        statusEmoji = '✅';
      } else {
        statusEmoji = '❌';
      }

      const scoreText = `(${game.awayTeam} ${awayScore} @ ${game.homeTeam} ${homeScore})`;
      
      return `${index + 1}. ${statusEmoji} **${pickedTeam}** ${spreadText}${ddEmoji}\n    ${scoreText}`;
    }).filter(Boolean).join('\n');

    // Split into multiple fields if too long
    const maxLength = 1024;
    if (pickDetails.length <= maxLength) {
      embed.addFields({
        name: '🎯 All Picks',
        value: pickDetails,
        inline: false
      });
    } else {
      // Split into chunks
      const chunks = [];
      let currentChunk = '';
      pickDetails.split('\n').forEach(line => {
        if ((currentChunk + line + '\n').length > maxLength) {
          chunks.push(currentChunk);
          currentChunk = line + '\n';
        } else {
          currentChunk += line + '\n';
        }
      });
      if (currentChunk) chunks.push(currentChunk);

      chunks.forEach((chunk, index) => {
        embed.addFields({
          name: index === 0 ? '🎯 All Picks' : `🎯 Picks (continued ${index + 1})`,
          value: chunk,
          inline: false
        });
      });
    }
  }

  // Check for missed games
  if (result?.missedPicks > 0) {
    const pickedGameIds = picks.map(p => p.gameId);
    const missedGames = session.games
      .filter(g => !pickedGameIds.includes(g.id))
      .map(g => `${g.awayTeam} @ ${g.homeTeam}`)
      .join(', ');
    
    if (missedGames) {
      embed.addFields({
        name: '⚠️ Missed Picks',
        value: missedGames.length > 1024 ? missedGames.substring(0, 1021) + '...' : missedGames,
        inline: false
      });
    }
  }

  const backButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`history_session_${sessionId}`)
      .setLabel('Back to Session')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀️')
  );

  await interaction.editReply({
    embeds: [embed],
    components: [backButton]
  });
}

/**
 * Show detailed view of a specific game with all picks
 */
async function showGameDetail(interaction, sessionId, gameId) {
  const data = readPATSData();
  
  // Check both active and history
  let session = data.history.find(s => s.id === sessionId);
  if (!session) {
    session = data.activeSessions.find(s => s.id === sessionId);
  }

  if (!session) {
    await interaction.editReply({
      content: '❌ Session not found.',
      embeds: [],
      components: []
    });
    return;
  }

  const game = session.games.find(g => g.id === gameId);
  if (!game) {
    await interaction.editReply({
      content: '❌ Game not found.',
      embeds: [],
      components: []
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🏀  ${game.awayTeam} @ ${game.homeTeam}`)
    .setDescription(`**Session:** ${session.date}`)
    .setColor(0x5865F2)
    .setTimestamp(new Date(session.closedAt));

  // Game info and result
  if (game.result) {
    const awayScore = game.result.awayScore;
    const homeScore = game.result.homeScore;
    const margin = Math.abs(awayScore - homeScore);
    const winner = awayScore > homeScore ? game.awayTeam : game.homeTeam;
    
    embed.addFields({
      name: '📊 Final Score',
      value: [
        `**${game.awayTeam}:** ${awayScore}`,
        `**${game.homeTeam}:** ${homeScore}`,
        `**Winner:** ${winner} by ${margin}`
      ].join('\n'),
      inline: true
    });
  }

  // Spread info
  const awaySpread = game.awaySpread !== undefined ? game.awaySpread : 0;
  const homeSpread = game.homeSpread !== undefined ? game.homeSpread : 0;
  const favoredTeam = awaySpread < 0 ? game.awayTeam : game.homeTeam;
  const spreadValue = Math.abs(awaySpread);
  
  embed.addFields({
    name: '📈 Spread',
    value: [
      `**${game.awayTeam}:** ${awaySpread > 0 ? '+' : ''}${awaySpread}`,
      `**${game.homeTeam}:** ${homeSpread > 0 ? '+' : ''}${homeSpread}`,
      `**Favorite:** ${favoredTeam} by ${spreadValue}`
    ].join('\n'),
    inline: true
  });

  // Calculate which side covered
  if (game.result) {
    const homeScore = game.result.homeScore;
    const awayScore = game.result.awayScore;
    const awayCovered = (awayScore + awaySpread) > homeScore;
    const homeCovered = (homeScore + homeSpread) > awayScore;
    
    const coverText = awayCovered 
      ? `✅ ${game.awayTeam} covered the spread`
      : homeCovered 
        ? `✅ ${game.homeTeam} covered the spread`
        : `🟰 Push (tie)`;
    
    embed.addFields({
      name: '🎯 Spread Result',
      value: coverText,
      inline: false
    });
  }

  // Collect all picks for this game
  const awayPicks = [];
  const homePicks = [];
  const noPicks = [];

  for (const userId of session.participants) {
    const userPicksArray = session.picks[userId] || [];
    const pick = userPicksArray.find(p => p.gameId === gameId);
    
    if (!pick) {
      noPicks.push(userId);
    } else if (pick.pick === 'away') {
      awayPicks.push({ userId, pick });
    } else {
      homePicks.push({ userId, pick });
    }
  }

  // Display picks for away team
  if (awayPicks.length > 0) {
    const awayPicksText = await Promise.all(
      awayPicks.map(async ({ userId, pick }) => {
        try {
          const user = await interaction.client.users.fetch(userId);
          const ddEmoji = pick.isDoubleDown ? ' 💰' : '';
          
          // Determine if pick won
          let statusEmoji = '❓';
          if (game.result) {
            const awayScore = game.result.awayScore;
            const homeScore = game.result.homeScore;
            const pickWon = (awayScore + awaySpread) > homeScore;
            statusEmoji = pickWon ? '✅' : '❌';
          }
          
          return `${statusEmoji} ${user.username}${ddEmoji}`;
        } catch {
          return `❓ Unknown User`;
        }
      })
    );
    
    embed.addFields({
      name: `🔵  ${game.awayTeam} Picks (${awayPicks.length})`,
      value: awayPicksText.join('\n') || 'None',
      inline: true
    });
  } else {
    embed.addFields({
      name: `🔵  ${game.awayTeam} Picks (0)`,
      value: 'No picks',
      inline: true
    });
  }

  // Display picks for home team
  if (homePicks.length > 0) {
    const homePicksText = await Promise.all(
      homePicks.map(async ({ userId, pick }) => {
        try {
          const user = await interaction.client.users.fetch(userId);
          const ddEmoji = pick.isDoubleDown ? ' 💰' : '';
          
          // Determine if pick won
          let statusEmoji = '❓';
          if (game.result) {
            const homeScore = game.result.homeScore;
            const awayScore = game.result.awayScore;
            const pickWon = (homeScore + homeSpread) > awayScore;
            statusEmoji = pickWon ? '✅' : '❌';
          }
          
          return `${statusEmoji} ${user.username}${ddEmoji}`;
        } catch {
          return `❓ Unknown User`;
        }
      })
    );
    
    embed.addFields({
      name: `🏠 ${game.homeTeam} Picks (${homePicks.length})`,
      value: homePicksText.join('\n') || 'None',
      inline: true
    });
  } else {
    embed.addFields({
      name: `🏠 ${game.homeTeam} Picks (0)`,
      value: 'No picks',
      inline: true
    });
  }

  // Display users who didn't pick this game
  if (noPicks.length > 0) {
    const noPicksText = await Promise.all(
      noPicks.slice(0, 10).map(async (userId) => {
        try {
          const user = await interaction.client.users.fetch(userId);
          return `❌ ${user.username}`;
        } catch {
          return `❌ Unknown User`;
        }
      })
    );
    
    const remaining = noPicks.length > 10 ? ` (+${noPicks.length - 10} more)` : '';
    
    embed.addFields({
      name: `⚠️ No Pick / Missed (${noPicks.length})`,
      value: (noPicksText.join('\n') || 'None') + remaining,
      inline: false
    });
  }

  // Summary stats
  const totalPicks = awayPicks.length + homePicks.length;
  const pickRate = session.participants.length > 0 
    ? ((totalPicks / session.participants.length) * 100).toFixed(1)
    : '0.0';
  
  embed.addFields({
    name: '📊 Pick Distribution',
    value: [
      `**Total Participants:** ${session.participants.length}`,
      `**Picks Made:** ${totalPicks} (${pickRate}%)`,
      `**Missed:** ${noPicks.length}`
    ].join('\n'),
    inline: false
  });

  const backButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`history_session_${sessionId}`)
      .setLabel('Back to Session')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀️')
  );

  await interaction.editReply({
    embeds: [embed],
    components: [backButton]
  });
}

