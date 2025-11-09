import { Client, GatewayIntentBits, Events, Collection } from 'discord.js';
import dotenv from 'dotenv';
import { scheduleGameThreads } from './features/gameThreads.js';
import { scheduleGamePings } from './features/gamePing.js';
import { scheduleThreadLocking } from './features/lockThreads.js';
import * as gamethreadCommand from './commands/gamethread.js';
import * as testpingCommand from './commands/testping.js';

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
});

// Handle slash commands
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

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
});

client.on(Events.Error, (error) => {
  console.error('Discord client error:', error);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error('Failed to login:', error);
  process.exit(1);
});
