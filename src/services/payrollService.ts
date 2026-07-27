import apiClient from './apiClient';
import { PayrollEntryRequest, PayrollRecord } from '../types';

export async function getPayroll(farmId: number, year: number, month: number): Promise<PayrollRecord[]> {
  const res = await apiClient.get('/reports/payroll', { params: { farmId, year, month } });
  return res.data.data ?? [];
}

export async function saveEmployeePayrollEntry(
  farmId: number, year: number, month: number, employeeId: number, entry: PayrollEntryRequest,
): Promise<PayrollRecord> {
  const res = await apiClient.put(`/reports/payroll/${employeeId}`, entry, { params: { farmId, year, month } });
  return res.data.data;
}
