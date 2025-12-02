import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { loadPATSData, savePATSData } from './patsData.js';

/**
 * Get default notification preferences for a new user
 */
export function getDefaultPreferences() {
    return {
        dmNotifications: {
            announcements: true,
            reminders: true,
            warnings: true,
            gameLocks: false  // Default OFF to avoid spam
        },
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
    const announcementsStatus = prefs.dmNotifications.announcements ? '✅ Enabled' : '❌ Disabled';
    const remindersStatus = prefs.dmNotifications.reminders ? '✅ Enabled' : '❌ Disabled';
    const warningsStatus = prefs.dmNotifications.warnings ? '✅ Enabled' : '❌ Disabled';
    const gameLocksStatus = prefs.dmNotifications.gameLocks ? '✅ Enabled' : '❌ Disabled';
    
    const embed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('⚙️ Your PATS Settings')
        .setDescription('Control which notifications you receive via Direct Message.')
        .addFields(
            {
                name: 'Direct Message Notifications',
                value: [
                    `📢 **Session Announcements**: ${announcementsStatus}`,
                    `  → New PATS session has started`,
                    `⏰ **Reminders**: ${remindersStatus}`,
                    `  → Sent 1 hour before first game of the session`,
                    `⚠️ **Warnings**: ${warningsStatus}`,
                    `  → Sent 15 min before each game you haven't picked yet`,
                    `🔒 **Game Lock Alerts**: ${gameLocksStatus}`,
                    `  → Sent when each game starts (locks picks for that game)`
                ].join('\n')
            },
            {
                name: 'ℹ️ About Settings',
                value: 'These settings control your personal DM notifications. Channel announcements are always visible to everyone.'
            }
        )
        .setFooter({ text: 'Toggle any setting to enable or disable it' });
    
    // Create toggle buttons
    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('pats_toggle_announcements')
                .setLabel('Toggle Announcements')
                .setEmoji('📢')
                .setStyle(prefs.dmNotifications.announcements ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('pats_toggle_reminders')
                .setLabel('Toggle Reminders')
                .setEmoji('⏰')
                .setStyle(prefs.dmNotifications.reminders ? ButtonStyle.Success : ButtonStyle.Secondary)
        );
    
    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('pats_toggle_warnings')
                .setLabel('Toggle Warnings')
                .setEmoji('⚠️')
                .setStyle(prefs.dmNotifications.warnings ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('pats_toggle_gamelocks')
                .setLabel('Toggle Game Locks')
                .setEmoji('🔒')
                .setStyle(prefs.dmNotifications.gameLocks ? ButtonStyle.Success : ButtonStyle.Secondary)
        );
    
    const row3 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('pats_settings_back')
                .setLabel('Back to Dashboard')
                .setStyle(ButtonStyle.Primary)
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
        'pats_toggle_announcements': 'announcements',
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
 * Check if user should receive a specific notification type
 * @param {string} userId - Discord user ID
 * @param {string} notificationType - Type of notification ('announcements', 'reminders', 'warnings', 'gameLocks')
 * @returns {boolean} Whether user should receive this notification
 */
export function shouldNotifyUser(userId, notificationType) {
    const prefs = getUserPreferences(userId);
    return prefs.dmNotifications[notificationType] === true;
}
