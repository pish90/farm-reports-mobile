import apiClient from './apiClient';
import { AuditLog, PageDto } from '../types';

export const auditService = {
  async getAuditLogs(params: {
    farmId?: number;
    action?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    size?: number;
  }): Promise<PageDto<AuditLog>> {
    const res = await apiClient.get('/admin/audit-logs', { params });
    return res.data.data;
  },
};
