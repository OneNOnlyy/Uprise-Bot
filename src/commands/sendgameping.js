import { SlashCommandBuilder, PermissionFlagsBits, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder } from 'discord.js';
import { getUpcomingBlazersGames, formatGameInfo } from '../utils/nbaApi.js';

export const data = new SlashCommandBuilder()
  .setName('sendgameping')
  .setDescription('Manually send the game ping for a selected game (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const roleId = process.env.GAME_PING_ROLE_ID;
    const gameThreadChannelId = process.env.GAME_THREAD_CHANNEL_ID;
    
    if (!roleId || !gameThreadChannelId) {
      await interaction.editReply('❌ GAME_PING_ROLE_ID or GAME_THREAD_CHANNEL_ID not configured.');
      return;
    }

    // Get games (include yesterday to catch today's games that may have started)
    const games = await getUpcomingBlazersGames(14, true);
    
    if (!games || games.length === 0) {
      await interaction.editReply('❌ No games found. The API may be experiencing issues or there are no scheduled games in the next 14 days.');
      return;
    }

    // Filter to only show games that haven't finished yet
    const now = new Date();
    const availableGames = games.filter(game => {
      const gameTime = new Date(game.status);
      // Show games that are in the future or within the last 4 hours (likely still ongoing)
      return (gameTime.getTime() > now.getTime() - (4 * 60 * 60 * 1000));
    });

    if (availableGames.length === 0) {
      await interaction.editReply('❌ No upcoming or current games found.');
      return;
    }

    // Create select menu options for each game
    const options = availableGames.map((game, index) => {
      const gameInfo = formatGameInfo(game);
      const gameDate = new Date(game.status);
      const dateStr = gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });
      const timeStr = gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });
      
      return new StringSelectMenuOptionBuilder()
        .setLabel(`${gameInfo.awayTeam} @ ${gameInfo.homeTeam}`)
        .setDescription(`${dateStr} at ${timeStr} PT`)
        .setValue(index.toString());
    });

    // Create select menu
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('game_select_for_ping')
      .setPlaceholder('Select a game...')
      .addOptions(options);

    const actionRow = new ActionRowBuilder().addComponents(selectMenu);

    // Send the select menu
    await interaction.editReply({
      content: '🏀 Select which game to send the ping for:',
      components: [actionRow],
    });

    // Wait for the user to select a game (5 minute timeout)
    const filter = (i) => i.user.id === interaction.user.id && i.customId === 'game_select_for_ping';
    const collected = await interaction.channel.awaitMessageComponent({ filter, time: 300000 });

    const selectedGameIndex = parseInt(collected.values[0]);
    const selectedGame = availableGames[selectedGameIndex];
    const selectedGameInfo = formatGameInfo(selectedGame);

    // Defer the select menu interaction
    await collected.deferUpdate();

    // Send the ping in the game thread channel
    await sendGamePingToChannel(interaction.client, selectedGame, selectedGameInfo, roleId, gameThreadChannelId);

    // Reply to the user
    await interaction.editReply({
      content: `✅ Game ping sent for **${selectedGameInfo.awayTeam} @ ${selectedGameInfo.homeTeam}**`,
      components: [],
    });

  } catch (error) {
    console.error('Error executing sendgameping command:', error);
    await interaction.editReply({
      content: '❌ An error occurred while sending the game ping.',
      components: [],
    });
  }
}

/**
 * Send game ping to the game thread channel
 */
async function sendGamePingToChannel(client, game, gameInfo, roleId, gameThreadChannelId) {
  try {
    const gameThreadChannel = await client.channels.fetch(gameThreadChannelId);
    if (!gameThreadChannel) {
      console.error('Game thread channel not found');
      return;
    }

    // Get Unix timestamp for Discord relative time
    const gameDate = new Date(game.status);
    const gameUnixTime = Math.floor(gameDate.getTime() / 1000);
    const gameTimestamp = `<t:${gameUnixTime}:R>`;

    // Try to find the game thread
    let threadId = null;
    if (gameThreadChannel.isThreadOnly && gameThreadChannel.isThreadOnly()) {
      const threads = await gameThreadChannel.threads.fetchActive();
      const todayThread = threads.threads.find(thread => 
        thread.name.includes(gameInfo.awayTeam) || 
        thread.name.includes(gameInfo.homeTeam)
      );
      
      if (todayThread) {
        threadId = todayThread.id;
      }
    }

    // Determine where to send the ping
    let targetChannel = gameThreadChannel;
    if (threadId) {
      // If we found a game thread, send to that thread
      targetChannel = await client.channels.fetch(threadId);
    }

    if (!targetChannel || !targetChannel.send) {
      console.error('Target channel is not valid');
      return;
    }

    // Create and send the ping message
    const pingMessage = `<@&${roleId}> 🏀 **Game Starting Soon!**\n\n` +
                       `Portland Trail Blazers vs ${gameInfo.opponent}\n` +
                       `${gameInfo.location} • Tip-off at ${gameTimestamp}!\n\n` +
                       `Get ready for tip-off! 🔥`;

    await targetChannel.send(pingMessage);
    console.log(`✅ Sent game ping for ${gameInfo.awayTeam} @ ${gameInfo.homeTeam}`);

  } catch (error) {
    console.error('Error sending game ping to channel:', error);
  }
}
