import { Feather } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TouchableOpacity, View } from 'react-native';
import SyncStatusBadge from '../components/shared/SyncStatusBadge';
import AttendanceScreen from '../screens/AttendanceScreen';
import ExpensesScreen from '../screens/expenses/ExpensesScreen';
import LivestockScreen from '../screens/livestock/LivestockScreen';
import MilkScreen from '../screens/milk/MilkScreen';
import { useAuth } from '../store/AuthContext';
import {
  AttendanceStackParamList,
  ExpensesStackParamList,
  LivestockStackParamList,
  MainTabParamList,
  MilkStackParamList,
} from '../types';
import { navigationRef } from './navigationRef';

const Tab = createBottomTabNavigator<MainTabParamList>();

const AttendanceStack = createNativeStackNavigator<AttendanceStackParamList>();
const LivestockStack  = createNativeStackNavigator<LivestockStackParamList>();
const MilkStack       = createNativeStackNavigator<MilkStackParamList>();
const ExpensesStack   = createNativeStackNavigator<ExpensesStackParamList>();

function AttendanceNavigator() {
  return (
    <AttendanceStack.Navigator screenOptions={{ headerShown: false }}>
      <AttendanceStack.Screen name="AttendanceHome" component={AttendanceScreen} />
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
  const { user, logout } = useAuth();

  function openSummary() {
    if (navigationRef.isReady()) {
      navigationRef.navigate('Summary');
    }
  }

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerTitle: user?.farmName ?? 'Farm Reports',
        headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12, gap: 4 }}>
            <SyncStatusBadge />
            <TouchableOpacity onPress={openSummary} style={{ padding: 4 }} hitSlop={8}>
              <Feather name="clipboard" size={20} color="#2d6a4f" />
            </TouchableOpacity>
            <TouchableOpacity onPress={logout} style={{ padding: 4, marginLeft: 4 }} hitSlop={8}>
              <Feather name="log-out" size={20} color="#e53e3e" />
            </TouchableOpacity>
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
          };
          return <Feather name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Attendance" component={AttendanceNavigator} />
      <Tab.Screen name="Livestock"  component={LivestockNavigator} />
      <Tab.Screen name="Milk"       component={MilkNavigator} />
      <Tab.Screen name="Expenses"   component={ExpensesNavigator} />
    </Tab.Navigator>
  );
}
