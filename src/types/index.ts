export type RootStackParamList = {
  Login: undefined;
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
};

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
  farmId: number;
  farmName: string;
  userName: string;
  role: string;
}
