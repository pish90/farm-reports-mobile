import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, Platform, View } from 'react-native';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import LoginScreen from '../screens/LoginScreen';
import SummaryScreen from '../screens/SummaryScreen';
import { useAuth } from '../store/AuthContext';
import { RootStackParamList } from '../types';
import MainNavigator from './MainNavigator';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2d6a4f" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : user.mustChangePassword ? (
        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainNavigator} />
          <Stack.Screen
            name="Summary"
            component={SummaryScreen}
            options={{
              presentation: Platform.OS === 'ios' ? 'modal' : 'card',
              headerShown: true,
              title: 'Report Summary',
              headerTitleStyle: { fontWeight: '600', fontSize: 17 },
              headerTintColor: '#2d6a4f',
            }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
