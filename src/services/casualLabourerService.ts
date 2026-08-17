import AsyncStorage from '@react-native-async-storage/async-storage';
import { fromByteArray } from 'base64-js';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getDb } from '../db/database';
import {
  CasualLabourerDto,
  CasualLabourerPaymentDto,
  CasualLabourerReportDto,
  CasualLabourerSummaryDto,
  CasualPayrollEntry,
  CasualWorkSessionDto,
  CreateWorkSessionRequest,
  EmployeeLedgerDto,
} from '../types';
import apiClient from './apiClient';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080/api';

interface AddCasualLabourerParams {
  name?: string;
  firstName?: string;
  lastName?: string;
  phone: string | null;
  photoBase64: string | null;
  photoMimeType: string | null;
}

interface RecordPaymentParams {
  paymentDate: string; // YYYY-MM-DD
  amount: number;
  note: string | null;
}

async function getCachedCasualLabourers(farmId: number): Promise<CasualLabourerDto[] | null> {
  try {
    const rows = await getDb().getAllAsync<{
      id: number; name: string; phone: string | null;
      photo_base64: string | null; photo_mime_type: string | null;
      employee_id: string | null; first_name: string | null; last_name: string | null;
    }>(
      'SELECT id, name, phone, photo_base64, photo_mime_type, employee_id, first_name, last_name FROM casual_labourers_cache WHERE farm_id = ? ORDER BY name',
      [farmId],
    );
    if (rows.length === 0) return null;
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      photoBase64: r.photo_base64,
      photoMimeType: r.photo_mime_type,
      employeeId: r.employee_id ?? undefined,
      firstName: r.first_name ?? undefined,
      lastName: r.last_name ?? undefined,
    }));
  } catch {
    // New columns may not exist yet if migrations haven't run — fall back to base columns
    const rows = await getDb().getAllAsync<{
      id: number; name: string; phone: string | null;
      photo_base64: string | null; photo_mime_type: string | null;
    }>(
      'SELECT id, name, phone, photo_base64, photo_mime_type FROM casual_labourers_cache WHERE farm_id = ? ORDER BY name',
      [farmId],
    );
    if (rows.length === 0) return null;
    return rows.map(r => ({ id: r.id, name: r.name, phone: r.phone, photoBase64: r.photo_base64, photoMimeType: r.photo_mime_type }));
  }
}

async function setCachedCasualLabourers(farmId: number, labourers: CasualLabourerDto[]): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM casual_labourers_cache WHERE farm_id = ?', [farmId]);
    for (const l of labourers) {
      await db.runAsync(
        `INSERT INTO casual_labourers_cache (id, farm_id, name, phone, default_daily_rate, photo_base64, photo_mime_type, employee_id, first_name, last_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [l.id, farmId, l.name, l.phone ?? null, 0, l.photoBase64 ?? null, l.photoMimeType ?? null, l.employeeId ?? null, l.firstName ?? null, l.lastName ?? null],
      );
    }
  });
}

// ── Labourers ─────────────────────────────────────────────────────────────────

export async function getCasualLabourers(farmId: number): Promise<CasualLabourerDto[]> {
  try {
    const res = await apiClient.get(`/farms/${farmId}/casual-labourers`);
    const labourers: CasualLabourerDto[] = res.data.data;
    setCachedCasualLabourers(farmId, labourers).catch(() => {}); // non-fatal: cache failure must not discard fresh data
    return labourers;
  } catch {
    const cached = await getCachedCasualLabourers(farmId);
    return cached ?? [];
  }
}

export async function addCasualLabourer(
  farmId: number,
  params: AddCasualLabourerParams,
): Promise<CasualLabourerDto> {
  const res = await apiClient.post(`/farms/${farmId}/casual-labourers`, {
    name: params.name || null,
    firstName: params.firstName || null,
    lastName: params.lastName || null,
    phone: params.phone || null,
    photoBase64: params.photoBase64 || null,
    photoMimeType: params.photoMimeType || null,
  });
  return res.data.data as CasualLabourerDto;
}

export async function updateCasualLabourer(
  farmId: number,
  labourerId: number,
  params: AddCasualLabourerParams,
): Promise<CasualLabourerDto> {
  const res = await apiClient.put(`/farms/${farmId}/casual-labourers/${labourerId}`, {
    name: params.name || null,
    firstName: params.firstName || null,
    lastName: params.lastName || null,
    phone: params.phone || null,
    photoBase64: params.photoBase64 || null,
    photoMimeType: params.photoMimeType || null,
  });
  return res.data.data as CasualLabourerDto;
}

export async function deactivateCasualLabourer(farmId: number, labourerId: number): Promise<void> {
  await apiClient.delete(`/farms/${farmId}/casual-labourers/${labourerId}`);
}

// ── Work Sessions ─────────────────────────────────────────────────────────────

export async function getWorkSessions(farmId: number): Promise<CasualWorkSessionDto[]> {
  const res = await apiClient.get(`/farms/${farmId}/casual-labourers/work-sessions`);
  return res.data.data as CasualWorkSessionDto[];
}

export async function createWorkSession(
  farmId: number,
  request: CreateWorkSessionRequest,
): Promise<CasualWorkSessionDto> {
  const res = await apiClient.post(`/farms/${farmId}/casual-labourers/work-sessions`, request);
  return res.data.data as CasualWorkSessionDto;
}

export async function updateWorkSession(
  farmId: number,
  sessionId: number,
  request: CreateWorkSessionRequest,
): Promise<CasualWorkSessionDto> {
  const res = await apiClient.put(`/farms/${farmId}/casual-labourers/work-sessions/${sessionId}`, request);
  return res.data.data as CasualWorkSessionDto;
}

export async function deleteWorkSession(farmId: number, sessionId: number): Promise<void> {
  await apiClient.delete(`/farms/${farmId}/casual-labourers/work-sessions/${sessionId}`);
}

// ── All-Summaries Report ──────────────────────────────────────────────────────

export async function getAllSummaries(farmId: number): Promise<CasualLabourerReportDto[]> {
  const res = await apiClient.get(`/farms/${farmId}/casual-labourers/all-summaries`);
  return res.data.data as CasualLabourerReportDto[];
}

// ── Summary (per-labourer) ────────────────────────────────────────────────────

export async function getCasualLabourerSummary(
  farmId: number,
  labourerId: number,
): Promise<CasualLabourerSummaryDto> {
  const res = await apiClient.get(`/farms/${farmId}/casual-labourers/${labourerId}/summary`);
  return res.data.data as CasualLabourerSummaryDto;
}

// ── Annual ledger ───────────────────────────────────────────────────────────

export async function getCasualLabourerLedger(
  farmId: number,
  labourerId: number,
  year: number,
): Promise<EmployeeLedgerDto> {
  const res = await apiClient.get(`/farms/${farmId}/casual-labourers/${labourerId}/ledger`, {
    params: { year },
  });
  return res.data.data as EmployeeLedgerDto;
}

// ── Payments ──────────────────────────────────────────────────────────────────

export async function recordPayment(
  farmId: number,
  labourerId: number,
  params: RecordPaymentParams,
): Promise<CasualLabourerPaymentDto> {
  const res = await apiClient.post(`/farms/${farmId}/casual-labourers/${labourerId}/payments`, {
    paymentDate: params.paymentDate,
    amount: params.amount,
    note: params.note || null,
  });
  return res.data.data as CasualLabourerPaymentDto;
}

export async function deletePayment(
  farmId: number,
  labourerId: number,
  paymentId: number,
): Promise<void> {
  await apiClient.delete(`/farms/${farmId}/casual-labourers/${labourerId}/payments/${paymentId}`);
}

// ── Payroll (JSON list) ───────────────────────────────────────────────────────

export async function getCasualPayroll(
  farmId: number,
  year: number,
  month: number,
): Promise<CasualPayrollEntry[]> {
  const res = await apiClient.get(`/farms/${farmId}/casual-labourers/payroll`, {
    params: { year, month },
  });
  return res.data.data as CasualPayrollEntry[];
}

// ── Export ────────────────────────────────────────────────────────────────────

export async function downloadAndShareMonthlyExcel(
  farmId: number,
  year: number,
  month: number,
): Promise<void> {
  const token = await AsyncStorage.getItem('auth_token');

  const response = await fetch(
    `${BASE_URL}/farms/${farmId}/casual-labourers/export?year=${year}&month=${month}`,
    {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
        'ngrok-skip-browser-warning': 'true',
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Server returned ${response.status}. Please try again.`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());

  const fileName = `casual-labour-${year}-${String(month).padStart(2, '0')}.xlsx`;
  const fileUri = (FileSystem.cacheDirectory ?? '') + fileName;
  await FileSystem.writeAsStringAsync(fileUri, fromByteArray(bytes), { encoding: 'base64' });

  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: 'Export Casual Labour Report',
    UTI: 'com.microsoft.excel.xlsx',
  });
}
