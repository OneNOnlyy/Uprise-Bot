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
                    `  └ Timing: ${reminderTiming}`,
                    `⚠️ **Warnings**: ${warningsStatus}`,
                    `  └ Timing: ${warningTiming}`,
                    `🔒 **Game Lock Alerts**: ${gameLocksStatus}`,
                    `  └ Sent when each game starts`
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
            ? prefs.reminderMinutes.join(', ') + ' minutes' 
            : prefs.reminderMinutes + ' minutes')
        : 'Session default (configured per session)';
    
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('⏰ Reminder Customization')
        .setDescription('Customize when you receive reminders before the first game of a session.')
        .addFields(
            {
                name: '📋 Current Setting',
                value: currentSetting
            },
            {
                name: '⚙️ How It Works',
                value: [
                    '• **Session Default**: Use the timing set when the session was scheduled',
                    '• **Custom Single**: Set one reminder time (e.g., 60 minutes before)',
                    '• **Custom Multiple**: Set multiple reminder times (e.g., 120, 60, 30 minutes before)',
                    '',
                    '💡 Example: `30` = one reminder 30 min before',
                    '💡 Example: `60,30,15` = three reminders at 60, 30, and 15 min before'
                ].join('\n')
            }
        );
    
    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('pats_reminder_use_default')
                .setLabel('Use Session Default')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('pats_reminder_set_custom')
                .setLabel('Set Custom Times')
                .setEmoji('✏️')
                .setStyle(ButtonStyle.Primary)
        );
    
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
            ? prefs.warningMinutes.join(', ') + ' minutes' 
            : prefs.warningMinutes + ' minutes')
        : 'Session default (configured per session)';
    
    const embed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('⚠️ Warning Customization')
        .setDescription('Customize when you receive warnings before EACH game you haven\'t picked.')
        .addFields(
            {
                name: '📋 Current Setting',
                value: currentSetting
            },
            {
                name: '⚙️ How It Works',
                value: [
                    '• **Session Default**: Use the timing set when the session was scheduled',
                    '• **Custom Single**: Set one warning time per game (e.g., 30 minutes before)',
                    '• **Custom Multiple**: Set multiple warnings per game (e.g., 30, 15, 5 minutes before)',
                    '',
                    '💡 Example: `30` = one warning 30 min before each unpicked game',
                    '💡 Example: `30,15,5` = three warnings per unpicked game at 30, 15, and 5 min before'
                ].join('\n')
            }
        );
    
    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('pats_warning_use_default')
                .setLabel('Use Session Default')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('pats_warning_set_custom')
                .setLabel('Set Custom Times')
                .setEmoji('✏️')
                .setStyle(ButtonStyle.Primary)
        );
    
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
