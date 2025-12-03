/**
 * Mock Offseason - Admin Commands Handler
 * Handles all /mock admin subcommands
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { 
  createMockLeague, 
  getMockLeague, 
  saveMockLeague,
  assignGM, 
  removeGM, 
  advancePhase,
  runGMLottery,
  NBA_TEAMS,
  PHASES
} from '../mockData.js';
import { importAllRosters, importProspects, generateFreeAgents, importAllData } from '../data/rosterImport.js';

/**
 * Handle admin subcommands
 */
export async function handleAdminCommand(interaction, subcommand) {
  switch (subcommand) {
    case 'create':
      return await handleCreate(interaction);
    case 'start':
      return await handleStart(interaction);
    case 'advance':
      return await handleAdvance(interaction);
    case 'pause':
      return await handlePause(interaction);
    case 'resume':
      return await handleResume(interaction);
    case 'import':
      return await handleImport(interaction);
    case 'assign':
      return await handleAssign(interaction);
    case 'remove':
      return await handleRemove(interaction);
    case 'announce':
      return await handleAnnounce(interaction);
    case 'config':
      return await handleConfig(interaction);
    case 'reset':
      return await handleReset(interaction);
    default:
      return interaction.reply({ content: '❌ Unknown admin command.', ephemeral: true });
  }
}

/**
 * Create a new Mock Offseason league
 */
async function handleCreate(interaction) {
  const seasonName = interaction.options.getString('season_name');
  
  // Check if a league already exists
  const existingLeague = await getMockLeague(interaction.guildId);
  if (existingLeague) {
    const embed = new EmbedBuilder()
      .setColor(0xFF6B6B)
      .setTitle('❌ League Already Exists')
      .setDescription(`A Mock Offseason league already exists: **${existingLeague.seasonName}**`)
      .addFields({
        name: 'Options',
        value: '• Use `/mock admin reset` to delete the current league and start fresh\n• Or continue with the existing league'
      });
    
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
  
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const league = await createMockLeague(interaction.guildId, seasonName, interaction.user.id);
    
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ Mock Offseason League Created!')
      .setDescription(`**${seasonName}** has been created successfully.`)
      .addFields(
        {
          name: '📋 Next Steps',
          value: '1. Import NBA rosters: `/mock admin import rosters`\n2. Import draft prospects: `/mock admin import prospects`\n3. Open GM lottery registration\n4. Start the season: `/mock admin start`'
        },
        {
          name: '⚙️ Configuration',
          value: 'Use `/mock admin config` to customize timing, rules, and settings.'
        }
      )
      .setFooter({ text: 'Mock Offseason • Uprise Bot' })
      .setTimestamp();
    
    // Buttons for quick actions
    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mock_admin_import_all')
        .setLabel('Import All Data')
        .setEmoji('📥')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('mock_admin_open_lottery')
        .setLabel('Open GM Lottery')
        .setEmoji('🎰')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('mock_admin_config')
        .setLabel('Configure')
        .setEmoji('⚙️')
        .setStyle(ButtonStyle.Secondary)
    );
    
    return interaction.editReply({ embeds: [embed], components: [buttonRow] });
    
  } catch (error) {
    console.error('Error creating league:', error);
    return interaction.editReply({ content: `❌ Error creating league: ${error.message}` });
  }
}

/**
 * Start the Mock Offseason season
 */
async function handleStart(interaction) {
  const league = await getMockLeague(interaction.guildId);
  if (!league) {
    return interaction.reply({ content: '❌ No league exists. Create one first with `/mock admin create`', ephemeral: true });
  }
  
  if (league.phase !== PHASES.SETUP) {
    return interaction.reply({ content: '❌ The season has already started.', ephemeral: true });
  }
  
  await interaction.deferReply({ ephemeral: true });
  
  try {
    // Open GM lottery registration
    league.lotterySettings.registrationOpen = true;
    league.phase = PHASES.GM_LOTTERY;
    league.phaseStartTime = new Date().toISOString();
    
    await saveMockLeague(interaction.guildId, league);
    
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('🎰 Mock Offseason Season Started!')
      .setDescription(`**${league.seasonName}** is now active!`)
      .addFields(
        {
          name: '📅 Current Phase',
          value: '🎰 GM Lottery Registration',
          inline: true
        },
        {
          name: '👥 How to Join',
          value: 'Users can run `/mock dashboard` and register for the GM lottery.',
          inline: false
        }
      )
      .setFooter({ text: 'Mock Offseason • Uprise Bot' })
      .setTimestamp();
    
    return interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    console.error('Error starting season:', error);
    return interaction.editReply({ content: `❌ Error starting season: ${error.message}` });
  }
}

/**
 * Advance to the next phase
 */
async function handleAdvance(interaction) {
  const league = await getMockLeague(interaction.guildId);
  if (!league) {
    return interaction.reply({ content: '❌ No league exists.', ephemeral: true });
  }
  
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const oldPhase = league.phase;
    const newPhase = await advancePhase(interaction.guildId);
    
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('⏭️ Phase Advanced')
      .addFields(
        { name: 'Previous Phase', value: oldPhase, inline: true },
        { name: 'New Phase', value: newPhase, inline: true }
      )
      .setFooter({ text: 'Mock Offseason • Uprise Bot' })
      .setTimestamp();
    
    return interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    console.error('Error advancing phase:', error);
    return interaction.editReply({ content: `❌ Error: ${error.message}` });
  }
}

/**
 * Pause all timers
 */
async function handlePause(interaction) {
  const league = await getMockLeague(interaction.guildId);
  if (!league) {
    return interaction.reply({ content: '❌ No league exists.', ephemeral: true });
  }
  
  if (league.isPaused) {
    return interaction.reply({ content: '⚠️ The league is already paused.', ephemeral: true });
  }
  
  league.isPaused = true;
  league.pausedAt = new Date().toISOString();
  await saveMockLeague(interaction.guildId, league);
  
  const embed = new EmbedBuilder()
    .setColor(0xFFA500)
    .setTitle('⏸️ League Paused')
    .setDescription('All timers and deadlines have been paused.')
    .addFields({
      name: 'Resume',
      value: 'Use `/mock admin resume` to continue the league.'
    })
    .setTimestamp();
  
  return interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Resume timers
 */
async function handleResume(interaction) {
  const league = await getMockLeague(interaction.guildId);
  if (!league) {
    return interaction.reply({ content: '❌ No league exists.', ephemeral: true });
  }
  
  if (!league.isPaused) {
    return interaction.reply({ content: '⚠️ The league is not paused.', ephemeral: true });
  }
  
  league.isPaused = false;
  league.pausedAt = null;
  await saveMockLeague(interaction.guildId, league);
  
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('▶️ League Resumed')
    .setDescription('All timers and deadlines are now active again.')
    .setTimestamp();
  
  return interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Import data from NBA APIs
 */
async function handleImport(interaction) {
  const importType = interaction.options.getString('type');
  
  await interaction.deferReply({ ephemeral: true });
  
  const league = await getMockLeague(interaction.guildId);
  if (!league) {
    return interaction.editReply({ content: '❌ No league exists. Create one first with `/mock admin create`.' });
  }
  
  try {
    let result;
    let embed;
    
    switch (importType) {
      case 'rosters':
        result = await importAllRosters(interaction.guildId);
        embed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('✅ Rosters Imported!')
          .setDescription(`Successfully imported rosters for all 30 NBA teams.`)
          .addFields(
            { name: '📊 Teams', value: `${result.teamsImported}`, inline: true },
            { name: '👥 Players', value: `${result.totalPlayers}`, inline: true }
          )
          .setTimestamp();
        break;
        
      case 'prospects':
        result = await importProspects(interaction.guildId);
        embed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('✅ Prospects Imported!')
          .setDescription(`Successfully imported the 2026 draft class.`)
          .addFields(
            { name: '🎓 Prospects', value: `${result.prospectsImported}`, inline: true }
          )
          .setTimestamp();
        break;
        
      case 'freeagents':
        result = await generateFreeAgents(interaction.guildId);
        embed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('✅ Free Agents Generated!')
          .setDescription(`Successfully generated the free agent market.`)
          .addFields(
            { name: '📝 Free Agents', value: `${result.freeAgentsGenerated}`, inline: true }
          )
          .setTimestamp();
        break;
        
      case 'all':
        result = await importAllData(interaction.guildId);
        embed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('✅ All Data Imported!')
          .setDescription(`Successfully imported all mock offseason data.`)
          .addFields(
            { name: '📊 Teams', value: `${result.rosters.teamsImported}`, inline: true },
            { name: '👥 Players', value: `${result.rosters.totalPlayers}`, inline: true },
            { name: '🎓 Prospects', value: `${result.prospects.prospectsImported}`, inline: true },
            { name: '📝 Free Agents', value: `${result.freeAgents.freeAgentsGenerated}`, inline: true }
          )
          .setTimestamp();
        break;
        
      default:
        return interaction.editReply({ content: '❌ Invalid import type.' });
    }
    
    return interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    console.error('Import error:', error);
    return interaction.editReply({ content: `❌ Import failed: ${error.message}` });
  }
}

/**
 * Manually assign a user to a team
 */
async function handleAssign(interaction) {
  const user = interaction.options.getUser('user');
  const teamId = interaction.options.getString('team').toUpperCase();
  
  // Validate team
  if (!NBA_TEAMS[teamId]) {
    const validTeams = Object.keys(NBA_TEAMS).join(', ');
    return interaction.reply({ 
      content: `❌ Invalid team. Valid teams: ${validTeams}`, 
      ephemeral: true 
    });
  }
  
  await interaction.deferReply({ ephemeral: true });
  
  try {
    await assignGM(interaction.guildId, user.id, teamId);
    
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ GM Assigned')
      .setDescription(`${user} is now the GM of the **${NBA_TEAMS[teamId].name}**!`)
      .setTimestamp();
    
    return interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    return interaction.editReply({ content: `❌ Error: ${error.message}` });
  }
}

/**
 * Remove a GM from their team
 */
async function handleRemove(interaction) {
  const user = interaction.options.getUser('user');
  
  await interaction.deferReply({ ephemeral: true });
  
  try {
    await removeGM(interaction.guildId, user.id);
    
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ GM Removed')
      .setDescription(`${user} has been removed from their team.`)
      .setTimestamp();
    
    return interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    return interaction.editReply({ content: `❌ Error: ${error.message}` });
  }
}

/**
 * Send an announcement
 */
async function handleAnnounce(interaction) {
  const message = interaction.options.getString('message');
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle('📢 Mock Offseason Announcement')
    .setDescription(message)
    .setFooter({ text: `From: ${interaction.user.tag}` })
    .setTimestamp();
  
  // TODO: Send to dedicated announcement channel and/or DM all GMs
  
  return interaction.reply({ 
    content: '✅ Announcement sent! (Channel posting coming soon)',
    embeds: [embed],
    ephemeral: true 
  });
}

/**
 * Open config panel
 */
async function handleConfig(interaction) {
  const league = await getMockLeague(interaction.guildId);
  if (!league) {
    return interaction.reply({ content: '❌ No league exists.', ephemeral: true });
  }
  
  // Ensure default settings exist
  if (!league.settings) league.settings = {};
  if (!league.timingConfig) {
    league.timingConfig = {
      gmLotteryPick: 60000,
      draftPick: 120000,
      tradeProposalExpiration: 86400000
    };
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle('⚙️ League Configuration')
    .setDescription('Current settings for the Mock Offseason league.')
    .addFields(
      {
        name: '💰 Salary Cap Settings',
        value: `Cap: $${((league.salaryCap || 140600000) / 1000000).toFixed(1)}M\nTax: $${((league.luxuryTax || 170800000) / 1000000).toFixed(1)}M\nFirst Apron: $${((league.firstApron || 178600000) / 1000000).toFixed(1)}M`,
        inline: true
      },
      {
        name: '⏱️ Timing Settings',
        value: `GM Pick: ${(league.timingConfig.gmLotteryPick / 1000)}s\nDraft Pick: ${(league.timingConfig.draftPick / 1000)}s\nTrade Expiry: ${(league.timingConfig.tradeProposalExpiration / 3600000)}h`,
        inline: true
      },
      {
        name: '📋 Rules',
        value: `Commissioner Approval: ${league.settings.requireCommissioner ? '✅' : '❌'}\nMulti-Team Trades: ${league.settings.allowMultiTeamTrades ? '✅' : '❌'}\nStepien Rule: ${league.settings.stepienRuleEnforced !== false ? '✅' : '❌'}`,
        inline: true
      }
    )
    .setTimestamp();
  
  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_admin_config_timing')
      .setLabel('Edit Timing')
      .setEmoji('⏱️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_admin_config_rules')
      .setLabel('Edit Rules')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_admin_config_cap')
      .setLabel('Edit Cap')
      .setEmoji('💰')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return interaction.reply({ embeds: [embed], components: [buttonRow], ephemeral: true });
}

/**
 * Reset the league
 */
async function handleReset(interaction) {
  const league = await getMockLeague(interaction.guildId);
  if (!league) {
    return interaction.reply({ content: '❌ No league exists to reset.', ephemeral: true });
  }
  
  const embed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('⚠️ Reset League?')
    .setDescription(`Are you sure you want to reset **${league.seasonName}**?\n\n**This will delete:**\n• All team assignments\n• All transactions\n• All trade history\n• All draft picks\n\n**This cannot be undone!**`)
    .setTimestamp();
  
  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_admin_reset_confirm')
      .setLabel('Yes, Reset Everything')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('mock_admin_reset_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return interaction.reply({ embeds: [embed], components: [buttonRow], ephemeral: true });
}
