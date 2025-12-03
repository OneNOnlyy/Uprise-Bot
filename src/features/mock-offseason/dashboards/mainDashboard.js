/**
 * Mock Offseason - Main Dashboard Builder
 * Builds the main dashboard embed that users see when they run /mock dashboard
 */

import { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} from 'discord.js';
import { 
  getUserTeam, 
  getLeaguePhase, 
  NBA_TEAMS, 
  PHASES,
  formatCurrency,
  isAdmin
} from '../mockData.js';

/**
 * Get phase display name
 */
function getPhaseDisplayName(phase) {
  const phaseNames = {
    [PHASES.SETUP]: '⚙️ Setup',
    [PHASES.GM_LOTTERY]: '🎰 GM Lottery',
    [PHASES.PRE_DRAFT]: '📋 Pre-Draft',
    [PHASES.DRAFT_LOTTERY]: '🎲 Draft Lottery',
    [PHASES.DRAFT]: '📝 NBA Draft',
    [PHASES.FREE_AGENCY_MORATORIUM]: '⏸️ FA Moratorium',
    [PHASES.FREE_AGENCY]: '✍️ Free Agency',
    [PHASES.TRAINING_CAMP]: '🏋️ Training Camp',
    [PHASES.REGULAR_SEASON]: '🏀 Regular Season',
    [PHASES.TRADE_DEADLINE]: '⏰ Trade Deadline',
    [PHASES.PLAYOFFS]: '🏆 Playoffs',
    [PHASES.OFFSEASON]: '📅 Offseason'
  };
  return phaseNames[phase] || phase;
}

/**
 * Build the main dashboard
 */
export async function buildMainDashboard(interaction, league) {
  const userId = interaction.user.id;
  const userTeam = await getUserTeam(interaction.guildId, userId);
  const userIsAdmin = isAdmin(interaction.member);
  
  // Build the embed
  const embed = new EmbedBuilder()
    .setColor(0x1D428A) // NBA blue
    .setTitle('🏀 MOCK OFFSEASON DASHBOARD')
    .setDescription(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    .setFooter({ text: 'Mock Offseason • Uprise Bot' })
    .setTimestamp();
  
  // User info section
  if (userTeam) {
    const teamInfo = NBA_TEAMS[userTeam.teamId];
    embed.addFields({
      name: '👤 Your Team',
      value: `🏟️ **${teamInfo.name}**\n${userTeam.isAssistant ? '(Assistant GM)' : '(General Manager)'}`,
      inline: true
    });
    
    // Cap snapshot (if team has data)
    const totalSalary = userTeam.capSpace?.totalSalary || 0;
    const capSpace = league.salaryCap - totalSalary;
    embed.addFields({
      name: '💰 Cap Snapshot',
      value: `Salary: ${formatCurrency(totalSalary)}\nCap: ${formatCurrency(league.salaryCap)}\nSpace: ${formatCurrency(Math.max(0, capSpace))}`,
      inline: true
    });
  } else {
    embed.addFields({
      name: '👤 Your Status',
      value: '❌ Not a GM yet\nJoin the lottery or wait for assignment!',
      inline: true
    });
  }
  
  // League info
  const phaseInfo = await getLeaguePhase(interaction.guildId);
  embed.addFields({
    name: '📅 Current Phase',
    value: `${getPhaseDisplayName(phaseInfo.phase)}${phaseInfo.isPaused ? ' (PAUSED)' : ''}`,
    inline: true
  });
  
  // Season name
  embed.addFields({
    name: '🏆 Season',
    value: league.seasonName,
    inline: true
  });
  
  // GM count
  const gmCount = Object.values(league.teams).filter(t => t.gm).length;
  embed.addFields({
    name: '👥 Active GMs',
    value: `${gmCount}/30 teams`,
    inline: true
  });
  
  // Notifications section (placeholder for now)
  embed.addFields({
    name: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    value: '\u200B',
    inline: false
  });
  
  embed.addFields({
    name: '🔔 Notifications',
    value: '_No new notifications_',
    inline: false
  });
  
  // Build navigation select menu
  const navOptions = [
    { label: '🏀 My Team', description: 'View roster, cap, and team management', value: 'mock_nav_team', disabled: !userTeam },
    { label: '🔄 Trade Center', description: 'Create, view, and manage trades', value: 'mock_nav_trades', disabled: !userTeam },
    { label: '✍️ Free Agency', description: 'Browse and sign free agents', value: 'mock_nav_freeagency', disabled: !userTeam },
    { label: '📋 Draft Room', description: 'Draft board, lottery, and picks', value: 'mock_nav_draft' },
    { label: '📊 League Hub', description: 'Standings, transactions, teams', value: 'mock_nav_league' },
    { label: '🔮 What-If Lab', description: 'Test hypothetical trades', value: 'mock_nav_whatif', disabled: !userTeam },
    { label: '🎰 GM Lottery', description: 'Register or view lottery status', value: 'mock_nav_lottery' },
    { label: '📰 News Feed', description: 'Latest transactions and rumors', value: 'mock_nav_news' },
    { label: '❓ Help Center', description: 'Tutorials and glossary', value: 'mock_nav_help' }
  ];
  
  // Add admin option if user is admin
  if (userIsAdmin) {
    navOptions.push({ label: '⚙️ Admin Panel', description: 'League management (Admin)', value: 'mock_nav_admin' });
  }
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('mock_select_navigation')
    .setPlaceholder('📍 Navigate to...')
    .addOptions(navOptions.map(opt => ({
      label: opt.label,
      description: opt.description,
      value: opt.value,
      default: false
    })));
  
  const selectRow = new ActionRowBuilder().addComponents(selectMenu);
  
  // Build button rows
  const buttonRow1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_nav_team')
      .setLabel('My Team')
      .setEmoji('🏀')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!userTeam),
    new ButtonBuilder()
      .setCustomId('mock_nav_trades')
      .setLabel('Trades')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!userTeam),
    new ButtonBuilder()
      .setCustomId('mock_nav_freeagency')
      .setLabel('Free Agency')
      .setEmoji('✍️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!userTeam),
    new ButtonBuilder()
      .setCustomId('mock_nav_draft')
      .setLabel('Draft')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary)
  );
  
  const buttonRow2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_nav_league')
      .setLabel('League')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_nav_whatif')
      .setLabel('What-If')
      .setEmoji('🔮')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!userTeam),
    new ButtonBuilder()
      .setCustomId('mock_nav_lottery')
      .setLabel('GM Lottery')
      .setEmoji('🎰')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_nav_help')
      .setLabel('Help')
      .setEmoji('❓')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return {
    embeds: [embed],
    components: [selectRow, buttonRow1, buttonRow2]
  };
}

/**
 * Build a "no team" state dashboard for users without a team
 */
export async function buildNoTeamDashboard(interaction, league) {
  const embed = new EmbedBuilder()
    .setColor(0xFF6B6B)
    .setTitle('🏀 MOCK OFFSEASON')
    .setDescription('You are not currently a GM of any team.')
    .addFields(
      {
        name: '🎰 Join the GM Lottery',
        value: 'Register for the GM lottery to get a chance to pick your team!',
        inline: false
      },
      {
        name: '📊 Browse the League',
        value: 'You can still view standings, transactions, and team rosters.',
        inline: false
      }
    )
    .setFooter({ text: 'Mock Offseason • Uprise Bot' })
    .setTimestamp();
  
  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_lottery_register')
      .setLabel('Register for Lottery')
      .setEmoji('🎰')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('mock_nav_league')
      .setLabel('View League')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_nav_help')
      .setLabel('Help')
      .setEmoji('❓')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return {
    embeds: [embed],
    components: [buttonRow]
  };
}

/**
 * Handle navigation select menu
 */
export async function handleNavSelectMenu(interaction) {
  const selected = interaction.values[0];
  
  // Convert select value to button customId format
  // e.g., 'mock_nav_team' stays as is
  
  // Create a fake button interaction customId
  interaction.customId = selected;
  
  // Import and call navigation handler
  const { handleNavigation } = await import('../handlers/navigationHandler.js');
  return await handleNavigation(interaction);
}
