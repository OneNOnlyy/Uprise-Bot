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

    // Count available (not started) and locked games
    const now = new Date();
    const availableGames = session.games.filter(g => new Date(g.commenceTime) >= now);
    const lockedGames = session.games.filter(g => new Date(g.commenceTime) < now);
    const lockedGameIds = lockedGames.map(g => g.id);
    const missedPicks = lockedGames.filter(g => !pickedGameIds.includes(g.id)).length;

    // Create main menu embed
    const embed = new EmbedBuilder()
      .setTitle('🏀 Picks Against The Spread')
      .setDescription('Select a game below to view details and make your pick!')
      .setColor(0xE03A3E)
      .addFields({
        name: '📊 Your Progress',
        value: `Picks Made: **${userPicks.length}/${session.games.length}**${missedPicks > 0 ? `\n⚠️ Missed Picks: **${missedPicks}** (counted as losses)` : ''}`,
        inline: false
      })
      .setFooter({ text: 'Select a game from the dropdown below' });

    // Create game selection menu
    const options = session.games.map((game, index) => {
      const hasPicked = pickedGameIds.includes(game.id);
      const gameTime = new Date(game.commenceTime);
      const isLocked = gameTime < now;
      
      // Format time properly
      const dateStr = gameTime.toLocaleDateString('en-US', { 
        timeZone: 'America/Los_Angeles',
        month: 'numeric',
        day: 'numeric'
      });
      const timeStr = gameTime.toLocaleTimeString('en-US', { 
        timeZone: 'America/Los_Angeles',
        hour: 'numeric',
        minute: '2-digit'
      });
      
      let description = `${dateStr} ${timeStr} PT`;
      if (isLocked) {
        description += ' 🔒 LOCKED';
      } else if (hasPicked) {
        description += ' 📌 Picked';
      }
      
      return new StringSelectMenuOptionBuilder()
        .setLabel(`${game.awayTeam} @ ${game.homeTeam}`)
        .setDescription(description)
        .setValue(game.id)
        .setEmoji(isLocked ? '🔒' : (hasPicked ? '📌' : '🏀'));
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('pats_game_select')
      .setPlaceholder('Choose a game to view details...')
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    const components = [row];
    
    // Add "Back to Overview" button
    const backButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('pats_back_to_overview')
        .setLabel('Back to Overview')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('◀️')
    );
    components.push(backButton);

    await interaction.editReply({
      embeds: [embed],
      components: components
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
export async function handleGameSelection(interaction, gameIdOverride = null) {
  try {
    // Only defer if not already deferred
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }

    const session = getActiveSession();
    if (!session) {
      await interaction.editReply({
        content: '❌ Session ended.',
        components: []
      });
      return;
    }

    const gameId = gameIdOverride || interaction.values[0];
    const game = session.games.find(g => g.id === gameId);
    
    if (!game) {
      await interaction.editReply({
        content: '❌ Game not found.',
        components: []
      });
      return;
    }

    // Check if game has started (locked)
    const gameTime = new Date(game.commenceTime);
    const now = new Date();
    const isLocked = gameTime < now;

    // Fetch matchup info (injuries, records)
    console.log(`Fetching matchup info for ${game.awayTeam} @ ${game.homeTeam}...`);
    let matchupInfo = null;
    
    try {
      matchupInfo = await getMatchupInfo(game.homeTeam, game.awayTeam);
      console.log(`Matchup info result:`, matchupInfo ? 'Success' : 'Null');
    } catch (error) {
      console.error(`Error fetching matchup info:`, error);
      matchupInfo = { home: null, away: null };
    }

    if (!matchupInfo) {
      console.warn(`Matchup info is null, using fallback`);
      matchupInfo = { home: null, away: null };
    }

    // Ensure game has spreadDisplay
    if (!game.spreadDisplay) {
      console.warn(`Game missing spreadDisplay, creating default`);
      game.spreadDisplay = {
        home: game.homeSpread ? (game.homeSpread > 0 ? `+${game.homeSpread}` : game.homeSpread.toString()) : 'N/A',
        away: game.awaySpread ? (game.awaySpread > 0 ? `+${game.awaySpread}` : game.awaySpread.toString()) : 'N/A'
      };
    }

    // Create detailed game embed
    const embed = new EmbedBuilder()
      .setTitle(`🏀 ${game.awayTeam} @ ${game.homeTeam}`)
      .setColor(isLocked ? 0xFF0000 : 0xE03A3E)
      .setTimestamp();

    // Add locked warning if game has started
    if (isLocked) {
      embed.setDescription('🔒 **This game has started and is locked.**\nYou cannot make or change picks for this game.');
    }

    // Game time
    const formattedDate = gameTime.toLocaleDateString('en-US', {
      timeZone: 'America/Los_Angeles',
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
    const formattedTime = gameTime.toLocaleTimeString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      minute: '2-digit'
    });
    
    embed.addFields({
      name: '🕐 Tip-Off',
      value: `${formattedDate} at ${formattedTime} PT${isLocked ? ' 🔒' : ''}`,
      inline: false
    });

    // Away Team Info
    if (matchupInfo?.away) {
      const awayInfo = matchupInfo.away;
      embed.addFields({
        name: `� ${game.awayTeam}`,
        value: `**Record:** ${awayInfo.record}\n**Spread:** ${game.spreadDisplay.away}`,
        inline: true
      });
      
      if (awayInfo.logo) {
        embed.setThumbnail(awayInfo.logo);
      }
    } else {
      embed.addFields({
        name: `� ${game.awayTeam}`,
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
    const underdogTeam = game.favored === 'home' ? game.awayTeam : game.homeTeam;
    const spreadValue = Math.abs(game.homeSpread);
    
    // Determine if there's a half-point (no push possible)
    const hasHalfPoint = spreadValue % 1 !== 0;
    const pushText = hasHalfPoint ? '' : `\n\n*If the margin is exactly ${spreadValue} points, it's a push (no win/loss).*`;
    
    // Build clearer explanation
    let homeExplanation, awayExplanation;
    
    if (game.homeSpread < 0) {
      // Home is favored
      homeExplanation = `**${game.homeTeam}** (Favorite): Must win by more than ${spreadValue} points`;
      awayExplanation = `**${game.awayTeam}** (Underdog): Can lose by up to ${spreadValue} points, or win outright`;
    } else {
      // Away is favored
      homeExplanation = `**${game.homeTeam}** (Underdog): Can lose by up to ${spreadValue} points, or win outright`;
      awayExplanation = `**${game.awayTeam}** (Favorite): Must win by more than ${spreadValue} points`;
    }
    
    embed.addFields({
      name: '📊 How The Spread Works',
      value: `**${favoredTeam}** is favored by **${spreadValue} points**\n\n` +
             `${homeExplanation}\n${awayExplanation}${pushText}`,
      inline: false
    });

    // Check if user already picked this game
    const userPicks = getUserPicks(session.id, interaction.user.id);
    const existingPick = userPicks.find(p => p.gameId === gameId);
    const hasDoubleDown = userPicks.some(p => p.isDoubleDown);
    
    if (existingPick) {
      const pickedTeam = existingPick.pick === 'home' ? game.homeTeam : game.awayTeam;
      const ddText = existingPick.isDoubleDown ? ' 💰 **DOUBLE DOWN**' : '';
      embed.addFields({
        name: '✅ Your Current Pick',
        value: `**${pickedTeam}** (${existingPick.spread > 0 ? '+' : ''}${existingPick.spread})${ddText}${isLocked ? ' - Locked' : ''}`,
        inline: false
      });
    } else if (isLocked) {
      embed.addFields({
        name: '⚠️ No Pick Made',
        value: '**This game is locked.** This will count as an automatic loss.',
        inline: false
      });
    }

    // Create pick buttons (disabled if locked)
    const pickButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`pats_pick_${gameId}_away`)
        .setLabel(`Pick ${game.awayTeam} ${game.spreadDisplay.away}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✈️')
        .setDisabled(isLocked),
      new ButtonBuilder()
        .setCustomId(`pats_pick_${gameId}_home`)
        .setLabel(`Pick ${game.homeTeam} ${game.spreadDisplay.home}`)
        .setStyle(ButtonStyle.Success)
        .setEmoji('🏠')
        .setDisabled(isLocked)
    );

    // Create double-down button (disabled if locked or already used on another game)
    const ddButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`pats_set_doubledown_${gameId}`)
        .setLabel(existingPick?.isDoubleDown ? 'Double Down Active' : 'Use Double Down')
        .setStyle(existingPick?.isDoubleDown ? ButtonStyle.Success : ButtonStyle.Danger)
        .setEmoji('💰')
        .setDisabled(isLocked || (hasDoubleDown && !existingPick?.isDoubleDown))
    );

    // Create info buttons
    const infoButtons = new ActionRowBuilder().addComponents(
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
      components: [pickButtons, ddButtons, infoButtons]
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
    
    // Defer the update so we can edit the message
    await interaction.deferUpdate();
    
    // Get user's updated picks
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
      
      // Format time properly
      const dateStr = gameTime.toLocaleDateString('en-US', { 
        timeZone: 'America/Los_Angeles',
        month: 'numeric',
        day: 'numeric'
      });
      const timeStr = gameTime.toLocaleTimeString('en-US', { 
        timeZone: 'America/Los_Angeles',
        hour: 'numeric',
        minute: '2-digit'
      });
      
      return new StringSelectMenuOptionBuilder()
        .setLabel(`${game.awayTeam} @ ${game.homeTeam}`)
        .setDescription(`${dateStr} ${timeStr} PT ${hasPicked ? '📌 Picked' : ''}`)
        .setValue(game.id)
        .setEmoji(hasPicked ? '📌' : '🏀');
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('pats_game_select')
      .setPlaceholder('Choose a game to view details...')
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    const components = [row];
    
    // Add "Back to Overview" button
    const backButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('pats_back_to_overview')
        .setLabel('Back to Overview')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('◀️')
    );
    components.push(backButton);

    // Update the original message to show the main menu
    await interaction.editReply({
      embeds: [embed],
      components: components
    });

  } catch (error) {
    console.error('Error handling pick submission:', error);
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ Error saving pick.',
        ephemeral: true
      });
    } else {
      await interaction.followUp({
        content: '❌ Error saving pick.',
        ephemeral: true
      });
    }
  }
}

/**
 * Handle double-down toggle
 */
export async function handleDoubleDownToggle(interaction) {
  try {
    const session = getActiveSession();
    if (!session) {
      await interaction.reply({
        content: '❌ Session ended.',
        ephemeral: true
      });
      return;
    }

    const [, , gameId] = interaction.customId.split('_');
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
        content: '❌ This game has already started! You cannot modify your double-down.',
        ephemeral: true
      });
      return;
    }

    // Get user's picks
    const userPicks = getUserPicks(session.id, interaction.user.id);
    const existingPick = userPicks.find(p => p.gameId === gameId);
    
    if (!existingPick) {
      await interaction.reply({
        content: '❌ You must make a pick first before adding a double-down!',
        ephemeral: true
      });
      return;
    }

    // Toggle double-down
    const newDoubleDownState = !existingPick.isDoubleDown;
    const result = savePick(session.id, interaction.user.id, gameId, existingPick.pick, existingPick.spread, newDoubleDownState);
    
    if (result.error) {
      await interaction.reply({
        content: `❌ ${result.error}`,
        ephemeral: true
      });
      return;
    }

    await interaction.deferUpdate();
    
    // Refresh the game view to show updated double-down status
    await handleGameSelection(interaction, gameId);

  } catch (error) {
    console.error('Error handling double-down toggle:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ Error toggling double-down.',
        ephemeral: true
      });
    }
  }
}

/**
 * Handle setting double-down for a game (new golden button)
 */
export async function handleSetDoubleDown(interaction) {
  try {
    await interaction.deferUpdate();

    const session = getActiveSession();
    if (!session) {
      await interaction.followUp({
        content: '❌ Session ended.',
        ephemeral: true
      });
      return;
    }

    const gameId = interaction.customId.split('_')[3];
    const game = session.games.find(g => g.id === gameId);
    
    if (!game) {
      await interaction.followUp({
        content: '❌ Game not found.',
        ephemeral: true
      });
      return;
    }

    // Check if game has started
    const gameTime = new Date(game.commenceTime);
    if (gameTime < new Date()) {
      await interaction.followUp({
        content: '❌ This game has already started!',
        ephemeral: true
      });
      return;
    }

    // Get user's picks
    const userPicks = getUserPicks(session.id, interaction.user.id);
    const existingPick = userPicks.find(p => p.gameId === gameId);
    const hasDoubleDown = userPicks.some(p => p.isDoubleDown);
    
    // If already has double-down on this game, toggle it off
    if (existingPick?.isDoubleDown) {
      const result = savePick(session.id, interaction.user.id, gameId, existingPick.pick, existingPick.spread, false);
      
      if (result.error) {
        await interaction.followUp({
          content: `❌ ${result.error}`,
          ephemeral: true
        });
        return;
      }
      
      // Refresh the game view to show updated button state
      await handleGameSelection(interaction, gameId);
      return;
    }
    
    // If already has double-down on another game, show error
    if (hasDoubleDown) {
      await interaction.followUp({
        content: '❌ You already have a double-down active on another game! Remove it first.',
        ephemeral: true
      });
      return;
    }
    
    // If has a pick, add double-down to it
    if (existingPick) {
      const result = savePick(session.id, interaction.user.id, gameId, existingPick.pick, existingPick.spread, true);
      
      if (result.error) {
        await interaction.followUp({
          content: `❌ ${result.error}`,
          ephemeral: true
        });
        return;
      }
      
      // Refresh the game view to show updated button state
      await handleGameSelection(interaction, gameId);
      return;
    }
    
    // No pick made yet - just refresh view with DD ready indicator
    // The button will show as ready to use once they make a pick
    await handleGameSelection(interaction, gameId);

  } catch (error) {
    console.error('Error setting double-down:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.followUp({
        content: '❌ Error setting double-down.',
        ephemeral: true
      });
    }
  }
}

/**
 * Handle back to menu button
 */
export async function handleBackToMenu(interaction) {
  try {
    await interaction.deferUpdate();
    
    const session = getActiveSession();
    if (!session) {
      await interaction.editReply({
        content: '❌ No active PATS session.',
        components: []
      });
      return;
    }

    // Get user's existing picks
    const userPicks = getUserPicks(session.id, interaction.user.id);
    const pickedGameIds = userPicks.map(p => p.gameId);

    // Count available (not started) and locked games
    const now = new Date();
    const lockedGames = session.games.filter(g => new Date(g.commenceTime) < now);
    const missedPicks = lockedGames.filter(g => !pickedGameIds.includes(g.id)).length;

    // Create main menu embed
    const embed = new EmbedBuilder()
      .setTitle('🏀 Picks Against The Spread')
      .setDescription('Select a game below to view details and make your pick!')
      .setColor(0xE03A3E)
      .addFields({
        name: '📊 Your Progress',
        value: `Picks Made: **${userPicks.length}/${session.games.length}**${missedPicks > 0 ? `\n⚠️ Missed Picks: **${missedPicks}** (counted as losses)` : ''}`,
        inline: false
      })
      .setFooter({ text: 'Select a game from the dropdown below' });

    // Create game selection menu
    const options = session.games.map((game, index) => {
      const hasPicked = pickedGameIds.includes(game.id);
      const gameTime = new Date(game.commenceTime);
      const isLocked = gameTime < now;
      
      // Format time properly
      const dateStr = gameTime.toLocaleDateString('en-US', { 
        timeZone: 'America/Los_Angeles',
        month: 'numeric',
        day: 'numeric'
      });
      const timeStr = gameTime.toLocaleTimeString('en-US', { 
        timeZone: 'America/Los_Angeles',
        hour: 'numeric',
        minute: '2-digit'
      });
      
      let description = `${dateStr} ${timeStr} PT`;
      if (isLocked) {
        description += ' 🔒 LOCKED';
      } else if (hasPicked) {
        description += ' 📌 Picked';
      }
      
      return new StringSelectMenuOptionBuilder()
        .setLabel(`${game.awayTeam} @ ${game.homeTeam}`)
        .setDescription(description)
        .setValue(game.id)
        .setEmoji(isLocked ? '🔒' : (hasPicked ? '📌' : '🏀'));
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('pats_game_select')
      .setPlaceholder('Choose a game to view details...')
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    const components = [row];
    
    // Add "Back to Overview" button
    const backButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('pats_back_to_overview')
        .setLabel('Back to Overview')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('◀️')
    );
    components.push(backButton);

    await interaction.editReply({
      embeds: [embed],
      components: components
    });
    
  } catch (error) {
    console.error('Error handling back to menu:', error);
    await interaction.editReply({
      content: '❌ Error returning to menu.',
      components: []
    });
  }
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
        name: `� ${game.awayTeam} Injuries`,
        value: awayInjuries,
        inline: false
      });
    } else {
      embed.addFields({
        name: `� ${game.awayTeam} Injuries`,
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
    const formattedDate = gameTime.toLocaleDateString('en-US', {
      timeZone: 'America/Los_Angeles',
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
    const formattedTime = gameTime.toLocaleTimeString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      minute: '2-digit'
    });
    
    embed.addFields({
      name: '🕐 Tip-Off',
      value: `${formattedDate} at ${formattedTime} PT`,
      inline: false
    });

    // Away team full info
    if (matchupInfo?.away) {
      const awayInfo = matchupInfo.away;
      embed.addFields({
        name: `� ${game.awayTeam}`,
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
 * Handle viewing all user picks
 */
export async function handleViewMyPicks(interaction) {
  try {
    await interaction.deferUpdate();
    
    const session = getActiveSession();
    if (!session) {
      await interaction.editReply({
        content: '❌ No active PATS session found.',
        embeds: [],
        components: []
      });
      return;
    }

    const userPicks = getUserPicks(session.id, interaction.user.id);
    
    if (userPicks.length === 0) {
      await interaction.editReply({
        content: '❌ You haven\'t made any picks yet.',
        embeds: [],
        components: []
      });
      return;
    }

    // Build the picks overview embed
    const embed = new EmbedBuilder()
      .setColor('#1e90ff')
      .setTitle('📋 Your Picks Overview')
      .setDescription('Review all your picks for today\'s games.')
      .setTimestamp();

    const now = new Date();
    let lockedCount = 0;
    let wins = 0;
    let losses = 0;

    // Add each pick as a cleaner field
    for (const pick of userPicks) {
      const game = session.games.find(g => g.id === pick.gameId);
      if (game) {
        const gameTime = new Date(game.commenceTime);
        const isLocked = gameTime < now;
        if (isLocked) lockedCount++;
        
        const pickedTeam = pick.pick === 'home' ? game.homeTeam : game.awayTeam;
        const spreadText = pick.spread > 0 ? `+${pick.spread}` : pick.spread.toString();
        const otherTeam = pick.pick === 'home' ? game.awayTeam : game.homeTeam;
        
        // Format time properly
        const formattedDate = gameTime.toLocaleDateString('en-US', {
          timeZone: 'America/Los_Angeles',
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        });
        const formattedTime = gameTime.toLocaleTimeString('en-US', {
          timeZone: 'America/Los_Angeles',
          hour: 'numeric',
          minute: '2-digit'
        });
        
        let statusEmoji = isLocked ? '🔒' : '📌';  // 📌 for unlocked picks, 🔒 for locked pending
        let resultText = '';
        const ddEmoji = pick.isDoubleDown ? ' 💰' : '';
        
        // Check if game has result
        if (game.result && game.result.status === 'Final') {
          const homeScore = game.result.homeScore;
          const awayScore = game.result.awayScore;
          
          // Calculate if pick won against the spread
          // Correct logic: compare team's score + their spread vs opponent's score
          const awaySpread = game.awaySpread !== undefined ? game.awaySpread : 0;
          const homeSpread = game.homeSpread !== undefined ? game.homeSpread : 0;
          
          let pickWon = false;
          if (pick.pick === 'home') {
            // Home covers if: homeScore + homeSpread > awayScore
            pickWon = (homeScore + homeSpread) > awayScore;
          } else {
            // Away covers if: awayScore + awaySpread > homeScore
            pickWon = (awayScore + awaySpread) > homeScore;
          }
          
          if (pickWon) {
            statusEmoji = '✅';
            wins += pick.isDoubleDown ? 2 : 1;
            resultText = `\n**Result:** ✅ WIN${pick.isDoubleDown ? ' (DOUBLE DOWN x2)' : ''}`;
          } else {
            statusEmoji = '❌';
            losses += pick.isDoubleDown ? 2 : 1;
            resultText = `\n**Result:** ❌ LOSS${pick.isDoubleDown ? ' (DOUBLE DOWN x2)' : ''}`;
          }
          
          resultText += ` (${game.awayTeam} ${awayScore}, ${game.homeTeam} ${homeScore})`;
        }
        
        embed.addFields({
          name: `${statusEmoji} ${game.awayTeam} @ ${game.homeTeam}${ddEmoji}`,
          value: `**Pick:** ${pickedTeam} (${spreadText})${pick.isDoubleDown ? ' **DOUBLE DOWN**' : ''}\n**Time:** ${formattedDate} at ${formattedTime} PT${resultText}`,
          inline: true
        });
      }
    }

    // Check for missed picks on locked games
    const lockedGames = session.games.filter(g => new Date(g.commenceTime) < now);
    const pickedGameIds = userPicks.map(p => p.gameId);
    const missedPicks = lockedGames.filter(g => !pickedGameIds.includes(g.id));
    
    if (missedPicks.length > 0) {
      embed.addFields({
        name: '⚠️ Missed Picks',
        value: `You missed **${missedPicks.length}** game(s). These count as automatic losses.`,
        inline: false
      });
      losses += missedPicks.length;
    }

    // Update footer with record
    if (wins > 0 || losses > 0) {
      const pending = userPicks.length - wins - losses + missedPicks.length;
      embed.setFooter({ text: `Record: ${wins}-${losses} • ${pending} pending` });
    } else if (lockedCount > 0) {
      embed.setFooter({ text: `${lockedCount} locked • ${userPicks.length - lockedCount} can be changed` });
    } else {
      embed.setFooter({ text: 'All picks can still be changed' });
    }

    // Add back button - goes to overview (dashboard)
    const backButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('pats_back_to_overview')
        .setLabel('Back to Overview')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('◀️')
    );

    await interaction.editReply({
      embeds: [embed],
      components: [backButton]
    });
    
  } catch (error) {
    console.error('Error viewing picks:', error);
    await interaction.editReply({
      content: '❌ Error loading your picks.',
      embeds: [],
      components: []
    });
  }
}

/**
 * Handle back to game button (from injury/matchup views)
 */
export async function handleBackToGame(interaction) {
  try {
    // Extract gameId from customId: pats_back_to_game_{gameId}
    const parts = interaction.customId.split('_');
    const gameId = parts.slice(4).join('_'); // Handle gameIds with underscores
    
    // Create a modified interaction object that looks like a select menu interaction
    const modifiedInteraction = {
      ...interaction,
      values: [gameId],
      customId: 'pats_game_select',
      deferUpdate: async () => {
        if (!interaction.deferred && !interaction.replied) {
          return await interaction.deferUpdate();
        }
      },
      editReply: interaction.editReply.bind(interaction)
    };
    
    await handleGameSelection(modifiedInteraction);
    
  } catch (error) {
    console.error('Error handling back to game:', error);
    await interaction.editReply({
      content: '❌ Error returning to game.',
      components: []
    });
  }
}

/**
 * Handle makepick from dashboard - shows the game selection menu
 */
export async function handleMakepickFromDashboard(interaction) {
  try {
    const session = getActiveSession();
    if (!session) {
      await interaction.editReply({
        content: '❌ No active PATS session.',
        embeds: [],
        components: []
      });
      return;
    }

    // Get user's existing picks
    const userPicks = getUserPicks(session.id, interaction.user.id);
    const pickedGameIds = userPicks.map(p => p.gameId);

    // Count available (not started) and locked games
    const now = new Date();
    const lockedGames = session.games.filter(g => new Date(g.commenceTime) < now);
    const missedPicks = lockedGames.filter(g => !pickedGameIds.includes(g.id)).length;

    // Create main menu embed
    const embed = new EmbedBuilder()
      .setTitle('🏀 Picks Against The Spread')
      .setDescription('Select a game below to view details and make your pick!')
      .setColor(0xE03A3E)
      .addFields({
        name: '📊 Your Progress',
        value: `Picks Made: **${userPicks.length}/${session.games.length}**${missedPicks > 0 ? `\n⚠️ Missed Picks: **${missedPicks}** (counted as losses)` : ''}`,
        inline: false
      })
      .setFooter({ text: 'Select a game from the dropdown below' });

    // Create game selection menu
    const options = session.games.map((game, index) => {
      const hasPicked = pickedGameIds.includes(game.id);
      const gameTime = new Date(game.commenceTime);
      const isLocked = gameTime < now;
      
      // Format time properly
      const dateStr = gameTime.toLocaleDateString('en-US', { 
        timeZone: 'America/Los_Angeles',
        month: 'numeric',
        day: 'numeric'
      });
      const timeStr = gameTime.toLocaleTimeString('en-US', { 
        timeZone: 'America/Los_Angeles',
        hour: 'numeric',
        minute: '2-digit'
      });
      
      let description = `${dateStr} ${timeStr} PT`;
      if (isLocked) {
        description += ' 🔒 LOCKED';
      } else if (hasPicked) {
        description += ' 📌 Picked';
      }
      
      return new StringSelectMenuOptionBuilder()
        .setLabel(`${game.awayTeam} @ ${game.homeTeam}`)
        .setDescription(description)
        .setValue(game.id)
        .setEmoji(isLocked ? '🔒' : (hasPicked ? '📌' : '🏀'));
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('pats_game_select')
      .setPlaceholder('Choose a game to view details...')
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    const components = [row];
    
    // Add "Back to Overview" button
    const backButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('pats_back_to_overview')
        .setLabel('Back to Overview')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('◀️')
    );
    components.push(backButton);

    await interaction.editReply({
      embeds: [embed],
      components: components
    });
    
  } catch (error) {
    console.error('Error showing makepick from dashboard:', error);
    await interaction.editReply({
      content: '❌ An error occurred.',
      embeds: [],
      components: []
    });
  }
}

/**
 * Handle back to overview (dashboard) button
 */
export async function handleBackToOverview(interaction) {
  try {
    await interaction.deferUpdate();
    const patsCommand = await import('./pats.js');
    await patsCommand.showDashboard(interaction);
  } catch (error) {
    console.error('Error returning to overview:', error);
    await interaction.editReply({
      content: '❌ Error returning to overview.',
      embeds: [],
      components: []
    });
  }
}
