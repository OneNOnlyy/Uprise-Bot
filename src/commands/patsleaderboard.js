import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { getLeaderboard, getMonthlyLeaderboard, getAvailableMonthlyLeaderboardMonths, getUserStats, getUserMonthlyStats, getActiveGlobalSession, getUserPicks, getLiveSessionLeaderboard, getCurrentSessionStats, getCurrentPacificMonthKey } from '../utils/patsData.js';

function normalizeFilterType(filterType) {
  // Legacy boolean and legacy names
  if (typeof filterType === 'boolean') return filterType ? 'monthly' : 'alltime';
  if (filterType === 'global') return 'alltime';
  if (filterType === 'role') return 'monthly';
  if (filterType === 'season') return 'alltime';
  if (filterType === 'alltime' || filterType === 'monthly') return filterType;
  return 'monthly';
}

function formatMonthKey(monthKey) {
  // YYYY-MM -> "Dec. 2025"
  if (!monthKey || typeof monthKey !== 'string') return 'N/A';
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthKey;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
  const monthText = MONTHS[month - 1] || match[2];
  return `${monthText} ${year}`;
}

export const data = new SlashCommandBuilder()
  .setName('patsleaderboard')
  .setDescription('View the Picks Against The Spread leaderboard');

/**
 * Build leaderboard embed with optional filters
 * @param {Interaction} interaction 
 * @param {string} filterType - 'monthly' or 'alltime' (legacy: 'role'/'global')
 * @param {boolean} fromStatsMenu - If true, show navigation buttons for stats menu
 * @param {string|null} monthKeyOverride - For monthly view, show a specific YYYY-MM
 */
export async function buildLeaderboardEmbed(interaction, filterType = 'monthly', fromStatsMenu = false, monthKeyOverride = null) {
  filterType = normalizeFilterType(filterType);
  
  const monthKey = filterType === 'monthly' ? (monthKeyOverride || getCurrentPacificMonthKey()) : getCurrentPacificMonthKey();
  const monthLabel = formatMonthKey(monthKey);
  const monthlyLeaderboard = getMonthlyLeaderboard(monthKey);
  const allTimeLeaderboard = getLeaderboard();
  const session = getActiveGlobalSession();
  const liveLeaderboard = session ? getLiveSessionLeaderboard(session) : null;
  const embed = new EmbedBuilder()
    .setTitle(filterType === 'monthly' ? '📅 Monthly PATS Leaderboard' : '🏅 All-Time PATS Leaderboard')
    .setDescription(
      filterType === 'monthly'
        ? `Top performers for **${monthLabel}**`
        : 'Top performers of all time'
    )
    .setColor(0x5865F2)
    .setTimestamp();

  // Show live session leaderboard if a global session is active (helpful context on both pages)
  if (liveLeaderboard && liveLeaderboard.standings.length > 0) {
    const top10 = liveLeaderboard.standings.slice(0, 10);
    const sessionLeaderboardText = (await Promise.all(top10.map(async (entry, index) => {
      try {
        const member = await interaction.guild.members.fetch(entry.userId);
        const displayName = member.displayName;
        const record = `${entry.wins}-${entry.losses}-${entry.pushes}`;
        const winPct = entry.totalComplete > 0 ? ` (${entry.winPercentage.toFixed(1)}%)` : '';
        const pendingText = entry.pending > 0 ? ` • ${entry.pending} pending` : '';
        return `${index + 1}. ${displayName} - ${record}${winPct}${pendingText}`;
      } catch {
        return null;
      }
    }))).filter(Boolean);

    if (sessionLeaderboardText.length > 0) {
      embed.addFields({
        name: '📅 Today\'s Session Leaders',
        value: sessionLeaderboardText.join('\n') || 'No picks yet',
        inline: false
      });
    }
  }

  if (filterType === 'monthly') {
    if (monthlyLeaderboard.length > 0) {
      const top10 = monthlyLeaderboard.slice(0, 10);
      const monthText = (await Promise.all(top10.map(async (entry, index) => {
        try {
          const member = await interaction.guild.members.fetch(entry.userId);
          const displayName = member.displayName;
          return `${index + 1}. ${displayName} - ${entry.totalWins}-${entry.totalLosses}-${entry.totalPushes} (${entry.winPercentage.toFixed(1)}%)`;
        } catch {
          return null;
        }
      }))).filter(Boolean);

      embed.addFields({
        name: `📅 Monthly Leaders (${monthLabel})`,
        value: monthText.join('\n') || 'No data yet',
        inline: false
      });
    } else {
      embed.addFields({
        name: `📅 Monthly Leaders (${monthLabel})`,
        value: 'No stats this month yet! Be the first to participate in PATS.',
        inline: false
      });
    }

    const userMonthStats = getUserMonthlyStats(interaction.user.id, monthKey);
    const monthRank = monthlyLeaderboard.findIndex(entry => entry.userId === interaction.user.id) + 1;
    const monthRankDisplay = monthRank > 0 ? `#${monthRank}` : 'Unranked';

    embed.addFields({
      name: `📈 Your Monthly Stats (${monthLabel})`,
      value: `**Rank:** ${monthRankDisplay}\n` +
             `**Record:** ${userMonthStats.totalWins}-${userMonthStats.totalLosses}-${userMonthStats.totalPushes}\n` +
             `**Win %:** ${userMonthStats.winPercentage.toFixed(1)}%\n` +
             `**Sessions:** ${userMonthStats.sessions}`,
      inline: true
    });
  } else {
    if (allTimeLeaderboard.length > 0) {
      const top10 = allTimeLeaderboard.slice(0, 10);
      const allTimeText = (await Promise.all(top10.map(async (entry, index) => {
        try {
          const member = await interaction.guild.members.fetch(entry.userId);
          const displayName = member.displayName;
          return `${index + 1}. ${displayName} - ${entry.totalWins}-${entry.totalLosses}-${entry.totalPushes} (${entry.winPercentage.toFixed(1)}%)`;
        } catch {
          return null;
        }
      }))).filter(Boolean);

      embed.addFields({
        name: '🏅 All-Time Leaders',
        value: allTimeText.join('\n') || 'No data yet',
        inline: false
      });
    } else {
      embed.addFields({
        name: '🏅 All-Time Leaders',
        value: 'No stats yet! Be the first to participate in PATS.',
        inline: false
      });
    }

    const userAllTimeStats = getUserStats(interaction.user.id);
    const allTimeRank = allTimeLeaderboard.findIndex(entry => entry.userId === interaction.user.id) + 1;
    const allTimeRankDisplay = allTimeRank > 0 ? `#${allTimeRank}` : 'Unranked';

    const ddStats = (userAllTimeStats.doubleDownsUsed || 0) > 0
      ? `\n**Double Downs:** ${userAllTimeStats.doubleDownWins || 0}-${userAllTimeStats.doubleDownLosses || 0}-${userAllTimeStats.doubleDownPushes || 0} 💰`
      : '';

    embed.addFields({
      name: '📈 Your All-Time Stats',
      value: `**Rank:** ${allTimeRankDisplay}\n` +
             `**Record:** ${userAllTimeStats.totalWins}-${userAllTimeStats.totalLosses}-${userAllTimeStats.totalPushes}\n` +
             `**Win %:** ${userAllTimeStats.winPercentage.toFixed(1)}%\n` +
             `**Sessions:** ${userAllTimeStats.sessions}${ddStats}`,
      inline: true
    });
  }

  embed.setFooter({ text: 'Keep making picks to climb the leaderboard!' });

  // Build components based on context
  const components = [];
  
  // Use different button IDs based on context to preserve navigation state
  const monthlyButtonId = fromStatsMenu ? 'pats_leaderboard_monthly_stats' : 'pats_leaderboard_monthly_cmd';
  const allTimeButtonId = fromStatsMenu ? 'pats_leaderboard_alltime_stats' : 'pats_leaderboard_alltime_cmd';
  
  // Monthly history selector (only on Monthly page)
  if (filterType === 'monthly') {
    const selectId = fromStatsMenu ? 'pats_leaderboard_select_month_stats' : 'pats_leaderboard_select_month_cmd';
    const months = getAvailableMonthlyLeaderboardMonths(24);
    if (monthKey && !months.includes(monthKey)) {
      months.unshift(monthKey);
    }

    const options = months.slice(0, 25).map(mk => ({
      label: formatMonthKey(mk),
      value: mk,
      default: mk === monthKey
    }));

    if (options.length > 0) {
      const monthSelectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(selectId)
          .setPlaceholder('Select Month')
          .addOptions(options)
      );
      components.push(monthSelectRow);
    }
  }

  // Toggle buttons row - 2 options
  const toggleRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(monthlyButtonId)
      .setLabel('📅 Monthly')
      .setStyle(filterType === 'monthly' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(filterType === 'monthly'),
    new ButtonBuilder()
      .setCustomId(allTimeButtonId)
      .setLabel('🏅 All-Time')
      .setStyle(filterType === 'alltime' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(filterType === 'alltime')
  );
  components.push(toggleRow);
  
  // Navigation row (only if from stats menu)
  if (fromStatsMenu) {
    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('pats_leaderboard_back_to_stats')
        .setLabel('Back to Stats')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📊')
    );
    components.push(navRow);
  }

  return { embed, components };
}

/**
 * Show leaderboard with toggle buttons (called from stats menu)
 */
export async function showLeaderboardFromStats(interaction, filterType = 'global', monthKey = null) {
  const { embed, components } = await buildLeaderboardEmbed(interaction, filterType, true, monthKey);
  
  await interaction.editReply({
    embeds: [embed],
    components: components
  });
}

/**
 * Show leaderboard standalone (called from /pats leaderboard command or its toggle buttons)
 */
export async function showLeaderboardStandalone(interaction, filterType = 'global', monthKey = null) {
  const { embed, components } = await buildLeaderboardEmbed(interaction, filterType, false, monthKey);
  
  await interaction.editReply({
    embeds: [embed],
    components: components
  });
}

export async function execute(interaction) {
  try {
    // Only defer if not already deferred or replied
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    const { embed, components } = await buildLeaderboardEmbed(interaction, 'monthly', false, null);

    await interaction.editReply({ 
      embeds: [embed],
      components: components
    });

  } catch (error) {
    console.error('Error executing patsleaderboard command:', error);
    await interaction.editReply({
      content: '❌ An error occurred while loading the leaderboard.',
    });
  }
}

