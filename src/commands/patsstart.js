import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getFormattedGamesForDate } from '../utils/oddsApi.js';
import { createPATSSession, getActiveSession } from '../utils/patsData.js';
import { getCachedGames, prefetchMatchupInfo } from '../utils/dataCache.js';

export const data = new SlashCommandBuilder()
  .setName('patsstart')
  .setDescription('Start a Picks Against The Spread session (Admin only)')
  .addStringOption(option =>
    option.setName('date')
      .setDescription('Date for games (YYYY-MM-DD, default: today)')
      .setRequired(false))
  .addRoleOption(option =>
    option.setName('participant_role')
      .setDescription('Role to DM for participation (default: @everyone)')
      .setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    // Check if there's already an active session
    const existingSession = getActiveSession();
    if (existingSession) {
      await interaction.editReply({
        content: '❌ There is already an active PATS session. Please close it before starting a new one.',
      });
      return;
    }

    // Get date parameter or use today
    const dateParam = interaction.options.getString('date');
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    const dateStr = targetDate.toISOString().split('T')[0];
    
    // Get games for the date - use cached data for better performance
    console.log(`📊 Fetching games for PATS session on ${dateStr}...`);
    let games;
    
    // If requesting today's games, use cache
    const today = new Date().toISOString().split('T')[0];
    if (dateStr === today) {
      console.log('[PATS] Using cached games for today');
      games = await getCachedGames();
    } else {
      // For other dates, fetch directly
      console.log('[PATS] Fetching games for specific date:', dateStr);
      games = await getFormattedGamesForDate(dateStr);
    }
    
    if (!games || games.length === 0) {
      await interaction.editReply({
        content: `❌ No NBA games found for ${dateStr}. Try a different date.`,
      });
      return;
    }

    // Get participant role
    const participantRole = interaction.options.getRole('participant_role');
    
    // Create session
    const participants = participantRole ? [participantRole.id] : [];
    const session = createPATSSession(dateStr, games, participants);
    
    console.log(`✅ Created PATS session ${session.id} with ${games.length} games`);
    
    // Prefetch matchup info for all games to warm up the cache
    // This runs in the background and doesn't block the announcement
    prefetchMatchupInfo(games).catch(err => {
      console.error('[PATS] Error prefetching matchup info:', err);
    });

    // Create announcement embed
    const embed = new EmbedBuilder()
      .setTitle('🏀 Picks Against The Spread - LIVE!')
      .setDescription(`**${games.length} NBA games** available for picks today!`)
      .setColor(0xE03A3E)
      .addFields(
        { name: '📅 Date', value: dateStr, inline: true },
        { name: '🎮 Games Available', value: games.length.toString(), inline: true },
        { name: '\u200B', value: '\u200B', inline: true }
      )
      .addFields({
        name: '📋 How to Play',
        value: '1️⃣ Use `/makepick` to see games and odds\n2️⃣ View injuries, records, and spreads\n3️⃣ Pick the team you think will cover the spread\n4️⃣ Check the leaderboard with `/patsleaderboard`',
        inline: false
      })
      .setFooter({ text: '🎯 Make your picks before tip-off!' })
      .setTimestamp();

    // Add game list
    const gamesList = games.slice(0, 10).map(game => {
      const favoredTeam = game.favored === 'home' ? game.homeTeam : game.awayTeam;
      const spread = game.favored === 'home' ? game.homeSpread : game.awaySpread;
      return `**✈️ ${game.awayTeam}** @ **${game.homeTeam}**\n🎯 ${favoredTeam} ${spread}\n🕐 ${game.timeString}`;
    }).join('\n\n');
    
    embed.addFields({
      name: '🏀 Today\'s Games',
      value: gamesList + (games.length > 10 ? `\n\n*...and ${games.length - 10} more*` : ''),
      inline: false
    });

    // Send to channel
    const channel = interaction.channel;
    await channel.send({ 
      content: participantRole ? `${participantRole}` : '@here',
      embeds: [embed] 
    });

    // DM participants
    let dmCount = 0;
    if (participantRole) {
      try {
        const members = await interaction.guild.members.fetch();
        const roleMembers = members.filter(member => member.roles.cache.has(participantRole.id));
        
        for (const [, member] of roleMembers) {
          try {
            const dmEmbed = new EmbedBuilder()
              .setTitle('🏀 PATS is Live!')
              .setDescription(`Picks Against The Spread is now open for **${dateStr}**!`)
              .setColor(0xE03A3E)
              .addFields({
                name: '📋 How to Participate',
                value: `Head to ${channel} and use \`/makepick\` to make your picks!`,
                inline: false
              })
              .addFields({
                name: '⏰ Deadline',
                value: 'Make your picks before each game starts!',
                inline: false
              });

            await member.send({ embeds: [dmEmbed] });
            dmCount++;
          } catch (dmError) {
            console.log(`Could not DM ${member.user.tag}`);
          }
        }
      } catch (error) {
        console.error('Error sending DMs:', error);
      }
    }

    await interaction.editReply({
      content: `✅ **PATS Session Started!**\n\n` +
               `📊 ${games.length} games loaded\n` +
               `📨 ${dmCount} participants notified\n` +
               `🆔 Session ID: ${session.id}`,
    });

  } catch (error) {
    console.error('Error executing patsstart command:', error);
    await interaction.editReply({
      content: '❌ An error occurred while starting the PATS session.',
    });
  }
}
