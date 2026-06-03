import { Feather } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TouchableOpacity, View } from 'react-native';
import SyncStatusBadge from '../components/shared/SyncStatusBadge';
import AdminDashboardScreen from '../screens/AdminDashboardScreen';
import AdminFarmDetailScreen from '../screens/AdminFarmDetailScreen';
import AuditLogScreen from '../screens/AuditLogScreen';
import AttendanceLandingScreen from '../screens/AttendanceLandingScreen';
import AttendanceScreen from '../screens/AttendanceScreen';
import CasualAttendanceScreen from '../screens/CasualAttendanceScreen';
import CreateWorkSessionScreen from '../screens/CreateWorkSessionScreen';
import SelectCasualsScreen from '../screens/SelectCasualsScreen';
import CasualReportScreen from '../screens/CasualReportScreen';
import ExpensesScreen from '../screens/expenses/ExpensesScreen';
import LivestockScreen from '../screens/livestock/LivestockScreen';
import MilkScreen from '../screens/milk/MilkScreen';
import SettingsScreen from '../screens/SettingsScreen';
import WorkersScreen from '../screens/WorkersScreen';
import { useAuth } from '../store/AuthContext';
import {
  AdminStackParamList,
  AttendanceStackParamList,
  ExpensesStackParamList,
  LivestockStackParamList,
  MainTabParamList,
  MilkStackParamList,
} from '../types';
import { navigationRef } from './navigationRef';

const AdminStack = createNativeStackNavigator<AdminStackParamList>();

function AdminNavigator() {
  return (
    <AdminStack.Navigator screenOptions={{ headerShown: false }}>
      <AdminStack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
      <AdminStack.Screen
        name="AdminFarmDetail"
        component={AdminFarmDetailScreen}
        options={{
          headerShown: true,
          headerTitleStyle: { fontWeight: '600', fontSize: 17 },
          headerTintColor: '#2d6a4f',
        }}
      />
      <AdminStack.Screen
        name="Workers"
        component={WorkersScreen}
        options={({ route }) => ({
          headerShown: true,
          title: `${(route.params as { farmName: string }).farmName} — Workers`,
          headerTitleStyle: { fontWeight: '600', fontSize: 17 },
          headerTintColor: '#2d6a4f',
        })}
      />
      <AdminStack.Screen
        name="AuditLog"
        component={AuditLogScreen}
        options={{
          headerShown: true,
          title: 'Audit Log',
          headerTitleStyle: { fontWeight: '600', fontSize: 17 },
          headerTintColor: '#2d6a4f',
        }}
      />
    </AdminStack.Navigator>
  );
}

const Tab = createBottomTabNavigator<MainTabParamList>();

const AttendanceStack = createNativeStackNavigator<AttendanceStackParamList>();
const LivestockStack  = createNativeStackNavigator<LivestockStackParamList>();
const MilkStack       = createNativeStackNavigator<MilkStackParamList>();
const ExpensesStack   = createNativeStackNavigator<ExpensesStackParamList>();

function AttendanceNavigator() {
  return (
    <AttendanceStack.Navigator screenOptions={{ headerShown: false }}>
      <AttendanceStack.Screen name="AttendanceHome" component={AttendanceLandingScreen} />
      <AttendanceStack.Screen
        name="SalariedAttendance"
        component={AttendanceScreen}
        options={{ headerShown: true, title: 'Salaried Attendance', headerTitleStyle: { fontWeight: '600', fontSize: 17 }, headerTintColor: '#2d6a4f' }}
      />
      <AttendanceStack.Screen
        name="CasualHome"
        component={CasualAttendanceScreen}
        options={{ headerShown: true, title: 'Casual Attendance', headerTitleStyle: { fontWeight: '600', fontSize: 17 }, headerTintColor: '#7c3aed' }}
      />
      <AttendanceStack.Screen
        name="CreateWorkSession"
        component={CreateWorkSessionScreen}
        options={{ headerShown: true, title: 'Work Session', headerTitleStyle: { fontWeight: '600', fontSize: 17 }, headerTintColor: '#7c3aed' }}
      />
      <AttendanceStack.Screen
        name="SelectCasuals"
        component={SelectCasualsScreen}
        options={{ headerShown: true, title: 'Choose Casuals', headerTitleStyle: { fontWeight: '600', fontSize: 17 }, headerTintColor: '#7c3aed' }}
      />
      <AttendanceStack.Screen
        name="CasualReport"
        component={CasualReportScreen}
        options={{ headerShown: true, title: 'Casual Report', headerTitleStyle: { fontWeight: '600', fontSize: 17 }, headerTintColor: '#7c3aed' }}
      />
      <AttendanceStack.Screen
        name="Workers"
        component={WorkersScreen}
        options={{ headerShown: true, title: 'Manage Workers', headerTitleStyle: { fontWeight: '600', fontSize: 17 }, headerTintColor: '#2d6a4f' }}
      />
    </AttendanceStack.Navigator>
  );
}

function LivestockNavigator() {
  return (
    <LivestockStack.Navigator screenOptions={{ headerShown: false }}>
      <LivestockStack.Screen name="LivestockHome" component={LivestockScreen} />
    </LivestockStack.Navigator>
  );
}

function MilkNavigator() {
  return (
    <MilkStack.Navigator screenOptions={{ headerShown: false }}>
      <MilkStack.Screen name="MilkHome" component={MilkScreen} />
    </MilkStack.Navigator>
  );
}

function ExpensesNavigator() {
  return (
    <ExpensesStack.Navigator screenOptions={{ headerShown: false }}>
      <ExpensesStack.Screen name="ExpensesHome" component={ExpensesScreen} />
    </ExpensesStack.Navigator>
  );
}

export default function MainNavigator() {
  const { user } = useAuth();
  const isAdmin      = user?.role === 'ADMIN';
  const isManager    = user?.role === 'MANAGER';
  const isOpsManager = user?.role === 'OPERATIONS_MANAGER';
  const showFarmTabs = !isAdmin && !isOpsManager;

  function openSummary() {
    if (navigationRef.isReady()) {
      navigationRef.navigate('Summary');
    }
  }

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerTitle: user?.farmName ?? user?.userName ?? 'Farm Reports',
        headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12, gap: 4 }}>
            {!isAdmin && !isOpsManager && <SyncStatusBadge />}
            {!isAdmin && !isOpsManager && (
              <TouchableOpacity onPress={openSummary} style={{ padding: 4 }} hitSlop={8}>
                <Feather name="clipboard" size={20} color="#2d6a4f" />
              </TouchableOpacity>
            )}
          </View>
        ),
        tabBarActiveTintColor: '#2d6a4f',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: { borderTopColor: '#eee' },
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Feather.glyphMap> = {
            Attendance: 'users',
            Livestock:  'tag',
            Milk:       'droplet',
            Expenses:   'dollar-sign',
            Admin:      isOpsManager ? 'dollar-sign' : isManager ? 'clipboard' : 'grid',
            Settings:   'settings',
          };
          return <Feather name={icons[route.name] ?? 'circle'} size={size} color={color} />;
        },
      })}
    >
      {showFarmTabs && <Tab.Screen name="Attendance" component={AttendanceNavigator} />}
      {showFarmTabs && <Tab.Screen name="Livestock"  component={LivestockNavigator} />}
      {showFarmTabs && <Tab.Screen name="Milk"       component={MilkNavigator} />}
      {showFarmTabs && <Tab.Screen name="Expenses"   component={ExpensesNavigator} />}
      {(isAdmin || isManager || isOpsManager) && (
        <Tab.Screen
          name="Admin"
          component={AdminNavigator}
          options={{
            headerShown: false,
            tabBarLabel: isOpsManager ? 'Farms' : isManager ? 'My Report' : 'Admin',
          }}
        />
      )}
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ headerTitle: 'Settings' }}
      />
    </Tab.Navigator>
  );
}
