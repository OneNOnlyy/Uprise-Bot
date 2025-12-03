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
  
  // Extension offer modal
  if (customId.startsWith('mock_extension_offer_')) {
    return await handleExtensionOfferModal(interaction);
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
 * Handle extension offer modal submission
 */
async function handleExtensionOfferModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  const league = await getMockLeague(interaction.guildId);
  if (!league) {
    return interaction.editReply({ content: '❌ No league exists.' });
  }
  
  // Get form values
  const salaryStr = interaction.fields.getTextInputValue('ext_salary') || '0';
  const yearsStr = interaction.fields.getTextInputValue('ext_years') || '1';
  const options = interaction.fields.getTextInputValue('ext_options') || '';
  const playerId = interaction.customId.replace('mock_extension_offer_', '');
  
  // Parse salary (handle M for millions)
  let salary = salaryStr.toLowerCase().replace('m', '000000').replace(/[^0-9]/g, '');
  salary = parseInt(salary);
  const years = parseInt(yearsStr);
  
  if (isNaN(salary) || salary <= 0) {
    return interaction.editReply({ content: '❌ Invalid salary amount.' });
  }
  
  if (isNaN(years) || years < 1 || years > 5) {
    return interaction.editReply({ content: '❌ Contract must be 1-5 years.' });
  }
  
  // Find user's team
  const userTeamEntry = Object.entries(league.teams).find(([_, t]) => t.gm === interaction.user.id);
  if (!userTeamEntry) {
    return interaction.editReply({ content: '❌ You don\'t have a team!' });
  }
  
  const [teamId, team] = userTeamEntry;
  const player = (team.roster || []).find(p => 
    (p.id || p.name.toLowerCase().replace(/\s/g, '_')) === playerId
  );
  
  if (!player) {
    return interaction.editReply({ content: '❌ Player not found on your roster.' });
  }
  
  // Calculate total value
  const totalValue = salary * years;
  
  // Simulate player response based on offer vs market value
  const marketValue = calculatePlayerMarketValue(player);
  const offerPct = salary / marketValue;
  
  let response, success;
  if (offerPct >= 1.0) {
    // At or above market value - high chance of acceptance
    success = Math.random() < 0.85;
    response = success ? 'accepts' : 'wants to test free agency';
  } else if (offerPct >= 0.9) {
    // Slightly below market - moderate chance
    success = Math.random() < 0.5;
    response = success ? 'accepts after negotiation' : 'declines, wants more';
  } else {
    // Below market - low chance
    success = Math.random() < 0.15;
    response = success ? 'surprisingly accepts' : 'declines the lowball offer';
  }
  
  if (success) {
    // Update player contract
    player.salary = salary;
    player.yearsRemaining = years;
    player.contractOptions = options;
    player.extended = true;
    
    // Log the extension
    if (!league.transactions) league.transactions = [];
    league.transactions.push({
      type: 'EXTENSION',
      team: teamId,
      player: player.name,
      salary: salary,
      years: years,
      totalValue: totalValue,
      timestamp: new Date().toISOString()
    });
    
    await saveMockLeague(interaction.guildId, league);
    
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ Extension Signed!')
      .setDescription(`**${player.name}** ${response}!`)
      .addFields(
        { name: 'Annual Salary', value: formatCurrency(salary), inline: true },
        { name: 'Years', value: `${years}`, inline: true },
        { name: 'Total Value', value: formatCurrency(totalValue), inline: true }
      );
    
    if (options) {
      embed.addFields({ name: 'Contract Options', value: options, inline: false });
    }
    
    return interaction.editReply({ embeds: [embed] });
  } else {
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('❌ Extension Declined')
      .setDescription(`**${player.name}** ${response}.`)
      .addFields(
        { name: 'Your Offer', value: `${formatCurrency(salary)}/yr for ${years} years`, inline: true },
        { name: 'Est. Market Value', value: `${formatCurrency(marketValue)}/yr`, inline: true }
      );
    
    return interaction.editReply({ embeds: [embed] });
  }
}

/**
 * Calculate player market value
 */
function calculatePlayerMarketValue(player) {
  const overall = player.overall || 70;
  const age = player.age || 25;
  
  let baseSalary;
  if (overall >= 90) baseSalary = 45000000;
  else if (overall >= 85) baseSalary = 35000000;
  else if (overall >= 80) baseSalary = 25000000;
  else if (overall >= 75) baseSalary = 15000000;
  else if (overall >= 70) baseSalary = 8000000;
  else baseSalary = 3000000;
  
  if (age <= 25) baseSalary *= 1.1;
  else if (age >= 32) baseSalary *= 0.75;
  else if (age >= 30) baseSalary *= 0.9;
  
  return Math.round(baseSalary);
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
