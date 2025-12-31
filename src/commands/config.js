import { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '../../.env');

export const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Configure bot settings (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

// Configuration categories
const CONFIG_CATEGORIES = {
  CHANNELS: 'channels',
  ROLES: 'roles',
  THREADS: 'threads',
  PINGS: 'pings',
  TEAM: 'team',
  SCHEDULE: 'schedule',
  PATS: 'pats'
};

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    await showMainMenu(interaction);
  } catch (error) {
    console.error('Error executing config command:', error);
    await interaction.editReply({
      content: '❌ An error occurred while loading the configuration menu.',
      components: [],
    });
  }
}

/**
 * Show the main configuration menu
 */
async function showMainMenu(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('⚙️ Bot Configuration')
    .setDescription('Select a category to configure:')
    .setColor(0xE03A3E) // Trail Blazers red
    .addFields(
      { name: '📺 Channels', value: 'Configure Discord channels', inline: true },
      { name: '👥 Roles', value: 'Configure Discord roles', inline: true },
      { name: '🧵 Threads', value: 'Game thread settings', inline: true },
      { name: '🔔 Pings', value: 'Game ping settings', inline: true },
      { name: '🏀 Team', value: 'Team & API settings', inline: true },
      { name: '⏰ Schedule', value: 'Timing & scheduling', inline: true },
      { name: '🏀 PATS', value: 'Picks Against The Spread settings', inline: true }
    )
    .setFooter({ text: 'Select a category below to get started' });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('config_category')
    .setPlaceholder('Choose a configuration category...')
    .addOptions([
      new StringSelectMenuOptionBuilder()
        .setLabel('Channels')
        .setDescription('Configure Discord channels')
        .setValue(CONFIG_CATEGORIES.CHANNELS)
        .setEmoji('📺'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Roles')
        .setDescription('Configure Discord roles')
        .setValue(CONFIG_CATEGORIES.ROLES)
        .setEmoji('👥'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Threads')
        .setDescription('Game thread settings')
        .setValue(CONFIG_CATEGORIES.THREADS)
        .setEmoji('🧵'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Pings')
        .setDescription('Game ping settings')
        .setValue(CONFIG_CATEGORIES.PINGS)
        .setEmoji('🔔'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Team')
        .setDescription('Team & API settings')
        .setValue(CONFIG_CATEGORIES.TEAM)
        .setEmoji('🏀'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Schedule')
        .setDescription('Timing & scheduling')
        .setValue(CONFIG_CATEGORIES.SCHEDULE)
        .setEmoji('⏰'),
      new StringSelectMenuOptionBuilder()
        .setLabel('PATS')
        .setDescription('Picks Against The Spread settings')
        .setValue(CONFIG_CATEGORIES.PATS)
        .setEmoji('🏀')
    ]);

  const row = new ActionRowBuilder().addComponents(selectMenu);

  await interaction.editReply({
    embeds: [embed],
    components: [row]
  });
}

/**
 * Show channels configuration
 */
async function showChannelsConfig(interaction) {
  const currentConfig = readCurrentConfig();
  
  const embed = new EmbedBuilder()
    .setTitle('📺 Channel Configuration')
    .setDescription('Configure which channels the bot uses')
    .setColor(0xE03A3E)
    .addFields(
      { 
        name: '🏀 Game Thread Channel', 
        value: currentConfig.GAME_THREAD_CHANNEL_ID ? `<#${currentConfig.GAME_THREAD_CHANNEL_ID}>` : 'Not set',
        inline: false 
      },
      { 
        name: '💬 Main Chat Channel', 
        value: currentConfig.MAIN_CHAT_CHANNEL_ID ? `<#${currentConfig.MAIN_CHAT_CHANNEL_ID}>` : 'Not set',
        inline: false 
      },
      { 
        name: '📋 Transaction Feed Channel', 
        value: currentConfig.TRANSACTION_CHANNEL_ID ? `<#${currentConfig.TRANSACTION_CHANNEL_ID}>` : 'Not set',
        inline: false 
      }
    );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('config_channels_select')
    .setPlaceholder('Select a channel setting to modify...')
    .addOptions([
      new StringSelectMenuOptionBuilder()
        .setLabel('Game Thread Channel')
        .setDescription('Where game threads are created')
        .setValue('GAME_THREAD_CHANNEL_ID')
        .setEmoji('🏀'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Main Chat Channel')
        .setDescription('Where announcements are posted')
        .setValue('MAIN_CHAT_CHANNEL_ID')
        .setEmoji('💬'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Transaction Feed Channel')
        .setDescription('Where NBA transactions are posted')
        .setValue('TRANSACTION_CHANNEL_ID')
        .setEmoji('📋')
    ]);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('config_back')
      .setLabel('Back to Main Menu')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀️')
  );

  await interaction.editReply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(selectMenu), buttons]
  });
}

/**
 * Show roles configuration
 */
async function showRolesConfig(interaction) {
  const currentConfig = readCurrentConfig();
  
  const embed = new EmbedBuilder()
    .setTitle('👥 Role Configuration')
    .setDescription('Configure which roles the bot uses')
    .setColor(0xE03A3E)
    .addFields(
      { 
        name: '🔔 Game Ping Role', 
        value: currentConfig.GAME_PING_ROLE_ID ? `<@&${currentConfig.GAME_PING_ROLE_ID}>` : 'Not set',
        inline: false 
      },
      { 
        name: '👮 Moderator Role', 
        value: currentConfig.MODERATOR_ROLE_ID ? `<@&${currentConfig.MODERATOR_ROLE_ID}>` : 'Not set',
        inline: false 
      }
    );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('config_roles_select')
    .setPlaceholder('Select a role setting to modify...')
    .addOptions([
      new StringSelectMenuOptionBuilder()
        .setLabel('Game Ping Role')
        .setDescription('Role to ping when games start')
        .setValue('GAME_PING_ROLE_ID')
        .setEmoji('🔔'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Moderator Role')
        .setDescription('Role with moderation permissions')
        .setValue('MODERATOR_ROLE_ID')
        .setEmoji('👮')
    ]);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('config_back')
      .setLabel('Back to Main Menu')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀️')
  );

  await interaction.editReply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(selectMenu), buttons]
  });
}

/**
 * Show threads configuration
 */
async function showThreadsConfig(interaction) {
  const currentConfig = readCurrentConfig();
  
  const embed = new EmbedBuilder()
    .setTitle('🧵 Thread Configuration')
    .setDescription('Configure game thread behavior')
    .setColor(0xE03A3E)
    .addFields(
      { 
        name: '⏰ Thread Creation Time', 
        value: currentConfig.THREAD_CREATE_TIME || '8:00 AM PT',
        inline: false 
      },
      { 
        name: '🔒 Auto-Lock Threads', 
        value: currentConfig.AUTO_LOCK_THREADS !== 'false' ? 'Enabled (24h after game)' : 'Disabled',
        inline: false 
      }
    );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('config_threads_select')
    .setPlaceholder('Select a thread setting to modify...')
    .addOptions([
      new StringSelectMenuOptionBuilder()
        .setLabel('Thread Creation Time')
        .setDescription('When to create game threads each day')
        .setValue('THREAD_CREATE_TIME')
        .setEmoji('⏰'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Auto-Lock Settings')
        .setDescription('Configure thread auto-locking')
        .setValue('AUTO_LOCK_THREADS')
        .setEmoji('🔒')
    ]);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('config_back')
      .setLabel('Back to Main Menu')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀️')
  );

  await interaction.editReply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(selectMenu), buttons]
  });
}

/**
 * Show pings configuration
 */
async function showPingsConfig(interaction) {
  const currentConfig = readCurrentConfig();
  
  const embed = new EmbedBuilder()
    .setTitle('🔔 Ping Configuration')
    .setDescription('Configure game ping notifications')
    .setColor(0xE03A3E)
    .addFields(
      { 
        name: '⏰ Ping Timing', 
        value: 'At game start time',
        inline: false 
      },
      { 
        name: '🔔 Ping Enabled', 
        value: currentConfig.ENABLE_GAME_PINGS !== 'false' ? 'Yes' : 'No',
        inline: false 
      }
    );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('config_pings_select')
    .setPlaceholder('Select a ping setting to modify...')
    .addOptions([
      new StringSelectMenuOptionBuilder()
        .setLabel('Enable/Disable Game Pings')
        .setDescription('Toggle game ping notifications')
        .setValue('ENABLE_GAME_PINGS')
        .setEmoji('🔔')
    ]);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('config_back')
      .setLabel('Back to Main Menu')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀️')
  );

  await interaction.editReply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(selectMenu), buttons]
  });
}

/**
 * Show team configuration
 */
async function showTeamConfig(interaction) {
  const currentConfig = readCurrentConfig();
  
  const embed = new EmbedBuilder()
    .setTitle('🏀 Team Configuration')
    .setDescription('Configure team and API settings')
    .setColor(0xE03A3E)
    .addFields(
      { 
        name: '🏀 Team ID', 
        value: currentConfig.TEAM_ID || 'Not set',
        inline: false 
      },
      { 
        name: '🌐 Timezone', 
        value: currentConfig.TIMEZONE || 'America/Los_Angeles',
        inline: false 
      },
      { 
        name: '🔑 API Key', 
        value: currentConfig.BALLDONTLIE_API_KEY ? '✅ Set' : '❌ Not set',
        inline: false 
      }
    );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('config_team_select')
    .setPlaceholder('Select a team setting to modify...')
    .addOptions([
      new StringSelectMenuOptionBuilder()
        .setLabel('Timezone')
        .setDescription('Configure timezone for scheduling')
        .setValue('TIMEZONE')
        .setEmoji('🌐'),
      new StringSelectMenuOptionBuilder()
        .setLabel('API Key')
        .setDescription('Set BallDontLie API key')
        .setValue('BALLDONTLIE_API_KEY')
        .setEmoji('🔑')
    ]);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('config_back')
      .setLabel('Back to Main Menu')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀️')
  );

  await interaction.editReply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(selectMenu), buttons]
  });
}

/**
 * Show schedule configuration
 */
async function showScheduleConfig(interaction) {
  const currentConfig = readCurrentConfig();
  
  const embed = new EmbedBuilder()
    .setTitle('⏰ Schedule Configuration')
    .setDescription('Configure timing and scheduling')
    .setColor(0xE03A3E)
    .addFields(
      { 
        name: '🔄 Auto-Update', 
        value: currentConfig.AUTO_UPDATE !== '0' ? 'Enabled' : 'Disabled',
        inline: false 
      },
      { 
        name: '🌐 Timezone', 
        value: currentConfig.TIMEZONE || 'America/Los_Angeles',
        inline: false 
      }
    );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('config_schedule_select')
    .setPlaceholder('Select a schedule setting to modify...')
    .addOptions([
      new StringSelectMenuOptionBuilder()
        .setLabel('Auto-Update')
        .setDescription('Enable/disable auto-update on restart')
        .setValue('AUTO_UPDATE')
        .setEmoji('🔄')
    ]);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('config_back')
      .setLabel('Back to Main Menu')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀️')
  );

  await interaction.editReply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(selectMenu), buttons]
  });
}

/**
 * Show PATS configuration
 */
async function showPatsConfig(interaction) {
  const currentConfig = readCurrentConfig();
  const monthlyMaxPicksRaw = currentConfig.PATS_MONTHLY_MAX_PICKS;
  const monthlyMaxPicks = monthlyMaxPicksRaw ? String(monthlyMaxPicksRaw) : '90';

  const embed = new EmbedBuilder()
    .setTitle('🏀 PATS Configuration')
    .setDescription('Configure Picks Against The Spread rules')
    .setColor(0xE03A3E)
    .addFields(
      {
        name: '📅 Monthly Max Picks',
        value: `${monthlyMaxPicks} games per month`,
        inline: false
      }
    );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('config_pats_select')
    .setPlaceholder('Select a PATS setting to modify...')
    .addOptions([
      new StringSelectMenuOptionBuilder()
        .setLabel('Monthly Max Picks')
        .setDescription('Maximum games a user can pick per month')
        .setValue('PATS_MONTHLY_MAX_PICKS')
        .setEmoji('📅')
    ]);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('config_back')
      .setLabel('Back to Main Menu')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀️')
  );

  await interaction.editReply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(selectMenu), buttons]
  });
}

/**
 * Read current configuration from .env
 */
function readCurrentConfig() {
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const config = {};
    
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        config[key] = valueParts.join('=');
      }
    });
    
    return config;
  } catch (error) {
    console.error('Error reading .env file:', error);
    return {};
  }
}

/**
 * Update configuration value in .env
 */
function updateConfig(key, value) {
  try {
    let envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    let found = false;
    
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith(key + '=')) {
        lines[i] = `${key}=${value}`;
        found = true;
        break;
      }
    }
    
    if (!found) {
      lines.push(`${key}=${value}`);
    }
    
    fs.writeFileSync(envPath, lines.join('\n'));
    process.env[key] = value;
    
    return true;
  } catch (error) {
    console.error('Error updating .env file:', error);
    return false;
  }
}

/**
 * Handle configuration interactions
 */
export async function handleConfigInteraction(interaction) {
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'config_category') {
      const category = interaction.values[0];
      await interaction.deferUpdate();
      
      switch (category) {
        case CONFIG_CATEGORIES.CHANNELS:
          await showChannelsConfig(interaction);
          break;
        case CONFIG_CATEGORIES.ROLES:
          await showRolesConfig(interaction);
          break;
        case CONFIG_CATEGORIES.THREADS:
          await showThreadsConfig(interaction);
          break;
        case CONFIG_CATEGORIES.PINGS:
          await showPingsConfig(interaction);
          break;
        case CONFIG_CATEGORIES.TEAM:
          await showTeamConfig(interaction);
          break;
        case CONFIG_CATEGORIES.SCHEDULE:
          await showScheduleConfig(interaction);
          break;
        case CONFIG_CATEGORIES.PATS:
          await showPatsConfig(interaction);
          break;
      }
    } else if (interaction.customId.startsWith('config_')) {
      const setting = interaction.values[0];
      await showSettingModal(interaction, setting);
    }
  } else if (interaction.isButton()) {
    if (interaction.customId === 'config_back') {
      await interaction.deferUpdate();
      await showMainMenu(interaction);
    }
  } else if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('config_modal_')) {
      await handleModalSubmit(interaction);
    }
  }
}

/**
 * Show modal for setting configuration
 */
async function showSettingModal(interaction, setting) {
  const currentConfig = readCurrentConfig();
  const currentValue = currentConfig[setting] || '';
  
  const modal = new ModalBuilder()
    .setCustomId(`config_modal_${setting}`)
    .setTitle(`Configure ${setting}`);

  const input = new TextInputBuilder()
    .setCustomId('config_value')
    .setLabel(setting)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(`Enter new value for ${setting}`)
    .setValue(currentValue)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  
  await interaction.showModal(modal);
}

/**
 * Handle modal submission
 */
async function handleModalSubmit(interaction) {
  const setting = interaction.customId.replace('config_modal_', '');
  const value = interaction.fields.getTextInputValue('config_value');
  
  const success = updateConfig(setting, value);
  
  if (success) {
    await interaction.reply({
      content: `✅ Successfully updated **${setting}** to: \`${value}\`\n\n⚠️ **Note:** Some changes may require a bot restart to take effect.`,
      ephemeral: true
    });
  } else {
    await interaction.reply({
      content: `❌ Failed to update **${setting}**. Please check the logs.`,
      ephemeral: true
    });
  }
}
