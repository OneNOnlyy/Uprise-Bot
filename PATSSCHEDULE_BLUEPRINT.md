# /patsschedule Command - Complete Blueprint

## Overview
The `/patsschedule` command allows admins to schedule PATS sessions in advance with automatic announcements, reminders, warnings, and game-by-game locking. Users can customize their notification preferences independently of session settings.

---

## Core Architecture

### Data Structure
**File: `data/scheduled-sessions.json`**
```json
{
  "sessions": [
    {
      "id": "session_1732492800000",
      "channelId": "123456789",
      "scheduledDate": "2024-12-15",
      "firstGameTime": "2024-12-15T19:30:00-08:00",
      "games": ["gameId1", "gameId2", "gameId3"],
      "gameDetails": [
        {
          "gameId": "gameId1",
          "matchup": "CLE @ BOS",
          "startTime": "2024-12-15T19:30:00-08:00"
        }
      ],
      "participantType": "role",
      "roleId": "987654321",
      "specificUsers": ["userId1", "userId2"],
      "notifications": {
        "announcement": {
          "enabled": true,
          "time": "2024-12-15T10:00:00-08:00"
        },
        "reminder": {
          "enabled": true,
          "minutesBefore": 60
        },
        "warning": {
          "enabled": true,
          "minutesBefore": 15
        }
      },
      "createdBy": "adminUserId",
      "createdByUsername": "AdminUsername",
      "createdAt": "2024-12-01T10:00:00-08:00",
      "templateName": "Saturday Night Games",
      "recurring": {
        "enabled": false,
        "pattern": "weekly",
        "dayOfWeek": 6
      }
    }
  ],
  "templates": [
    {
      "name": "Saturday Night Games",
      "channelId": "123456789",
      "participantType": "role",
      "roleId": "987654321",
      "notifications": {
        "announcement": { "enabled": true, "hoursBefore": 9 },
        "reminder": { "enabled": true, "minutesBefore": 60 },
        "warning": { "enabled": true, "minutesBefore": 15 }
      }
    }
  ]
}
```

**File: `data/pats-data.json` (User Preferences Addition)**
```json
{
  "users": {
    "userId": {
      "userId": "userId",
      "username": "PlayerUsername",
      "totalWins": 10,
      "totalLosses": 3,
      "preferences": {
        "dmNotifications": {
          "announcements": true,
          "reminders": true,
          "warnings": true,
          "gameLocks": false
        }
      }
    }
  }
}
```

---

## Notification System

### Automatic Game Locking
- Games lock automatically when they start (existing system)
- **NO manual lock time configuration needed**
- Individual games lock as they begin, not all at once

### Notification Types & Delivery

#### 1. Session Announcement
**When**: Configurable time before first game (e.g., 9:00 AM same day)  
**Where**: Channel message (public)  
**Content**:
```
🏀 PATS Session Scheduled for Today!

📅 First game starts: 4:30 PM PT
🎮 Games: 8 total
👥 Participants: @RoleOrUsers

Use /pats dashboard to join and make your picks!
First game: CLE @ BOS starts at 4:30 PM PT
```

#### 2. Reminder (DM)
**When**: Configurable minutes before first game (e.g., 60 minutes)  
**Where**: Direct Message to participants  
**Content**:
```
⏰ PATS Reminder

Your scheduled session starts in 60 minutes!
First game: CLE @ BOS @ 4:30 PM PT

Click here to make your picks: [Jump to Channel]
```
**User Control**: Can be disabled in Settings

#### 3. Warning (DM)
**When**: Configurable minutes before first game (e.g., 15 minutes)  
**Where**: Direct Message to participants  
**Content**:
```
⚠️ FINAL WARNING

First game locks in 15 minutes!
CLE @ BOS @ 4:30 PM PT

Make your picks now: [Jump to Channel]
```
**User Control**: Can be disabled in Settings

#### 4. Game Lock Notification (DM)
**When**: Automatically when each game starts  
**Where**: Direct Message to participants (if enabled)  
**Content**:
```
🔒 LOCKED: CLE @ BOS
Picks are now locked for this game.

Next game: MIA @ ATL starts in 5 minutes (4:35 PM PT)
```
**User Control**: Can be disabled in Settings (default: OFF)

### Notification Settings Priority
- **Admin sets session defaults**: Announcement, Reminder, Warning enabled/disabled
- **Users override individually**: Each user controls their own DM preferences
- **Channel announcements**: Always sent (cannot be disabled by users)
- **DMs**: Respect each user's preferences regardless of admin settings

---

## User Settings System

### Settings Menu Access
**From Active Session Dashboard**:
- Button: ⚙️ Settings
- Shows current notification preferences

**From No Session Dashboard**:
- Button: ⚙️ Settings
- Shows current notification preferences

### Settings Interface
```
⚙️ Your PATS Settings

Direct Message Notifications:
📢 Session Announcements: ✅ Enabled
⏰ Reminders (60 min): ✅ Enabled
⚠️ Warnings (15 min): ✅ Enabled
🔒 Game Lock Alerts: ❌ Disabled

[Toggle Announcements] [Toggle Reminders]
[Toggle Warnings] [Toggle Game Locks]
[Back to Dashboard]
```

### Implementation Details
- Settings stored in `data/pats-data.json` under `users[userId].preferences.dmNotifications`
- Default values: announcements, reminders, warnings = true; gameLocks = false
- Toggles flip boolean values and save immediately
- Settings persist across all sessions

---

## /patsschedule Command Flow

### Level 1: Main Menu
```
📅 Schedule PATS Session

[📆 Schedule New Session]
[📋 View Scheduled Sessions]
[💾 Saved Templates]
[❌ Cancel]
```

### Level 2A: Date Selection
```
📆 Select Date for PATS Session

Available dates with NBA games:
[Today - Dec 15 (8 games)]
[Tomorrow - Dec 16 (5 games)]
[Thu, Dec 17 (11 games)]
[Fri, Dec 18 (7 games)]
[Sat, Dec 19 (12 games)]
[Sun, Dec 20 (9 games)]
[Mon, Dec 21 (6 games)]

[⬅️ Back] [❌ Cancel]
```
- Shows next 7 days with NBA games
- Displays game count for each day
- Grays out days with no games

### Level 2B: View Scheduled Sessions
```
📋 Scheduled Sessions

1. **Today, Dec 15** - 8 games
   First game: 4:30 PM PT (CLE @ BOS)
   Channel: #nba-pats
   Participants: @NBAFans
   Created by: @AdminUsername

2. **Sat, Dec 19** - 12 games
   First game: 1:00 PM PT (MIA @ ATL)
   Channel: #weekend-picks
   Participants: @User1, @User2, @User3
   Created by: @AdminUsername

[Manage Session 1] [Manage Session 2]
[⬅️ Back] [❌ Cancel]
```

### Level 2C: Saved Templates
```
💾 Saved Templates

1. **Saturday Night Games**
   Channel: #nba-pats
   Participants: @NBAFans
   Announcements: ✅ | Reminders: ✅ | Warnings: ✅

2. **Weekday Quick Picks**
   Channel: #weekday-picks
   Participants: @User1, @User2
   Announcements: ❌ | Reminders: ✅ | Warnings: ✅

[Use Template 1] [Edit Template 1] [Delete Template 1]
[Use Template 2] [Edit Template 2] [Delete Template 2]
[➕ Create New Template]
[⬅️ Back] [❌ Cancel]
```

### Level 3: Game Preview & Selection
```
🏀 Games on Dec 15, 2024

Select games to include:

☑️ CLE @ BOS - 4:30 PM PT
☑️ MIA @ ATL - 4:35 PM PT
☑️ PHI @ CHI - 5:00 PM PT
☑️ LAL @ GSW - 7:00 PM PT
☑️ DEN @ PHX - 7:30 PM PT
☐ SAC @ POR - 7:00 PM PT
☐ OKC @ DAL - 5:30 PM PT
☐ MEM @ HOU - 6:00 PM PT

[✅ Select All] [❌ Deselect All]
[➡️ Continue] [⬅️ Back] [❌ Cancel]
```
- Checkboxes to select/deselect games
- Shows start times in PT
- Must select at least 1 game
- Games ordered by start time

### Level 4: Configuration
```
⚙️ Configure Session

📅 Date: Dec 15, 2024
🎮 Games: 5 selected
⏰ First game: CLE @ BOS @ 4:30 PM PT

**Channel**
Current: #nba-pats
[Change Channel]

**Participants**
○ Specific Role
● Specific Users
[Select Users/Role]

**Notifications**
📢 Announcement: ✅ 9:00 AM PT (9.5 hrs before)
   [Edit Time] [Toggle On/Off]

⏰ Reminder (DM): ✅ 60 minutes before first game
   [Edit Time] [Toggle On/Off]

⚠️ Warning (DM): ✅ 15 minutes before first game
   [Edit Time] [Toggle On/Off]

Note: Players can override DM preferences in Settings

**Template**
[💾 Save as Template]

**Recurring**
[🔁 Set up recurring schedule]

[✅ Schedule Session] [⬅️ Back] [❌ Cancel]
```

#### Configuration Details
- **Channel**: Dropdown of text channels
- **Participants**: Radio buttons
  - Specific Role: Select one role via dropdown
  - Specific Users: Multi-select menu (up to 25 users)
- **Announcement Time**: 
  - Time picker (hour:minute AM/PM)
  - Calculated relative to first game time
  - Shows "X hours before first game"
- **Reminder/Warning Times**:
  - Minute selector: 15, 30, 45, 60, 90, 120 minutes
  - Calculated from first game start time
- **Template**: Saves channel, participants, notification settings
- **Recurring**: Opens recurring schedule config

### Level 5A: Confirmation
```
✅ Session Scheduled Successfully!

📅 Date: Dec 15, 2024
🏀 Games: 5 games
⏰ First game: CLE @ BOS @ 4:30 PM PT
📍 Channel: #nba-pats
👥 Participants: @User1, @User2, @User3

**Notifications**
📢 Announcement: 9:00 AM PT
⏰ Reminder: 3:30 PM PT (60 min before)
⚠️ Warning: 4:15 PM PT (15 min before)

[📋 View All Scheduled] [📆 Schedule Another] [✅ Done]
```

### Level 5B: Session Manager
```
⚙️ Manage Session: Dec 15, 2024

📅 Date: Dec 15, 2024
🎮 Games: 5 games
⏰ First game: 4:30 PM PT (CLE @ BOS)
📍 Channel: #nba-pats
👥 Participants: @User1, @User2, @User3

**Status**: Scheduled (starts in 4 hours)

[✏️ Edit Configuration]
[➕ Add Games] [➖ Remove Games]
[👥 Edit Participants]
[🔔 Edit Notifications]
[🗑️ Delete Session]
[⬅️ Back to List]
```

---

## Recurring Schedules

### Recurring Configuration
```
🔁 Set Up Recurring Schedule

**Pattern**
○ Daily (every day with NBA games)
● Weekly (same day each week)
○ Bi-weekly (every 2 weeks)
○ Custom days

**Weekly Options**
Day: [Saturday ▼]

**Duration**
○ Until date: [Select Date ▼]
○ Number of occurrences: [4]
● Indefinite (create manually later)

**Preview**
This will create sessions for:
• Sat, Dec 19, 2024
• Sat, Dec 26, 2024
• Sat, Jan 2, 2025
• Sat, Jan 9, 2025
(and continuing...)

[✅ Create Recurring Sessions] [⬅️ Back] [❌ Cancel]
```

### Bulk Actions
```
📋 Scheduled Sessions (12 total)

[Filters: All | Today | This Week | Recurring]

Showing: Recurring "Saturday Night Games"
• Sat, Dec 19 - 12 games - @NBAFans
• Sat, Dec 26 - 8 games - @NBAFans
• Sat, Jan 2 - 11 games - @NBAFans
• Sat, Jan 9 - 9 games - @NBAFans

[✏️ Edit All] [🗑️ Delete All] [⏸️ Pause Recurring]
[Edit Individual Session...]
```

---

## Technical Implementation

### Files to Create

1. **`src/commands/patsschedule.js`**
   - Slash command definition
   - 5-level menu system
   - Game selection interface
   - Configuration UI
   - Template management
   - Recurring schedule setup

2. **`src/utils/sessionScheduler.js`**
   - Cron job management
   - Session creation automation
   - Notification scheduling
   - DM delivery system
   - User preference checking
   - Game lock listener

3. **`src/utils/notificationManager.js`**
   - Channel announcement sender
   - DM sender with preference checks
   - Template message builders
   - Jump link generator

4. **`src/utils/userPreferences.js`**
   - Settings menu UI
   - Preference get/set functions
   - Default preference initialization
   - Toggle handlers

### Files to Modify

1. **`src/commands/pats.js`**
   - Add "⚙️ Settings" button to dashboard
   - Add settings menu handler

2. **`src/index.js`**
   - Register `/patsschedule` command
   - Add interaction handlers for all menu levels
   - Add settings button handlers

3. **`src/utils/patsData.js`**
   - Add `preferences` object to user data structure
   - Initialize preferences on first interaction
   - Add username storage on every interaction

### Cron Jobs

```javascript
// Example structure
const scheduledJobs = new Map();

function scheduleSession(sessionData) {
  // Announcement job
  if (sessionData.notifications.announcement.enabled) {
    const announcementJob = cron.schedule(
      getTimeString(sessionData.notifications.announcement.time),
      () => sendAnnouncement(sessionData)
    );
    scheduledJobs.set(`${sessionData.id}_announcement`, announcementJob);
  }

  // Reminder job (check user preferences)
  if (sessionData.notifications.reminder.enabled) {
    const reminderJob = cron.schedule(
      getTimeString(calculateReminderTime(sessionData)),
      () => sendReminders(sessionData)
    );
    scheduledJobs.set(`${sessionData.id}_reminder`, reminderJob);
  }

  // Warning job (check user preferences)
  if (sessionData.notifications.warning.enabled) {
    const warningJob = cron.schedule(
      getTimeString(calculateWarningTime(sessionData)),
      () => sendWarnings(sessionData)
    );
    scheduledJobs.set(`${sessionData.id}_warning`, warningJob);
  }

  // Session start job (create actual PATS session)
  const startJob = cron.schedule(
    getTimeString(sessionData.firstGameTime),
    () => startScheduledSession(sessionData)
  );
  scheduledJobs.set(`${sessionData.id}_start`, startJob);
}

async function sendReminders(sessionData) {
  const participants = await getParticipants(sessionData);
  
  for (const user of participants) {
    // Check user's preferences
    const userPrefs = await getUserPreferences(user.id);
    if (userPrefs.dmNotifications.reminders) {
      await sendReminderDM(user, sessionData);
    }
  }
}
```

---

## Username Storage System

### Implementation Strategy
**Update on every interaction**:
```javascript
// In src/index.js (interaction handler)
if (interaction.user) {
  const userId = interaction.user.id;
  const username = interaction.user.username;
  
  // Store/update username
  if (!data.users[userId]) {
    data.users[userId] = createNewUser(userId);
  }
  data.users[userId].username = username;
  savePATSData(data);
}
```

### Display Logic
```javascript
function getDisplayUsername(userId, data) {
  return data.users[userId]?.username || `<@${userId}>`;
}
```

---

## Key Features Summary

✅ **Auto-locking**: Games lock when they start (no manual configuration)  
✅ **DM Notifications**: Reminders and warnings sent via DM to participants  
✅ **User Control**: Players can disable notifications in Settings  
✅ **Admin Control**: Set session-level notification defaults  
✅ **Role/User Selection**: Target specific role or individual users  
✅ **First Game Focus**: All messaging references the first game's start time  
✅ **Templates**: Save common configurations for quick reuse  
✅ **Recurring**: Automate weekly/bi-weekly sessions  
✅ **Flexible Timing**: Configure announcement, reminder, and warning times  
✅ **Game Lock Alerts**: Optional DM when each game locks (default: OFF)  

---

## Testing Checklist

### Scheduling
- [ ] Create session for today with 3 games
- [ ] Create session for next week
- [ ] Edit scheduled session
- [ ] Delete scheduled session
- [ ] View all scheduled sessions

### Notifications
- [ ] Verify announcement sent to channel at configured time
- [ ] Verify reminders sent via DM 60 minutes before first game
- [ ] Verify warnings sent via DM 15 minutes before first game
- [ ] Verify session auto-starts at first game time
- [ ] Verify game lock notifications sent (if enabled)

### User Preferences
- [ ] Disable reminders, verify not received
- [ ] Disable warnings, verify not received
- [ ] Disable game locks, verify not received
- [ ] Re-enable notifications, verify received again
- [ ] Verify settings persist across sessions

### Templates
- [ ] Save configuration as template
- [ ] Load template when scheduling new session
- [ ] Edit existing template
- [ ] Delete template

### Recurring
- [ ] Create weekly recurring session
- [ ] Verify 4 future sessions created
- [ ] Edit all recurring sessions at once
- [ ] Delete recurring series

### Participants
- [ ] Schedule with role, verify all role members get DMs
- [ ] Schedule with specific users, verify only those users get DMs
- [ ] Verify non-participants don't receive DMs

### Username Display
- [ ] Verify scheduled sessions show creator username
- [ ] Verify participant lists show usernames not IDs
- [ ] Verify fallback to ID if username not stored

---

## Next Steps

1. **Phase 1: Core Scheduling**
   - Create `/patsschedule` command structure
   - Build date selection and game preview menus
   - Implement basic configuration UI

2. **Phase 2: Notification System**
   - Build `sessionScheduler.js` with cron jobs
   - Implement DM sender with preference checking
   - Add game lock notification listener

3. **Phase 3: User Settings**
   - Add Settings button to dashboards
   - Create settings menu UI
   - Implement preference storage

4. **Phase 4: Advanced Features**
   - Template save/load system
   - Recurring schedule creator
   - Bulk session management

5. **Phase 5: Testing & Polish**
   - Test all notification timings
   - Verify preference overrides work
   - Test edge cases (no games, past dates, etc.)
