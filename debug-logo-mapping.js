import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function mapAllTeamLogos() {
  try {
    const url = 'https://www.cbssports.com/nba/injuries/';
    console.log('Mapping all CBS team logo IDs...\n');

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const html = await response.text();
    const $ = cheerio.load(html);

    // For each table, get logo ID and identify team from player names
    const idMapping = {};
    
    $('table').each((tableIndex, table) => {
      const $table = $(table);
      
      // Get logo ID
      let logoId = null;
      let $parent = $table.parent();
      for (let i = 0; i < 5; i++) {
        $parent = $parent.parent();
        if (!$parent.length) break;
        
        const $logo = $parent.find('img[alt="team logo"]').first();
        if ($logo.length) {
          const logoSrc = $logo.attr('src') || '';
          const match = logoSrc.match(/team-logos\/(\d+)\.svg/);
          if (match) {
            logoId = match[1];
            break;
          }
        }
      }
      
      if (!logoId) return;
      
      // Get first player name
      const firstRow = $table.find('tr').eq(1);
      const firstPlayer = firstRow.find('td').eq(0).text().trim();
      
      // Map well-known players to teams
      const playerTeamMap = {
        // Grizzlies
        'Luke Kennard': 'MEM', 'Ja Morant': 'MEM', 'Desmond Bane': 'MEM',
        // Celtics
        'Neemias Queta': 'BOS', 'Jayson Tatum': 'BOS', 'Jaylen Brown': 'BOS',
        // Mavericks
        'Ben Saraf': 'DAL', 'Luka Doncic': 'DAL', 'Kyrie Irving': 'DAL',
        // Hornets
        'Brandon Miller': 'CHA', 'Lamelo Ball': 'CHA', 'Miles Bridges': 'CHA',
        // Suns
        'Dalen Terry': 'PHO', 'Kevin Durant': 'PHO', 'Devin Booker': 'PHO',
        // Bucks
        'Chris Livingston': 'MIL', 'Giannis Antetokounmpo': 'MIL', 'Damian Lillard': 'MIL',
        // Magic
        'Brandon Williams': 'ORL', 'Paolo Banchero': 'ORL', 'Franz Wagner': 'ORL',
        // Pacers
        'Julian Strawther': 'IND', 'Tyrese Haliburton': 'IND', 'Myles Turner': 'IND',
        // Pistons
        'Bobi Klintman': 'DET', 'Cade Cunningham': 'DET', 'Jaden Ivey': 'DET',
        // Raptors
        'Al Horford': 'TOR', 'RJ Barrett': 'TOR', 'Scottie Barnes': 'TOR',
        // Wizards
        'Steven Adams': 'WAS', 'Jordan Poole': 'WAS', 'Kyle Kuzma': 'WAS',
        // Heat
        'Jordan Miller': 'MIA', 'Tyler Herro': 'MIA', 'Jimmy Butler': 'MIA',
        // Hawks
        'Deandre Ayton': 'ATL', 'Trae Young': 'ATL', 'Dejounte Murray': 'ATL',
        // Jazz
        'Jaren Jackson Jr.': 'UTA', 'Lauri Markkanen': 'UTA', 'Collin Sexton': 'UTA',
        // Pelicans
        'Tyler Herro': 'NOP', 'Zion Williamson': 'NOP', 'Brandon Ingram': 'NOP',
        // Nets
        'Giannis Antetokounmpo': 'BKN', 'Cameron Johnson': 'BKN', 'Nic Claxton': 'BKN',
        // Knicks
        'Terrence Shannon Jr.': 'NYK', 'Jalen Brunson': 'NYK', 'Karl-Anthony Towns': 'NYK',
        // Cavaliers
        'Jordan Poole': 'CLE', 'Darius Garland': 'CLE', 'Donovan Mitchell': 'CLE',
        // Nuggets
        'Landry Shamet': 'DEN', 'Nikola Jokic': 'DEN', 'Jamal Murray': 'DEN',
        // Warriors
        'Wendell Carter Jr.': 'GSW', 'Stephen Curry': 'GSW', 'Draymond Green': 'GSW',
        // Rockets
        'J Edgecombe': 'HOU', 'VJ Edgecombe': 'HOU', 'Alperen Sengun': 'HOU',
        // Clippers
        'Rasheer Fleming': 'LAC', 'Kawhi Leonard': 'LAC', 'James Harden': 'LAC',
        // Lakers
        'Robert Williams III': 'LAL', 'LeBron James': 'LAL', 'Anthony Davis': 'LAL',
        // Timberwolves
        'Domantas Sabonis': 'MIN', 'Anthony Edwards': 'MIN', 'Rudy Gobert': 'MIN',
        // Thunder
        'Dylan Harper': 'OKC', 'Shai Gilgeous-Alexander': 'OKC', 'Jalen Williams': 'OKC',
        // Kings
        'J Barrett': 'SAC', 'RJ Barrett': 'SAC', 'Domantas Sabonis': 'SAC', 'De\'Aaron Fox': 'SAC',
        // Spurs
        'Georges Niang': 'SAS', 'Victor Wembanyama': 'SAS', 'Devin Vassell': 'SAS',
        // Bulls
        'Marvin Bagley III': 'CHI', 'Zach LaVine': 'CHI', 'Nikola Vucevic': 'CHI',
        // Trail Blazers
        'Robert Williams III': 'POR', 'Scoot Henderson': 'POR', 'Shaedon Sharpe': 'POR', 'Anfernee Simons': 'POR',
        // 76ers
        'Joel Embiid': 'PHI', 'VJ Edgecombe': 'PHI', 'Tyrese Maxey': 'PHI', 'Paul George': 'PHI'
      };
      
      // Get clean player name
      let cleanPlayer = firstPlayer;
      const spaceIndex = firstPlayer.indexOf(' ');
      if (spaceIndex >= 0) {
        const firstPart = firstPlayer.substring(0, spaceIndex);
        const secondPart = firstPlayer.substring(spaceIndex + 1);
        
        if (/^[A-Z]\./.test(firstPart)) {
          cleanPlayer = secondPart;
        }
      }
      
      const team = playerTeamMap[cleanPlayer];
      if (team && !idMapping[logoId]) {
        idMapping[logoId] = team;
        console.log(`ID ${logoId} = ${team} (from player: ${cleanPlayer})`);
      }
    });
    
    console.log('\n\nFinal mapping object:');
    console.log('const CBS_ID_TO_ABBR = {');
    const entries = Object.entries(idMapping).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
    const chunks = [];
    for (let i = 0; i < entries.length; i += 6) {
      const chunk = entries.slice(i, i + 6).map(([id, team]) => `'${id}': '${team}'`).join(', ');
      chunks.push(`  ${chunk}`);
    }
    console.log(chunks.join(',\n'));
    console.log('};');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

mapAllTeamLogos();
