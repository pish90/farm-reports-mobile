import { getDb } from './database';

// ─── Entity types ────────────────────────────────────────────────────────────

export interface LocalReport {
  id: number;
  farm_id: number;
  year: number;
  month: number;
  server_report_id: number | null;
  status: string;
  last_synced_at: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
}

export interface SectionSummary {
  attendance: { workerCount: number; markedSlots: number; totalSlots: number };
  livestock:  { totalTypes: number; nonZeroCount: number };
  milk:       { filledDays: number; daysInMonth: number };
  expenses:   { count: number; total: number };
}

export interface LocalAttendanceRecord {
  id: number;
  report_id: number;
  worker_id: number;
  worker_name: string;
  day_of_month: number;
  present: number; // 0 | 1 — kept for backward compat
  status: string | null; // 'P' | 'A' | 'AL' | 'SL' | 'PL'
  notes: string | null;
}

export interface LocalLivestockRecord {
  id: number;
  report_id: number;
  livestock_type_id: number;
  category: string;
  type_name: string;
  count: number;
}

export interface LocalMilkRecord {
  id: number;
  report_id: number;
  day_of_month: number;
  litres: number;
}

export interface LocalExpenseRecord {
  id: number;
  report_id: number;
  entry_no: number;
  date: string;
  supplier_contractor: string | null;
  receipt_no: string | null;
  cost: number;
  description: string | null;
  category_id: number | null;
  category_code: string | null;
  category_name: string | null;
  business_unit_id: number | null;
  business_unit_code: string | null;
  business_unit_name: string | null;
  receipt_image_uri: string | null;
}

export interface LocalExpenseApportionment {
  id: number;
  expense_local_id: number;
  business_unit_id: number;
  business_unit_code: string;
  business_unit_name: string;
  percentage: number;
  amount: number;
}

export interface LocalAttendanceNote {
  report_id: number;
  worker_id: number;
  note: string;
}

export interface LocalLivestockNote {
  report_id: number;
  category: string;
  note: string;
}

export interface SyncQueueEntry {
  id: number;
  report_id: number;
  section: string;
  synced: number;
  created_at: string;
}

export interface FullReport {
  report: LocalReport;
  attendance: LocalAttendanceRecord[];
  livestock: LocalLivestockRecord[];
  milk: LocalMilkRecord[];
  expenses: LocalExpenseRecord[];
}

// Input types (no id / report_id — provided by caller)
export type AttendanceInput = Omit<LocalAttendanceRecord, 'id' | 'report_id' | 'present'> & { present: number };
export type LivestockInput  = Omit<LocalLivestockRecord,  'id' | 'report_id'>;
export type MilkInput       = Omit<LocalMilkRecord,       'id' | 'report_id'>;
export type ExpenseInput    = Omit<LocalExpenseRecord, 'id' | 'report_id'> & {
  apportionments?: Array<{
    business_unit_id: number;
    business_unit_code: string;
    business_unit_name: string;
    percentage: number;
    amount: number;
  }>;
};

// ─── Reports ─────────────────────────────────────────────────────────────────

export async function getOrCreateLocalReport(
  farmId: number,
  year: number,
  month: number,
): Promise<LocalReport> {
  const db = getDb();
  const existing = await db.getFirstAsync<LocalReport>(
    'SELECT * FROM local_reports WHERE farm_id = ? AND year = ? AND month = ?',
    [farmId, year, month],
  );
  if (existing) return existing;

  const result = await db.runAsync(
    'INSERT INTO local_reports (farm_id, year, month) VALUES (?, ?, ?)',
    [farmId, year, month],
  );
  return {
    id: result.lastInsertRowId,
    farm_id: farmId,
    year,
    month,
    server_report_id: null,
    status: 'draft',
    last_synced_at: null,
    submitted_at: null,
    submitted_by: null,
  };
}

export async function getLocalReport(reportId: number): Promise<LocalReport | null> {
  return getDb().getFirstAsync<LocalReport>(
    'SELECT * FROM local_reports WHERE id = ?',
    [reportId],
  );
}

export async function updateServerReportId(
  localId: number,
  serverReportId: number,
): Promise<void> {
  await getDb().runAsync(
    'UPDATE local_reports SET server_report_id = ? WHERE id = ?',
    [serverReportId, localId],
  );
}

export async function updateLastSyncedAt(localId: number): Promise<void> {
  await getDb().runAsync(
    "UPDATE local_reports SET last_synced_at = datetime('now') WHERE id = ?",
    [localId],
  );
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export async function saveAttendance(
  reportId: number,
  records: AttendanceInput[],
): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM local_attendance WHERE report_id = ?', [reportId]);
    for (const r of records) {
      await db.runAsync(
        `INSERT INTO local_attendance
           (report_id, worker_id, worker_name, day_of_month, present, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [reportId, r.worker_id, r.worker_name, r.day_of_month, r.present, r.status ?? null, r.notes ?? null],
      );
    }
  });
}

// ─── Livestock ────────────────────────────────────────────────────────────────

export async function saveLivestock(
  reportId: number,
  records: LivestockInput[],
): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM local_livestock WHERE report_id = ?', [reportId]);
    for (const r of records) {
      await db.runAsync(
        `INSERT INTO local_livestock
           (report_id, livestock_type_id, category, type_name, count)
         VALUES (?, ?, ?, ?, ?)`,
        [reportId, r.livestock_type_id, r.category, r.type_name, r.count],
      );
    }
  });
}

// ─── Milk ─────────────────────────────────────────────────────────────────────

export async function saveMilk(
  reportId: number,
  records: MilkInput[],
): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM local_milk WHERE report_id = ?', [reportId]);
    for (const r of records) {
      await db.runAsync(
        'INSERT INTO local_milk (report_id, day_of_month, litres) VALUES (?, ?, ?)',
        [reportId, r.day_of_month, r.litres],
      );
    }
  });
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export async function saveExpenses(
  reportId: number,
  records: ExpenseInput[],
): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'DELETE FROM local_expense_apportionments WHERE expense_local_id IN (SELECT id FROM local_expenses WHERE report_id = ?)',
      [reportId],
    );
    await db.runAsync('DELETE FROM local_expenses WHERE report_id = ?', [reportId]);
    for (const r of records) {
      const result = await db.runAsync(
        `INSERT INTO local_expenses
           (report_id, entry_no, date, supplier_contractor, receipt_no, cost,
            description, category_id, category_code, category_name,
            business_unit_id, business_unit_code, business_unit_name, receipt_image_uri)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          reportId, r.entry_no, r.date,
          r.supplier_contractor ?? null, r.receipt_no ?? null, r.cost,
          r.description ?? null,
          r.category_id ?? null, r.category_code ?? null, r.category_name ?? null,
          r.business_unit_id ?? null, r.business_unit_code ?? null, r.business_unit_name ?? null,
          r.receipt_image_uri ?? null,
        ],
      );
      if (r.apportionments && r.apportionments.length > 0) {
        for (const ap of r.apportionments) {
          await db.runAsync(
            `INSERT INTO local_expense_apportionments
               (expense_local_id, business_unit_id, business_unit_code, business_unit_name, percentage, amount)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [result.lastInsertRowId, ap.business_unit_id, ap.business_unit_code, ap.business_unit_name, ap.percentage, ap.amount],
          );
        }
      }
    }
  });
}

export async function saveAttendanceNotes(
  reportId: number,
  notes: Array<{ worker_id: number; note: string }>,
): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM local_attendance_notes WHERE report_id = ?', [reportId]);
    for (const n of notes) {
      if (n.note.trim()) {
        await db.runAsync(
          'INSERT OR REPLACE INTO local_attendance_notes (report_id, worker_id, note) VALUES (?, ?, ?)',
          [reportId, n.worker_id, n.note.trim()],
        );
      }
    }
  });
}

export async function saveLivestockNotes(
  reportId: number,
  notes: Array<{ category: string; note: string }>,
): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM local_livestock_notes WHERE report_id = ?', [reportId]);
    for (const n of notes) {
      if (n.note.trim()) {
        await db.runAsync(
          'INSERT OR REPLACE INTO local_livestock_notes (report_id, category, note) VALUES (?, ?, ?)',
          [reportId, n.category, n.note.trim()],
        );
      }
    }
  });
}

// ─── Full report ──────────────────────────────────────────────────────────────

export async function getFullReport(reportId: number): Promise<FullReport | null> {
  const db = getDb();
  const report = await db.getFirstAsync<LocalReport>(
    'SELECT * FROM local_reports WHERE id = ?',
    [reportId],
  );
  if (!report) return null;

  const [attendance, livestock, milk, expenses] = await Promise.all([
    db.getAllAsync<LocalAttendanceRecord>(
      'SELECT * FROM local_attendance WHERE report_id = ? ORDER BY worker_id, day_of_month',
      [reportId],
    ),
    db.getAllAsync<LocalLivestockRecord>(
      'SELECT * FROM local_livestock WHERE report_id = ? ORDER BY category, type_name',
      [reportId],
    ),
    db.getAllAsync<LocalMilkRecord>(
      'SELECT * FROM local_milk WHERE report_id = ? ORDER BY day_of_month',
      [reportId],
    ),
    db.getAllAsync<LocalExpenseRecord>(
      'SELECT * FROM local_expenses WHERE report_id = ? ORDER BY entry_no',
      [reportId],
    ),
  ]);

  return { report, attendance, livestock, milk, expenses };
}

// ─── Submit ───────────────────────────────────────────────────────────────────

export async function updateReportSubmitted(
  reportId: number,
  submittedBy: string,
): Promise<void> {
  await getDb().runAsync(
    `UPDATE local_reports
     SET status = 'submitted', submitted_at = datetime('now'), submitted_by = ?
     WHERE id = ?`,
    [submittedBy, reportId],
  );
}

export async function updateReportDraft(reportId: number): Promise<void> {
  await getDb().runAsync(
    `UPDATE local_reports
     SET status = 'draft', submitted_at = NULL, submitted_by = NULL
     WHERE id = ?`,
    [reportId],
  );
}

// ─── Section summary ──────────────────────────────────────────────────────────

export async function getReportSectionSummary(
  reportId: number,
  year: number,
  month: number,
): Promise<SectionSummary> {
  const db = getDb();
  const daysInMonth = new Date(year, month, 0).getDate();

  const [attRow, liveRow, milkRow, expRow] = await Promise.all([
    db.getFirstAsync<{ worker_count: number; marked_slots: number }>(
      `SELECT COUNT(DISTINCT worker_id)               AS worker_count,
              COALESCE(SUM(present), 0)               AS marked_slots
       FROM local_attendance WHERE report_id = ?`,
      [reportId],
    ),
    db.getFirstAsync<{ total_types: number; non_zero: number }>(
      `SELECT COUNT(*)                                          AS total_types,
              COALESCE(SUM(CASE WHEN count > 0 THEN 1 ELSE 0 END), 0) AS non_zero
       FROM local_livestock WHERE report_id = ?`,
      [reportId],
    ),
    db.getFirstAsync<{ filled_days: number }>(
      `SELECT COALESCE(SUM(CASE WHEN litres > 0 THEN 1 ELSE 0 END), 0) AS filled_days
       FROM local_milk WHERE report_id = ?`,
      [reportId],
    ),
    db.getFirstAsync<{ cnt: number; total: number }>(
      `SELECT COUNT(*)                      AS cnt,
              COALESCE(SUM(cost), 0.0)      AS total
       FROM local_expenses WHERE report_id = ?`,
      [reportId],
    ),
  ]);

  const workerCount = attRow?.worker_count ?? 0;
  const markedSlots = attRow?.marked_slots ?? 0;

  return {
    attendance: { workerCount, markedSlots, totalSlots: workerCount * daysInMonth },
    livestock:  { totalTypes: liveRow?.total_types ?? 0, nonZeroCount: liveRow?.non_zero ?? 0 },
    milk:       { filledDays: milkRow?.filled_days ?? 0, daysInMonth },
    expenses:   { count: expRow?.cnt ?? 0, total: expRow?.total ?? 0 },
  };
}

// ─── Sync queue ───────────────────────────────────────────────────────────────

export async function markSectionDirty(reportId: number, section: string): Promise<void> {
  // Avoid duplicate pending entries for the same report + section
  await getDb().runAsync(
    `INSERT INTO sync_queue (report_id, section)
     SELECT ?, ?
     WHERE NOT EXISTS (
       SELECT 1 FROM sync_queue
       WHERE report_id = ? AND section = ? AND synced = 0
     )`,
    [reportId, section, reportId, section],
  );
}

export async function getPendingSyncs(reportId?: number): Promise<SyncQueueEntry[]> {
  if (reportId !== undefined) {
    return getDb().getAllAsync<SyncQueueEntry>(
      'SELECT * FROM sync_queue WHERE report_id = ? AND synced = 0 ORDER BY created_at',
      [reportId],
    );
  }
  return getDb().getAllAsync<SyncQueueEntry>(
    'SELECT * FROM sync_queue WHERE synced = 0 ORDER BY created_at',
    [],
  );
}

export async function markSectionSynced(queueId: number): Promise<void> {
  await getDb().runAsync(
    'UPDATE sync_queue SET synced = 1 WHERE id = ?',
    [queueId],
  );
}
