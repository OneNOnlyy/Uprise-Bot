# 🏆 PATS Seasons System - Blueprint

## Overview

The PATS Seasons system introduces structured competition periods with standings, awards, auto-scheduling, and historical tracking. Seasons group sessions together for competitive play, with champions crowned at the end of each season.

**Key Features:**
- Defined competition periods (weekly, monthly, custom)
- Automatic session scheduling with full configuration
- Season standings and leaderboards
- End-of-season awards and recognition
- Historical season browsing with drill-down to sessions
- Participant management per season

---

## 📅 Season Structure

### Season Types

| Type | Duration | Description |
|------|----------|-------------|
| `weekly` | 7 days | Sunday-Saturday |
| `biweekly` | 14 days | Every 2 weeks |
| `monthly` | Calendar month | 1st to last day of month |
| `custom` | X days | Admin-defined start/end dates |

### Season Phases

```
1. SETUP      → Admin creates season, assigns participants
2. ACTIVE     → Sessions run, picks are made, standings update
3. CLOSING    → Final session completes, awards calculated
4. COMPLETED  → Season archived, champion crowned
```

---

## 👥 Participant Management

### Assigning Users to Seasons

Users **must be explicitly assigned** to a season to participate. This can be done:

1. **During Season Creation** - Select participants from a user selection menu
2. **Via Admin Menu** - Add/remove participants at any time during the season
3. **Bulk Assignment** - Assign all users with PATS role in one click

### User Dashboard Behavior

When a user is assigned to an active season:
- Their `/pats dashboard` is **centered around that season**
- Shows season-specific stats, standings, and progress
- "My Stats" shows both season and all-time statistics
- Leaderboard defaults to season standings

### Non-Participant Behavior

Users NOT assigned to a season:
- Can still view the season schedule and standings (read-only)
- Cannot make picks for season sessions
- Their dashboard shows all-time stats only
- Admin can add them at any time

---

## 🏅 Season Awards

Awards are automatically calculated when a season ends.

### Award Requirements

| Award | Description | Requirement |
|-------|-------------|-------------|
| 🏆 **Season Champion** | Best win rate | Minimum **30 picks** |
| 🎯 **Sharpshooter** | Best double-down record | Minimum **5 double-downs** |
| 📈 **Volume King** | Most total picks | No minimum |
| 🔥 **Hot Streak** | Longest win streak during season | No minimum |
| 💪 **Comeback Kid** | Best record in final week | Minimum 10 picks in final week |
| 🆕 **Rookie of Season** | Best new player | **Not awarded in Season 1** |

### Rookie Definition

A "rookie" is a user who:
- Made their **first PATS pick ever** during this season
- Has never participated in a previous season
- Meets minimum 15 picks requirement

### Award Tiebreakers

1. **Champion**: Total picks → DD win rate → Head-to-head record
2. **Sharpshooter**: Total DD attempts → Overall win rate
3. **Volume King**: Win rate (if tied on picks)
4. **Hot Streak**: Most recent streak wins tiebreaker
5. **Rookie**: Total picks → DD record

---

## ⏰ Auto-Scheduling System

### Full Integration with Existing Schedule System

The auto-scheduling system **fully integrates** with the existing `/pats schedule` configuration. All settings from scheduled sessions apply to auto-scheduled season sessions.

### Schedule Configuration (Per Season)

```javascript
{
  "seasonScheduleConfig": {
    // Channel Settings
    "announcementChannelId": "1234567890",      // Where session announcements post
    "resultsChannelId": "1234567890",           // Where results post (can be same)
    
    // Timing Settings
    "autoSchedule": true,                        // Enable auto-scheduling
    "scheduleDaysAhead": 2,                      // How many days ahead to look for games
    "minGamesForSession": 3,                     // Minimum NBA games to create a session
    "sessionStartOffset": 60,                    // Minutes before first game to start session
    
    // Announcement Settings
    "announceBeforeStart": 60,                   // Minutes before session to send announcement
    "announcementMessage": null,                 // Custom message (null = default)
    
    // Reminder Settings  
    "reminders": {
      "enabled": true,
      "minutes": [60, 30],                       // When to send reminders (minutes before first game)
      "dmEnabled": true                          // Send DM reminders
    },
    
    // Warning Settings
    "warnings": {
      "enabled": true,
      "minutes": [30, 10],                       // When to send warnings (minutes before game locks)
      "dmEnabled": true                          // Send DM warnings for unpicked games
    },
    
    // Game Lock Settings
    "gameLockAlerts": {
      "enabled": true,
      "dmEnabled": false                         // DM when each game locks
    },
    
    // Auto-Close Settings
    "autoClose": {
      "enabled": true,
      "delayMinutes": 180                        // Minutes after last game ends to auto-close
    }
  }
}
```

### Daily Auto-Schedule Process

```
Daily at configured check time (e.g., 6:00 AM PST):

1. Check if season is active and auto-schedule enabled
2. For each day in scheduleDaysAhead:
   a. Fetch NBA games from API for that date
   b. If games >= minGamesForSession:
      - Check if session already scheduled for that date
      - If not, create scheduled session with:
        • Start time: First game time - sessionStartOffset
        • Announcement time: Start time - announceBeforeStart
        • All reminder/warning settings from config
        • All games for that date
   c. If games < minGamesForSession:
      - Skip day, log "insufficient games for [date]"
3. Schedule cron jobs for each new session:
   - Announcement job
   - Session start job
   - Reminder jobs
   - Warning jobs (per-game)
   - Auto-close job
4. Update season calendar
5. Post summary to admin log channel (optional)
```

### Manual Override Options

Admins can always:
- **Skip a day**: Mark a date as "no session" even if games exist
- **Force a session**: Create session even with fewer than minimum games
- **Edit scheduled session**: Change times, add/remove games
- **Cancel scheduled session**: Remove before it starts
- **Pause auto-scheduling**: Temporarily disable without ending season

---

## 📊 Data Structure

### Season Object

```javascript
{
  "seasons": {
    "current": {
      "id": "2025-12",
      "name": "December 2025",
      "type": "monthly",
      "startDate": "2025-12-01T00:00:00.000Z",
      "endDate": "2025-12-31T23:59:59.999Z",
      "status": "active", // "setup", "active", "closing", "completed"
      "participants": [
        "158054977355382785",
        "254848719420129280",
        "192242302532452352"
      ],
      "sessions": [
        "1764705601744",
        "1764795601106",
        "1764878401550"
      ],
      "standings": {
        "158054977355382785": {
          "wins": 21,
          "losses": 41,
          "pushes": 2,
          "totalPicks": 64,
          "ddWins": 3,
          "ddLosses": 2,
          "ddPushes": 0,
          "sessionsPlayed": 7,
          "currentStreak": 2,
          "longestWinStreak": 5,
          "lastWeekRecord": { "wins": 8, "losses": 5, "pushes": 0 }
        }
      },
      "scheduleConfig": {
        // Full schedule configuration (see above)
      },
      "scheduledSessions": [
        {
          "date": "2025-12-06",
          "scheduledStart": "2025-12-06T20:00:00.000Z",
          "announcementTime": "2025-12-06T19:00:00.000Z",
          "estimatedGames": 10,
          "status": "scheduled", // "pending", "scheduled", "announced", "active", "completed", "cancelled", "skipped"
          "sessionId": null,
          "skippedReason": null
        }
      ],
      "skippedDates": [
        {
          "date": "2025-12-25",
          "reason": "Christmas - No PATS"
        }
      ]
    },
    "history": [
      // Completed seasons (see Season History Entry below)
    ]
  }
}
```

### User Season Stats

```javascript
{
  "users": {
    "158054977355382785": {
      // All-time stats (existing)
      "totalWins": 28,
      "totalLosses": 71,
      "totalPushes": 1,
      "sessions": 9,
      "doubleDownsUsed": 6,
      "doubleDownWins": 2,
      "doubleDownLosses": 5,
      // ... existing fields ...
      
      // NEW: Season-specific tracking
      "seasonStats": {
        "2025-12": {
          "wins": 21,
          "losses": 41,
          "pushes": 1,
          "ddWins": 3,
          "ddLosses": 2,
          "ddPushes": 0,
          "totalPicks": 63,
          "sessionsPlayed": 7,
          "currentStreak": 2,
          "bestStreak": 5,
          "lastActiveDate": "2025-12-04"
        }
      },
      
      // For rookie tracking
      "firstEverPick": "2025-11-22T08:50:14.109Z",
      "firstSeasonId": "2025-11"
    }
  }
}
```

### Season History Entry

```javascript
{
  "id": "2025-11",
  "name": "November 2025",
  "type": "monthly",
  "startDate": "2025-11-01T00:00:00.000Z",
  "endDate": "2025-11-30T23:59:59.999Z",
  "status": "completed",
  "completedAt": "2025-12-01T00:00:00.000Z",
  
  "participants": ["158054977355382785", "254848719420129280", "192242302532452352", "245731241943498752"],
  "sessions": ["session_id_1", "session_id_2", ...],
  
  "stats": {
    "totalSessions": 15,
    "totalPicks": 287,
    "totalGames": 142,
    "averagePicksPerSession": 19.1
  },
  
  "awards": {
    "champion": {
      "userId": "192242302532452352",
      "username": "ArrowMancer",
      "winRate": 0.652,
      "record": { "wins": 45, "losses": 24, "pushes": 0 },
      "totalPicks": 69
    },
    "sharpshooter": {
      "userId": "192242302532452352",
      "username": "ArrowMancer",
      "ddWinRate": 0.80,
      "ddRecord": { "wins": 8, "losses": 2, "pushes": 0 }
    },
    "volumeKing": {
      "userId": "158054977355382785",
      "username": "grantismantis",
      "totalPicks": 156
    },
    "hotStreak": {
      "userId": "254848719420129280",
      "username": "myah7409",
      "streakLength": 12,
      "streakDates": ["2025-11-15", "2025-11-16", ...]
    },
    "comebackKid": {
      "userId": "158054977355382785",
      "username": "grantismantis",
      "finalWeekRecord": { "wins": 18, "losses": 6, "pushes": 0 },
      "finalWeekWinRate": 0.75
    },
    "rookieOfSeason": null // Not awarded in Season 1
  },
  
  "finalStandings": {
    "158054977355382785": { /* full stats */ },
    "254848719420129280": { /* full stats */ },
    // ...
  }
}
```

---

## 🖥️ User Interface

### Main Dashboard (With Active Season)

```
┌─────────────────────────────────────────────┐
│  🏀 PATS Dashboard                          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│                                             │
│  📅 Season: December 2025                   │
│  🏆 Your Rank: #2 of 4                      │
│  📊 Season Record: 21-41-1 (33.9%)          │
│  ⏳ 26 days remaining                       │
│                                             │
│  🎮 Current Session: Dec 5, 2025            │
│  └ 8 games • Picks close at tip-off         │
│                                             │
│  [🎯 Make Picks] [📊 My Stats]              │
│  [📅 Season] [🏆 Leaderboard] [⚙️ Settings] │
└─────────────────────────────────────────────┘
```

### Season Menu

```
┌─────────────────────────────────────────────┐
│  📅 Season: December 2025                   │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│                                             │
│  📊 Season Progress                         │
│  ├── Days: 5/31                             │
│  ├── Sessions: 3 completed, 1 active        │
│  ├── Your Picks: 64                         │
│  └── Participants: 4                        │
│                                             │
│  🏆 Current Standings                       │
│  #1 🥇 ArrowMancer     - 55.0% (44-36)      │
│  #2 🥈 You             - 33.9% (21-41)      │
│  #3 🥉 myah7409        - 42.1% (40-55)      │
│                                             │
│  📋 Upcoming Sessions                       │
│  ├── Fri Dec 6: 10 games (4:00 PM)          │
│  ├── Sat Dec 7: 11 games (12:00 PM)         │
│  └── Sun Dec 8: 8 games (3:00 PM)           │
│                                             │
│  [📊 Full Standings] [📅 Full Schedule]     │
│  [📜 Past Sessions] [🏆 Past Seasons]       │
│  [🔙 Back to Dashboard]                     │
└─────────────────────────────────────────────┘
```

### Full Schedule View (With Week Navigation)

```
┌─────────────────────────────────────────────┐
│  📅 December 2025 Schedule                  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│                                             │
│  📆 Week 1 (Dec 1-7)                        │
│  ┌────────────────────────────────────┐     │
│  │ Mon 1  │ ✅ 9 games  │ 27 picks    │     │
│  │ Tue 2  │ ✅ 6 games  │ 18 picks    │     │
│  │ Wed 3  │ ✅ 9 games  │ 27 picks    │     │
│  │ Thu 4  │ ✅ 5 games  │ 15 picks    │     │
│  │ Fri 5  │ 🎮 8 games  │ ACTIVE      │     │
│  │ Sat 6  │ 📋 10 games │ 4:00 PM     │     │
│  │ Sun 7  │ ⏳ 11 games │ TBD         │     │
│  └────────────────────────────────────┘     │
│                                             │
│  Legend:                                    │
│  ✅ Completed │ 🎮 Active │ 📋 Scheduled    │
│  ⏳ Pending   │ ⏭️ Skipped │ ❌ No Games    │
│                                             │
│  [◀️ Prev Week] [Week 1/5] [Next Week ▶️]   │
│  [🔙 Back to Season]                        │
└─────────────────────────────────────────────┘
```

### Season History Navigation

**Full Drill-Down Flow:**
```
Past Seasons → Select Season → View Season Details → Session List → Session Detail (full review)
```

Users can browse from season history all the way down to individual sessions and review them in depth, just like current sessions.

### Past Seasons Browser

```
┌─────────────────────────────────────────────┐
│  🏆 Past Seasons                            │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│                                             │
│  📜 Season History                          │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │ November 2025                        │   │
│  │ 🏆 Champion: ArrowMancer (65.2%)     │   │
│  │ 📊 15 sessions • 287 picks • 4 GMs   │   │
│  │ [View Details]                       │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │ October 2025                         │   │
│  │ 🏆 Champion: grantismantis (58.1%)   │   │
│  │ 📊 18 sessions • 412 picks • 6 GMs   │   │
│  │ [View Details]                       │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  [🔙 Back to Season Menu]                   │
└─────────────────────────────────────────────┘
```

### Season Detail View (From History)

```
┌─────────────────────────────────────────────┐
│  📜 November 2025                           │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│                                             │
│  🏆 Season Champion: ArrowMancer (65.2%)    │
│                                             │
│  📊 Season Stats                            │
│  ├── Duration: Nov 1 - Nov 30               │
│  ├── Sessions: 15                           │
│  ├── Total Picks: 287                       │
│  └── Participants: 4                        │
│                                             │
│  🏅 Awards                                  │
│  🏆 Champion: ArrowMancer (65.2%)           │
│  🎯 Sharpshooter: ArrowMancer (80% DD)      │
│  📈 Volume King: grantismantis (156 picks)  │
│  🔥 Hot Streak: myah7409 (12 wins)          │
│  💪 Comeback Kid: grantismantis (75% final) │
│  🆕 Rookie: N/A (Season 1)                  │
│                                             │
│  📊 Final Standings                         │
│  #1 ArrowMancer    65.2% (45-24-0)          │
│  #2 myah7409       48.3% (58-62-1)          │
│  #3 grantismantis  33.9% (53-103-0)         │
│  #4 creeperdude17  44.4% (4-5-0)            │
│                                             │
│  [📋 View Sessions] [🔙 Back]               │
└─────────────────────────────────────────────┘
```

### Session List Within Season

```
┌─────────────────────────────────────────────┐
│  📋 November 2025 Sessions                  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│                                             │
│  Select a session to view details:          │
│                                             │
│  [Select Session ▼]                         │
│  ┌──────────────────────────────────────┐   │
│  │ Nov 30 - 8 games, 24 picks           │   │
│  │ Nov 29 - 8 games, 21 picks           │   │
│  │ Nov 28 - 11 games, 33 picks          │   │
│  │ Nov 27 - 9 games, 27 picks           │   │
│  │ Nov 26 - 9 games, 27 picks           │   │
│  │ ...                                  │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  [🔙 Back to Season]                        │
└─────────────────────────────────────────────┘
```

*Selecting a session opens the **existing session detail view** with full game results, picks, and standings - same as current `/pats history` session view.*

---

## 🔧 Admin Interface

### Season Admin Menu

```
┌─────────────────────────────────────────────┐
│  ⚙️ PATS Season Admin                       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│                                             │
│  📅 Current Season: December 2025           │
│  └ Status: Active • 4 participants          │
│  └ Auto-Schedule: ✅ Enabled                │
│                                             │
│  [➕ Create Season] [✏️ Edit Season]        │
│  [👥 Manage Participants]                   │
│  [📅 Manage Schedule]                       │
│  [⚙️ Schedule Settings]                     │
│  [🏁 End Season Early]                      │
│  [🔙 Back to Admin]                         │
└─────────────────────────────────────────────┘
```

### Create Season Wizard - Step 1: Basic Info

```
┌─────────────────────────────────────────────┐
│  ➕ Create New Season (1/4)                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│                                             │
│  📝 Basic Information                       │
│                                             │
│  Season Name: [December 2025           ]    │
│                                             │
│  Type: [Select Type ▼]                      │
│    • Weekly (7 days)                        │
│    • Biweekly (14 days)                     │
│    • Monthly (calendar month)               │
│    • Custom (set dates)                     │
│                                             │
│  Start Date: [2025-12-01]                   │
│  End Date: [2025-12-31] (auto for monthly)  │
│                                             │
│  [Cancel] [Next: Participants →]            │
└─────────────────────────────────────────────┘
```

### Create Season Wizard - Step 2: Participants

```
┌─────────────────────────────────────────────┐
│  ➕ Create New Season (2/4)                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│                                             │
│  👥 Select Participants                     │
│                                             │
│  [Select Users ▼]                           │
│  ┌──────────────────────────────────────┐   │
│  │ ✓ grantismantis                      │   │
│  │ ✓ ArrowMancer                        │   │
│  │ ✓ myah7409                           │   │
│  │ □ creeperdude17                      │   │
│  │ □ newuser123                         │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  Selected: 3 participants                   │
│                                             │
│  [📋 Add All PATS Role Members]             │
│                                             │
│  [← Back] [Next: Schedule Settings →]       │
└─────────────────────────────────────────────┘
```

### Create Season Wizard - Step 3: Schedule Settings

```
┌─────────────────────────────────────────────┐
│  ➕ Create New Season (3/4)                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│                                             │
│  📅 Schedule Settings                       │
│                                             │
│  Auto-Schedule Sessions: [✓]                │
│                                             │
│  📢 Announcement Channel:                   │
│  [#pats-announcements ▼]                    │
│                                             │
│  ⏰ Session Start:                          │
│  [60] minutes before first game             │
│                                             │
│  📣 Announcement:                           │
│  [60] minutes before session starts         │
│                                             │
│  🔔 Reminders: [✓] Enabled                  │
│  At: [60, 30] minutes before first game     │
│  DM Reminders: [✓]                          │
│                                             │
│  ⚠️ Warnings: [✓] Enabled                   │
│  At: [30, 10] minutes before each game      │
│  DM Warnings: [✓]                           │
│                                             │
│  [← Back] [Next: Review →]                  │
└─────────────────────────────────────────────┘
```

### Create Season Wizard - Step 4: Review

```
┌─────────────────────────────────────────────┐
│  ➕ Create New Season (4/4)                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│                                             │
│  📋 Review Season Settings                  │
│                                             │
│  📅 Season: December 2025                   │
│  📆 Type: Monthly                           │
│  🗓️ Dates: Dec 1 - Dec 31, 2025             │
│                                             │
│  👥 Participants (3):                       │
│  • grantismantis                            │
│  • ArrowMancer                              │
│  • myah7409                                 │
│                                             │
│  ⚙️ Schedule Settings:                      │
│  • Auto-Schedule: Enabled                   │
│  • Channel: #pats-announcements             │
│  • Session Start: 60 min before games       │
│  • Reminders: 60, 30 min (DM enabled)       │
│  • Warnings: 30, 10 min (DM enabled)        │
│                                             │
│  [← Back] [✅ Create Season]                │
└─────────────────────────────────────────────┘
```

### Manage Participants

```
┌─────────────────────────────────────────────┐
│  👥 Season Participants                     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│                                             │
│  📅 December 2025                           │
│                                             │
│  Current Participants (4):                  │
│  ┌──────────────────────────────────────┐   │
│  │ grantismantis     │ 64 picks  │ [✕]  │   │
│  │ ArrowMancer       │ 44 picks  │ [✕]  │   │
│  │ myah7409          │ 55 picks  │ [✕]  │   │
│  │ creeperdude17     │ 9 picks   │ [✕]  │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  [➕ Add Participant]                        │
│  [📋 Add All PATS Role Members]             │
│  [🔙 Back]                                  │
└─────────────────────────────────────────────┘
```

### Add Participant (Selection Menu)

```
┌─────────────────────────────────────────────┐
│  ➕ Add Participant                         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│                                             │
│  Select user to add:                        │
│                                             │
│  [Select User ▼]                            │
│  ┌──────────────────────────────────────┐   │
│  │ newuser123                           │   │
│  │ basketballfan99                      │   │
│  │ pickmaster2000                       │   │
│  │ ─────────────────────────────────    │   │
│  │ ✓ grantismantis (already in season)  │   │
│  │ ✓ ArrowMancer (already in season)    │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  [Add Selected] [Cancel]                    │
└─────────────────────────────────────────────┘
```

### Manage Schedule

```
┌─────────────────────────────────────────────┐
│  📅 Season Schedule Management              │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│                                             │
│  Auto-Scheduling: ✅ Enabled                │
│  └ Next check: Tomorrow 6:00 AM PST         │
│                                             │
│  📋 Upcoming Scheduled Sessions:            │
│  ┌──────────────────────────────────────┐   │
│  │ Fri Dec 6  │ 10 games │ 4:00 PM │ ✏️ │   │
│  │ Sat Dec 7  │ 11 games │ 12:00 PM│ ✏️ │   │
│  │ Sun Dec 8  │ 8 games  │ 3:00 PM │ ✏️ │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  ⏭️ Skipped Dates:                          │
│  • Dec 25 - Christmas                       │
│                                             │
│  [➕ Add Manual Session]                     │
│  [⏭️ Skip a Date]                           │
│  [🔄 Refresh Schedule]                      │
│  [⚙️ Schedule Settings]                     │
│  [🔙 Back]                                  │
└─────────────────────────────────────────────┘
```

### Schedule Settings (Editable Mid-Season)

```
┌─────────────────────────────────────────────┐
│  ⚙️ Schedule Settings                       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│                                             │
│  These settings apply to ALL auto-scheduled │
│  sessions for this season.                  │
│                                             │
│  📢 Channels                                │
│  Announcement: [#pats-announcements ▼]      │
│  Results: [#pats-results ▼]                 │
│                                             │
│  ⏰ Timing                                  │
│  Min games for session: [3]                 │
│  Session start offset: [60] min             │
│  Announcement offset: [60] min              │
│                                             │
│  🔔 Reminders                               │
│  Enabled: [✓]  DM: [✓]                      │
│  Times: [60, 30] minutes                    │
│                                             │
│  ⚠️ Warnings                                │
│  Enabled: [✓]  DM: [✓]                      │
│  Times: [30, 10] minutes                    │
│                                             │
│  🔒 Game Lock Alerts                        │
│  Enabled: [✓]  DM: [ ]                      │
│                                             │
│  [Cancel] [💾 Save Settings]                │
└─────────────────────────────────────────────┘
```

---

## 📊 Leaderboard Integration

### Leaderboard Filters

The leaderboard now has **four views**:

```
[🌐 Global] [🔥 Blazers Uprise] [📅 This Season] [📜 All-Time]
```

| View | Description | Data Source |
|------|-------------|-------------|
| 🌐 Global | All participants, all time | `users.totalWins/totalLosses` |
| 🔥 Blazers Uprise | PATS role members only | Filtered by role `1445979227525746798` |
| 📅 This Season | Current season only | `seasons.current.standings` |
| 📜 All-Time | Historical combined (same as Global) | `users.totalWins/totalLosses` |

### Season Leaderboard Display

```
┌─────────────────────────────────────────────┐
│  🏆 December 2025 Standings                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│                                             │
│  📊 By Win Rate                             │
│  (🏆 = 30+ picks, eligible for Champion)    │
│                                             │
│  #1 🥇 ArrowMancer    55.0% (44-36-0) 🏆    │
│  #2 🥈 myah7409       42.1% (40-55-1) 🏆    │
│  #3 🥉 grantismantis  33.9% (21-41-2)       │
│      └ ⚠️ 6 more picks for 🏆               │
│  #4    creeperdude17  44.4% (4-5-0)         │
│      └ ⚠️ 21 more picks for 🏆              │
│                                             │
│  🎯 Double-Down Leaders                     │
│  (Min 5 DD for Sharpshooter 🎯)             │
│                                             │
│  #1 ArrowMancer    80.0% (8-2-0) 🎯         │
│  #2 grantismantis  50.0% (3-3-0)            │
│      └ ⚠️ 2 more DD for 🎯                  │
│  #3 myah7409       33.3% (1-2-0)            │
│                                             │
│  [🌐 Global] [🔥 Blazers] [📅 Season] [📜 All-Time]
│  [🔙 Back]                                  │
└─────────────────────────────────────────────┘
```

---

## 🔄 Session Integration

### How Sessions Connect to Seasons

When a session is created (auto or manual) during an active season:

1. Session is automatically linked to current season
2. Session ID added to `season.sessions` array
3. When session closes, results update `season.standings`
4. Streak tracking updates per-user

### Session Close Process (Updated)

```javascript
// When a session closes:
1. Calculate individual results (existing)
2. Update user all-time stats (existing)
3. NEW: If season active:
   a. Update season standings for each participant
   b. Update streak tracking
   c. Check if final week (for Comeback Kid tracking)
   d. Mark session as completed in scheduledSessions
4. Create session snapshot (existing)
5. Post results to channel (existing)
```

---

## 📁 File Structure

### New/Modified Files

```
src/
├── utils/
│   ├── patsData.js              (modify - add season methods)
│   └── patsSeasons.js           (new - season-specific logic)
├── commands/
│   └── pats.js                  (modify - add season subcommands)
data/
├── pats.json                    (modify - add seasons object)
└── snapshots/                   (existing - session snapshots)
```

### New Functions in patsSeasons.js

```javascript
// Season CRUD
createSeason(name, type, startDate, endDate, participants, scheduleConfig)
getCurrentSeason()
getSeasonById(seasonId)
updateSeason(seasonId, updates)
endSeason(seasonId)
archiveSeason(seasonId)

// Participant Management
addSeasonParticipant(seasonId, userId)
removeSeasonParticipant(seasonId, userId)
getSeasonParticipants(seasonId)
isUserInSeason(userId, seasonId)
bulkAddParticipants(seasonId, userIds)

// Standings & Stats
updateSeasonStandings(seasonId, userId, result)
getSeasonStandings(seasonId)
getUserSeasonStats(userId, seasonId)
updateStreakTracking(userId, seasonId, isWin)
trackFinalWeekStats(seasonId)

// Awards
calculateSeasonAwards(seasonId)
isRookie(userId, seasonId)
getAwardEligibility(userId, seasonId)

// Schedule
getSeasonSchedule(seasonId)
addScheduledSession(seasonId, date, time, gameCount)
updateScheduledSession(seasonId, date, updates)
removeScheduledSession(seasonId, date)
skipDate(seasonId, date, reason)

// History & Navigation
getSeasonHistory()
getSessionsInSeason(seasonId)
getSeasonSessionDetails(seasonId, sessionId)

// Auto-scheduling
runDailyScheduleCheck(seasonId)
fetchUpcomingGames(daysAhead)
shouldCreateSession(date, gameCount, minGames)
createScheduledSessionJobs(scheduledSession)
```

---

## 🚀 Implementation Phases

### Phase 1: Data Structure & Core (Week 1)
- [ ] Add seasons object to `data/pats.json` schema
- [ ] Create `src/utils/patsSeasons.js` utility file
- [ ] Implement season CRUD operations
- [ ] Add participant management functions
- [ ] Update session close to track season stats

### Phase 2: Season UI - Basic (Week 1-2)
- [ ] Update dashboard to show season info when user is assigned
- [ ] Create Season menu with basic standings
- [ ] Add season filter to leaderboard (4th toggle)
- [ ] Show "not in season" state for non-participants

### Phase 3: Admin Interface (Week 2)
- [ ] Create Season Admin menu
- [ ] Implement Create Season wizard (4 steps)
- [ ] Add participant management UI with selection menu
- [ ] Add schedule settings editor

### Phase 4: Auto-Scheduling (Week 2-3)
- [ ] Create daily schedule check cron job
- [ ] Integrate with existing `/pats schedule` config system
- [ ] Implement auto-session creation with full settings
- [ ] Add skip date functionality
- [ ] Add manual session override

### Phase 5: Season History Navigation (Week 3)
- [ ] Implement Past Seasons browser
- [ ] Add Season Detail view with awards
- [ ] Add session list within season (dropdown select)
- [ ] Connect to existing session detail view for drill-down
- [ ] Full Schedule view with week navigation

### Phase 6: Awards System (Week 3-4)
- [ ] Implement award calculation logic
- [ ] Track win streaks throughout season
- [ ] Track final week stats for Comeback Kid
- [ ] Add rookie detection (check firstEverPick)
- [ ] Skip Rookie award for Season 1
- [ ] Create end-of-season announcement embed

### Phase 7: Migration & Testing (Week 4)
- [ ] Create migration script for existing data
- [ ] Migrate Nov 22 - Nov 30 sessions to "November 2025" season
- [ ] Create "December 2025" as current season
- [ ] Calculate historical season stats for all users
- [ ] Full testing of all flows
- [ ] Bug fixes and polish

---

## 📋 Migration Plan

### Existing Data Migration

Based on current pats.json:
- **23 sessions** from Nov 22 to Dec 4, 2025
- **6 users** with varying participation

**Migration Steps:**

1. **Create "November 2025" as Season 1:**
   - Sessions Nov 22-30 (partial month)
   - Calculate standings from existing session data
   - Mark as "completed"
   - No champion if no one reaches 30 picks (likely)

2. **Create "December 2025" as Current Season:**
   - Sessions from Dec 1 onwards
   - Set all active participants
   - Calculate current standings

3. **Backfill User Stats:**
   - Parse all historical sessions
   - Calculate `seasonStats` for each user per season
   - Set `firstEverPick` dates for rookie tracking
   - Calculate best streaks from session history

4. **No Rookie Award for Season 1:**
   - Everyone is technically a "rookie" in Season 1
   - First eligible season for Rookie award is Season 2+

---

## ❓ Resolved Design Decisions

| Question | Decision |
|----------|----------|
| Can multiple seasons be active? | **No** - One active season at a time |
| Can users join mid-season? | **Yes** - Admins can add anytime via selection menu |
| Do mid-season joins qualify for champion? | **Yes** - If they reach 30 picks |
| What if no season is active? | Dashboard shows all-time stats only |
| How to break champion ties? | Total picks → DD rate → head-to-head |
| Auto-schedule settings? | **Full integration with existing /pats schedule config** |
| Participant assignment? | **Required** - via selection menu in admin or at creation |
| Can users see season without being in it? | **Yes** - read-only access to schedule/standings |

---

## 📝 Notes

- All times stored in UTC, displayed in user's timezone (PST default)
- Season stats calculated incrementally as sessions close
- Awards only finalized when season ends
- Rookie status checked against `firstEverPick` date
- First season (Season 1) will not have Rookie of Season award
- Schedule settings are per-season (can differ between seasons)
- Manual sessions during a season automatically link to that season
- Participants must be explicitly assigned - no automatic enrollment
