/**
 * ReminderService - Manages scheduled reminders with persistent storage
 * Uses setInterval for periodic checks and setTimeout for individual reminders
 */
const logger = require('../utils/logger');
const db = require('../database/setup');

class ReminderService {
  constructor() {
    this.jobs = new Map(); // reminderId -> timer
    this.isRunning = false;
    this.checkInterval = null;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Check for pending reminders every minute
    this.checkInterval = setInterval(() => {
      this.checkPending();
    }, 60000);

    // Load existing pending reminders
    this.loadPending();

    logger.info('ReminderService iniciado');
  }

  async loadPending() {
    try {
      const reminders = db.getPendingReminders(new Date().toISOString());
      for (const reminder of reminders) {
        this.scheduleReminder(reminder);
      }
      logger.info(`Cargados ${reminders.length} recordatorios pendientes`);
    } catch (error) {
      logger.error('Error cargando recordatorios:', error.message);
    }
  }

  async checkPending() {
    try {
      const now = new Date().toISOString();
      const reminders = db.getPendingReminders(now);

      for (const reminder of reminders) {
        logger.info(`Recordatorio disparado: ${reminder.id} - ${reminder.message}`);
        if (this.onReminder) {
          await this.onReminder(reminder);
        }
        db.markReminderSent(reminder.id);
        this.jobs.delete(reminder.id);
      }
    } catch (error) {
      logger.error('Error verificando recordatorios:', error.message);
    }
  }

  scheduleReminder(reminder) {
    if (this.jobs.has(reminder.id)) return;

    const remindDate = new Date(reminder.remind_at);
    const now = new Date();

    if (remindDate <= now) {
      // Already overdue, trigger immediately
      if (this.onReminder) this.onReminder(reminder);
      db.markReminderSent(reminder.id);
      return;
    }

    // Schedule with setTimeout (one-off)
    const delay = remindDate - now;
    const timer = setTimeout(async () => {
      if (this.onReminder) await this.onReminder(reminder);
      db.markReminderSent(reminder.id);
      this.jobs.delete(reminder.id);
    }, delay);

    this.jobs.set(reminder.id, timer);
    logger.debug(`Recordatorio programado: ${reminder.id} en ${delay}ms`);
  }

  cancel(reminderId) {
    const timer = this.jobs.get(reminderId);
    if (timer) {
      clearTimeout(timer);
      this.jobs.delete(reminderId);
      return true;
    }
    return false;
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    for (const timer of this.jobs.values()) {
      clearTimeout(timer);
    }
    this.jobs.clear();
    this.isRunning = false;
  }
}

module.exports = ReminderService;