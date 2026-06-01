export type RootStackParamList = {
  Login: undefined;
  ChangePassword: undefined;
  Main: undefined;
  Summary: undefined;
};

export type AdminStackParamList = {
  AdminDashboard: undefined;
  AdminFarmDetail: {
    farmId: number;
    farmName: string;
    reportId: number | null;
    year: number;
    month: number;
  };
  Workers: {
    farmId: number;
    farmName: string;
  };
  AuditLog: undefined;
};

export type AuditActionType =
  | 'LOGIN' | 'LOGIN_FAILED' | 'PASSWORD_CHANGED' | 'PASSWORD_RESET'
  | 'REPORT_CREATED' | 'REPORT_SUBMITTED' | 'REPORT_REOPENED'
  | 'ATTENDANCE_UPDATED' | 'LIVESTOCK_UPDATED' | 'MILK_UPDATED'
  | 'EXPENSES_UPDATED' | 'ATTENDANCE_NOTES_UPDATED' | 'LIVESTOCK_NOTES_UPDATED'
  | 'WORKER_ADDED' | 'WORKER_DEACTIVATED'
  | 'CASUAL_LABOURER_ADDED' | 'CASUAL_LABOURER_DEACTIVATED' | 'CASUAL_ATTENDANCE_UPDATED'
  | 'EXCEL_EXPORTED';

export interface AuditLog {
  id: number;
  timestamp: string;
  userId: number | null;
  userName: string | null;
  userRole: string | null;
  farmId: number | null;
  farmName: string | null;
  action: AuditActionType;
  entityType: string | null;
  entityId: string | null;
  description: string | null;
  ipAddress: string | null;
}

export interface AuditLogPage {
  content: AuditLog[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
}

// Server-side report DTOs (returned by admin API)
export interface ServerAttendanceRecord {
  id: number;
  workerId: number;
  workerName: string;
  dayOfMonth: number;
  present: boolean;
  notes: string | null;
}

export interface ServerLivestockRecord {
  id: number;
  livestockTypeId: number;
  category: string;
  type: string;
  count: number;
}

export interface ServerMilkRecord {
  id: number;
  dayOfMonth: number;
  litres: number;
}

export interface ServerExpenseApportionment {
  businessUnitId: number;
  businessUnitCode: string;
  businessUnitName: string;
  percentage: number;
  amount: number;
}

export interface ServerExpense {
  id: number;
  entryNo: number;
  date: string;
  supplierContractor: string | null;
  receiptNo: string | null;
  cost: number;
  description: string | null;
  categoryId: number | null;
  categoryCode: string | null;
  categoryName: string | null;
  businessUnitId: number | null;
  businessUnitCode: string | null;
  businessUnitName: string | null;
  apportionments: ServerExpenseApportionment[];
}

export interface AdminReport {
  id: number;
  farmId: number;
  year: number;
  month: number;
  status: 'DRAFT' | 'SUBMITTED';
  submittedAt: string | null;
  attendance: ServerAttendanceRecord[];
  livestock: ServerLivestockRecord[];
  milk: ServerMilkRecord[];
  expenses: ServerExpense[];
}

export type MainTabParamList = {
  Attendance: undefined;
  Livestock: undefined;
  Milk: undefined;
  Expenses: undefined;
  Admin: { screen?: string; params?: object };
  Settings: undefined;
};

export interface FarmLiveStatus {
  farmId: number;
  farmName: string;
  year: number;
  month: number;
  reportStatus: 'NOT_STARTED' | 'DRAFT' | 'SUBMITTED';
  reportId: number | null;
  activeWorkers: number;
  attendanceDaysRecorded: number;
  milkTotalLitres: number;
  expenseCount: number;
  expenseTotal: number;
  livestockEntered: boolean;
}

export interface CasualLabourerDto {
  id: number;
  name: string;
  phone: string | null;
  defaultDailyRate: number;
  photoBase64: string | null;
  photoMimeType: string | null;
}

export interface CasualAttendanceRecord {
  id: number;
  casualLabourerId: number;
  casualLabourerName: string;
  dayOfMonth: number;
  present: boolean;
  status: string;
  rateOverride: number | null;
  effectiveRate: number;
  taskDescription: string | null;
}

export interface CasualLabourerPaymentDto {
  id: number;
  casualLabourerId: number;
  labourerName: string;
  paymentDate: string; // YYYY-MM-DD
  amount: number;
  note: string | null;
  paidBy: string | null;
  createdAt: string;
}

export interface CasualLabourerSummaryDto {
  allTimeEarned: number;
  allTimePaid: number;
  outstanding: number;
  payments: CasualLabourerPaymentDto[];
}

export interface CasualPayrollEntry {
  labourerId: number;
  name: string;
  phone: string | null;
  photoBase64: string | null;
  photoMimeType: string | null;
  defaultDailyRate: number;
  daysPresent: number;
  monthEarnings: number;
  allTimePaid: number;
  outstanding: number;
}

export type AttendanceStackParamList = {
  AttendanceHome: undefined;
  Workers: undefined;
};

export type LivestockStackParamList = {
  LivestockHome: undefined;
};

export type MilkStackParamList = {
  MilkHome: undefined;
};

export type ExpensesStackParamList = {
  ExpensesHome: undefined;
};

export interface CurrentUser {
  userId: number;
  farmId: number | null;
  farmName: string | null;
  userName: string;
  role: string;
  mustChangePassword: boolean;
}
