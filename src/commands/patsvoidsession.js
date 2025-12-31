import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { voidActivePersonalSessionByOwnerId, getActiveGlobalSession } from '../utils/patsData.js';

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.editReply({ content: '❌ Admin only.' });
      return;
    }

    const globalSession = getActiveGlobalSession();
    if (globalSession) {
      await interaction.editReply({
        content: '❌ A global session is currently active. This command only voids personal sessions.'
      });
      return;
    }

    const player = interaction.options.getUser('player');
    const reason = interaction.options.getString('reason') || null;

    const result = voidActivePersonalSessionByOwnerId(player.id, {
      voidedBy: interaction.user.id,
      reason
    });

    if (!result || result.error) {
      await interaction.editReply({
        content: `❌ ${result?.error || 'Failed to void personal session.'}`
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🧹 Personal Session Voided')
      .setColor(0xED4245)
      .setDescription(`Voided <@${player.id}>\'s active personal session.`)
      .addFields(
        { name: '📅 Date', value: result.date || 'Unknown', inline: true },
        { name: '🆔 Session ID', value: result.sessionId || 'Unknown', inline: true },
        { name: '↩️ Stat Reverts', value: String(result.revertedStatWrites || 0), inline: true }
      )
      .setTimestamp();

    if (reason) {
      embed.addFields({ name: '📝 Reason', value: reason, inline: false });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[PATS] Error voiding personal session:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: '❌ Failed to void personal session.' });
    } else {
      await interaction.reply({ content: '❌ Failed to void personal session.', ephemeral: true });
    }
  }
}
