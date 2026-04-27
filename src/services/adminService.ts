import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import apiClient from './apiClient';
import { AdminReport, FarmLiveStatus, ServerExpense } from '../types';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080/api';

export interface ExpenseEntryPayload {
  entryNo: number;
  date: string;
  supplierContractor: string | null;
  receiptNo: string | null;
  cost: number;
  description: string | null;
  categoryId: number | null;
  businessUnitId: number | null;
  apportionments?: Array<{
    businessUnitId: number;
    businessUnitCode: string;
    businessUnitName: string;
    percentage: number;
    amount: number;
  }>;
}

export interface MilkEntryPayload {
  dayOfMonth: number;
  litres: number;
}

export const adminService = {
  async getFarmLiveStatus(year?: number, month?: number): Promise<FarmLiveStatus[]> {
    const params: Record<string, number> = {};
    if (year)  params.year  = year;
    if (month) params.month = month;
    const res = await apiClient.get('/admin/live-status', { params });
    return res.data.data;
  },

  async resetUserPassword(email: string, newPassword: string): Promise<void> {
    await apiClient.put('/admin/users/reset-password', { email, newPassword });
  },

  async getOrCreateReport(farmId: number, year: number, month: number): Promise<AdminReport> {
    try {
      const res = await apiClient.get(`/admin/farms/${farmId}/report`, { params: { year, month } });
      return res.data.data;
    } catch (err: any) {
      if (err?.response?.status === 404) {
        const res = await apiClient.post(`/admin/farms/${farmId}/report`, null, { params: { year, month } });
        return res.data.data;
      }
      throw err;
    }
  },

  async getReport(reportId: number): Promise<AdminReport> {
    const res = await apiClient.get(`/admin/reports/${reportId}`);
    return res.data.data;
  },

  async reopenReport(reportId: number): Promise<AdminReport> {
    const res = await apiClient.post(`/admin/reports/${reportId}/reopen`);
    return res.data.data;
  },

  async submitReport(reportId: number, farmId: number): Promise<AdminReport> {
    const res = await apiClient.post(`/admin/reports/${reportId}/submit`, null, { params: { farmId } });
    return res.data.data;
  },

  async upsertExpenses(reportId: number, farmId: number, entries: ExpenseEntryPayload[]): Promise<void> {
    await apiClient.put(`/admin/reports/${reportId}/expenses`, entries, { params: { farmId } });
  },

  async upsertMilk(reportId: number, farmId: number, entries: MilkEntryPayload[]): Promise<void> {
    await apiClient.put(`/admin/reports/${reportId}/milk`, entries, { params: { farmId } });
  },

  async downloadAllFarmsExcel(year: number, month: number): Promise<void> {
    const token = await AsyncStorage.getItem('auth_token');
    const filename = `farm-reports-${year}-${String(month).padStart(2, '0')}.xlsx`;
    const localUri = (FileSystem.cacheDirectory ?? '') + filename;

    const result = await FileSystem.downloadAsync(
      `${BASE_URL}/admin/export/excel?year=${year}&month=${month}`,
      localUri,
      { headers: { Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' } },
    );

    if (result.status !== 200) {
      throw new Error('Download failed');
    }

    await Sharing.shareAsync(result.uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Save Farm Reports',
      UTI: 'com.microsoft.excel.xlsx',
    });
  },

  async downloadFarmExcel(reportId: number, farmName: string, year: number, month: number): Promise<void> {
    const token = await AsyncStorage.getItem('auth_token');
    const safeName = farmName.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/, '');
    const filename = `${safeName}_${year}-${String(month).padStart(2, '0')}.xlsx`;
    const localUri = (FileSystem.cacheDirectory ?? '') + filename;

    const result = await FileSystem.downloadAsync(
      `${BASE_URL}/reports/${reportId}/export`,
      localUri,
      { headers: { Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' } },
    );

    if (result.status !== 200) {
      throw new Error('Download failed');
    }

    await Sharing.shareAsync(result.uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Save Farm Report',
      UTI: 'com.microsoft.excel.xlsx',
    });
  },
};

export function serverExpenseToLocal(e: ServerExpense, reportId: number) {
  return {
    id: e.id,
    report_id: reportId,
    entry_no: e.entryNo,
    date: e.date,
    supplier_contractor: e.supplierContractor,
    receipt_no: e.receiptNo,
    cost: e.cost,
    description: e.description,
    category_id: e.categoryId,
    category_code: e.categoryCode,
    category_name: e.categoryName,
    business_unit_id: e.businessUnitId,
    business_unit_code: e.businessUnitCode,
    business_unit_name: e.businessUnitName,
    receipt_image_uri: null as string | null,
  };
}
