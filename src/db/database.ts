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
      receipt_no          TEXT,
      cost                REAL    NOT NULL,
      description         TEXT,
      category_id         INTEGER,
      category_code       TEXT,
      category_name       TEXT,
      business_unit_id    INTEGER,
      business_unit_code  TEXT,
      business_unit_name  TEXT
    );

    CREATE TABLE IF NOT EXISTS local_expense_apportionments (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_local_id   INTEGER NOT NULL,
      business_unit_id   INTEGER NOT NULL,
      business_unit_code TEXT    NOT NULL,
      business_unit_name TEXT    NOT NULL,
      percentage         REAL    NOT NULL,
      amount             REAL    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_attendance_notes (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      worker_id INTEGER NOT NULL,
      note      TEXT    NOT NULL,
      UNIQUE (report_id, worker_id)
    );

    CREATE TABLE IF NOT EXISTS local_livestock_notes (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      category  TEXT    NOT NULL,
      note      TEXT    NOT NULL,
      UNIQUE (report_id, category)
    );

    CREATE TABLE IF NOT EXISTS expense_categories_cache (
      id           INTEGER PRIMARY KEY,
      account_code TEXT NOT NULL,
      account_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS business_units_cache (
      id   INTEGER PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL
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

  const migrations = [
    'ALTER TABLE local_reports ADD COLUMN submitted_at TEXT',
    'ALTER TABLE local_reports ADD COLUMN submitted_by TEXT',
    'ALTER TABLE local_expenses ADD COLUMN receipt_no TEXT',
    'ALTER TABLE local_expenses ADD COLUMN description TEXT',
    'ALTER TABLE local_expenses ADD COLUMN category_id INTEGER',
    'ALTER TABLE local_expenses ADD COLUMN category_code TEXT',
    'ALTER TABLE local_expenses ADD COLUMN category_name TEXT',
    'ALTER TABLE local_expenses ADD COLUMN business_unit_id INTEGER',
    'ALTER TABLE local_expenses ADD COLUMN business_unit_code TEXT',
    'ALTER TABLE local_expenses ADD COLUMN business_unit_name TEXT',
    'ALTER TABLE local_expenses ADD COLUMN receipt_image_uri TEXT',
    'ALTER TABLE local_attendance ADD COLUMN status TEXT',
  ];
  for (const sql of migrations) {
    try { await db.execAsync(`${sql};`); } catch {}
  }
}
