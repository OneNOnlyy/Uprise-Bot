import { SlashCommandBuilder, PermissionFlagsBits, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType, EmbedBuilder } from 'discord.js';
import { getUpcomingBlazersGames, formatGameInfo } from '../utils/nbaApi.js';

export const data = new SlashCommandBuilder()
  .setName('uprise')
  .setDescription('Uprise Bot commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('gamethread')
      .setDescription('Create a game thread for an upcoming Trail Blazers game')
  );

/**
 * Check if user has the required role or permissions
 */
function hasPermission(interaction) {
  const member = interaction.member;
  const modRoleId = process.env.MODERATOR_ROLE_ID;
  
  // Check if user is administrator
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }
  
  // Check if user has the moderator role
  if (modRoleId && member.roles.cache.has(modRoleId)) {
    return true;
  }
  
  return false;
}

/**
 * Announce in main chat that a game thread has been created
 */
async function announceGameThreadCreated(client, gameInfo, threadId) {
  try {
    const mainChatId = process.env.MAIN_CHAT_CHANNEL_ID;
    if (!mainChatId) {
      console.log('ℹ️ MAIN_CHAT_CHANNEL_ID not set, skipping announcement');
      return;
    }

    const mainChat = await client.channels.fetch(mainChatId);
    if (!mainChat) {
      console.error('Could not find main chat channel');
      return;
    }

    const message = `🏀 **Game Thread Created!**\n\n` +
                   `** ${gameInfo.awayTeam} @ ${gameInfo.homeTeam}**\n` +
                   `📅 ${gameInfo.gameDate} • 🕐 ${gameInfo.gameTime}\n\n` +
                   `Head over to <#${threadId}> to discuss the game! 🔥`;

    await mainChat.send(message);
    console.log('✅ Announced game thread creation in main chat');
  } catch (error) {
    console.error('Error announcing game thread:', error);
  }
}

/**
 * Get NBA team logo URL from ESPN CDN (PNG format for Discord compatibility)
 */
function getTeamLogoUrl(teamAbbreviation) {
  // ESPN provides reliable PNG logos that work well with Discord
  const teamMapping = {
    'ATL': 'atl',
    'BOS': 'bos',
    'BKN': 'bkn',
    'CHA': 'cha',
    'CHI': 'chi',
    'CLE': 'cle',
    'DAL': 'dal',
    'DEN': 'den',
    'DET': 'det',
    'GSW': 'gs',
    'HOU': 'hou',
    'IND': 'ind',
    'LAC': 'lac',
    'LAL': 'lal',
    'MEM': 'mem',
    'MIA': 'mia',
    'MIL': 'mil',
    'MIN': 'min',
    'NOP': 'no',
    'NYK': 'ny',
    'OKC': 'okc',
    'ORL': 'orl',
    'PHI': 'phi',
    'PHX': 'phx',
    'POR': 'por',
    'SAC': 'sac',
    'SAS': 'sa',
    'TOR': 'tor',
    'UTA': 'utah',
    'WAS': 'wsh'
  };
  
  const espnAbbr = teamMapping[teamAbbreviation];
  if (!espnAbbr) return null;
  
  return `https://a.espncdn.com/i/teamlogos/nba/500/${espnAbbr}.png`;
}

/**
 * Create a game thread in the specified channel (supports both Forum and Text channels)
 */
async function createGameThread(interaction, gameInfo) {
  try {
    const channelId = process.env.GAME_THREAD_CHANNEL_ID;
    const channel = await interaction.client.channels.fetch(channelId);
    
    if (!channel) {
      return { success: false, message: 'Could not find the configured game thread channel.' };
    }

    // Create thread title
    const threadTitle = `🏀  ${gameInfo.awayTeam} @ ${gameInfo.homeTeam} - ${gameInfo.gameDate}`;
    
    // Get opponent logo
    const opponentTeam = gameInfo.isHomeGame ? gameInfo.awayTeam : gameInfo.homeTeam;
    const opponentLogoUrl = getTeamLogoUrl(opponentTeam);
    
    // Create embed with opponent logo
    const embed = new EmbedBuilder()
      .setTitle(` ${gameInfo.awayTeam} @ ${gameInfo.homeTeam}`)
      .setDescription(`**Rip City!** 🌹 Let's go Blazers! Discuss the game here!`)
      .addFields(
        { name: '📅 Date', value: gameInfo.gameDate, inline: true },
        { name: '🕐 Tip-off', value: gameInfo.gameTime, inline: true },
        { name: '📍 Location', value: gameInfo.location, inline: true },
        { name: '🏟️ Opponent', value: gameInfo.opponent, inline: false }
      )
      .setColor(0xE03A3E); // Trail Blazers red
    
    if (opponentLogoUrl) {
      embed.setThumbnail(opponentLogoUrl);
    }

    let thread;
    
    // Check if the channel is a forum channel
    if (channel.isThreadOnly()) {
      // Forum channel - create a forum post with embed
      thread = await channel.threads.create({
        name: threadTitle,
        message: { embeds: [embed] },
        autoArchiveDuration: 1440, // 24 hours
        reason: `Manual game thread creation by ${interaction.user.tag}`
      });
    } else {
      // Regular text channel - send embed and create thread
      const message = await channel.send({ embeds: [embed] });
      thread = await message.startThread({
        name: threadTitle,
        autoArchiveDuration: 1440, // 24 hours
        reason: `Manual game thread creation by ${interaction.user.tag}`
      });
    }

    return { 
      success: true, 
      message: `Game thread created: ${thread.toString()}`,
      threadId: thread.id 
    };
  } catch (error) {
    console.error('Error creating game thread:', error);
    return { success: false, message: `Error creating thread: ${error.message}` };
  }
}

export async function execute(interaction) {
  // Check if user has permission
  if (!hasPermission(interaction)) {
    await interaction.reply({
      content: '❌ You do not have permission to use this command. This command is restricted to Moderator Team and Administrators.',
      ephemeral: true
    });
    return;
  }

  // Defer immediately to prevent timeout (within 3 seconds)
  await interaction.deferReply();

  try {
    console.log('📊 Fetching upcoming games...');
    
    // Fetch upcoming games with a timeout
    const games = await Promise.race([
      getUpcomingBlazersGames(14),
      new Promise((resolve) => setTimeout(() => resolve([]), 10000)) // 10 second timeout
    ]);
    
    console.log(`📊 Found ${games ? games.length : 0} games`);
    
    if (!games || games.length === 0) {
      await interaction.editReply({
        content: '❌ No upcoming Trail Blazers games found in the next 14 days.',
      });
      return;
    }

    // Format games for display
    console.log('📊 Formatting games...');
    const formattedGames = games.map(game => formatGameInfo(game)).filter(g => g !== null);
    console.log(`📊 Formatted ${formattedGames.length} games`);
    
    if (formattedGames.length === 0) {
      await interaction.editReply({
        content: '❌ Could not format game information. Please try again later.',
      });
      return;
    }

    // Create select menu options (max 25)
    const options = formattedGames.slice(0, 25).map((gameInfo, index) => {
      const label = ` ${gameInfo.awayTeam} @ ${gameInfo.homeTeam}`;
      const description = `${gameInfo.gameDate} at ${gameInfo.gameTime} (${gameInfo.location})`;
      
      console.log(`Dropdown option ${index}: ${label} - ${description}`);
      
      return new StringSelectMenuOptionBuilder()
        .setLabel(label)
        .setDescription(description)
        .setValue(String(index))
        .setEmoji('🏀');
    });

    // Create select menu
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('game_select')
      .setPlaceholder('Select a game to create a thread for')
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    // Send select menu
    const response = await interaction.editReply({
      content: `**Select a game to create a thread for:**\n\nFound ${formattedGames.length} upcoming Trail Blazers game(s).`,
      components: [row],
    });

    // Wait for selection
    try {
      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60000, // 60 seconds
        filter: (i) => i.user.id === interaction.user.id
      });

      collector.on('collect', async (selectInteraction) => {
        const selectedIndex = parseInt(selectInteraction.values[0]);
        const selectedGame = formattedGames[selectedIndex];

        await selectInteraction.deferUpdate();

        // Create the thread
        const result = await createGameThread(interaction, selectedGame);

        if (result.success) {
          // Announce in main chat that the game thread was created
          await announceGameThreadCreated(interaction.client, selectedGame, result.threadId);
          
          await interaction.editReply({
            content: `✅ ${result.message}\n\n**Game Details:**\n- Matchup:  ${selectedGame.awayTeam} @ ${selectedGame.homeTeam}\n- Date: ${selectedGame.gameDate}\n- Location: ${selectedGame.location}\n- Tip-off: ${selectedGame.gameTime}`,
            components: []
          });
        } else {
          await interaction.editReply({
            content: `❌ ${result.message}`,
            components: []
          });
        }

        collector.stop();
      });

      collector.on('end', (collected, reason) => {
        if (reason === 'time') {
          interaction.editReply({
            content: '⏱️ Game selection timed out. Please run the command again.',
            components: []
          }).catch(console.error);
        }
      });

    } catch (error) {
      console.error('Error handling selection:', error);
      await interaction.editReply({
        content: '❌ An error occurred while processing your selection.',
        components: []
      });
    }

  } catch (error) {
    console.error('Error executing gamethread command:', error);
    await interaction.editReply({
      content: '❌ An error occurred while fetching upcoming games. Check the bot logs for details.',
    }).catch(err => console.error('Failed to edit reply:', err));
  }
}

