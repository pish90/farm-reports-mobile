export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Summary: undefined;
};

export type MainTabParamList = {
  Attendance: undefined;
  Livestock: undefined;
  Milk: undefined;
  Expenses: undefined;
  Admin: undefined;
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
