import cron from 'node-cron';
import { EmbedBuilder } from 'discord.js';
import { fetchNBATransactions, getTransactionType, extractPlayerName } from '../utils/transactionsApi.js';
import { getConfig } from '../config/config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE = path.join(__dirname, '../../data/transactions-cache.json');

/**
 * Load cached transactions to avoid duplicates
 */
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading transaction cache:', error);
  }
  return { lastCheck: null, processedIds: [] };
}

/**
 * Save transaction cache
 */
function saveCache(cache) {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.error('Error saving transaction cache:', error);
  }
}

/**
 * Generate unique ID for transaction
 */
function generateTransactionId(transaction) {
  return `${transaction.date}_${transaction.description.substring(0, 50)}`.replace(/\s/g, '_');
}

/**
 * Check for new transactions and post them
 */
async function checkAndPostTransactions(client) {
  try {
    const config = getConfig();
    const transactionChannelId = config.transactionChannelId;
    
    if (!transactionChannelId) {
      return; // Channel not configured
    }
    
    const channel = await client.channels.fetch(transactionChannelId).catch(() => null);
    if (!channel) {
      console.error('❌ Transaction channel not found');
      return;
    }
    
    console.log('🔍 Checking for new NBA transactions...');
    
    const transactions = await fetchNBATransactions();
    
    // If fetch failed completely, skip this cycle
    if (!transactions || transactions.length === 0) {
      console.log('⏭️ No transactions fetched, skipping this cycle');
      return;
    }
    
    const cache = loadCache();
    const newTransactions = [];
    
    for (const transaction of transactions) {
      const id = generateTransactionId(transaction);
      
      if (!cache.processedIds.includes(id)) {
        newTransactions.push(transaction);
        cache.processedIds.push(id);
      }
    }
    
    // Keep only last 500 IDs to prevent cache from growing too large
    if (cache.processedIds.length > 500) {
      cache.processedIds = cache.processedIds.slice(-500);
    }
    
    cache.lastCheck = new Date().toISOString();
    saveCache(cache);
    
    if (newTransactions.length > 0) {
      console.log(`📋 Found ${newTransactions.length} new transaction(s)`);
      
      // Post each transaction (limit to 5 at a time to avoid spam)
      const transactionsToPost = newTransactions.slice(0, 5);
      
      for (const transaction of transactionsToPost) {
        await postTransaction(channel, transaction);
        // Wait 1 second between posts
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } else {
      console.log('✅ No new transactions');
    }
    
  } catch (error) {
    console.error('❌ Error checking transactions:', error);
  }
}

/**
 * Post a transaction to the channel
 */
async function postTransaction(channel, transaction) {
  try {
    const { type, emoji, color } = getTransactionType(transaction.description);
    const playerName = extractPlayerName(transaction.description);
    
    const embed = new EmbedBuilder()
      .setTitle(`${emoji} NBA Transaction: ${type}`)
      .setDescription(transaction.description)
      .setColor(color)
      .addFields(
        { name: '📅 Date', value: transaction.date, inline: true },
        { name: '🏀 Team', value: transaction.team, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'NBA Transactions' });
    
    if (playerName) {
      embed.addFields({ name: '👤 Player', value: playerName, inline: true });
    }
    
    await channel.send({ embeds: [embed] });
    console.log(`✅ Posted transaction: ${type} - ${transaction.team}`);
    
  } catch (error) {
    console.error('❌ Error posting transaction:', error);
  }
}

/**
 * Schedule transaction checking every 2 minutes
 */
export function scheduleTransactionFeed(client) {
  console.log('📅 Scheduling NBA transaction feed...');
  console.log('⏰ Will check every 2 minutes (24/7)');
  
  // Check every 2 minutes
  cron.schedule('*/2 * * * *', () => {
    checkAndPostTransactions(client);
  });
  
  // Run initial check after 10 seconds
  setTimeout(() => {
    const config = getConfig();
    if (config.transactionChannelId) {
      console.log('🚀 Running initial transaction check...');
      checkAndPostTransactions(client);
    }
  }, 10000);
}

/**
 * Manual transaction check (can be called by command)
 */
export async function manualTransactionCheck(client) {
  console.log('🔄 Manual transaction check initiated...');
  await checkAndPostTransactions(client);
}
