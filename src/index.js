import { Client, GatewayIntentBits, Events, Collection } from 'discord.js';
import dotenv from 'dotenv';
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

client.once(Events.ClientReady, (readyClient) => {
  console.log(`✅ Uprise Bot is ready! Logged in as ${readyClient.user.tag}`);
  console.log(`🏀 Monitoring Portland Trail Blazers games...`);
  console.log(`⚡ Slash commands loaded: ${client.commands.size}`);
  
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
      // Handle dashboard buttons
      if (interaction.customId.startsWith('pats_dashboard_')) {
        await patsCommand.handleDashboardButton(interaction);
      }
      // Handle game selection dropdown
      else if (interaction.customId === 'pats_game_select') {
        await makepickCommand.handleGameSelection(interaction);
      }
      // Handle pick submission buttons
      else if (interaction.customId.startsWith('pats_pick_')) {
        await makepickCommand.handlePickSubmission(interaction);
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
});

client.on(Events.Error, (error) => {
  console.error('Discord client error:', error);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error('Failed to login:', error);
  process.exit(1);
});
