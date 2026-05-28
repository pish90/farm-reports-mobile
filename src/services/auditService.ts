import apiClient from './apiClient';
import { AuditLogPage } from '../types';

export const auditService = {
  async getAuditLogs(params: {
    farmId?: number;
    action?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    size?: number;
  }): Promise<AuditLogPage> {
    const res = await apiClient.get('/admin/audit-logs', { params });
    return res.data.data;
  },
};
