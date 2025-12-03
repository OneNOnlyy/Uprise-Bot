/**
 * Mock Offseason - Lottery Handler
 * Handles GM lottery registration and drawing
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getMockLeague, saveMockLeague, registerForLottery, NBA_TEAMS, PHASES } from '../mockData.js';

/**
 * Build lottery panel embed
 */
export async function buildLotteryPanel(interaction, league) {
  const lotterySettings = league.lotterySettings || {};
  const registeredUsers = lotterySettings.registeredUsers || [];
  const isOpen = lotterySettings.registrationOpen;
  const userRegistered = registeredUsers.includes(interaction.user.id);
  
  // Has lottery been completed?
  const lotteryComplete = lotterySettings.lotteryOrder && lotterySettings.lotteryOrder.length > 0;
  
  let statusText = '';
  let statusColor = 0x1D428A;
  
  if (lotteryComplete) {
    statusText = '✅ **LOTTERY COMPLETE** - Teams have been assigned!';
    statusColor = 0x00FF00;
  } else if (isOpen) {
    statusText = '🟢 **REGISTRATION OPEN** - Sign up to become a GM!';
    statusColor = 0x00FF00;
  } else {
    statusText = '🔴 **REGISTRATION CLOSED**';
    statusColor = 0xFF0000;
  }
  
  const embed = new EmbedBuilder()
    .setColor(statusColor)
    .setTitle('🎰 GM LOTTERY')
    .setDescription(statusText)
    .addFields(
      {
        name: '📊 Registration Status',
        value: [
          `**Registered:** ${registeredUsers.length}/30 GMs`,
          `**Your Status:** ${userRegistered ? '✅ Registered!' : '❌ Not registered'}`
        ].join('\n'),
        inline: true
      },
      {
        name: '🎲 How It Works',
        value: [
          '1️⃣ Register for the lottery',
          '2️⃣ Admin runs the random draw',
          '3️⃣ Pick teams in lottery order',
          '4️⃣ Build your championship roster!'
        ].join('\n'),
        inline: true
      }
    )
    .setFooter({ text: 'Mock Offseason • GM Lottery' })
    .setTimestamp();
  
  // Show lottery order if complete
  if (lotteryComplete) {
    const orderList = lotterySettings.lotteryOrder.slice(0, 10).map((userId, i) => {
      const hasTeam = Object.values(league.teams).find(t => t.gm === userId);
      return `${i + 1}. <@${userId}>${hasTeam ? ` - ${hasTeam.emoji} ${hasTeam.name}` : ' - Selecting...'}`;
    }).join('\n');
    
    embed.addFields({
      name: '🏆 Lottery Order',
      value: orderList + (lotterySettings.lotteryOrder.length > 10 ? `\n*...and ${lotterySettings.lotteryOrder.length - 10} more*` : ''),
      inline: false
    });
    
    // Check if it's user's turn to pick
    const currentPicker = getCurrentPicker(league);
    if (currentPicker === interaction.user.id) {
      embed.addFields({
        name: '🔔 YOUR TURN!',
        value: 'It\'s your turn to select a team!',
        inline: false
      });
    }
  }
  
  // Action buttons
  const buttonRow = new ActionRowBuilder();
  
  if (!lotteryComplete && isOpen && !userRegistered) {
    buttonRow.addComponents(
      new ButtonBuilder()
        .setCustomId('mock_lottery_register')
        .setLabel('Register for Lottery')
        .setEmoji('🎰')
        .setStyle(ButtonStyle.Success)
    );
  } else if (!lotteryComplete && userRegistered) {
    buttonRow.addComponents(
      new ButtonBuilder()
        .setCustomId('mock_lottery_unregister')
        .setLabel('Withdraw Registration')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger)
    );
  }
  
  if (lotteryComplete) {
    const currentPicker = getCurrentPicker(league);
    if (currentPicker === interaction.user.id) {
      buttonRow.addComponents(
        new ButtonBuilder()
          .setCustomId('mock_lottery_select_team')
          .setLabel('Select Your Team')
          .setEmoji('🏀')
          .setStyle(ButtonStyle.Success)
      );
    }
  }
  
  buttonRow.addComponents(
    new ButtonBuilder()
      .setCustomId('mock_lottery_refresh')
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary)
  );
  
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_nav_dashboard')
      .setLabel('Dashboard')
      .setEmoji('🏠')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_nav_help')
      .setLabel('Lottery Help')
      .setEmoji('❓')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return {
    embeds: [embed],
    components: [buttonRow, navRow]
  };
}

/**
 * Get current picker in lottery
 */
function getCurrentPicker(league) {
  const lotteryOrder = league.lotterySettings?.lotteryOrder || [];
  
  // Find first user without a team
  for (const userId of lotteryOrder) {
    const hasTeam = Object.values(league.teams).find(t => t.gm === userId);
    if (!hasTeam) {
      return userId;
    }
  }
  return null;
}

/**
 * Handle lottery button interactions
 */
export async function handleLotteryAction(interaction) {
  const customId = interaction.customId;
  const league = await getMockLeague(interaction.guildId);
  
  if (!league) {
    return interaction.reply({ content: '❌ No league exists.', ephemeral: true });
  }
  
  switch (customId) {
    case 'mock_lottery_register':
      return await handleRegister(interaction, league);
    case 'mock_lottery_unregister':
      return await handleUnregister(interaction, league);
    case 'mock_lottery_refresh':
      return await handleRefresh(interaction, league);
    case 'mock_lottery_select_team':
      return await showTeamSelection(interaction, league);
    default:
      return interaction.reply({ content: '❌ Unknown lottery action.', ephemeral: true });
  }
}

/**
 * Handle lottery registration
 */
async function handleRegister(interaction, league) {
  const lotterySettings = league.lotterySettings || {};
  
  if (!lotterySettings.registrationOpen) {
    return interaction.reply({ content: '❌ Registration is not open.', ephemeral: true });
  }
  
  if ((lotterySettings.registeredUsers || []).includes(interaction.user.id)) {
    return interaction.reply({ content: '❌ You\'re already registered!', ephemeral: true });
  }
  
  if ((lotterySettings.registeredUsers || []).length >= 30) {
    return interaction.reply({ content: '❌ Lottery is full (30 GMs max).', ephemeral: true });
  }
  
  try {
    await registerForLottery(interaction.guildId, interaction.user.id);
    
    // Refresh panel
    const updatedLeague = await getMockLeague(interaction.guildId);
    const panel = await buildLotteryPanel(interaction, updatedLeague);
    return interaction.update(panel);
    
  } catch (error) {
    console.error('Error registering:', error);
    return interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true });
  }
}

/**
 * Handle lottery unregistration
 */
async function handleUnregister(interaction, league) {
  const lotterySettings = league.lotterySettings || {};
  const registeredUsers = lotterySettings.registeredUsers || [];
  
  if (!registeredUsers.includes(interaction.user.id)) {
    return interaction.reply({ content: '❌ You\'re not registered.', ephemeral: true });
  }
  
  // Remove user
  league.lotterySettings.registeredUsers = registeredUsers.filter(id => id !== interaction.user.id);
  await saveMockLeague(interaction.guildId, league);
  
  // Refresh panel
  const panel = await buildLotteryPanel(interaction, league);
  return interaction.update(panel);
}

/**
 * Handle refresh
 */
async function handleRefresh(interaction, league) {
  const panel = await buildLotteryPanel(interaction, league);
  return interaction.update(panel);
}

/**
 * Show team selection for lottery winner
 */
async function showTeamSelection(interaction, league) {
  const currentPicker = getCurrentPicker(league);
  
  if (currentPicker !== interaction.user.id) {
    return interaction.reply({ content: '❌ It\'s not your turn to pick!', ephemeral: true });
  }
  
  // Get available teams
  const availableTeams = Object.entries(league.teams)
    .filter(([_, team]) => !team.gm)
    .slice(0, 25);
  
  if (availableTeams.length === 0) {
    return interaction.reply({ content: '❌ No teams available!', ephemeral: true });
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('🏀 SELECT YOUR TEAM')
    .setDescription('Choose wisely! This will be your team for the entire offseason.\n\nConsider:\n• Current roster quality\n• Available cap space\n• Draft pick assets')
    .setTimestamp();
  
  // Group by conference
  const eastTeams = availableTeams.filter(([id, _]) => NBA_TEAMS[id]?.conference === 'Eastern');
  const westTeams = availableTeams.filter(([id, _]) => NBA_TEAMS[id]?.conference === 'Western');
  
  if (eastTeams.length > 0) {
    const eastList = eastTeams.map(([id, team]) => `${team.emoji} ${team.name}`).join('\n');
    embed.addFields({ name: '🏀 Eastern Conference', value: eastList, inline: true });
  }
  
  if (westTeams.length > 0) {
    const westList = westTeams.map(([id, team]) => `${team.emoji} ${team.name}`).join('\n');
    embed.addFields({ name: '🏀 Western Conference', value: westList, inline: true });
  }
  
  // Create selection buttons by division or group
  const buttonRows = [];
  const teamBatches = chunkArray(availableTeams, 5);
  
  for (const batch of teamBatches.slice(0, 4)) {
    const row = new ActionRowBuilder();
    for (const [teamId, team] of batch) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`mock_lottery_pick_${teamId}`)
          .setLabel(team.abbreviation || teamId.toUpperCase())
          .setEmoji(team.emoji)
          .setStyle(ButtonStyle.Primary)
      );
    }
    buttonRows.push(row);
  }
  
  // Back button
  buttonRows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mock_nav_lottery')
        .setLabel('Back')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary)
    )
  );
  
  return interaction.update({ embeds: [embed], components: buttonRows.slice(0, 5) });
}

/**
 * Handle team selection from lottery
 */
export async function handleLotteryTeamPick(interaction, teamId) {
  const league = await getMockLeague(interaction.guildId);
  
  if (!league) {
    return interaction.reply({ content: '❌ No league exists.', ephemeral: true });
  }
  
  const currentPicker = getCurrentPicker(league);
  
  if (currentPicker !== interaction.user.id) {
    return interaction.reply({ content: '❌ It\'s not your turn to pick!', ephemeral: true });
  }
  
  const team = league.teams[teamId];
  
  if (!team) {
    return interaction.reply({ content: '❌ Invalid team.', ephemeral: true });
  }
  
  if (team.gm) {
    return interaction.reply({ content: '❌ Team already taken!', ephemeral: true });
  }
  
  // Assign team
  team.gm = interaction.user.id;
  team.gmName = interaction.user.username;
  team.assignedAt = new Date().toISOString();
  
  await saveMockLeague(interaction.guildId, league);
  
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('🎉 CONGRATULATIONS!')
    .setDescription(`You are now the GM of the **${team.emoji} ${team.name}**!`)
    .addFields(
      { name: 'Conference', value: team.conference, inline: true },
      { name: 'Division', value: team.division, inline: true }
    )
    .setFooter({ text: 'Good luck! Build a championship team!' })
    .setTimestamp();
  
  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_nav_dashboard')
      .setLabel('Go to Dashboard')
      .setEmoji('🏠')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('mock_nav_team')
      .setLabel('View My Team')
      .setEmoji('🏀')
      .setStyle(ButtonStyle.Primary)
  );
  
  return interaction.update({ embeds: [embed], components: [buttonRow] });
}

/**
 * Helper to chunk array
 */
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
