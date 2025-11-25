import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../data');
const SCHEDULED_SESSIONS_FILE = path.join(DATA_DIR, 'scheduled-sessions.json');

// Store active cron jobs
const scheduledJobs = new Map();

/**
 * Ensure data directory and scheduled sessions file exist
 */
function ensureScheduledSessionsFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  if (!fs.existsSync(SCHEDULED_SESSIONS_FILE)) {
    const initialData = {
      sessions: [],
      templates: []
    };
    fs.writeFileSync(SCHEDULED_SESSIONS_FILE, JSON.stringify(initialData, null, 2));
  }
}

/**
 * Load scheduled sessions data
 */
export function loadScheduledSessions() {
  ensureScheduledSessionsFile();
  const data = fs.readFileSync(SCHEDULED_SESSIONS_FILE, 'utf8');
  return JSON.parse(data);
}

/**
 * Save scheduled sessions data
 */
export function saveScheduledSessions(data) {
  ensureScheduledSessionsFile();
  fs.writeFileSync(SCHEDULED_SESSIONS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Generate unique session ID
 */
function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Add a new scheduled session
 * @param {object} sessionConfig - Session configuration
 * @returns {object} Created session
 */
export function addScheduledSession(sessionConfig) {
  const data = loadScheduledSessions();
  
  const session = {
    id: generateSessionId(),
    channelId: sessionConfig.channelId,
    scheduledDate: sessionConfig.scheduledDate,
    firstGameTime: sessionConfig.firstGameTime,
    games: sessionConfig.games,
    gameDetails: sessionConfig.gameDetails,
    participantType: sessionConfig.participantType, // 'role' or 'users'
    roleId: sessionConfig.roleId || null,
    specificUsers: sessionConfig.specificUsers || [],
    notifications: {
      announcement: {
        enabled: sessionConfig.notifications.announcement.enabled,
        time: sessionConfig.notifications.announcement.time
      },
      reminder: {
        enabled: sessionConfig.notifications.reminder.enabled,
        minutesBefore: sessionConfig.notifications.reminder.minutesBefore
      },
      warning: {
        enabled: sessionConfig.notifications.warning.enabled,
        minutesBefore: sessionConfig.notifications.warning.minutesBefore
      }
    },
    createdBy: sessionConfig.createdBy,
    createdByUsername: sessionConfig.createdByUsername,
    createdAt: new Date().toISOString(),
    templateName: sessionConfig.templateName || null,
    recurring: sessionConfig.recurring || { enabled: false }
  };
  
  data.sessions.push(session);
  saveScheduledSessions(data);
  
  console.log(`[Scheduler] Created session ${session.id} for ${session.scheduledDate}`);
  return session;
}

/**
 * Get scheduled session by ID
 */
export function getScheduledSession(sessionId) {
  const data = loadScheduledSessions();
  return data.sessions.find(s => s.id === sessionId);
}

/**
 * Get all scheduled sessions
 */
export function getAllScheduledSessions() {
  const data = loadScheduledSessions();
  return data.sessions;
}

/**
 * Get upcoming scheduled sessions (not yet started)
 */
export function getUpcomingScheduledSessions() {
  const data = loadScheduledSessions();
  const now = new Date();
  return data.sessions.filter(s => new Date(s.firstGameTime) > now);
}

/**
 * Update scheduled session
 */
export function updateScheduledSession(sessionId, updates) {
  const data = loadScheduledSessions();
  const index = data.sessions.findIndex(s => s.id === sessionId);
  
  if (index === -1) {
    throw new Error('Scheduled session not found');
  }
  
  data.sessions[index] = {
    ...data.sessions[index],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  
  saveScheduledSessions(data);
  console.log(`[Scheduler] Updated session ${sessionId}`);
  return data.sessions[index];
}

/**
 * Delete scheduled session
 */
export function deleteScheduledSession(sessionId) {
  const data = loadScheduledSessions();
  const index = data.sessions.findIndex(s => s.id === sessionId);
  
  if (index === -1) {
    return false;
  }
  
  data.sessions.splice(index, 1);
  saveScheduledSessions(data);
  
  // Cancel any scheduled cron jobs for this session
  cancelSessionJobs(sessionId);
  
  console.log(`[Scheduler] Deleted session ${sessionId}`);
  return true;
}

/**
 * Cancel all cron jobs for a session
 */
function cancelSessionJobs(sessionId) {
  const jobKeys = Array.from(scheduledJobs.keys()).filter(key => key.startsWith(sessionId));
  
  jobKeys.forEach(key => {
    const job = scheduledJobs.get(key);
    if (job) {
      job.stop();
      scheduledJobs.delete(key);
      console.log(`[Scheduler] Cancelled job ${key}`);
    }
  });
}

/**
 * Save a template
 */
export function saveTemplate(templateConfig) {
  const data = loadScheduledSessions();
  
  // Check if template with same name exists
  const existingIndex = data.templates.findIndex(t => t.name === templateConfig.name);
  
  const template = {
    name: templateConfig.name,
    channelId: templateConfig.channelId,
    participantType: templateConfig.participantType,
    roleId: templateConfig.roleId || null,
    specificUsers: templateConfig.specificUsers || [],
    notifications: templateConfig.notifications,
    createdAt: existingIndex === -1 ? new Date().toISOString() : data.templates[existingIndex].createdAt,
    updatedAt: new Date().toISOString()
  };
  
  if (existingIndex !== -1) {
    data.templates[existingIndex] = template;
  } else {
    data.templates.push(template);
  }
  
  saveScheduledSessions(data);
  console.log(`[Scheduler] Saved template: ${template.name}`);
  return template;
}

/**
 * Get all templates
 */
export function getAllTemplates() {
  const data = loadScheduledSessions();
  return data.templates;
}

/**
 * Get template by name
 */
export function getTemplate(name) {
  const data = loadScheduledSessions();
  return data.templates.find(t => t.name === name);
}

/**
 * Delete template
 */
export function deleteTemplate(name) {
  const data = loadScheduledSessions();
  const index = data.templates.findIndex(t => t.name === name);
  
  if (index === -1) {
    return false;
  }
  
  data.templates.splice(index, 1);
  saveScheduledSessions(data);
  
  console.log(`[Scheduler] Deleted template: ${name}`);
  return true;
}

/**
 * Schedule cron jobs for a session
 * This will be called when the session is created or when the bot restarts
 */
export function scheduleSessionJobs(session, handlers) {
  const now = new Date();
  
  // Announcement job
  if (session.notifications.announcement.enabled) {
    const announcementTime = new Date(session.notifications.announcement.time);
    
    if (announcementTime > now) {
      const cronTime = getCronExpression(announcementTime);
      const job = cron.schedule(cronTime, () => {
        handlers.sendAnnouncement(session);
        scheduledJobs.delete(`${session.id}_announcement`);
      });
      
      scheduledJobs.set(`${session.id}_announcement`, job);
      console.log(`[Scheduler] Scheduled announcement for ${session.id} at ${announcementTime}`);
    }
  }
  
  // Reminder job
  if (session.notifications.reminder.enabled) {
    const firstGameTime = new Date(session.firstGameTime);
    const reminderTime = new Date(firstGameTime.getTime() - (session.notifications.reminder.minutesBefore * 60 * 1000));
    
    if (reminderTime > now) {
      const cronTime = getCronExpression(reminderTime);
      const job = cron.schedule(cronTime, () => {
        handlers.sendReminders(session);
        scheduledJobs.delete(`${session.id}_reminder`);
      });
      
      scheduledJobs.set(`${session.id}_reminder`, job);
      console.log(`[Scheduler] Scheduled reminder for ${session.id} at ${reminderTime}`);
    }
  }
  
  // Warning job
  if (session.notifications.warning.enabled) {
    const firstGameTime = new Date(session.firstGameTime);
    const warningTime = new Date(firstGameTime.getTime() - (session.notifications.warning.minutesBefore * 60 * 1000));
    
    if (warningTime > now) {
      const cronTime = getCronExpression(warningTime);
      const job = cron.schedule(cronTime, () => {
        handlers.sendWarnings(session);
        scheduledJobs.delete(`${session.id}_warning`);
      });
      
      scheduledJobs.set(`${session.id}_warning`, job);
      console.log(`[Scheduler] Scheduled warning for ${session.id} at ${warningTime}`);
    }
  }
  
  // Session start job
  const firstGameTime = new Date(session.firstGameTime);
  if (firstGameTime > now) {
    const cronTime = getCronExpression(firstGameTime);
    const job = cron.schedule(cronTime, () => {
      handlers.startSession(session);
      scheduledJobs.delete(`${session.id}_start`);
    });
    
    scheduledJobs.set(`${session.id}_start`, job);
    console.log(`[Scheduler] Scheduled session start for ${session.id} at ${firstGameTime}`);
  }
}

/**
 * Convert Date to cron expression
 * @param {Date} date - Target date/time
 * @returns {string} Cron expression
 */
function getCronExpression(date) {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1;
  
  return `${minute} ${hour} ${dayOfMonth} ${month} *`;
}

/**
 * Initialize scheduler - schedule all pending sessions
 * Call this when bot starts up
 */
export function initializeScheduler(handlers) {
  const sessions = getUpcomingScheduledSessions();
  
  console.log(`[Scheduler] Initializing ${sessions.length} upcoming sessions`);
  
  sessions.forEach(session => {
    scheduleSessionJobs(session, handlers);
  });
}

/**
 * Get all active cron jobs (for debugging)
 */
export function getActiveJobs() {
  return Array.from(scheduledJobs.keys());
}
