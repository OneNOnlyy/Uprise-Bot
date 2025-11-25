import { Client, GatewayIntentBits, Events, Collection } from 'discord.js';
import dotenv from 'dotenv';
import { initializeCache, startInjuryReportUpdates } from './utils/dataCache.js';
import { scheduleGameThreads } from './features/gameThreads.js';
import { scheduleGamePings } from './features/gamePing.js';
import { scheduleThreadLocking } from './features/lockThreads.js';
import { scheduleGameResultChecking } from './features/checkGameResults.js';
import { scheduleTransactionFeed } from './features/transactionFeed.js';
import * as gamethreadCommand from './commands/gamethread.js';
import * as testpingCommand from './commands/testping.js';
import * as sendgamepingCommand from './commands/sendgameping.js';
import * as configCommand from './commands/config.js';
import * as patsstartCommand from './commands/patsstart.js';
import * as makepickCommand from './commands/makepick.js';
import * as patsCommand from './commands/pats.js';
import * as patsleaderboardCommand from './commands/patsleaderboard.js';
import * as patsendCommand from './commands/patsend.js';
import * as patshistoryCommand from './commands/patshistory.js';
import * as patsreopenCommand from './commands/patsreopen.js';
import * as patsaddplayerCommand from './commands/patsaddplayer.js';
import * as patseditplayerCommand from './commands/patseditplayer.js';
import * as patsviewplayerCommand from './commands/patsviewplayer.js';
import * as patsdeleteplayerCommand from './commands/patsdeleteplayer.js';
import * as patsrefreshspreadsCommand from './commands/patsrefreshspreads.js';
import * as patsscheduleCommand from './commands/patsschedule.js';
import { showSettingsMenu, handleToggle } from './utils/userPreferences.js';
import { ensureUser } from './utils/patsData.js';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Setup commands collection
client.commands = new Collection();
client.commands.set(gamethreadCommand.data.name, gamethreadCommand);
client.commands.set(testpingCommand.data.name, testpingCommand);
client.commands.set(sendgamepingCommand.data.name, sendgamepingCommand);
client.commands.set(configCommand.data.name, configCommand);
client.commands.set(patsstartCommand.data.name, patsstartCommand);
client.commands.set(makepickCommand.data.name, makepickCommand);
client.commands.set(patsCommand.data.name, patsCommand);
client.commands.set(patsleaderboardCommand.data.name, patsleaderboardCommand);
client.commands.set(patsendCommand.data.name, patsendCommand);
client.commands.set(patshistoryCommand.data.name, patshistoryCommand);
client.commands.set(patsreopenCommand.data.name, patsreopenCommand);
client.commands.set(patsaddplayerCommand.data.name, patsaddplayerCommand);
client.commands.set(patseditplayerCommand.data.name, patseditplayerCommand);
client.commands.set(patsviewplayerCommand.data.name, patsviewplayerCommand);
client.commands.set(patsdeleteplayerCommand.data.name, patsdeleteplayerCommand);
client.commands.set(patsrefreshspreadsCommand.data.name, patsrefreshspreadsCommand);
client.commands.set(patsscheduleCommand.data.name, patsscheduleCommand);

client.once(Events.ClientReady, (readyClient) => {
  console.log(`✅ Uprise Bot is ready! Logged in as ${readyClient.user.tag}`);
  console.log(`🏀 Monitoring Portland Trail Blazers games...`);
  console.log(`⚡ Slash commands loaded: ${client.commands.size}`);
  
  // Initialize data cache system
  initializeCache();
  
  // Start automated injury report updates
  startInjuryReportUpdates();
  
  // Start the game thread scheduler
  scheduleGameThreads(client);
  
  // Start the game ping scheduler
  scheduleGamePings(client);
  
  // Start the thread locking scheduler
  scheduleThreadLocking(client);
  
  // Start the PATS game result checker
  scheduleGameResultChecking();
  
  // Start the NBA transaction feed
  scheduleTransactionFeed(client);
});

// Handle slash commands and interactions
client.on(Events.InteractionCreate, async (interaction) => {
  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error('Error executing command:', error);
      const errorMessage = { 
        content: '❌ There was an error executing this command!', 
        ephemeral: true 
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  }
  
  // Handle config menu interactions (select menus, buttons, modals)
  if (interaction.customId && interaction.customId.startsWith('config_')) {
    try {
      await configCommand.handleConfigInteraction(interaction);
    } catch (error) {
      console.error('Error handling config interaction:', error);
    }
  }
  
  // Handle PATS interactions (select menus, buttons)
  if (interaction.customId && interaction.customId.startsWith('pats_')) {
    try {
      // Update username on every interaction
      if (interaction.user) {
        const data = await import('./utils/patsData.js').then(m => m.loadPATSData());
        ensureUser(data, interaction.user.id, interaction.user.username);
        await import('./utils/patsData.js').then(m => m.savePATSData(data));
      }
      
      // Handle settings toggle buttons
      if (interaction.customId.startsWith('pats_toggle_') || interaction.customId === 'pats_settings_back') {
        if (interaction.customId === 'pats_settings_back') {
          await interaction.deferUpdate();
          await patsCommand.showDashboard(interaction);
        } else {
          await handleToggle(interaction);
        }
      }
      // Handle settings menu buttons
      else if (interaction.customId === 'pats_dashboard_settings' || interaction.customId === 'pats_no_session_settings') {
        await interaction.deferUpdate();
        await showSettingsMenu(interaction);
      }
      // Handle dashboard buttons (including stats and history)
      else if (interaction.customId.startsWith('pats_dashboard_') || 
          interaction.customId.startsWith('pats_stats_') ||
          interaction.customId.startsWith('pats_view_history') ||
          interaction.customId.startsWith('pats_history_') ||
          interaction.customId.startsWith('pats_help_') ||
          interaction.customId.startsWith('pats_no_session_')) {
        await patsCommand.handleDashboardButton(interaction);
      }
      // Handle player selection dropdown
      else if (interaction.customId === 'pats_player_select') {
        await patsCommand.handlePlayerSelection(interaction);
      }
      // Handle everyone's picks navigation
      else if (interaction.customId.startsWith('pats_everyone_picks_nav_')) {
        await patsCommand.handleEveryonePicksNavigation(interaction);
      }
      // Handle game selection dropdown
      else if (interaction.customId === 'pats_game_select') {
        await makepickCommand.handleGameSelection(interaction);
      }
      // Handle pick submission buttons
      else if (interaction.customId.startsWith('pats_pick_')) {
        await makepickCommand.handlePickSubmission(interaction);
      }
      // Handle double-down toggle
      else if (interaction.customId.startsWith('pats_doubledown_')) {
        await makepickCommand.handleDoubleDownToggle(interaction);
      }
      // Handle set double-down button
      else if (interaction.customId.startsWith('pats_set_doubledown_')) {
        await makepickCommand.handleSetDoubleDown(interaction);
      }
      // Handle remove double-down button
      else if (interaction.customId.startsWith('pats_remove_doubledown_')) {
        await makepickCommand.handleRemoveDoubleDown(interaction);
      }
      // Handle view matchup button
      else if (interaction.customId.startsWith('pats_matchup_')) {
        await makepickCommand.handleViewMatchup(interaction);
      }
      // Handle back to game button
      else if (interaction.customId.startsWith('pats_back_to_game_')) {
        await makepickCommand.handleBackToGame(interaction);
      }
      // Handle back to menu button
      else if (interaction.customId === 'pats_back_to_menu') {
        await makepickCommand.handleBackToMenu(interaction);
      }
      // Handle back to dashboard button
      else if (interaction.customId === 'pats_back_to_dashboard') {
        await makepickCommand.handleBackToDashboard(interaction);
      }
      // Handle navigation to specific game (previous/next)
      else if (interaction.customId.startsWith('pats_nav_game_')) {
        await makepickCommand.handleGameNavigation(interaction);
      }
      // Handle back to overview (dashboard) button
      else if (interaction.customId === 'pats_back_to_overview') {
        await makepickCommand.handleBackToOverview(interaction);
      }
      // Handle view my picks button
      else if (interaction.customId === 'pats_view_my_picks') {
        await makepickCommand.handleViewMyPicks(interaction);
      }
    } catch (error) {
      console.error('Error handling PATS interaction:', error);
      const errorMessage = { 
        content: '❌ There was an error processing your pick!', 
        ephemeral: true 
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  }
  
  // Handle PATS history interactions (admin)
  if (interaction.customId && interaction.customId.startsWith('history_')) {
    try {
      if (interaction.customId === 'history_overview') {
        await patshistoryCommand.handleHistoryButton(interaction);
      } else if (interaction.customId.startsWith('history_session_')) {
        await patshistoryCommand.handleHistoryButton(interaction);
      } else if (interaction.customId.startsWith('history_user_')) {
        await patshistoryCommand.handleHistoryButton(interaction);
      } else if (interaction.customId.startsWith('history_game_')) {
        await patshistoryCommand.handleHistoryButton(interaction);
      } else if (interaction.customId === 'history_session_select') {
        await patshistoryCommand.handleSessionSelect(interaction);
      } else if (interaction.customId === 'history_user_select') {
        await patshistoryCommand.handleUserSelect(interaction);
      } else if (interaction.customId === 'history_game_select') {
        await patshistoryCommand.handleGameSelect(interaction);
      }
    } catch (error) {
      console.error('Error handling history interaction:', error);
      const errorMessage = { 
        content: '❌ There was an error processing your request!', 
        ephemeral: true 
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  }
  
  // Handle schedule interactions
  if (interaction.customId && interaction.customId.startsWith('schedule_')) {
    try {
      if (interaction.customId === 'schedule_new_session') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showDateSelection(interaction);
      }
      else if (interaction.customId.startsWith('schedule_date_')) {
        const selectedDate = interaction.customId.replace('schedule_date_', '');
        await interaction.deferUpdate();
        await patsscheduleCommand.showGameSelection(interaction, selectedDate);
      }
      else if (interaction.customId.startsWith('schedule_toggle_game_')) {
        // Toggle game selection
        const parts = interaction.customId.replace('schedule_toggle_game_', '').split('_');
        const selectedDate = parts.slice(0, -1).join('_');
        const gameIndex = parseInt(parts[parts.length - 1]);
        
        patsscheduleCommand.toggleGameSelection(interaction.user.id, selectedDate, gameIndex);
        
        await interaction.deferUpdate();
        await patsscheduleCommand.showGameSelection(interaction, selectedDate);
      }
      else if (interaction.customId.startsWith('schedule_selectall_')) {
        const selectedDate = interaction.customId.replace('schedule_selectall_', '');
        patsscheduleCommand.selectAllGames(interaction.user.id);
        
        await interaction.deferUpdate();
        await patsscheduleCommand.showGameSelection(interaction, selectedDate);
      }
      else if (interaction.customId.startsWith('schedule_deselectall_')) {
        const selectedDate = interaction.customId.replace('schedule_deselectall_', '');
        patsscheduleCommand.deselectAllGames(interaction.user.id);
        
        await interaction.deferUpdate();
        await patsscheduleCommand.showGameSelection(interaction, selectedDate);
      }
      else if (interaction.customId.startsWith('schedule_continue_config_')) {
        await interaction.deferUpdate();
        await patsscheduleCommand.showConfigurationMenu(interaction);
      }
      else if (interaction.customId.startsWith('schedule_config_')) {
        await interaction.deferUpdate();
        await interaction.followUp({
          content: '🚧 Channel/Participant/Notification configuration coming next!',
          ephemeral: true
        });
      }
      else if (interaction.customId === 'schedule_create_session') {
        await interaction.deferUpdate();
        await interaction.editReply({
          content: '🚧 Session creation and confirmation coming next!',
          embeds: [],
          components: []
        });
      }
      else if (interaction.customId === 'schedule_view_sessions') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showScheduledSessions(interaction);
      }
      else if (interaction.customId === 'schedule_templates') {
        await interaction.deferUpdate();
        await patsscheduleCommand.showTemplatesMenu(interaction);
      }
      else if (interaction.customId === 'schedule_back_main') {
        await interaction.deferUpdate();
        await patsscheduleCommand.execute(interaction);
      }
      else if (interaction.customId === 'schedule_cancel') {
        await interaction.deferUpdate();
        await patsscheduleCommand.cancelMenu(interaction);
      }
      else if (interaction.customId.startsWith('schedule_manage_')) {
        const sessionId = interaction.customId.replace('schedule_manage_', '');
        await interaction.deferUpdate();
        await patsscheduleCommand.showSessionManager(interaction, sessionId);
      }
      else if (interaction.customId.startsWith('schedule_delete_')) {
        const sessionId = interaction.customId.replace('schedule_delete_', '');
        await interaction.deferUpdate();
        const { deleteScheduledSession } = await import('./utils/sessionScheduler.js');
        deleteScheduledSession(sessionId);
        await interaction.editReply({
          content: '✅ Session deleted successfully!',
          embeds: [],
          components: []
        });
      }
    } catch (error) {
      console.error('Error handling schedule interaction:', error);
      const errorMessage = { 
        content: '❌ There was an error processing your request!', 
        ephemeral: true 
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  }
});

client.on(Events.Error, (error) => {
  console.error('Discord client error:', error);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error('Failed to login:', error);
  process.exit(1);
});
