/**
 * Mock Offseason - News Feed System (MockWoj/MockShams)
 * Generates and displays transaction news in reporter style
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getMockLeague, formatCurrency, NBA_TEAMS } from '../mockData.js';

// Reporter personas
const REPORTERS = {
  woj: {
    name: 'MockWoj',
    avatar: '📰',
    style: 'Breaking:',
    phrases: [
      'Sources tell MockWoj:',
      'Sources:',
      'Breaking:',
      'Just in:',
      'News:'
    ]
  },
  shams: {
    name: 'MockShams',
    avatar: '🗞️',
    style: 'Sources:',
    phrases: [
      'Sources tell MockShams:',
      'I\'m told',
      'Sources:',
      'Breaking:',
      'Per sources:'
    ]
  },
  windhorst: {
    name: 'MockWindhorst',
    avatar: '📺',
    style: 'Analysis:',
    phrases: [
      'I\'m hearing from sources that',
      'Multiple sources indicate',
      'From what I\'m told,',
      'Sources close to the situation say'
    ]
  }
};

/**
 * Generate a news report for a transaction
 */
export function generateNewsReport(transaction, league) {
  const reporter = getRandomReporter();
  const phrase = reporter.phrases[Math.floor(Math.random() * reporter.phrases.length)];
  
  let headline = '';
  let details = '';
  
  switch (transaction.type) {
    case 'trade':
      headline = generateTradeHeadline(transaction, phrase);
      details = generateTradeDetails(transaction, league);
      break;
    case 'signing':
      headline = generateSigningHeadline(transaction, phrase);
      details = generateSigningDetails(transaction, league);
      break;
    case 'release':
      headline = generateReleaseHeadline(transaction, phrase);
      details = generateReleaseDetails(transaction, league);
      break;
    case 'draft':
      headline = generateDraftHeadline(transaction, phrase);
      details = generateDraftDetails(transaction, league);
      break;
    case 'extension':
      headline = generateExtensionHeadline(transaction, phrase);
      details = generateExtensionDetails(transaction, league);
      break;
    default:
      headline = `${phrase} A transaction has occurred.`;
      details = 'Details to follow.';
  }
  
  return {
    reporter,
    headline,
    details,
    timestamp: transaction.timestamp || new Date().toISOString()
  };
}

/**
 * Trade headlines
 */
function generateTradeHeadline(txn, phrase) {
  const team1 = txn.details?.team1 || 'Team 1';
  const team2 = txn.details?.team2 || 'Team 2';
  
  const templates = [
    `${phrase} The ${team1} and ${team2} have agreed to a trade.`,
    `${phrase} ${team1} sending package to ${team2} in blockbuster deal.`,
    `${phrase} Trade finalized between ${team1} and ${team2}.`,
    `${phrase} ${team1} and ${team2} complete trade negotiations.`
  ];
  
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateTradeDetails(txn, league) {
  const parts = [];
  
  if (txn.details?.initiator?.players?.length > 0) {
    const team = txn.details.team1;
    const players = txn.details.initiator.players.map(p => p.name).join(', ');
    parts.push(`${team} sends: ${players}`);
  }
  
  if (txn.details?.target?.players?.length > 0) {
    const team = txn.details.team2;
    const players = txn.details.target.players.map(p => p.name).join(', ');
    parts.push(`${team} sends: ${players}`);
  }
  
  if (txn.details?.initiator?.picks?.length > 0) {
    parts.push(`Draft picks also involved in the deal.`);
  }
  
  return parts.join('\n') || 'Full details to come.';
}

/**
 * Signing headlines
 */
function generateSigningHeadline(txn, phrase) {
  const player = txn.details?.playerName || 'Free agent';
  const team = txn.details?.teamName || 'team';
  
  const templates = [
    `${phrase} ${player} has agreed to sign with the ${team}.`,
    `${phrase} Free agent ${player} is heading to ${team}.`,
    `${phrase} ${team} lands ${player} in free agency.`,
    `${phrase} Deal done: ${player} to the ${team}.`
  ];
  
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateSigningDetails(txn, league) {
  const salary = txn.details?.salary;
  const years = txn.details?.years;
  
  if (salary && years) {
    const total = salary * years;
    return `Contract details: ${years} year(s), ${formatCurrency(total)} total (${formatCurrency(salary)}/yr)`;
  }
  
  return 'Contract details to be finalized.';
}

/**
 * Release headlines
 */
function generateReleaseHeadline(txn, phrase) {
  const player = txn.details?.playerName || 'Player';
  const team = txn.details?.teamName || 'team';
  
  const templates = [
    `${phrase} The ${team} have waived ${player}.`,
    `${phrase} ${player} has been released by the ${team}.`,
    `${phrase} ${team} parting ways with ${player}.`
  ];
  
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateReleaseDetails(txn, league) {
  const player = txn.details?.playerName;
  return `${player || 'Player'} is now a free agent and available to sign with any team.`;
}

/**
 * Draft headlines
 */
function generateDraftHeadline(txn, phrase) {
  const player = txn.details?.playerName || 'Prospect';
  const team = txn.details?.teamName || 'team';
  const pick = txn.details?.pickNumber || '?';
  
  return `${phrase} With the #${pick} pick, the ${team} select ${player}.`;
}

function generateDraftDetails(txn, league) {
  const player = txn.details;
  if (player) {
    return `${player.position || 'Player'} from ${player.school || 'Unknown'}`;
  }
  return '';
}

/**
 * Extension headlines
 */
function generateExtensionHeadline(txn, phrase) {
  const player = txn.details?.playerName || 'Player';
  const team = txn.details?.teamName || 'team';
  
  return `${phrase} ${player} has agreed to a contract extension with the ${team}.`;
}

function generateExtensionDetails(txn, league) {
  const salary = txn.details?.salary;
  const years = txn.details?.years;
  
  if (salary && years) {
    const total = salary * years;
    return `Extension: ${years} year(s), ${formatCurrency(total)} total`;
  }
  
  return 'Extension details to be announced.';
}

/**
 * Get random reporter
 */
function getRandomReporter() {
  const reporters = Object.values(REPORTERS);
  return reporters[Math.floor(Math.random() * reporters.length)];
}

/**
 * Build the news feed view
 */
export async function buildNewsFeed(interaction, league, page = 0) {
  const transactions = (league.transactions || []).slice().reverse();
  const pageSize = 5;
  const totalPages = Math.ceil(transactions.length / pageSize) || 1;
  const start = page * pageSize;
  const pageTransactions = transactions.slice(start, start + pageSize);
  
  const embed = new EmbedBuilder()
    .setColor(0x1D428A)
    .setTitle('📰 MOCK OFFSEASON NEWS')
    .setDescription('Latest transactions and breaking news')
    .setTimestamp()
    .setFooter({ text: `Page ${page + 1}/${totalPages} • Mock Offseason News` });
  
  if (pageTransactions.length === 0) {
    embed.addFields({
      name: '📭 No News Yet',
      value: 'Transactions will appear here as they happen.',
      inline: false
    });
  } else {
    for (const txn of pageTransactions) {
      const report = generateNewsReport(txn, league);
      const time = `<t:${Math.floor(new Date(report.timestamp).getTime() / 1000)}:R>`;
      
      embed.addFields({
        name: `${report.reporter.avatar} ${report.reporter.name} • ${time}`,
        value: `**${report.headline}**\n${report.details}`,
        inline: false
      });
    }
  }
  
  // Pagination and navigation
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mock_news_page_${page - 1}`)
      .setLabel('← Newer')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId('mock_news_refresh')
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`mock_news_page_${page + 1}`)
      .setLabel('Older →')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1)
  );
  
  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mock_nav_dashboard')
      .setLabel('Dashboard')
      .setEmoji('🏠')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mock_nav_league')
      .setLabel('League Hub')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return {
    embeds: [embed],
    components: [navRow, backRow]
  };
}

/**
 * Generate and post a breaking news announcement to a channel
 */
export async function postBreakingNews(client, guildId, channelId, transaction, league) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;
  
  const report = generateNewsReport(transaction, league);
  
  const embed = new EmbedBuilder()
    .setColor(0xFF0000) // Red for breaking news
    .setTitle(`🚨 BREAKING NEWS 🚨`)
    .setDescription(`**${report.reporter.avatar} ${report.reporter.name}**\n\n${report.headline}`)
    .addFields({
      name: 'Details',
      value: report.details,
      inline: false
    })
    .setTimestamp()
    .setFooter({ text: 'Mock Offseason • Breaking News' });
  
  await channel.send({ embeds: [embed] });
}

/**
 * Handle news feed button interactions
 */
export async function handleNewsAction(interaction) {
  const customId = interaction.customId;
  const league = await getMockLeague(interaction.guildId);
  
  if (!league) {
    return interaction.reply({ content: '❌ No league exists.', ephemeral: true });
  }
  
  if (customId === 'mock_nav_news' || customId === 'mock_news_refresh') {
    const feed = await buildNewsFeed(interaction, league);
    return interaction.update(feed);
  }
  
  if (customId.startsWith('mock_news_page_')) {
    const page = parseInt(customId.split('_').pop());
    const feed = await buildNewsFeed(interaction, league, Math.max(0, page));
    return interaction.update(feed);
  }
  
  return interaction.reply({ content: '❌ Unknown news action.', ephemeral: true });
}
