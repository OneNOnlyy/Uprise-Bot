import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { addPlayer } from '../utils/patsData.js';

export const data = new SlashCommandBuilder()
  .setName('patsaddplayer')
  .setDescription('Add a player to the PATS system (Admin only)')
  .addUserOption(option =>
    option.setName('player')
      .setDescription('The player to add')
      .setRequired(true))
  .addIntegerOption(option =>
    option.setName('wins')
      .setDescription('Initial wins (default: 0)')
      .setRequired(false)
      .setMinValue(0))
  .addIntegerOption(option =>
    option.setName('losses')
      .setDescription('Initial losses (default: 0)')
      .setRequired(false)
      .setMinValue(0))
  .addIntegerOption(option =>
    option.setName('pushes')
      .setDescription('Initial pushes (default: 0)')
      .setRequired(false)
      .setMinValue(0))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const player = interaction.options.getUser('player');
    const wins = interaction.options.getInteger('wins') || 0;
    const losses = interaction.options.getInteger('losses') || 0;
    const pushes = interaction.options.getInteger('pushes') || 0;

    // Add player to system
    const playerData = addPlayer(player.id, player.username, {
      totalWins: wins,
      totalLosses: losses,
      totalPushes: pushes
    });

    // Create confirmation embed
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('✅ Player Added to PATS')
      .setDescription(`Successfully added **${player.username}** to the system`)
      .addFields(
        { name: '👤 Player', value: `<@${player.id}>`, inline: true },
        { name: '📊 Record', value: `${wins}-${losses}-${pushes}`, inline: true },
        { name: '🎯 Win %', value: `${wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : 0}%`, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    console.log(`[PATS Admin] ${interaction.user.username} added player: ${player.username} (${player.id})`);
  } catch (error) {
    console.error('[PATS Admin] Error adding player:', error);
    
    let errorMessage = '❌ Failed to add player to PATS system.';
    if (error.message.includes('already exists')) {
      errorMessage = '❌ This player is already in the PATS system. Use `/patseditplayer` to modify their record.';
    }
    
    await interaction.editReply({ content: errorMessage });
  }
}
