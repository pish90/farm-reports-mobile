import apiClient from './apiClient';
import {
  EmployeeDto,
  EmployeeLedgerDto,
  EmployeePaymentDto,
  EmployeeRequest,
  EmployeeSummaryDto,
} from '../types';

export async function getEmployees(
  farmId: number,
  employmentType?: 'SALARIED' | 'CASUAL',
  search?: string,
): Promise<EmployeeDto[]> {
  const params: Record<string, string> = {};
  if (employmentType) params.employmentType = employmentType;
  if (search) params.search = search;
  const res = await apiClient.get(`/farms/${farmId}/employees`, { params });
  return res.data.data ?? [];
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
