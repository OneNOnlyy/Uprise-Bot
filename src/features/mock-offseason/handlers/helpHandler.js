/**
 * Mock Offseason - Help Handler
 * Provides context-sensitive help for all features
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';

/**
 * Help topics and their content
 */
const HELP_TOPICS = {
  main: {
    title: '❓ Mock Offseason Help',
    description: 'Welcome to Mock Offseason! This is an NBA GM simulation where you manage a real NBA team through the offseason.',
    fields: [
      {
        name: '🎯 Getting Started',
        value: '1. Register for the GM Lottery\n2. Get assigned a random lottery position\n3. Select your team in draft order\n4. Manage your team through the offseason!',
        inline: false
      },
      {
        name: '📋 Main Features',
        value: '• **Team Management** - View roster, cap, depth chart\n• **Trade Hub** - Propose and negotiate trades\n• **Free Agency** - Sign available players\n• **Draft Room** - Scout and draft prospects',
        inline: false
      },
      {
        name: '🔧 Need More Help?',
        value: 'Select a topic from the menu below for detailed help.',
        inline: false
      }
    ]
  },
  lottery: {
    title: '🎰 GM Lottery Help',
    description: 'The GM Lottery determines the order in which players select their teams.',
    fields: [
      {
        name: '📝 Registration',
        value: 'When registration opens, click "Register for Lottery" to enter.\nYou can withdraw before the draw if needed.',
        inline: false
      },
      {
        name: '🎲 The Draw',
        value: 'Admin runs the lottery draw which randomizes all registered users.\nYour position determines when you pick your team.',
        inline: false
      },
      {
        name: '🏀 Team Selection',
        value: 'When it\'s your turn, you\'ll see available teams.\nConsider roster quality, cap space, and draft picks!',
        inline: false
      }
    ]
  },
  team: {
    title: '🏀 Team Management Help',
    description: 'Learn how to manage your team roster and salary cap.',
    fields: [
      {
        name: '📋 Roster',
        value: 'View your full roster, organized by position.\nMax 15 players + 2 two-way contracts.',
        inline: false
      },
      {
        name: '💰 Salary Cap',
        value: `**Cap:** $140.6M\n**Luxury Tax:** $170.8M\n**First Apron:** $178.1M\n**Second Apron:** $188.9M`,
        inline: false
      },
      {
        name: '📊 Depth Chart',
        value: 'Set your starting lineup and rotation.\nThis affects simulation results!',
        inline: false
      }
    ]
  },
  trade: {
    title: '🔄 Trade Hub Help',
    description: 'Learn how to propose and complete trades.',
    fields: [
      {
        name: '📤 Proposing Trades',
        value: '1. Select a team to trade with\n2. Choose players/picks to offer\n3. Choose players/picks to request\n4. System checks salary matching\n5. Send the proposal!',
        inline: false
      },
      {
        name: '💰 Salary Matching',
        value: '**Over cap teams** must match within 125% + $100K\n**Under cap teams** can absorb using cap space\n**Exceptions** can be used in some scenarios',
        inline: false
      },
      {
        name: '📥 Trade Inbox',
        value: 'Review incoming proposals.\nYou can accept, reject, or counter.',
        inline: false
      }
    ]
  },
  freeagency: {
    title: '💼 Free Agency Help',
    description: 'Learn how to sign free agents and manage offers.',
    fields: [
      {
        name: '🔍 Browse Market',
        value: 'View available free agents by position.\nSee their asking price and interest level.',
        inline: false
      },
      {
        name: '📝 Making Offers',
        value: 'Select a player and offer a contract.\nSpecify salary per year and total years.',
        inline: false
      },
      {
        name: '💰 Signing Tools',
        value: '**Cap Space** - Sign anyone if under cap\n**MLE** - $12.8M exception (non-tax teams)\n**Room Exception** - $7.7M (cap space teams)\n**Veteran Minimum** - Always available',
        inline: false
      },
      {
        name: '⏱️ Decision Time',
        value: 'Players may take time to decide.\nHigher offers and better teams win!',
        inline: false
      }
    ]
  },
  draft: {
    title: '🎯 Draft Room Help',
    description: 'Learn how to scout prospects and make draft picks.',
    fields: [
      {
        name: '📋 Draft Board',
        value: 'View the draft order for all picks.\nSee which picks your team owns.',
        inline: false
      },
      {
        name: '⭐ Scouting Prospects',
        value: 'Browse 2026 draft class.\nView stats, measurements, and projections.',
        inline: false
      },
      {
        name: '📝 Big Board',
        value: 'Create your personal rankings.\nSet auto-draft priority.',
        inline: false
      },
      {
        name: '⏱️ On The Clock',
        value: 'When it\'s your pick, select from available prospects.\nTime limit per pick (default 2 minutes).',
        inline: false
      }
    ]
  },
  cba: {
    title: '📜 CBA Rules Help',
    description: 'Understanding NBA salary cap rules in Mock Offseason.',
    fields: [
      {
        name: '💰 2024-25 Cap Numbers',
        value: [
          '**Salary Cap:** $140,588,000',
          '**Luxury Tax:** $170,814,000',
          '**First Apron:** $178,132,000',
          '**Second Apron:** $188,931,000'
        ].join('\n'),
        inline: false
      },
      {
        name: '📋 Roster Limits',
        value: '**Standard:** 15 players\n**Two-Way:** 2 additional\n**Minimum:** 14 players by deadline',
        inline: false
      },
      {
        name: '🔄 Trade Rules',
        value: '**Salary Matching:** 125% + $100K\n**Aggregation:** Multiple players can match\n**Draft Picks:** Can include future picks',
        inline: false
      },
      {
        name: '💼 Exceptions',
        value: '**Non-Taxpayer MLE:** $12.8M\n**Taxpayer MLE:** $5.2M\n**Bi-Annual:** $4.5M\n**Room Exception:** $7.7M',
        inline: false
      }
    ]
  }
};

/**
 * Build help embed for a topic
 */
export async function buildHelpEmbed(interaction, topic = 'main') {
  const helpData = HELP_TOPICS[topic] || HELP_TOPICS.main;
  
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(helpData.title)
    .setDescription(helpData.description)
    .setTimestamp();
  
  for (const field of helpData.fields) {
    embed.addFields(field);
  }
  
  // Topic selection menu
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('mock_help_topic')
    .setPlaceholder('Select help topic...')
    .addOptions([
      { label: 'Getting Started', value: 'main', emoji: '🏠', description: 'Overview and basics' },
      { label: 'GM Lottery', value: 'lottery', emoji: '🎰', description: 'Team selection lottery' },
      { label: 'Team Management', value: 'team', emoji: '🏀', description: 'Roster and cap management' },
      { label: 'Trade Hub', value: 'trade', emoji: '🔄', description: 'Trading players and picks' },
      { label: 'Free Agency', value: 'freeagency', emoji: '💼', description: 'Signing free agents' },
      { label: 'Draft Room', value: 'draft', emoji: '🎯', description: 'Draft prospects' },
      { label: 'CBA Rules', value: 'cba', emoji: '📜', description: 'Salary cap rules' }
    ]);
  
  const selectRow = new ActionRowBuilder().addComponents(selectMenu);
  
  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_nav_dashboard')
      .setLabel('Back to Dashboard')
      .setEmoji('🏠')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return {
    embeds: [embed],
    components: [selectRow, buttonRow]
  };
}

/**
 * Handle help button interactions
 */
export async function handleHelpAction(interaction) {
  const topic = interaction.customId.replace('mock_help_', '') || 'main';
  const help = await buildHelpEmbed(interaction, topic);
  return interaction.update(help);
}

/**
 * Handle help select menu
 */
export async function handleHelpSelect(interaction) {
  const topic = interaction.values[0];
  const help = await buildHelpEmbed(interaction, topic);
  return interaction.update(help);
}
