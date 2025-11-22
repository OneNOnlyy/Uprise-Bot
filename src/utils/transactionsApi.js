import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

/**
 * Fetch and parse NBA transactions from official NBA website
 */
export async function fetchNBATransactions() {
  try {
    const url = 'https://www.nba.com/players/transactions';
    
    console.log('🔍 Fetching NBA transactions...');
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      console.error(`❌ Failed to fetch transactions: ${response.status}`);
      return [];
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const transactions = [];
    
    // Find transaction elements - adjust selectors based on actual page structure
    // The NBA site likely has a table or list of transactions
    $('.Transactions_transaction__').each((index, element) => {
      try {
        const $el = $(element);
        const date = $el.find('.Transactions_date__').text().trim();
        const description = $el.find('.Transactions_description__').text().trim();
        const team = $el.find('.Transactions_team__').text().trim();
        
        if (description && date) {
          transactions.push({
            date,
            description,
            team: team || 'Multiple Teams',
            timestamp: new Date().toISOString()
          });
        }
      } catch (err) {
        console.error('Error parsing transaction element:', err);
      }
    });
    
    // Fallback: Try alternative selectors if first approach fails
    if (transactions.length === 0) {
      $('article, .transaction-item, [data-transaction], tr').each((index, element) => {
        try {
          const $el = $(element);
          const text = $el.text().trim();
          
          // Look for date patterns (e.g., "Nov 22, 2025" or "11/22/2025")
          const dateMatch = text.match(/([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/);
          
          if (dateMatch && text.length > 20) {
            // Extract team names (common NBA team patterns)
            const teamMatch = text.match(/(Lakers|Warriors|Celtics|Heat|Nets|Knicks|76ers|Bucks|Raptors|Bulls|Cavaliers|Pistons|Pacers|Magic|Hawks|Hornets|Wizards|Mavericks|Rockets|Grizzlies|Pelicans|Spurs|Thunder|Trail Blazers|Jazz|Nuggets|Timberwolves|Kings|Clippers|Suns)/i);
            
            transactions.push({
              date: dateMatch[1],
              description: text,
              team: teamMatch ? teamMatch[1] : 'NBA',
              timestamp: new Date().toISOString()
            });
          }
        } catch (err) {
          console.error('Error parsing fallback transaction:', err);
        }
      });
    }
    
    console.log(`✅ Found ${transactions.length} transactions`);
    return transactions;
    
  } catch (error) {
    console.error('❌ Error fetching NBA transactions:', error);
    return [];
  }
}

/**
 * Parse transaction type from description
 */
export function getTransactionType(description) {
  const lowerDesc = description.toLowerCase();
  
  if (lowerDesc.includes('signed') || lowerDesc.includes('signs')) {
    return { type: 'Signing', emoji: '✍️', color: 0x00FF00 };
  }
  if (lowerDesc.includes('waived') || lowerDesc.includes('released')) {
    return { type: 'Waived', emoji: '❌', color: 0xFF0000 };
  }
  if (lowerDesc.includes('traded') || lowerDesc.includes('trade')) {
    return { type: 'Trade', emoji: '🔄', color: 0x0099FF };
  }
  if (lowerDesc.includes('assigned') || lowerDesc.includes('recalled')) {
    return { type: 'G League', emoji: '🏀', color: 0xFFA500 };
  }
  if (lowerDesc.includes('injured') || lowerDesc.includes('il') || lowerDesc.includes('injury')) {
    return { type: 'Injury', emoji: '🏥', color: 0xFF6B6B };
  }
  if (lowerDesc.includes('activated') || lowerDesc.includes('return')) {
    return { type: 'Activated', emoji: '✅', color: 0x00AA00 };
  }
  if (lowerDesc.includes('suspended') || lowerDesc.includes('suspension')) {
    return { type: 'Suspension', emoji: '⚠️', color: 0xFFCC00 };
  }
  
  return { type: 'Transaction', emoji: '📋', color: 0x808080 };
}

/**
 * Extract player name from transaction description
 */
export function extractPlayerName(description) {
  // Try to find player name patterns
  // Usually in format "Team signed PlayerName" or "PlayerName traded to"
  const patterns = [
    /signed\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
    /waived\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
    /traded\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
    /([A-Z][a-z]+\s+[A-Z][a-z]+)\s+(?:signed|waived|traded)/i,
  ];
  
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}
