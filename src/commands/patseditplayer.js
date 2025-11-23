import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { updatePlayerRecord, getPlayerStats } from '../utils/patsData.js';

export const data = new SlashCommandBuilder()
  .setName('patseditplayer')
  .setDescription('Edit a player\'s record in the PATS system (Admin only)')
  .addUserOption(option =>
    option.setName('player')
      .setDescription('The player to edit')
      .setRequired(true))
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
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const player = interaction.options.getUser('player');
    
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

    if (wins !== null) updates.totalWins = wins;
    if (losses !== null) updates.totalLosses = losses;
    if (pushes !== null) updates.totalPushes = pushes;
    if (sessions !== null) updates.sessions = sessions;
    if (ddWins !== null) updates.doubleDownWins = ddWins;
    if (ddLosses !== null) updates.doubleDownLosses = ddLosses;

    if (Object.keys(updates).length === 0) {
      await interaction.editReply({
        content: '❌ No changes specified. Please provide at least one stat to update.'
      });
      return;
    }

    // Update player record
    const updatedStats = updatePlayerRecord(player.id, updates);

    // Create comparison embed
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle('✅ Player Record Updated')
      .setDescription(`Successfully updated **${player.username}**'s record`)
      .addFields(
        { name: '👤 Player', value: `<@${player.id}>`, inline: false },
        { 
          name: '📊 Record', 
          value: `**${updatedStats.totalWins}-${updatedStats.totalLosses}-${updatedStats.totalPushes}**`, 
          inline: true 
        },
        { 
          name: '🎯 Win %', 
          value: `${updatedStats.totalWins + updatedStats.totalLosses > 0 ? 
            ((updatedStats.totalWins / (updatedStats.totalWins + updatedStats.totalLosses)) * 100).toFixed(1) : 0}%`, 
          inline: true 
        },
        { name: '🎲 Sessions', value: updatedStats.sessions.toString(), inline: true }
      );

    // Add double down stats if they exist
    if (updatedStats.doubleDownWins > 0 || updatedStats.doubleDownLosses > 0) {
      embed.addFields({
        name: '⚡ Double Down',
        value: `${updatedStats.doubleDownWins}W - ${updatedStats.doubleDownLosses}L - ${updatedStats.doubleDownPushes || 0}P`,
        inline: false
      });
    }

    // Show what changed
    const changes = [];
    if (wins !== null) changes.push(`Wins: ${currentStats.totalWins} → ${wins}`);
    if (losses !== null) changes.push(`Losses: ${currentStats.totalLosses} → ${losses}`);
    if (pushes !== null) changes.push(`Pushes: ${currentStats.totalPushes} → ${pushes}`);
    if (sessions !== null) changes.push(`Sessions: ${currentStats.sessions} → ${sessions}`);
    if (ddWins !== null) changes.push(`DD Wins: ${currentStats.doubleDownWins} → ${ddWins}`);
    if (ddLosses !== null) changes.push(`DD Losses: ${currentStats.doubleDownLosses} → ${ddLosses}`);

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
