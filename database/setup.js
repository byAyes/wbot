const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'data', 'nautilus.db');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db;

function getDatabase() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    initTables();
  }
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS birthdays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL,
      birthday TEXT NOT NULL,
      day INTEGER NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS hall_of_shame (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quoted_message_id TEXT NOT NULL,
      quoted_user_id TEXT NOT NULL,
      quoted_username TEXT NOT NULL,
      quoted_content TEXT,
      quoted_channel_id TEXT NOT NULL,
      quoted_message_url TEXT NOT NULL,
      nominated_by_id TEXT NOT NULL,
      nominated_by_username TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      posted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hos_quoted_msg ON hall_of_shame(quoted_message_id)
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_configs (
      guild_id TEXT PRIMARY KEY,
      hos_channel_id TEXT,
      hos_role_id TEXT,
      hos_enabled INTEGER DEFAULT 1,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// --- Birthday CRUD ---

function setBirthday(userId, username, day, month, year) {
  const db = getDatabase();
  const birthdayStr = `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;

  const existing = db.prepare('SELECT id FROM birthdays WHERE user_id = ?').get(userId);

  if (existing) {
    db.prepare(`
      UPDATE birthdays 
      SET username = ?, birthday = ?, day = ?, month = ?, year = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(username, birthdayStr, day, month, year, userId);
    return { action: 'updated', birthday: birthdayStr };
  } else {
    db.prepare(`
      INSERT INTO birthdays (user_id, username, birthday, day, month, year)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, username, birthdayStr, day, month, year);
    return { action: 'created', birthday: birthdayStr };
  }
}

function getAllBirthdays() {
  const db = getDatabase();
  return db.prepare('SELECT * FROM birthdays ORDER BY month, day').all();
}

function getUpcomingBirthdays(limit = 10) {
  const db = getDatabase();
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  // Get birthdays where (month, day) is >= today, order by upcoming
  const rows = db.prepare(`
    SELECT * FROM birthdays
    ORDER BY 
      CASE 
        WHEN month > ? OR (month = ? AND day >= ?) THEN 0
        ELSE 1
      END,
      month, day
    LIMIT ?
  `).all(currentMonth, currentMonth, currentDay, limit);

  return rows.map(entry => {
    const birthDate = new Date(now.getFullYear(), entry.month - 1, entry.day);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let diffDays;
    if (birthDate < today) {
      const nextYear = new Date(now.getFullYear() + 1, entry.month - 1, entry.day);
      diffDays = Math.ceil((nextYear - today) / (1000 * 60 * 60 * 24));
    } else {
      diffDays = Math.ceil((birthDate - today) / (1000 * 60 * 60 * 24));
    }

    return { ...entry, remainingDays: diffDays };
  });
}

function getBirthdayByUserId(userId) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM birthdays WHERE user_id = ?').get(userId);
}

function deleteBirthday(userId) {
  const db = getDatabase();
  return db.prepare('DELETE FROM birthdays WHERE user_id = ?').run(userId);
}

// Migrate old birthdays.json data if exists
function migrateFromJson() {
  const jsonPath = path.join(__dirname, '..', 'birthdays.json');
  if (fs.existsSync(jsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        const db = getDatabase();
        const insert = db.prepare(`
          INSERT OR IGNORE INTO birthdays (user_id, username, birthday, day, month, year)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        const migrate = db.transaction((entries) => {
          for (const entry of entries) {
            const parts = entry.birthday.split('-');
            if (parts.length === 3) {
              insert.run(
                entry.userId.split('@')[0],
                entry.mention || entry.userId,
                entry.birthday,
                parseInt(parts[0], 10),
                parseInt(parts[1], 10),
                parseInt(parts[2], 10)
              );
            }
          }
        });

        migrate(data);
        console.log(`Migrated ${data.length} birthdays from birthdays.json`);
      }
    } catch (err) {
      console.error('Error migrating birthdays.json:', err.message);
    }
  }
}

// Run migration on load
migrateFromJson();

// --- Hall of Shame ---

function isAlreadyInHallOfShame(quotedMessageId) {
  const db = getDatabase();
  const result = db.prepare('SELECT id FROM hall_of_shame WHERE quoted_message_id = ?').get(quotedMessageId);
  return !!result;
}

function addHallOfShameEntry(entry) {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO hall_of_shame (quoted_message_id, quoted_user_id, quoted_username, quoted_content, quoted_channel_id, quoted_message_url, nominated_by_id, nominated_by_username, guild_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.quotedMessageId,
    entry.quotedUserId,
    entry.quotedUsername,
    entry.quotedContent || null,
    entry.quotedChannelId,
    entry.quotedMessageUrl,
    entry.nominatedById,
    entry.nominatedByUsername,
    entry.guildId
  );
}

function getHallOfShameStats(guildId, limit = 10) {
  const db = getDatabase();
  return db.prepare(`
    SELECT quoted_user_id, quoted_username, COUNT(*) as count
    FROM hall_of_shame
    WHERE guild_id = ?
    GROUP BY quoted_user_id
    ORDER BY count DESC
    LIMIT ?
  `).all(guildId, limit);
}

function getRecentHallOfShame(guildId, limit = 10) {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM hall_of_shame
    WHERE guild_id = ?
    ORDER BY posted_at DESC
    LIMIT ?
  `).all(guildId, limit);
}

// --- Guild Configs ---

function getGuildConfig(guildId) {
  const db = getDatabase();
  let config = db.prepare('SELECT * FROM guild_configs WHERE guild_id = ?').get(guildId);
  if (!config) {
    // Create default config
    db.prepare('INSERT INTO guild_configs (guild_id) VALUES (?)').run(guildId);
    config = db.prepare('SELECT * FROM guild_configs WHERE guild_id = ?').get(guildId);
  }
  return config;
}

function setHosChannel(guildId, channelId) {
  const db = getDatabase();
  getGuildConfig(guildId); // ensures row exists
  db.prepare('UPDATE guild_configs SET hos_channel_id = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?').run(channelId, guildId);
}

function setHosRole(guildId, roleId) {
  const db = getDatabase();
  getGuildConfig(guildId);
  db.prepare('UPDATE guild_configs SET hos_role_id = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?').run(roleId, guildId);
}

function setHosEnabled(guildId, enabled) {
  const db = getDatabase();
  getGuildConfig(guildId);
  db.prepare('UPDATE guild_configs SET hos_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?').run(enabled ? 1 : 0, guildId);
}

module.exports = {
  getDatabase,
  setBirthday,
  getAllBirthdays,
  getUpcomingBirthdays,
  getBirthdayByUserId,
  deleteBirthday,
  isAlreadyInHallOfShame,
  addHallOfShameEntry,
  getHallOfShameStats,
  getRecentHallOfShame,
  getGuildConfig,
  setHosChannel,
  setHosRole,
  setHosEnabled,
};
