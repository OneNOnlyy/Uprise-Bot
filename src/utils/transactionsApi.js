import fetch from 'node-fetch';

/**
 * Fetch and parse NBA transactions from ESPN API
 * @param {number} retryCount - Number of retries attempted
 */
export async function fetchNBATransactions(retryCount = 0) {
  const maxRetries = 2;
  
  try {
    // Use ESPN's transactions API which is much more reliable
    const url = 'http://site.api.espn.com/apis/site/v2/sports/basketball/nba/transactions';
    
    console.log(`🔍 Fetching NBA transactions from ESPN API... (attempt ${retryCount + 1}/${maxRetries + 1})`);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    const response = await fetch(url, {
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      console.error(`❌ Failed to fetch transactions: ${response.status}`);
      
      // Retry on server errors
      if (response.status >= 500 && retryCount < maxRetries) {
        console.log(`⏳ Retrying in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        return fetchNBATransactions(retryCount + 1);
      }
      
      return [];
    }
    
    const data = await response.json();
    
    if (!data.transactions || !Array.isArray(data.transactions)) {
      console.error('❌ Invalid response format from ESPN API');
      return [];
    }
    
    const transactions = [];
    
    for (const transaction of data.transactions) {
      try {
        // Parse the date from ISO format
        const date = new Date(transaction.date);
        const dateStr = date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'America/Los_Angeles'
        });
        
        transactions.push({
          date: dateStr,
          description: transaction.description,
          team: transaction.team?.displayName || 'NBA',
          teamAbbr: transaction.team?.abbreviation || null,
          timestamp: transaction.date
        });
      } catch (err) {
        console.error('Error parsing transaction:', err);
      }
    }
    
    console.log(`✅ Found ${transactions.length} transactions from ESPN API`);
    return transactions;
    
  } catch (error) {
    // Handle timeout and network errors
    if (error.name === 'AbortError') {
      console.error('⏱️ Request timed out after 15 seconds');
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
      console.error('🌐 Network timeout or connection reset');
    } else {
      console.error('❌ Error fetching NBA transactions:', error.message || error);
    }
    
    // Retry on network errors
    if (retryCount < maxRetries && (error.name === 'AbortError' || error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET')) {
      console.log(`⏳ Retrying in 5 seconds... (${retryCount + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      return fetchNBATransactions(retryCount + 1);
    }
    
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
