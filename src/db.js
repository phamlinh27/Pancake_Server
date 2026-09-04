const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const DB_PATH = path.join(dataDir, 'pancake.db');
const db = new sqlite3.Database(DB_PATH);

// Promise wrappers
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Khởi tạo schema
async function init() {
  await run('PRAGMA journal_mode = WAL');
  await run('PRAGMA foreign_keys = ON');

  // Bảng client: thông tin tool đang chạy
  await run(`
    CREATE TABLE IF NOT EXISTS clients (
      id              TEXT PRIMARY KEY,           -- GUID v7
      mainboard_seri  TEXT NOT NULL,
      pancake_apikey  TEXT NOT NULL,
      misa_account    TEXT,                       -- Tài khoản kinh doanh MISA
      is_blocked      INTEGER NOT NULL DEFAULT 0, -- 1=bị khoá, không được chạy
      started_at      TEXT NOT NULL,              -- ISO 8601
      last_seen_at    TEXT,                       -- lần heartbeat gần nhất
      status          INTEGER NOT NULL DEFAULT 1, -- 1=online, 0=offline
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(mainboard_seri)
    )
  `);

  // Migration: thêm cột is_blocked nếu chưa có
  try {
    await run(`ALTER TABLE clients ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0`);
  } catch (e) {
    // Cột đã tồn tại
  }

  // Migration: thêm cột misa_account nếu chưa có
  try {
    await run(`ALTER TABLE clients ADD COLUMN misa_account TEXT`);
  } catch (e) {
    // Cột đã tồn tại
  }

  // Bảng command: lệnh điều khiển từ server gửi cho client
  await run(`
    CREATE TABLE IF NOT EXISTS commands (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id    TEXT NOT NULL,
      action       TEXT NOT NULL,                  -- restart, update_config, stop, start...
      payload      TEXT,                           -- JSON string
      status       INTEGER NOT NULL DEFAULT 0,     -- 0=pending, 1=delivered, 2=acknowledged, 3=failed
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      delivered_at TEXT,
      acked_at     TEXT,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )
  `);
}

module.exports = { db, run, get, all, init };
