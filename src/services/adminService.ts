import apiClient from './apiClient';
import { FarmLiveStatus } from '../types';

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
};
