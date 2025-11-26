# Data Directory

This directory contains runtime data files for the Uprise Bot.

## Setup

When first cloning the repository, copy the template files to create your data files:

```bash
cp data/pats.json.template data/pats.json
cp data/scheduled-sessions.json.template data/scheduled-sessions.json
cp data/injury-tracking.json.template data/injury-tracking.json
```

## Data Files

**These files are NOT tracked in git and should never be committed:**

- `pats.json` - Active PATS sessions, user stats, picks, and history
- `scheduled-sessions.json` - Scheduled future PATS sessions
- `injury-tracking.json` - Active injury report subscriptions

The bot will automatically create these files if they don't exist, but it's recommended to copy from templates for proper structure.

## Templates

Template files show the expected structure and are safe to commit to git:

- `pats.json.template`
- `scheduled-sessions.json.template`
- `injury-tracking.json.template`
