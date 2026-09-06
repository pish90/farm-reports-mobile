import { AppState, AppStateStatus } from 'react-native';
import { getDb } from '../db/database';
import {
  SyncQueueEntry,
  getCasualAttendance,
  getFullReport,
  getLocalReport,
  getPendingSyncs,
  markSectionSynced,
  updateLastSyncedAt,
  updateServerReportId,
} from '../db/reportRepository';
import apiClient from './apiClient';

// ─── Status ───────────────────────────────────────────────────────────────────

export type SyncStatus = 'idle' | 'syncing' | 'error';

let _status: SyncStatus = 'idle';
let _listeners: Array<(status: SyncStatus) => void> = [];

function setStatus(s: SyncStatus) {
  _status = s;
  _listeners.forEach((fn) => fn(s));
}

export function getSyncStatus(): SyncStatus {
  return _status;
}

export function subscribeSyncStatus(fn: (status: SyncStatus) => void): () => void {
  _listeners.push(fn);
  return () => {
    _listeners = _listeners.filter((l) => l !== fn);
  };
}

// ─── Section sync ─────────────────────────────────────────────────────────────

async function syncSection(
  serverReportId: number,
  localReportId: number,
  entry: SyncQueueEntry,
): Promise<void> {
  const full = await getFullReport(localReportId);
  if (!full) return;

  switch (entry.section) {
    case 'livestock':
      await apiClient.put(`/reports/${serverReportId}/livestock`, full.livestock.map((l) => ({
        livestockTypeId: l.livestock_type_id,
        count: l.count,
      })));
      break;

    case 'milk':
      await apiClient.put(`/reports/${serverReportId}/milk`, full.milk.map((m) => ({
        dayOfMonth: m.day_of_month,
        litres: m.litres,
      })));
      break;

    case 'expenses': {
      await apiClient.put(`/reports/${serverReportId}/expenses`, full.expenses.map((e) => ({
        entryNo: e.entry_no,
        date: e.date,
        supplierContractor: e.supplier_contractor ?? null,
        receiptNo: e.receipt_no ?? null,
        cost: e.cost,
        description: e.description ?? null,
        categoryId: e.category_id ?? null,
        businessUnitId: e.business_unit_id ?? null,
      })));
      break;
    }

    case 'livestock-notes': {
      const notes = await getDb().getAllAsync<{ category: string; note: string }>(
        'SELECT category, note FROM local_livestock_notes WHERE report_id = ?',
        [localReportId],
      );
      await apiClient.put(`/reports/${serverReportId}/livestock-notes`, {
        notes: notes.map((n) => ({ subjectId: 0, subjectKey: n.category, note: n.note })),
      });
      break;
    }

    case 'casual-attendance': {
      const casual = await getCasualAttendance(localReportId);
      if (casual.length === 0) break;
      await apiClient.put(`/reports/${serverReportId}/casual-attendance`, casual.map((ca) => {
        const status = ca.status ?? (ca.present === 1 ? 'P' : 'A');
        return {
          casualLabourerId: ca.casual_labourer_id,
          dayOfMonth: ca.day_of_month,
          present: status === 'P',
          status,
          rateOverride: ca.rate_override ?? null,
          taskDescription: ca.task_description ?? null,
        };
      }));
      break;
    }

    case 'submit':
      await apiClient.post(`/reports/${serverReportId}/submit`, {});
      break;
  }

  await markSectionSynced(entry.id);
}

// ─── syncReport ───────────────────────────────────────────────────────────────

export async function syncReport(reportId: number): Promise<void> {
  const local = await getLocalReport(reportId);
  if (!local) throw new Error(`Local report ${reportId} not found`);

  // Ensure the report exists on the server
  let serverReportId = local.server_report_id;
  if (!serverReportId) {
    const res = await apiClient.post('/reports', {
      farmId: local.farm_id,
      year: local.year,
      month: local.month,
    });
    serverReportId = res.data.data.id as number;
    await updateServerReportId(local.id, serverReportId);
  }

  const pending = await getPendingSyncs(reportId);
  for (const entry of pending) {
    await syncSection(serverReportId, reportId, entry);
  }

  await updateLastSyncedAt(reportId);
}

// ─── syncAllPending ───────────────────────────────────────────────────────────

export async function syncAllPending(): Promise<void> {
  if (_status === 'syncing') return;
  const pending = await getPendingSyncs();
  if (pending.length === 0) return;

  setStatus('syncing');
  try {
    // Unique report IDs in the order they first appeared
    const reportIds = [...new Set(pending.map((e) => e.report_id))];
    for (const id of reportIds) {
      await syncReport(id);
    }
    setStatus('idle');
  } catch {
    setStatus('error');
  }
}

// ─── NetInfo helper (optional dependency) ─────────────────────────────────────

function trySubscribeNetInfo(): (() => void) | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const NetInfo = require('@react-native-community/netinfo').default;
    return NetInfo.addEventListener(
      (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
        if (state.isConnected && state.isInternetReachable) {
          syncAllPending().catch(() => {});
        }
      },
    );
  } catch {
    // Package not installed — gracefully degrade to AppState-only sync
    return null;
  }
}

// ─── Auto-sync on foreground + connectivity restore ───────────────────────────

export function initAutoSync(): () => void {
  const appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
    if (next === 'active') syncAllPending().catch(() => {});
  });

  const netInfoUnsub = trySubscribeNetInfo();

  // Periodic sync every 30 seconds while the app is running
  const intervalId = setInterval(() => {
    syncAllPending().catch(() => {});
  }, 30_000);

  // Trigger an initial sync immediately
  syncAllPending().catch(() => {});

  return () => {
    appStateSub.remove();
    netInfoUnsub?.();
    clearInterval(intervalId);
  };
}
