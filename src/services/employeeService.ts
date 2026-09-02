import apiClient from './apiClient';
import {
  EmployeeDto,
  EmployeeLedgerDto,
  EmployeePaymentDto,
  EmployeeRequest,
  EmployeeSummaryDto,
  PageDto,
} from '../types';

export async function getEmployees(
  farmId: number,
  opts: {
    employmentType?: 'SALARIED' | 'CASUAL';
    search?: string;
    status?: string;
    page?: number;
    size?: number;
  } = {},
): Promise<PageDto<EmployeeDto>> {
  const params: Record<string, string | number> = {};
  if (opts.employmentType) params.employmentType = opts.employmentType;
  if (opts.search) params.search = opts.search;
  if (opts.status) params.status = opts.status;
  if (opts.page !== undefined) params.page = opts.page;
  if (opts.size !== undefined) params.size = opts.size;
  const res = await apiClient.get(`/farms/${farmId}/employees`, { params });
  return res.data.data ?? { content: [], totalElements: 0, totalPages: 0, page: 0, size: 0 };
}

export async function getEmployee(farmId: number, id: number): Promise<EmployeeDto> {
  const res = await apiClient.get(`/farms/${farmId}/employees/${id}`);
  return res.data.data;
}

export async function createEmployee(farmId: number, request: EmployeeRequest): Promise<EmployeeDto> {
  const res = await apiClient.post(`/farms/${farmId}/employees`, request);
  return res.data.data;
}

export async function updateEmployee(farmId: number, id: number, request: EmployeeRequest): Promise<EmployeeDto> {
  const res = await apiClient.put(`/farms/${farmId}/employees/${id}`, request);
  return res.data.data;
}

export async function getEmployeeSummary(farmId: number, id: number): Promise<EmployeeSummaryDto> {
  const res = await apiClient.get(`/farms/${farmId}/employees/${id}/summary`);
  return res.data.data;
}

export async function getEmployeeLedger(farmId: number, id: number, year: number): Promise<EmployeeLedgerDto> {
  const res = await apiClient.get(`/farms/${farmId}/employees/${id}/ledger`, { params: { year } });
  return res.data.data;
}

export async function recordEmployeePayment(
  farmId: number,
  id: number,
  payment: { paymentDate: string; amount: number; note: string | null },
): Promise<EmployeePaymentDto> {
  const res = await apiClient.post(`/farms/${farmId}/employees/${id}/payments`, payment);
  return res.data.data;
}

export async function deleteEmployeePayment(farmId: number, id: number, paymentId: number): Promise<void> {
  await apiClient.delete(`/farms/${farmId}/employees/${id}/payments/${paymentId}`);
}
