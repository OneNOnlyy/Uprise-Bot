export async function fetchCBSSportsScores(date = null) {
  try {
    const dateStr = date ? new Date(date).toISOString().split('T')[0].replace(/-/g, '') : new Date().toISOString().split('T')[0].replace(/-/g, '');
    const url = CBS_SCOREBOARD_URL;

    console.log(`🏀 Fetching scores from CBS Sports for ${dateStr}...`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      console.error(`CBS Sports fetch failed: ${response.status}`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract game IDs from embedded script
    let gameIds = [];
    $('script').each((i, script) => {
      const scriptContent = $(script).html();
      if (scriptContent && scriptContent.includes('live-app-params')) {
        const gameAbbrMatch = scriptContent.match(/"gameAbbr":"([^"]+)"/);
        if (gameAbbrMatch) {
          const gameAbbr = gameAbbrMatch[1];
          gameIds = gameAbbr.split('|').filter(id => id.includes(dateStr));
        }
      }
    });

    console.log(`📋 Found ${gameIds.length} games for ${dateStr}`);

    if (gameIds.length === 0) {
      console.log('⚠️ No games found for this date on CBS Sports');
      return [];
    }

    // Fetch scores for each game from gametracker pages
    const games = [];

    for (const gameId of gameIds) {
      try {
        // Parse game ID: NBA_YYYYMMDD_AWAY@HOME
        const parts = gameId.split('_');
        if (parts.length < 3) continue;

        const matchup = parts[2];
        const [awayTeam, homeTeam] = matchup.split('@');

        // Fetch game details
        const gametrackerUrl = `${CBS_GAMETRACKER_URL}${gameId}`;
        const gameResponse = await fetch(gametrackerUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (!gameResponse.ok) {
          console.log(`⚠️ Could not fetch gametracker for ${awayTeam} @ ${homeTeam}`);
          continue;
        }

        const gameHtml = await gameResponse.text();
        const $game = cheerio.load(gameHtml);

        // Extract scores - CBS uses various selectors
        let awayScore = null;
        let homeScore = null;
        let status = 'Scheduled';

        // Try to find scores in the HTML
        const scoreElements = $game('[class*="score"]').toArray();
        const scores = scoreElements
          .map(el => $game(el).text().trim())
          .filter(text => /^\d+$/.test(text))
          .map(text => parseInt(text, 10));

        if (scores.length >= 2) {
          awayScore = scores[0];
          homeScore = scores[1];
        }

        // Determine game status more accurately
        // Check for INPROGRESS-status class which indicates live game
        const isInProgress = $game('body').attr('class')?.includes('INPROGRESS-status') || false;

        // Check for FINAL-status class
        const isGameFinal = $game('body').attr('class')?.includes('FINAL-status') || false;

        // Look for combined status like "3rd 9:53" in the HTML
        let combinedStatus = '';
        const bodyText = $game('body').text();
        const timeMatch = bodyText.match(/(\d+(?:st|nd|rd|th))\s+(\d+:\d+)/);
        if (timeMatch) {
          combinedStatus = `${timeMatch[1]} ${timeMatch[2]}`;
        }

        // Determine status based on game state
        if (isGameFinal) {
          status = 'Final';
        } else if (isInProgress && combinedStatus) {
          // Use the combined status like "3rd 9:53"
          status = combinedStatus;
        } else if (isInProgress) {
          status = 'Live';
        } else {
          status = 'Scheduled';
        }

        // Determine if game is final or live
        const isFinal = status === 'Final';
        const isLive = (isInProgress || (awayScore !== null && homeScore !== null)) && !isFinal;

        games.push({
          id: gameId,
          awayTeam,
          homeTeam,
          awayScore,
          homeScore,
          status,
          isFinal,
          isLive
        });

        console.log(`  ✅ ${awayTeam} ${awayScore || '-'} @ ${homeTeam} ${homeScore || '-'} (${status})`);

        // Small delay to avoid overwhelming CBS servers
        await new Promise(resolve => setTimeout(resolve, 300));

      } catch (error) {
        console.error(`Error fetching game ${gameId}:`, error.message);
      }
    }

    console.log(`✅ Fetched ${games.length} games with scores from CBS Sports`);
    return games;

  } catch (error) {
    console.error('Error fetching CBS Sports scores:', error);
    return [];
  }
}