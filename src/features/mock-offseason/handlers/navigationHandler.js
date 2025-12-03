/**
 * Mock Offseason - Navigation Handler
 * Handles main dashboard navigation and button routing
 */

import { buildMainDashboard, buildNoTeamDashboard } from '../dashboards/mainDashboard.js';
import { getMockLeague, getUserTeam } from '../mockData.js';
import { buildTeamDashboard } from './teamHandler.js';
import { buildTradeHub } from './tradeHandler.js';
import { buildFreeAgencyHub } from './freeAgencyHandler.js';
import { buildDraftRoom } from './draftHandler.js';
import { buildLotteryPanel } from './lotteryHandler.js';
import { buildHelpEmbed } from './helpHandler.js';
import { buildLeagueHub } from './leagueHubHandler.js';
import { buildAdminPanel } from '../admin/adminPanel.js';

/**
 * Handle main navigation buttons
 */
export async function handleNavigation(interaction) {
  const customId = interaction.customId;
  const league = await getMockLeague(interaction.guildId);
  
  if (!league) {
    return interaction.reply({ 
      content: '❌ No mock offseason league exists yet. An admin needs to create one.',
      ephemeral: true 
    });
  }
  
  // Route based on button custom ID
  switch (customId) {
    case 'mock_nav_dashboard':
      return await handleDashboardNav(interaction, league);
      
    case 'mock_nav_team':
      return await handleTeamNav(interaction, league);
      
    case 'mock_nav_trade':
      return await handleTradeNav(interaction, league);
      
    case 'mock_nav_freeagency':
      return await handleFreeAgencyNav(interaction, league);
      
    case 'mock_nav_draft':
      return await handleDraftNav(interaction, league);
      
    case 'mock_nav_lottery':
      return await handleLotteryNav(interaction, league);
      
    case 'mock_nav_help':
      return await handleHelpNav(interaction, league);
      
    case 'mock_nav_league':
      return await handleLeagueNav(interaction, league);
      
    case 'mock_nav_admin':
      return await handleAdminNav(interaction, league);
      
    case 'mock_refresh':
      return await handleRefresh(interaction, league);
      
    default:
      return interaction.reply({ content: '❌ Unknown navigation action.', ephemeral: true });
  }
}

/**
 * Navigate to main dashboard
 */
async function handleDashboardNav(interaction, league) {
  const userTeam = await getUserTeam(interaction.guildId, interaction.user.id);
  
  if (userTeam) {
    const dashboard = await buildMainDashboard(interaction, league, userTeam);
    return interaction.update(dashboard);
  } else {
    const dashboard = await buildNoTeamDashboard(interaction, league);
    return interaction.update(dashboard);
  }
}

/**
 * Navigate to team management
 */
async function handleTeamNav(interaction, league) {
  const userTeam = await getUserTeam(interaction.guildId, interaction.user.id);
  
  if (!userTeam) {
    return interaction.reply({ 
      content: '❌ You don\'t have a team yet! Register for the GM Lottery first.',
      ephemeral: true 
    });
  }
  
  const dashboard = await buildTeamDashboard(interaction, league, userTeam);
  return interaction.update(dashboard);
}

/**
 * Navigate to trade hub
 */
async function handleTradeNav(interaction, league) {
  const userTeam = await getUserTeam(interaction.guildId, interaction.user.id);
  
  if (!userTeam) {
    return interaction.reply({ 
      content: '❌ You need a team to access the Trade Hub!',
      ephemeral: true 
    });
  }
  
  const hub = await buildTradeHub(interaction, league, userTeam);
  return interaction.update(hub);
}

/**
 * Navigate to free agency
 */
async function handleFreeAgencyNav(interaction, league) {
  const userTeam = await getUserTeam(interaction.guildId, interaction.user.id);
  
  if (!userTeam) {
    return interaction.reply({ 
      content: '❌ You need a team to access Free Agency!',
      ephemeral: true 
    });
  }
  
  const hub = await buildFreeAgencyHub(interaction, league, userTeam);
  return interaction.update(hub);
}

/**
 * Navigate to draft room
 */
async function handleDraftNav(interaction, league) {
  const userTeam = await getUserTeam(interaction.guildId, interaction.user.id);
  
  if (!userTeam) {
    return interaction.reply({ 
      content: '❌ You need a team to access the Draft Room!',
      ephemeral: true 
    });
  }
  
  const room = await buildDraftRoom(interaction, league, userTeam);
  return interaction.update(room);
}

/**
 * Navigate to lottery panel
 */
async function handleLotteryNav(interaction, league) {
  const panel = await buildLotteryPanel(interaction, league);
  return interaction.update(panel);
}

/**
 * Navigate to help
 */
async function handleHelpNav(interaction, league) {
  const help = await buildHelpEmbed(interaction, 'main');
  return interaction.update(help);
}

/**
 * Navigate to league hub
 */
async function handleLeagueNav(interaction, league) {
  const hub = await buildLeagueHub(interaction, league);
  return interaction.update(hub);
}

/**
 * Navigate to admin panel (admin only)
 */
async function handleAdminNav(interaction, league) {
  if (!interaction.member.permissions.has('Administrator')) {
    return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
  }
  
  const panel = await buildAdminPanel(interaction, league);
  return interaction.update(panel);
}

/**
 * Refresh current view
 */
async function handleRefresh(interaction, league) {
  const userTeam = await getUserTeam(interaction.guildId, interaction.user.id);
  
  if (userTeam) {
    const dashboard = await buildMainDashboard(interaction, league, userTeam);
    return interaction.update(dashboard);
  } else {
    const dashboard = await buildNoTeamDashboard(interaction, league);
    return interaction.update(dashboard);
  }
}
