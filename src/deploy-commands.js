import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import * as gamethreadCommand from './commands/gamethread.js';
import * as testpingCommand from './commands/testping.js';
import * as sendgamepingCommand from './commands/sendgameping.js';
import * as configCommand from './commands/config.js';
import * as patsstartCommand from './commands/patsstart.js';
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

dotenv.config();

const commands = [
  gamethreadCommand.data.toJSON(),
  testpingCommand.data.toJSON(),
  sendgamepingCommand.data.toJSON(),
  configCommand.data.toJSON(),
  patsstartCommand.data.toJSON(),
  patsCommand.data.toJSON(),
  patsleaderboardCommand.data.toJSON(),
  patsendCommand.data.toJSON(),
  patshistoryCommand.data.toJSON(),
  patsreopenCommand.data.toJSON(),
  patsaddplayerCommand.data.toJSON(),
  patseditplayerCommand.data.toJSON(),
  patsviewplayerCommand.data.toJSON(),
  patsdeleteplayerCommand.data.toJSON(),
  patsrefreshspreadsCommand.data.toJSON(),
  patsscheduleCommand.data.toJSON(),
];

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

// Deploy commands
(async () => {
  try {
    console.log(`🔄 Started refreshing ${commands.length} application (/) commands.`);

    const data = await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID || '1383191065506615356',
        process.env.GUILD_ID
      ),
      { body: commands },
    );

    console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
    console.log('Commands registered:');
    data.forEach(cmd => {
      console.log(`  - /${cmd.name}`);
    });
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
})();
