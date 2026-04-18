import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initDatabase } from './src/db/database';
import { navigationRef } from './src/navigation/navigationRef';
import RootNavigator from './src/navigation';
import { initAutoSync } from './src/services/syncService';
import { AuthProvider } from './src/store/AuthContext';
import { SyncProvider } from './src/store/SyncContext';

export default function App() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    initDatabase()
      .then(() => setDbReady(true))
      .catch((e) => console.error('DB init failed:', e));
  }, []);

  useEffect(() => {
    if (!dbReady) return;
    const cleanup = initAutoSync();
    return cleanup;
  }, [dbReady]);

  if (!dbReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2d6a4f" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <SyncProvider>
            <NavigationContainer ref={navigationRef}>
              <RootNavigator />
              <StatusBar style="auto" />
            </NavigationContainer>
          </SyncProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
