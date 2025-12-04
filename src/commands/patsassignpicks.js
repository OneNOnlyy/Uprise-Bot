import { 
  SlashCommandBuilder, 
  PermissionFlagsBits,
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { getActiveSession, savePick, getUserPicks } from '../utils/patsData.js';
import { getTeamAbbreviation } from '../utils/oddsApi.js';

export const data = new SlashCommandBuilder()
  .setName('patsassignpicks')
  .setDescription('Assign picks on behalf of a user (Admin only)')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('The user to assign picks for')
      .setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

/**
 * Show the game selection menu for assigning picks
 */
export async function showGameSelection(interaction, targetUser) {
  const session = getActiveSession();
  
  if (!session) {
    await interaction.editReply({
      content: '❌ No active PATS session.',
      components: []
    });
    return;
  }
  
  // Get user's existing picks
  const userPicks = getUserPicks(session.id, targetUser.id);
  
  // Filter games that haven't started yet
  const availableGames = session.games.filter(game => {
    if (game.result?.isFinal || game.result?.isLive) {
      return false;
    }
    const gameTime = new Date(game.commenceTime);
    return gameTime > new Date();
  });
  
  if (availableGames.length === 0) {
    await interaction.editReply({
      content: '❌ No games available for picks (all games have started or finished).',
      components: []
    });
    return;
  }
  
  // Create game options
  const gameOptions = availableGames.map(game => {
    const gameTime = new Date(game.commenceTime);
    const timeStr = gameTime.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      timeZone: 'America/Los_Angeles',
      timeZoneName: 'short'
    });
    
    // Check if user already has a pick for this game
    const existingPick = userPicks.find(p => p.gameId === game.id);
    const pickIndicator = existingPick ? ` ✓ (${existingPick.pick})` : '';
    
    return {
      label: `${game.awayTeam} @ ${game.homeTeam}${pickIndicator}`,
      description: `${timeStr} - Select to assign pick`,
      value: game.id
    };
  });
  
  const embed = new EmbedBuilder()
    .setTitle(`🏀 Assign Picks for ${targetUser.username}`)
    .setDescription(`Select a game to assign a pick for **${targetUser.username}**`)
    .setColor('#5865F2')
    .addFields({
      name: '📊 Current Picks',
      value: userPicks.length > 0 
        ? userPicks.map(p => `${p.pick} (Game ${p.gameId})`).join('\n')
        : 'No picks yet'
    });
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`pats_assign_select_game_${targetUser.id}`)
    .setPlaceholder('Select a game')
    .addOptions(gameOptions.slice(0, 25)); // Discord max 25 options
  
  const row1 = new ActionRowBuilder().addComponents(selectMenu);
  
  const row2 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('pats_assign_cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [row1, row2]
  });
}

/**
 * Show team selection for a specific game
 */
export async function showTeamSelection(interaction, targetUserId, gameId) {
  const session = getActiveSession();
  
  if (!session) {
    await interaction.editReply({
      content: '❌ No active PATS session.',
      components: []
    });
    return;
  }
  
  const game = session.games.find(g => g.id === gameId);
  if (!game) {
    await interaction.editReply({
      content: '❌ Game not found.',
      components: []
    });
    return;
  }
  
  // Fix spreads if needed
  let homeSpread = game.homeSpread !== undefined ? game.homeSpread : 0;
  let awaySpread = game.awaySpread !== undefined ? game.awaySpread : 0;
  
  if (homeSpread !== 0 && awaySpread === 0) {
    awaySpread = -homeSpread;
  } else if (awaySpread !== 0 && homeSpread === 0) {
    homeSpread = -awaySpread;
  }
  
  const gameTime = new Date(game.commenceTime);
  const timeStr = gameTime.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'short'
  });
  
  const awayAbbr = getTeamAbbreviation(game.awayTeam);
  const homeAbbr = getTeamAbbreviation(game.homeTeam);
  
  const awaySpreadDisplay = awaySpread > 0 ? `+${awaySpread}` : awaySpread.toString();
  const homeSpreadDisplay = homeSpread > 0 ? `+${homeSpread}` : homeSpread.toString();
  
  const targetUser = await interaction.guild.members.fetch(targetUserId);
  
  const embed = new EmbedBuilder()
    .setTitle(`🏀 Select Team for ${targetUser.user.username}`)
    .setDescription(`**${game.awayTeam} @ ${game.homeTeam}**\n${timeStr}`)
    .setColor('#5865F2')
    .addFields(
      {
        name: `${awayAbbr} ${game.awayTeam}`,
        value: `Spread: **${awaySpreadDisplay}**`,
        inline: true
      },
      {
        name: `${homeAbbr} ${game.homeTeam}`,
        value: `Spread: **${homeSpreadDisplay}**`,
        inline: true
      }
    );
  
  const row1 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`pats_assign_pick_${targetUserId}_${gameId}_away`)
        .setLabel(`Pick ${awayAbbr} ${awaySpreadDisplay}`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`pats_assign_pick_${targetUserId}_${gameId}_home`)
        .setLabel(`Pick ${homeAbbr} ${homeSpreadDisplay}`)
        .setStyle(ButtonStyle.Primary)
    );
  
  const row2 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`pats_assign_back_${targetUserId}`)
        .setLabel('Back to Games')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.editReply({
    embeds: [embed],
    components: [row1, row2]
  });
}

/**
 * Process the pick assignment
 */
export async function assignPick(interaction, targetUserId, gameId, team) {
  const session = getActiveSession();
  
  if (!session) {
    await interaction.editReply({
      content: '❌ No active PATS session.',
      components: []
    });
    return;
  }
  
  const game = session.games.find(g => g.id === gameId);
  if (!game) {
    await interaction.editReply({
      content: '❌ Game not found.',
      components: []
    });
    return;
  }
  
  // Check if game has started
  const gameTime = new Date(game.commenceTime);
  if (gameTime <= new Date() || game.result?.isLive || game.result?.isFinal) {
    await interaction.editReply({
      content: '❌ This game has already started or finished.',
      components: []
    });
    return;
  }
  
  const teamName = team === 'away' ? game.awayTeam : game.homeTeam;
  const spread = team === 'away' ? game.awaySpread : game.homeSpread;
  
  // Make the pick on behalf of the user (savePick allows overriding existing picks)
  const result = savePick(session.id, targetUserId, gameId, teamName, spread);
  
  if (result.error) {
    await interaction.editReply({
      content: `❌ ${result.error}`,
      components: []
    });
    return;
  }
  
  const targetUser = await interaction.guild.members.fetch(targetUserId);
  
  await interaction.editReply({
    content: `✅ Pick assigned for **${targetUser.user.username}**: ${teamName} (${spread > 0 ? '+' : ''}${spread})`,
    embeds: [],
    components: []
  });
  
  // Show game selection again after 2 seconds
  setTimeout(async () => {
    await showGameSelection(interaction, targetUser.user);
  }, 2000);
}

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    const session = getActiveSession();
    if (!session) {
      await interaction.editReply({
        content: '❌ No active PATS session. Start one with `/patsstart`.',
      });
      return;
    }
    
    const targetUser = interaction.options.getUser('user');
    
    // Show game selection menu
    await showGameSelection(interaction, targetUser);
    
  } catch (error) {
    console.error('Error executing patsassignpicks command:', error);
    await interaction.editReply({
      content: '❌ An error occurred while processing the command.',
    });
  }
}
