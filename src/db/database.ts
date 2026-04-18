import * as SQLite from 'expo-sqlite';

let _db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!_db) {
    _db = SQLite.openDatabaseSync('farm_reports.db');
  }
  return _db;
}

export async function initDatabase(): Promise<void> {
  const db = getDb();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS local_reports (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      farm_id          INTEGER NOT NULL,
      year             INTEGER NOT NULL,
      month            INTEGER NOT NULL,
      server_report_id INTEGER,
      status           TEXT    NOT NULL DEFAULT 'draft',
      last_synced_at   TEXT,
      submitted_at     TEXT,
      submitted_by     TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_local_reports_farm_year_month
      ON local_reports (farm_id, year, month);

    CREATE TABLE IF NOT EXISTS local_attendance (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id    INTEGER NOT NULL,
      worker_id    INTEGER NOT NULL,
      worker_name  TEXT    NOT NULL,
      day_of_month INTEGER NOT NULL,
      present      INTEGER NOT NULL DEFAULT 0,
      notes        TEXT
    );

    CREATE TABLE IF NOT EXISTS local_livestock (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id         INTEGER NOT NULL,
      livestock_type_id INTEGER NOT NULL,
      category          TEXT    NOT NULL,
      type_name         TEXT    NOT NULL,
      count             INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_milk (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id    INTEGER NOT NULL,
      day_of_month INTEGER NOT NULL,
      litres       REAL    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_expenses (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id           INTEGER NOT NULL,
      entry_no            INTEGER NOT NULL,
      date                TEXT    NOT NULL,
      supplier_contractor TEXT,
      ref_no              TEXT,
      cost                REAL    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id  INTEGER NOT NULL,
      section    TEXT    NOT NULL,
      synced     INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS livestock_types_cache (
      id        INTEGER NOT NULL,
      farm_id   INTEGER NOT NULL,
      category  TEXT    NOT NULL,
      type_name TEXT    NOT NULL,
      PRIMARY KEY (id, farm_id)
    );

    CREATE TABLE IF NOT EXISTS workers_cache (
      id      INTEGER NOT NULL,
      farm_id INTEGER NOT NULL,
      name    TEXT    NOT NULL,
      PRIMARY KEY (id, farm_id)
    );
  `);

  // Migration: add submitted columns for existing installs (no-op on fresh install)
  for (const col of ['submitted_at TEXT', 'submitted_by TEXT']) {
    try {
      await db.execAsync(`ALTER TABLE local_reports ADD COLUMN ${col};`);
    } catch {}
  }
}
