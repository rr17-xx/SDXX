/**
 * 数据层：SQLite（默认，零配置） / Postgres（设置 DATABASE_URL 时自动启用）
 * 两边统一暴露 async 的 all / get / run 三个方法，占位符统一写 ?
 */
const path = require('path');
const fs = require('fs');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS letters (
  id              TEXT PRIMARY KEY,
  content         TEXT NOT NULL,
  mood            TEXT NOT NULL DEFAULT '🌱',
  nickname        TEXT NOT NULL DEFAULT '',
  want_public     INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'private',
  author_key      TEXT NOT NULL,
  pickup_code     TEXT NOT NULL UNIQUE,
  owner_reply     TEXT NOT NULL DEFAULT '',
  owner_replied_at TEXT,
  read_at         TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS replies (
  id         TEXT PRIMARY KEY,
  letter_id  TEXT NOT NULL,
  content    TEXT NOT NULL,
  nickname   TEXT NOT NULL DEFAULT '',
  is_owner   INTEGER NOT NULL DEFAULT 0,
  hidden     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_letters_status  ON letters(status, created_at);
CREATE INDEX IF NOT EXISTS idx_letters_author  ON letters(author_key);
CREATE INDEX IF NOT EXISTS idx_replies_letter  ON replies(letter_id);
`;

let driver = 'sqlite';
let sqlite = null;
let pool = null;

/** 把 ? 占位符转成 Postgres 的 $1 $2 ... */
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function init() {
  if (process.env.DATABASE_URL) {
    driver = 'postgres';
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost')
        ? false
        : { rejectUnauthorized: false },
    });
    for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) {
      await pool.query(stmt);
    }
    console.log('[db] 使用 Postgres');
    return;
  }

  driver = 'sqlite';
  const dir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dir, { recursive: true });
  const Database = require('better-sqlite3');
  sqlite = new Database(process.env.SQLITE_PATH || path.join(dir, 'treehole.db'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec(SCHEMA);
  console.log('[db] 使用 SQLite -> ' + (process.env.SQLITE_PATH || path.join(dir, 'treehole.db')));
}

async function all(sql, params = []) {
  if (driver === 'postgres') {
    const r = await pool.query(toPg(sql), params);
    return r.rows;
  }
  return sqlite.prepare(sql).all(...params);
}

async function get(sql, params = []) {
  if (driver === 'postgres') {
    const r = await pool.query(toPg(sql), params);
    return r.rows[0] || null;
  }
  return sqlite.prepare(sql).get(...params) || null;
}

async function run(sql, params = []) {
  if (driver === 'postgres') {
    await pool.query(toPg(sql), params);
    return;
  }
  sqlite.prepare(sql).run(...params);
}

module.exports = { init, all, get, run, driverName: () => driver };
