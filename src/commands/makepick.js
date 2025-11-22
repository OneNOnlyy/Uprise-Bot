import { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { getActiveSession, savePick, getUserPicks } from '../utils/patsData.js';
import { getMatchupInfo, formatInjuries } from '../utils/espnApi.js';

export const data = new SlashCommandBuilder()
  .setName('makepick')
  .setDescription('Make your picks against the spread');

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    // Check for active session
    const session = getActiveSession();
    if (!session) {
      await interaction.editReply({
        content: '❌ No active PATS session. Wait for an admin to start one with `/patsstart`.',
      });
      return;
    }

    // Get user's existing picks
    const userPicks = getUserPicks(session.id, interaction.user.id);
    const pickedGameIds = userPicks.map(p => p.gameId);

    // Create main menu embed
    const embed = new EmbedBuilder()
      .setTitle('🏀 Picks Against The Spread')
      .setDescription('Select a game below to view details and make your pick!')
      .setColor(0xE03A3E)
      .addFields({
        name: '📊 Your Progress',
        value: `Picks Made: **${userPicks.length}/${session.games.length}**`,
        inline: false
      })
      .setFooter({ text: 'Select a game from the dropdown below' });

    // Create game selection menu
    const options = session.games.map((game, index) => {
      const hasPicked = pickedGameIds.includes(game.id);
      const gameTime = new Date(game.commenceTime);
      const isPast = gameTime < new Date();
      
      return new StringSelectMenuOptionBuilder()
        .setLabel(`${game.awayTeam} @ ${game.homeTeam}`)
        .setDescription(`${gameTime.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' })} PT ${hasPicked ? '✅ Picked' : ''}`)
        .setValue(game.id)
        .setEmoji(hasPicked ? '✅' : '🏀');
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('pats_game_select')
      .setPlaceholder('Choose a game to view details...')
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });

  } catch (error) {
    console.error('Error executing makepick command:', error);
    await interaction.editReply({
      content: '❌ An error occurred while loading the PATS menu.',
    });
  }
}

/**
 * Handle game selection and show detailed view
 */
export async function handleGameSelection(interaction) {
  try {
    await interaction.deferUpdate();

    const session = getActiveSession();
    if (!session) {
      await interaction.editReply({
        content: '❌ Session ended.',
        components: []
      });
      return;
    }

    const gameId = interaction.values[0];
    const game = session.games.find(g => g.id === gameId);
    
    if (!game) {
      await interaction.editReply({
        content: '❌ Game not found.',
        components: []
      });
      return;
    }

    // Fetch matchup info (injuries, records)
    console.log(`Fetching matchup info for ${game.awayTeam} @ ${game.homeTeam}...`);
    const matchupInfo = await getMatchupInfo(game.homeTeam, game.awayTeam);

    // Create detailed game embed
    const embed = new EmbedBuilder()
      .setTitle(`🏀 ${game.awayTeam} @ ${game.homeTeam}`)
      .setColor(0xE03A3E)
      .setTimestamp();

    // Game time
    const gameTime = new Date(game.commenceTime);
    embed.addFields({
      name: '🕐 Tip-Off',
      value: gameTime.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short'
      }),
      inline: false
    });

    // Away Team Info
    if (matchupInfo?.away) {
      const awayInfo = matchupInfo.away;
      embed.addFields({
        name: `🔵 ${game.awayTeam}`,
        value: `**Record:** ${awayInfo.record}\n**Spread:** ${game.spreadDisplay.away}`,
        inline: true
      });
      
      if (awayInfo.logo) {
        embed.setThumbnail(awayInfo.logo);
      }
    } else {
      embed.addFields({
        name: `🔵 ${game.awayTeam}`,
        value: `**Spread:** ${game.spreadDisplay.away}`,
        inline: true
      });
    }

    // Home Team Info
    if (matchupInfo?.home) {
      const homeInfo = matchupInfo.home;
      embed.addFields({
        name: `🏠 ${game.homeTeam}`,
        value: `**Record:** ${homeInfo.record}\n**Spread:** ${game.spreadDisplay.home}`,
        inline: true
      });
    } else {
      embed.addFields({
        name: `🏠 ${game.homeTeam}`,
        value: `**Spread:** ${game.spreadDisplay.home}`,
        inline: true
      });
    }

    // Spread explanation
    const favoredTeam = game.favored === 'home' ? game.homeTeam : game.awayTeam;
    const favoredSpread = game.favored === 'home' ? game.homeSpread : game.awaySpread;
    
    embed.addFields({
      name: '📊 The Spread',
      value: `**${favoredTeam}** is favored by **${Math.abs(favoredSpread)} points**\n\n` +
             `Pick ${game.homeTeam}: They must win by more than ${Math.abs(game.homeSpread)} points\n` +
             `Pick ${game.awayTeam}: They must ${game.awaySpread > 0 ? 'win or lose by less than' : 'win by more than'} ${Math.abs(game.awaySpread)} points`,
      inline: false
    });

    // Check if user already picked this game
    const userPicks = getUserPicks(session.id, interaction.user.id);
    const existingPick = userPicks.find(p => p.gameId === gameId);
    
    if (existingPick) {
      const pickedTeam = existingPick.pick === 'home' ? game.homeTeam : game.awayTeam;
      embed.addFields({
        name: '✅ Your Current Pick',
        value: `**${pickedTeam}** (${existingPick.spread > 0 ? '+' : ''}${existingPick.spread})`,
        inline: false
      });
    }

    // Create pick buttons
    const pickButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`pats_pick_${gameId}_away`)
        .setLabel(`Pick ${game.awayTeam} ${game.spreadDisplay.away}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔵'),
      new ButtonBuilder()
        .setCustomId(`pats_pick_${gameId}_home`)
        .setLabel(`Pick ${game.homeTeam} ${game.spreadDisplay.home}`)
        .setStyle(ButtonStyle.Success)
        .setEmoji('🏠')
    );

    // Create info buttons
    const infoButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`pats_injuries_${gameId}`)
        .setLabel('View Injuries')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🏥'),
      new ButtonBuilder()
        .setCustomId(`pats_matchup_${gameId}`)
        .setLabel('Full Matchup Info')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📊'),
      new ButtonBuilder()
        .setCustomId('pats_back_to_menu')
        .setLabel('Back to Games')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('◀️')
    );

    await interaction.editReply({
      embeds: [embed],
      components: [pickButtons, infoButtons]
    });

  } catch (error) {
    console.error('Error handling game selection:', error);
    await interaction.editReply({
      content: '❌ Error loading game details.',
      components: []
    });
  }
}

/**
 * Handle pick submission
 */
export async function handlePickSubmission(interaction) {
  try {
    const session = getActiveSession();
    if (!session) {
      await interaction.reply({
        content: '❌ Session ended.',
        ephemeral: true
      });
      return;
    }

    const [, , gameId, pick] = interaction.customId.split('_');
    const game = session.games.find(g => g.id === gameId);
    
    if (!game) {
      await interaction.reply({
        content: '❌ Game not found.',
        ephemeral: true
      });
      return;
    }

    // Check if game has started
    const gameTime = new Date(game.commenceTime);
    if (gameTime < new Date()) {
      await interaction.reply({
        content: '❌ This game has already started! You cannot change your pick.',
        ephemeral: true
      });
      return;
    }

    // Save the pick
    const spread = pick === 'home' ? game.homeSpread : game.awaySpread;
    savePick(session.id, interaction.user.id, gameId, pick, spread);

    const pickedTeam = pick === 'home' ? game.homeTeam : game.awayTeam;
    
    await interaction.reply({
      content: `✅ **Pick Saved!**\n\nYou picked **${pickedTeam}** ${spread > 0 ? '+' : ''}${spread}\n\nGood luck! 🍀`,
      ephemeral: true
    });

  } catch (error) {
    console.error('Error handling pick submission:', error);
    await interaction.reply({
      content: '❌ Error saving pick.',
      ephemeral: true
    });
  }
}

/**
 * Handle back to menu button
 */
export async function handleBackToMenu(interaction) {
  // Re-execute the main command
  await execute(interaction);
}

/**
 * Handle view injuries button
 */
export async function handleViewInjuries(interaction) {
  try {
    await interaction.deferUpdate();

    const session = getActiveSession();
    if (!session) {
      await interaction.editReply({
        content: '❌ Session ended.',
        components: []
      });
      return;
    }

    const gameId = interaction.customId.split('_')[2];
    const game = session.games.find(g => g.id === gameId);
    
    if (!game) {
      await interaction.followUp({
        content: '❌ Game not found.',
        ephemeral: true
      });
      return;
    }

    // Fetch injury info
    const matchupInfo = await getMatchupInfo(game.homeTeam, game.awayTeam);

    const embed = new EmbedBuilder()
      .setTitle(`🏥 Injury Report: ${game.awayTeam} @ ${game.homeTeam}`)
      .setColor(0xFF0000)
      .setTimestamp();

    // Away team injuries
    if (matchupInfo?.away?.injuries) {
      const awayInjuries = formatInjuries(matchupInfo.away.injuries);
      embed.addFields({
        name: `🔵 ${game.awayTeam} Injuries`,
        value: awayInjuries,
        inline: false
      });
    } else {
      embed.addFields({
        name: `🔵 ${game.awayTeam} Injuries`,
        value: 'No injury data available',
        inline: false
      });
    }

    // Home team injuries
    if (matchupInfo?.home?.injuries) {
      const homeInjuries = formatInjuries(matchupInfo.home.injuries);
      embed.addFields({
        name: `🏠 ${game.homeTeam} Injuries`,
        value: homeInjuries,
        inline: false
      });
    } else {
      embed.addFields({
        name: `🏠 ${game.homeTeam} Injuries`,
        value: 'No injury data available',
        inline: false
      });
    }

    const backButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`pats_back_to_game_${gameId}`)
        .setLabel('Back to Game')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('◀️')
    );

    await interaction.editReply({
      embeds: [embed],
      components: [backButton]
    });

  } catch (error) {
    console.error('Error viewing injuries:', error);
    await interaction.followUp({
      content: '❌ Error loading injury report.',
      ephemeral: true
    });
  }
}

/**
 * Handle view full matchup info button
 */
export async function handleViewMatchup(interaction) {
  try {
    await interaction.deferUpdate();

    const session = getActiveSession();
    if (!session) {
      await interaction.editReply({
        content: '❌ Session ended.',
        components: []
      });
      return;
    }

    const gameId = interaction.customId.split('_')[2];
    const game = session.games.find(g => g.id === gameId);
    
    if (!game) {
      await interaction.followUp({
        content: '❌ Game not found.',
        ephemeral: true
      });
      return;
    }

    // Fetch matchup info
    const matchupInfo = await getMatchupInfo(game.homeTeam, game.awayTeam);

    const embed = new EmbedBuilder()
      .setTitle(`📊 Full Matchup: ${game.awayTeam} @ ${game.homeTeam}`)
      .setColor(0x0099FF)
      .setTimestamp();

    const gameTime = new Date(game.commenceTime);
    embed.addFields({
      name: '🕐 Tip-Off',
      value: gameTime.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short'
      }),
      inline: false
    });

    // Away team full info
    if (matchupInfo?.away) {
      const awayInfo = matchupInfo.away;
      embed.addFields({
        name: `🔵 ${game.awayTeam}`,
        value: `**Record:** ${awayInfo.record}\n**Spread:** ${game.spreadDisplay.away}\n**Injuries:**\n${formatInjuries(awayInfo.injuries)}`,
        inline: false
      });
    }

    // Home team full info
    if (matchupInfo?.home) {
      const homeInfo = matchupInfo.home;
      embed.addFields({
        name: `🏠 ${game.homeTeam}`,
        value: `**Record:** ${homeInfo.record}\n**Spread:** ${game.spreadDisplay.home}\n**Injuries:**\n${formatInjuries(homeInfo.injuries)}`,
        inline: false
      });
    }

    // Spread explanation
    const favoredTeam = game.favored === 'home' ? game.homeTeam : game.awayTeam;
    const favoredSpread = game.favored === 'home' ? game.homeSpread : game.awaySpread;
    
    embed.addFields({
      name: '📈 Spread Breakdown',
      value: `**${favoredTeam}** is favored by **${Math.abs(favoredSpread)} points**`,
      inline: false
    });

    const backButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`pats_back_to_game_${gameId}`)
        .setLabel('Back to Game')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('◀️')
    );

    await interaction.editReply({
      embeds: [embed],
      components: [backButton]
    });

  } catch (error) {
    console.error('Error viewing matchup:', error);
    await interaction.followUp({
      content: '❌ Error loading matchup info.',
      ephemeral: true
    });
  }
}

/**
 * Handle back to game button (from injury/matchup views)
 */
export async function handleBackToGame(interaction) {
  const gameId = interaction.customId.split('_')[3];
  
  // Simulate game selection
  const fakeInteraction = {
    ...interaction,
    values: [gameId],
    deferUpdate: interaction.deferUpdate.bind(interaction),
    editReply: interaction.editReply.bind(interaction)
  };
  
  await handleGameSelection(fakeInteraction);
}
