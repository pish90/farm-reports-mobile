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
};

export type AttendanceStackParamList = {
  AttendanceHome: undefined;
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
}
