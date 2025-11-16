import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getUpcomingBlazersGames, formatGameInfo } from '../utils/nbaApi.js';

export const data = new SlashCommandBuilder()
  .setName('testping')
  .setDescription('Test the game ping notification (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const roleId = process.env.GAME_PING_ROLE_ID;
    const mainChatId = process.env.MAIN_CHAT_CHANNEL_ID;
    
    if (!roleId) {
      await interaction.editReply('❌ GAME_PING_ROLE_ID not configured in environment variables.');
      return;
    }

    // Get next upcoming game
    const games = await getUpcomingBlazersGames(7);
    
    let opponent, location, gameTimestamp, awayTeam, homeTeam, gameUnixTime;
    
    if (games && games.length > 0) {
      const nextGame = formatGameInfo(games[0]);
      opponent = nextGame.opponent;
      location = nextGame.location;
      awayTeam = nextGame.awayTeam;
      homeTeam = nextGame.homeTeam;
      
      // Get Unix timestamp for Discord relative time
      const gameDate = new Date(games[0].status);
      gameUnixTime = Math.floor(gameDate.getTime() / 1000);
      gameTimestamp = `<t:${gameUnixTime}:R>`; // Relative time format (e.g., "in 5 minutes")
    } else {
      // Use placeholder data if no games found
      opponent = 'Los Angeles Lakers';
      location = '🏠 Home';
      gameTimestamp = '7:00 PM';
      awayTeam = 'Los Angeles Lakers';
      homeTeam = 'Portland Trail Blazers';
    }
    
    // Send test ping message in current channel (without actually pinging the role)
    const pingMessage = `@Game Ping Role 🏀 **Game Starting Soon!**\n\n` +
                       `Portland Trail Blazers vs ${opponent}\n` +
                       `${location} • Tip-off at ${gameTimestamp}!\n\n` +
                       `Get ready for tip-off! 🔥\n\n` +
                       `_This is a test ping from /testping command (role ping disabled for testing)_`;
    
    await interaction.channel.send(pingMessage);
    
    // Send test message to current channel (not main chat)
    const mainChatMessage = `🏀 **Game Time!**\n\n` +
                           `The **${awayTeam} @ ${homeTeam}** game is starting!\n\n` +
                           `Please move all game discussion to the game thread 🔥\n\n` +
                           `_This is a test message from /testping command (what would be sent to main chat)_`;
    
    await interaction.channel.send(mainChatMessage);
    await interaction.editReply('✅ Test ping sent! Both messages are above in this channel.');
    
  } catch (error) {
    console.error('Error executing testping command:', error);
    await interaction.editReply('❌ An error occurred while sending the test ping.');
  }
}
