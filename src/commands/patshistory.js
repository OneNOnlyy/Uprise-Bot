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
 * Show overview of all sessions
 */
async function showHistoryOverview(interaction) {
  const data = readPATSData();
  const allSessions = [...data.history].sort((a, b) => 
    new Date(b.closedAt) - new Date(a.closedAt)
  );

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
    const date = new Date(session.closedAt).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
    const participantCount = session.participants.length;
    const gameCount = session.games.length;
    
    // Calculate total picks made
    let totalPicks = 0;
    for (const userId in session.picks) {
      totalPicks += session.picks[userId].length;
    }
    
    return `**${index + 1}. ${date}** - ${participantCount} players • ${gameCount} games • ${totalPicks} picks`;
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
    const date = new Date(session.closedAt).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric'
    });
    return {
      label: `${date} - ${session.participants.length} players`,
      description: `${session.games.length} games • Session ID: ${session.id.slice(0, 8)}`,
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
  const session = data.history.find(s => s.id === sessionId);

  if (!session) {
    await interaction.editReply({
      content: '❌ Session not found.',
      embeds: [],
      components: []
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`📋 Session Details - ${session.date}`)
    .setDescription(`Session ID: \`${session.id}\``)
    .setColor(0x5865F2)
    .setTimestamp(new Date(session.closedAt));

  // Session info
  embed.addFields({
    name: '📅 Session Info',
    value: [
      `**Date:** ${session.date}`,
      `**Closed:** ${new Date(session.closedAt).toLocaleString('en-US')}`,
      `**Games:** ${session.games.length}`,
      `**Participants:** ${session.participants.length}`
    ].join('\n'),
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
      
      const totalComplete = result.wins + result.losses;
      const winPct = totalComplete > 0 ? ((result.wins / totalComplete) * 100).toFixed(1) : '0.0';
      
      return {
        userId,
        wins: result.wins,
        losses: result.losses,
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
        const record = `${entry.wins}-${entry.losses}`;
        const missedText = entry.missedPicks > 0 ? ` • ${entry.missedPicks} missed` : '';
        return `${medal} **${user.username}** - ${record} (${entry.winPct}%)${missedText}`;
      } catch {
        return `${index + 1}. Unknown User - ${entry.wins}-${entry.losses}`;
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
      label: `#${index + 1} - ${pickCount} picks • ${entry.wins}-${entry.losses}`,
      description: `View detailed picks for this user`,
      value: `${session.id}|${entry.userId}`
    };
  });

  const components = [];
  
  if (userOptions.length > 0) {
    const selectMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('history_user_select')
        .setPlaceholder('Select a user to view their picks')
        .addOptions(userOptions)
    );
    components.push(selectMenu);
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
  const session = data.history.find(s => s.id === sessionId);

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
    .setDescription(`**Session:** ${session.date}\n**Record:** ${result?.wins || 0}-${result?.losses || 0}`)
    .setColor(0x5865F2)
    .setTimestamp(new Date(session.closedAt));

  // Overall result
  const totalComplete = (result?.wins || 0) + (result?.losses || 0);
  const winPct = totalComplete > 0 ? (((result?.wins || 0) / totalComplete) * 100).toFixed(1) : '0.0';
  
  embed.addFields({
    name: '📊 Session Result',
    value: [
      `**Record:** ${result?.wins || 0}-${result?.losses || 0}`,
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
      const spreadText = pick.spread > 0 ? `+${pick.spread}` : pick.spread.toString();
      const ddEmoji = pick.isDoubleDown ? ' 💰' : '';
      
      if (!game.result) {
        return `${index + 1}. ❓ **${pickedTeam}** (${spreadText})${ddEmoji} - No result`;
      }

      const homeScore = game.result.homeScore;
      const awayScore = game.result.awayScore;
      const awaySpread = game.awaySpread !== undefined ? game.awaySpread : 0;
      const homeSpread = game.homeSpread !== undefined ? game.homeSpread : 0;
      
      let pickWon = false;
      if (pick.pick === 'home') {
        pickWon = (homeScore + homeSpread) > awayScore;
      } else {
        pickWon = (awayScore + awaySpread) > homeScore;
      }

      const statusEmoji = pickWon ? '✅' : '❌';
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
