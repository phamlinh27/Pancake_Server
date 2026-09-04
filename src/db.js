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
      tool_name       TEXT,                       -- Tên đơn vị / tên tool
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

  // Migration: thêm cột tool_name nếu chưa có
  try {
    await run(`ALTER TABLE clients ADD COLUMN tool_name TEXT`);
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

  // Đồng bộ row cũ dạng ISO +07:00 (2026-09-04T14:58:34.036+07:00)
  // về UTC plain khớp datetime('now') (2026-09-04 07:58:34)
  const clientRows = await all('SELECT id, last_seen_at, started_at, created_at FROM clients');
  for (const r of clientRows) {
    const nl = toUtcPlain(r.last_seen_at);
    const ns = toUtcPlain(r.started_at);
    const nc = toUtcPlain(r.created_at);
    if (nl !== r.last_seen_at || ns !== r.started_at || nc !== r.created_at) {
      await run('UPDATE clients SET last_seen_at = ?, started_at = ?, created_at = ? WHERE id = ?',
        [nl, ns, nc, r.id]);
    }
  }

  const cmdRows = await all('SELECT id, created_at, delivered_at, acked_at FROM commands');
  for (const r of cmdRows) {
    const nc = toUtcPlain(r.created_at);
    const nd = toUtcPlain(r.delivered_at);
    const na = toUtcPlain(r.acked_at);
    if (nc !== r.created_at || nd !== r.delivered_at || na !== r.acked_at) {
      await run('UPDATE commands SET created_at = ?, delivered_at = ?, acked_at = ? WHERE id = ?',
        [nc, nd, na, r.id]);
    }
  }
}

// Chuyển ISO có offset về UTC plain "yyyy-MM-dd HH:mm:ss"; chuỗi plain giữ nguyên
function toUtcPlain(value) {
  if (!value || !value.includes('T')) return value;
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

module.exports = { db, run, get, all, init };
