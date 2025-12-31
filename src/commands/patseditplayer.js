import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { updatePlayerRecord, updatePlayerMonthlyRecord, getPlayerStats, getUserMonthlyStats } from '../utils/patsData.js';

export const data = new SlashCommandBuilder()
  .setName('patseditplayer')
  .setDescription('Edit a player\'s record in the PATS system (Admin only)')
  .addUserOption(option =>
    option.setName('player')
      .setDescription('The player to edit')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('scope')
      .setDescription('Which stats to edit')
      .setRequired(false)
      .addChoices(
        { name: 'All-Time (Total)', value: 'total' },
        { name: 'Monthly (YYYY-MM)', value: 'monthly' },
        { name: 'Both (same values)', value: 'both' }
      ))
  .addStringOption(option =>
    option.setName('month')
      .setDescription('Month key for monthly edits (YYYY-MM)')
      .setRequired(false))
  .addIntegerOption(option =>
    option.setName('wins')
      .setDescription('Set total wins')
      .setRequired(false)
      .setMinValue(0))
  .addIntegerOption(option =>
    option.setName('losses')
      .setDescription('Set total losses')
      .setRequired(false)
      .setMinValue(0))
  .addIntegerOption(option =>
    option.setName('pushes')
      .setDescription('Set total pushes')
      .setRequired(false)
      .setMinValue(0))
  .addIntegerOption(option =>
    option.setName('sessions')
      .setDescription('Set total sessions played')
      .setRequired(false)
      .setMinValue(0))
  .addIntegerOption(option =>
    option.setName('doubledown_wins')
      .setDescription('Set double down wins')
      .setRequired(false)
      .setMinValue(0))
  .addIntegerOption(option =>
    option.setName('doubledown_losses')
      .setDescription('Set double down losses')
      .setRequired(false)
      .setMinValue(0))
  .addIntegerOption(option =>
    option.setName('doubledown_pushes')
      .setDescription('Set double down pushes')
      .setRequired(false)
      .setMinValue(0))
  .addIntegerOption(option =>
    option.setName('doubledowns_used')
      .setDescription('Set double downs used')
      .setRequired(false)
      .setMinValue(0))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const player = interaction.options.getUser('player');

    const scope = interaction.options.getString('scope') || 'total';
    const monthKeyRaw = interaction.options.getString('month');
    const monthKey = typeof monthKeyRaw === 'string' ? monthKeyRaw.trim() : null;

    if ((scope === 'monthly' || scope === 'both') && (!monthKey || !monthKey.match(/^\d{4}-\d{2}$/))) {
      await interaction.editReply({
        content: '❌ For monthly edits, you must provide a valid `month` in `YYYY-MM` format (example: `2025-12`).'
      });
      return;
    }
    
    // Check if player exists
    const currentStats = getPlayerStats(player.id);
    if (!currentStats) {
      await interaction.editReply({
        content: `❌ Player <@${player.id}> is not in the PATS system. Use \`/patsaddplayer\` to add them first.`
      });
      return;
    }

    // Build updates object from provided options
    const updates = {};
    const wins = interaction.options.getInteger('wins');
    const losses = interaction.options.getInteger('losses');
    const pushes = interaction.options.getInteger('pushes');
    const sessions = interaction.options.getInteger('sessions');
    const ddWins = interaction.options.getInteger('doubledown_wins');
    const ddLosses = interaction.options.getInteger('doubledown_losses');
    const ddPushes = interaction.options.getInteger('doubledown_pushes');
    const ddUsed = interaction.options.getInteger('doubledowns_used');

    if (wins !== null) updates.totalWins = wins;
    if (losses !== null) updates.totalLosses = losses;
    if (pushes !== null) updates.totalPushes = pushes;
    if (sessions !== null) updates.sessions = sessions;
    if (ddWins !== null) updates.doubleDownWins = ddWins;
    if (ddLosses !== null) updates.doubleDownLosses = ddLosses;
    if (ddPushes !== null) updates.doubleDownPushes = ddPushes;
    if (ddUsed !== null) updates.doubleDownsUsed = ddUsed;

    if (Object.keys(updates).length === 0) {
      await interaction.editReply({
        content: '❌ No changes specified. Please provide at least one stat to update.'
      });
      return;
    }

    const totalBefore = getPlayerStats(player.id);
    const monthlyBefore = (scope === 'monthly' || scope === 'both') ? getUserMonthlyStats(player.id, monthKey) : null;

    let updatedTotal = null;
    let updatedMonthly = null;

    if (scope === 'total' || scope === 'both') {
      updatedTotal = updatePlayerRecord(player.id, updates);
    }
    if (scope === 'monthly' || scope === 'both') {
      updatedMonthly = updatePlayerMonthlyRecord(player.id, monthKey, updates);
    }

    const updatedStats = updatedTotal || totalBefore;

    // Create comparison embed
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle('✅ Player Record Updated')
      .setDescription(`Successfully updated **${player.username}**'s record`)
      .addFields(
        { name: '👤 Player', value: `<@${player.id}>`, inline: false },
        { name: '🧭 Scope', value: scope === 'total' ? 'All-Time (Total)' : scope === 'monthly' ? `Monthly (${monthKey})` : `Both (Total + Monthly ${monthKey})`, inline: false },
        { 
          name: '📊 Record', 
          value: `**${(updatedTotal || totalBefore).totalWins}-${(updatedTotal || totalBefore).totalLosses}-${(updatedTotal || totalBefore).totalPushes}**`, 
          inline: true 
        },
        { 
          name: '🎯 Win %', 
          value: `${(updatedTotal || totalBefore).totalWins + (updatedTotal || totalBefore).totalLosses > 0 ? 
            (((updatedTotal || totalBefore).totalWins / ((updatedTotal || totalBefore).totalWins + (updatedTotal || totalBefore).totalLosses)) * 100).toFixed(1) : 0}%`, 
          inline: true 
        },
        { name: '🎲 Sessions', value: String((updatedTotal || totalBefore).sessions), inline: true }
      );

    // Add double down stats if they exist
    const ddBlock = updatedTotal || totalBefore;
    if ((ddBlock.doubleDownWins || 0) > 0 || (ddBlock.doubleDownLosses || 0) > 0 || (ddBlock.doubleDownPushes || 0) > 0) {
      embed.addFields({
        name: '⚡ Double Down',
        value: `${ddBlock.doubleDownWins || 0}W - ${ddBlock.doubleDownLosses || 0}L - ${ddBlock.doubleDownPushes || 0}P • Used: ${ddBlock.doubleDownsUsed || 0}`,
        inline: false
      });
    }

    if (updatedMonthly) {
      const mTotal = (updatedMonthly.totalWins || 0) + (updatedMonthly.totalLosses || 0);
      const mWinPct = mTotal > 0 ? ((updatedMonthly.totalWins || 0) / mTotal * 100).toFixed(1) : '0.0';
      embed.addFields({
        name: `🗓️ Monthly (${monthKey})`,
        value: `Record: **${updatedMonthly.totalWins || 0}-${updatedMonthly.totalLosses || 0}-${updatedMonthly.totalPushes || 0}** (${mWinPct}%)\nSessions: **${updatedMonthly.sessions || 0}**\nDD: **${updatedMonthly.doubleDownWins || 0}W-${updatedMonthly.doubleDownLosses || 0}L-${updatedMonthly.doubleDownPushes || 0}P** • Used: **${updatedMonthly.doubleDownsUsed || 0}**`,
        inline: false
      });
    }

    // Show what changed
    const changes = [];
    if (scope === 'total' || scope === 'both') {
      if (wins !== null) changes.push(`(Total) Wins: ${currentStats.totalWins} → ${wins}`);
      if (losses !== null) changes.push(`(Total) Losses: ${currentStats.totalLosses} → ${losses}`);
      if (pushes !== null) changes.push(`(Total) Pushes: ${currentStats.totalPushes} → ${pushes}`);
      if (sessions !== null) changes.push(`(Total) Sessions: ${currentStats.sessions} → ${sessions}`);
      if (ddWins !== null) changes.push(`(Total) DD Wins: ${currentStats.doubleDownWins} → ${ddWins}`);
      if (ddLosses !== null) changes.push(`(Total) DD Losses: ${currentStats.doubleDownLosses} → ${ddLosses}`);
      if (ddPushes !== null) changes.push(`(Total) DD Pushes: ${(currentStats.doubleDownPushes || 0)} → ${ddPushes}`);
      if (ddUsed !== null) changes.push(`(Total) DD Used: ${(currentStats.doubleDownsUsed || 0)} → ${ddUsed}`);
    }

    if (scope === 'monthly' || scope === 'both') {
      const before = monthlyBefore;
      if (before) {
        if (wins !== null) changes.push(`(Monthly ${monthKey}) Wins: ${before.totalWins} → ${wins}`);
        if (losses !== null) changes.push(`(Monthly ${monthKey}) Losses: ${before.totalLosses} → ${losses}`);
        if (pushes !== null) changes.push(`(Monthly ${monthKey}) Pushes: ${before.totalPushes} → ${pushes}`);
        if (sessions !== null) changes.push(`(Monthly ${monthKey}) Sessions: ${before.sessions} → ${sessions}`);
        if (ddWins !== null) changes.push(`(Monthly ${monthKey}) DD Wins: ${before.doubleDownWins} → ${ddWins}`);
        if (ddLosses !== null) changes.push(`(Monthly ${monthKey}) DD Losses: ${before.doubleDownLosses} → ${ddLosses}`);
        if (ddPushes !== null) changes.push(`(Monthly ${monthKey}) DD Pushes: ${before.doubleDownPushes} → ${ddPushes}`);
        if (ddUsed !== null) changes.push(`(Monthly ${monthKey}) DD Used: ${before.doubleDownsUsed} → ${ddUsed}`);
      }
    }

    if (changes.length > 0) {
      embed.addFields({
        name: '📝 Changes Made',
        value: changes.join('\n'),
        inline: false
      });
    }

    embed.setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    console.log(`[PATS Admin] ${interaction.user.username} updated player: ${player.username} (${player.id})`);
  } catch (error) {
    console.error('[PATS Admin] Error editing player:', error);
    await interaction.editReply({ 
      content: '❌ Failed to update player record. Please try again.' 
    });
  }
}
