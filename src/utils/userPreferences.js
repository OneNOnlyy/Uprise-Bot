import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { loadPATSData, savePATSData } from './patsData.js';

/**
 * Get default notification preferences for a new user
 */
export function getDefaultPreferences() {
    return {
        dmNotifications: {
            reminders: true,
            warnings: true,
            gameLocks: false  // Default OFF to avoid spam
        },
        reminderMinutes: null,  // null = use session default, or array like [60, 30]
        warningMinutes: null  // null = use session default, or array of custom times [30, 15, 5]
    };
}

/**
 * Get user's notification preferences
 * @param {string} userId - Discord user ID
 * @returns {object} User preferences object
 */
export function getUserPreferences(userId) {
    const data = loadPATSData();
    
    // Initialize user if doesn't exist
    if (!data.users[userId]) {
        data.users[userId] = {
            userId,
            totalWins: 0,
            totalLosses: 0,
            totalPushes: 0,
            doubleDownWins: 0,
            doubleDownLosses: 0,
            doubleDownPushes: 0,
            sessions: [],
            preferences: getDefaultPreferences()
        };
        savePATSData(data);
    }
    
    // Add preferences if user exists but doesn't have them
    if (!data.users[userId].preferences) {
        data.users[userId].preferences = getDefaultPreferences();
        savePATSData(data);
    }
    
    return data.users[userId].preferences;
}

/**
 * Update user's notification preferences
 * @param {string} userId - Discord user ID
 * @param {string} category - Preference category (e.g., 'announcements', 'reminders')
 * @param {boolean} value - New value
 */
export function setUserPreference(userId, category, value) {
    const data = loadPATSData();
    
    if (!data.users[userId]) {
        data.users[userId] = {
            userId,
            totalWins: 0,
            totalLosses: 0,
            totalPushes: 0,
            doubleDownWins: 0,
            doubleDownLosses: 0,
            doubleDownPushes: 0,
            sessions: [],
            preferences: getDefaultPreferences()
        };
    }
    
    if (!data.users[userId].preferences) {
        data.users[userId].preferences = getDefaultPreferences();
    }
    
    // Update the specific preference
    data.users[userId].preferences.dmNotifications[category] = value;
    savePATSData(data);
    
    return data.users[userId].preferences;
}

/**
 * Show user settings menu
 * @param {Interaction} interaction - Discord interaction
 */
export async function showSettingsMenu(interaction) {
    const userId = interaction.user.id;
    const prefs = getUserPreferences(userId);
    
    // Get emoji status for each setting
    const remindersStatus = prefs.dmNotifications.reminders ? '✅ Enabled' : '❌ Disabled';
    const warningsStatus = prefs.dmNotifications.warnings ? '✅ Enabled' : '❌ Disabled';
    const gameLocksStatus = prefs.dmNotifications.gameLocks ? '✅ Enabled' : '❌ Disabled';
    
    // Get custom timing info
    const reminderTiming = prefs.reminderMinutes 
        ? (Array.isArray(prefs.reminderMinutes) ? `Custom: ${prefs.reminderMinutes.join(', ')} min` : `Custom: ${prefs.reminderMinutes} min`)
        : 'Using session default';
    
    const warningTiming = prefs.warningMinutes 
        ? (Array.isArray(prefs.warningMinutes) ? `Custom: ${prefs.warningMinutes.join(', ')} min` : `Custom: ${prefs.warningMinutes} min`)
        : 'Using session default';
    
    const embed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('⚙️ Your PATS Settings')
        .setDescription('Control which notifications you receive via Direct Message.')
        .addFields(
            {
                name: 'Direct Message Notifications',
                value: [
                    `⏰ **Reminders**: ${remindersStatus}`,
                    `  └ *Get DMs about games you haven't picked yet*`,
                    `  └ Timing: ${reminderTiming}`,
                    `⚠️ **Warnings**: ${warningsStatus}`,
                    `  └ *Get DMs when games you missed are about to lock*`,
                    `  └ Timing: ${warningTiming}`,
                    `🔒 **Game Lock Alerts**: ${gameLocksStatus}`,
                    `  └ *Get DMs when each game starts/locks*`
                ].join('\n')
            },
            {
                name: 'ℹ️ About Settings',
                value: 'Session announcements are sent to everyone in the channel. Use the buttons below to customize your personal DM notifications.'
            }
        )
        .setFooter({ text: 'Click Customize to set multiple notification times' });
    
    // Create toggle and customize buttons
    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('pats_toggle_reminders')
                .setLabel('Toggle Reminders')
                .setEmoji('⏰')
                .setStyle(prefs.dmNotifications.reminders ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('pats_customize_reminders')
                .setLabel('Customize Times')
                .setEmoji('⚙️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(!prefs.dmNotifications.reminders)
        );
    
    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('pats_toggle_warnings')
                .setLabel('Toggle Warnings')
                .setEmoji('⚠️')
                .setStyle(prefs.dmNotifications.warnings ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('pats_customize_warnings')
                .setLabel('Customize Times')
                .setEmoji('⚙️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(!prefs.dmNotifications.warnings)
        );
    
    const row3 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('pats_toggle_gamelocks')
                .setLabel('Toggle Game Locks')
                .setEmoji('🔒')
                .setStyle(prefs.dmNotifications.gameLocks ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('pats_settings_back')
                .setLabel('Back to Dashboard')
                .setStyle(ButtonStyle.Secondary)
        );
    
    const updateMethod = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
    await interaction[updateMethod]({
        embeds: [embed],
        components: [row1, row2, row3],
        ephemeral: true
    });
}

/**
 * Handle toggle button interactions
 * @param {Interaction} interaction - Discord interaction
 */
export async function handleToggle(interaction) {
    const userId = interaction.user.id;
    const customId = interaction.customId;
    
    // Map button ID to preference key
    const toggleMap = {
        'pats_toggle_reminders': 'reminders',
        'pats_toggle_warnings': 'warnings',
        'pats_toggle_gamelocks': 'gameLocks'
    };
    
    const prefKey = toggleMap[customId];
    if (!prefKey) return;
    
    // Get current value and flip it
    const prefs = getUserPreferences(userId);
    const newValue = !prefs.dmNotifications[prefKey];
    
    // Update preference
    setUserPreference(userId, prefKey, newValue);
    
    // Refresh the settings menu
    await interaction.deferUpdate();
    await showSettingsMenu(interaction);
}

/**
 * Show reminder customization menu
 */
export async function showReminderCustomization(interaction) {
    const userId = interaction.user.id;
    const prefs = getUserPreferences(userId);
    
    const currentSetting = prefs.reminderMinutes 
        ? (Array.isArray(prefs.reminderMinutes) 
            ? prefs.reminderMinutes.sort((a, b) => b - a).join(', ') + ' minutes' 
            : prefs.reminderMinutes + ' minutes')
        : 'Session default (configured per session)';
    
    // Get current selections for the select menu
    const currentSelections = prefs.reminderMinutes 
        ? (Array.isArray(prefs.reminderMinutes) 
            ? prefs.reminderMinutes.map(m => m.toString())
            : [prefs.reminderMinutes.toString()])
        : [];
    
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('⏰ Reminder Customization')
        .setDescription('Select when you receive reminders before the first game of a session.\n\n**You can select multiple times** to receive multiple reminders.')
        .addFields(
            {
                name: '📋 Current Setting',
                value: currentSetting
            },
            {
                name: '⚙️ How It Works',
                value: [
                    '• **Session Default**: Don\'t select anything to use scheduled session timing',
                    '• **Single Time**: Select one option (e.g., 60 minutes)',
                    '• **Multiple Times**: Select multiple options (e.g., 120, 60, and 30 minutes)',
                    '',
                    '💡 Selecting none = Use session default',
                    '💡 Selecting multiple = Get multiple reminders'
                ].join('\n')
            }
        );
    
    const { StringSelectMenuBuilder } = await import('discord.js');
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('pats_reminder_times_select')
        .setPlaceholder('Select reminder times (or leave empty for session default)')
        .setMinValues(0)
        .setMaxValues(6)
        .addOptions([
            {
                label: '2 hours before',
                description: 'Reminder 120 minutes before first game',
                value: '120',
                default: currentSelections.includes('120')
            },
            {
                label: '90 minutes before',
                description: 'Reminder 90 minutes before first game',
                value: '90',
                default: currentSelections.includes('90')
            },
            {
                label: '1 hour before',
                description: 'Reminder 60 minutes before first game',
                value: '60',
                default: currentSelections.includes('60')
            },
            {
                label: '45 minutes before',
                description: 'Reminder 45 minutes before first game',
                value: '45',
                default: currentSelections.includes('45')
            },
            {
                label: '30 minutes before',
                description: 'Reminder 30 minutes before first game',
                value: '30',
                default: currentSelections.includes('30')
            },
            {
                label: '15 minutes before',
                description: 'Reminder 15 minutes before first game',
                value: '15',
                default: currentSelections.includes('15')
            }
        ]);
    
    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    
    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('pats_reminder_back')
                .setLabel('Back to Settings')
                .setStyle(ButtonStyle.Secondary)
        );
    
    await interaction.update({
        embeds: [embed],
        components: [row1, row2],
        ephemeral: true
    });
}

/**
 * Show warning customization menu
 */
export async function showWarningCustomization(interaction) {
    const userId = interaction.user.id;
    const prefs = getUserPreferences(userId);
    
    const currentSetting = prefs.warningMinutes 
        ? (Array.isArray(prefs.warningMinutes) 
            ? prefs.warningMinutes.sort((a, b) => b - a).join(', ') + ' minutes' 
            : prefs.warningMinutes + ' minutes')
        : 'Session default (configured per session)';
    
    // Get current selections for the select menu
    const currentSelections = prefs.warningMinutes 
        ? (Array.isArray(prefs.warningMinutes) 
            ? prefs.warningMinutes.map(m => m.toString())
            : [prefs.warningMinutes.toString()])
        : [];
    
    const embed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('⚠️ Warning Customization')
        .setDescription('Select when you receive warnings before each unpicked game.\n\n**You can select multiple times** to receive multiple warnings per game.')
        .addFields(
            {
                name: '📋 Current Setting',
                value: currentSetting
            },
            {
                name: '⚙️ How It Works',
                value: [
                    '• **Session Default**: Don\'t select anything to use scheduled session timing',
                    '• **Single Time**: Select one option (e.g., 30 minutes)',
                    '• **Multiple Times**: Select multiple options (e.g., 60, 30, and 15 minutes)',
                    '',
                    '💡 Selecting none = Use session default',
                    '💡 Selecting multiple = Get multiple warnings per game',
                    '💡 Warnings check each unpicked game individually'
                ].join('\n')
            }
        );
    
    const { StringSelectMenuBuilder } = await import('discord.js');
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('pats_warning_times_select')
        .setPlaceholder('Select warning times (or leave empty for session default)')
        .setMinValues(0)
        .setMaxValues(8)
        .addOptions([
            {
                label: '2 hours before',
                description: 'Warning 120 minutes before each unpicked game',
                value: '120',
                default: currentSelections.includes('120')
            },
            {
                label: '90 minutes before',
                description: 'Warning 90 minutes before each unpicked game',
                value: '90',
                default: currentSelections.includes('90')
            },
            {
                label: '1 hour before',
                description: 'Warning 60 minutes before each unpicked game',
                value: '60',
                default: currentSelections.includes('60')
            },
            {
                label: '45 minutes before',
                description: 'Warning 45 minutes before each unpicked game',
                value: '45',
                default: currentSelections.includes('45')
            },
            {
                label: '30 minutes before',
                description: 'Warning 30 minutes before each unpicked game',
                value: '30',
                default: currentSelections.includes('30')
            },
            {
                label: '15 minutes before',
                description: 'Warning 15 minutes before each unpicked game',
                value: '15',
                default: currentSelections.includes('15')
            },
            {
                label: '10 minutes before',
                description: 'Warning 10 minutes before each unpicked game',
                value: '10',
                default: currentSelections.includes('10')
            },
            {
                label: '5 minutes before',
                description: 'Warning 5 minutes before each unpicked game',
                value: '5',
                default: currentSelections.includes('5')
            }
        ]);
    
    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    
    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('pats_warning_back')
                .setLabel('Back to Settings')
                .setStyle(ButtonStyle.Secondary)
        );
    
    await interaction.update({
        embeds: [embed],
        components: [row1, row2],
        ephemeral: true
    });
}

/**
 * Set custom reminder times
 */
export function setReminderTimes(userId, minutes) {
    const data = loadPATSData();
    if (!data.users[userId]) {
        data.users[userId] = {
            userId,
            preferences: getDefaultPreferences()
        };
    }
    if (!data.users[userId].preferences) {
        data.users[userId].preferences = getDefaultPreferences();
    }
    
    data.users[userId].preferences.reminderMinutes = minutes;
    savePATSData(data);
}

/**
 * Set custom warning times
 */
export function setWarningTimes(userId, minutes) {
    const data = loadPATSData();
    if (!data.users[userId]) {
        data.users[userId] = {
            userId,
            preferences: getDefaultPreferences()
        };
    }
    if (!data.users[userId].preferences) {
        data.users[userId].preferences = getDefaultPreferences();
    }
    
    data.users[userId].preferences.warningMinutes = minutes;
    savePATSData(data);
}

/**
 * Check if user should receive a specific notification type
 * @param {string} userId - Discord user ID
 * @param {string} notificationType - Type of notification ('announcements', 'reminders', 'warnings', 'gameLocks')
 * @returns {boolean} Whether user should receive this notification
 */
export function shouldNotifyUser(userId, notificationType) {
    const prefs = getUserPreferences(userId);
    return prefs.dmNotifications[notificationType] === true;
}
