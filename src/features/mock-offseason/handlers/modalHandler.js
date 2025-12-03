/**
 * Mock Offseason - Modal Handler
 * Handles all modal submit interactions
 */

import { EmbedBuilder } from 'discord.js';
import { getMockLeague, saveMockLeague, formatCurrency } from '../mockData.js';

/**
 * Main modal submit router
 */
export async function handleModalSubmit(interaction) {
  const customId = interaction.customId;
  
  // Trade offer modal
  if (customId.startsWith('mock_trade_offer_modal')) {
    return await handleTradeOfferModal(interaction);
  }
  
  // Free agent offer modal
  if (customId.startsWith('mock_fa_offer_modal')) {
    return await handleFAOfferModal(interaction);
  }
  
  // Admin announce modal
  if (customId === 'mock_admin_announce_modal') {
    return await handleAnnounceModal(interaction);
  }
  
  // Config modal
  if (customId.startsWith('mock_admin_config_modal')) {
    return await handleConfigModal(interaction);
  }
  
  // Unknown modal
  console.warn(`Unknown mock modal: ${customId}`);
  return interaction.reply({ content: '❌ Unknown form submission.', ephemeral: true });
}

/**
 * Handle trade offer modal submission
 */
async function handleTradeOfferModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  // Extract trade details from modal
  const tradeMessage = interaction.fields.getTextInputValue('trade_message') || '';
  
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('📤 Trade Proposal')
    .setDescription('🚧 **Trade submission coming soon!**\n\nYour message:\n' + tradeMessage)
    .setTimestamp();
  
  return interaction.editReply({ embeds: [embed] });
}

/**
 * Handle free agent offer modal submission
 */
async function handleFAOfferModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  const league = await getMockLeague(interaction.guildId);
  if (!league) {
    return interaction.editReply({ content: '❌ No league exists.' });
  }
  
  // Get form values
  const salaryStr = interaction.fields.getTextInputValue('fa_salary') || '0';
  const yearsStr = interaction.fields.getTextInputValue('fa_years') || '1';
  const playerId = interaction.customId.replace('mock_fa_offer_modal_', '');
  
  // Parse values
  const salary = parseInt(salaryStr.replace(/[^0-9]/g, ''));
  const years = parseInt(yearsStr);
  
  if (isNaN(salary) || salary <= 0) {
    return interaction.editReply({ content: '❌ Invalid salary amount.' });
  }
  
  if (isNaN(years) || years < 1 || years > 5) {
    return interaction.editReply({ content: '❌ Contract must be 1-5 years.' });
  }
  
  // Find the player
  const player = (league.freeAgents || []).find(p => 
    (p.id || p.name.toLowerCase().replace(/\s/g, '_')) === playerId
  );
  
  if (!player) {
    return interaction.editReply({ content: '❌ Player not found.' });
  }
  
  // Find user's team
  const userTeamEntry = Object.entries(league.teams).find(([_, t]) => t.gm === interaction.user.id);
  if (!userTeamEntry) {
    return interaction.editReply({ content: '❌ You don\'t have a team!' });
  }
  
  const [teamId, team] = userTeamEntry;
  
  // Create the offer
  const offer = {
    id: `offer_${Date.now()}`,
    from: teamId,
    fromName: team.name,
    playerId,
    playerName: player.name,
    salary,
    years,
    totalValue: salary * years,
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
  };
  
  // Add to pending offers
  if (!league.pendingOffers) league.pendingOffers = [];
  league.pendingOffers.push(offer);
  
  await saveMockLeague(interaction.guildId, league);
  
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('📝 Offer Submitted!')
    .setDescription(`Your offer to **${player.name}** has been submitted.`)
    .addFields(
      { name: 'Salary', value: formatCurrency(salary), inline: true },
      { name: 'Years', value: `${years}`, inline: true },
      { name: 'Total Value', value: formatCurrency(salary * years), inline: true }
    )
    .setFooter({ text: 'The player will decide within 24 hours.' })
    .setTimestamp();
  
  return interaction.editReply({ embeds: [embed] });
}

/**
 * Handle admin announcement modal
 */
async function handleAnnounceModal(interaction) {
  if (!interaction.member.permissions.has('Administrator')) {
    return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
  }
  
  await interaction.deferReply({ ephemeral: true });
  
  const title = interaction.fields.getTextInputValue('announce_title') || 'Announcement';
  const message = interaction.fields.getTextInputValue('announce_message') || '';
  
  if (!message) {
    return interaction.editReply({ content: '❌ Message cannot be empty.' });
  }
  
  // Send announcement to channel
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle(`📢 ${title}`)
    .setDescription(message)
    .setFooter({ text: `Announced by ${interaction.user.username}` })
    .setTimestamp();
  
  await interaction.channel.send({ embeds: [embed] });
  
  return interaction.editReply({ content: '✅ Announcement sent!' });
}

/**
 * Handle config modal submission
 */
async function handleConfigModal(interaction) {
  if (!interaction.member.permissions.has('Administrator')) {
    return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
  }
  
  await interaction.deferReply({ ephemeral: true });
  
  const league = await getMockLeague(interaction.guildId);
  if (!league) {
    return interaction.editReply({ content: '❌ No league exists.' });
  }
  
  // Get config type from custom ID
  const configType = interaction.customId.replace('mock_admin_config_modal_', '');
  
  // Handle different config types
  switch (configType) {
    case 'timing':
      // Get timing values
      const faHours = parseInt(interaction.fields.getTextInputValue('fa_hours') || '48');
      const draftSeconds = parseInt(interaction.fields.getTextInputValue('draft_seconds') || '120');
      
      league.settings = league.settings || {};
      league.settings.freeAgencyDurationHours = faHours;
      league.settings.draftPickTimeSeconds = draftSeconds;
      
      await saveMockLeague(interaction.guildId, league);
      
      return interaction.editReply({ 
        content: `✅ Timing settings updated!\n• FA Duration: ${faHours} hours\n• Draft Pick Time: ${draftSeconds} seconds` 
      });
      
    default:
      return interaction.editReply({ content: '❌ Unknown config type.' });
  }
}
