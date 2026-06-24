import apiClient from './apiClient';
import { PayrollEntryRequest, PayrollRecord } from '../types';

export async function getPayroll(farmId: number, year: number, month: number): Promise<PayrollRecord[]> {
  const res = await apiClient.get('/reports/payroll', { params: { farmId, year, month } });
  return res.data.data ?? [];
}

export async function savePayroll(farmId: number, year: number, month: number, entries: PayrollEntryRequest[]): Promise<void> {
  await apiClient.put('/reports/payroll', entries, { params: { farmId, year, month } });
}
