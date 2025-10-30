import 'react-native-gesture-handler';
import React from 'react';
import { Platform } from 'react-native';
import { enableScreens } from 'react-native-screens';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { configure } from 'mobx';
import AppNavigator from './navigation/AppNavigator';
import { StoreContext, rootStore } from './stores/RootStore';

// Configure MobX for React Native iOS compatibility
configure({
  enforceActions: 'never',
  useProxies: 'never', // CRITICAL: iOS JSC doesn't support Proxies well
  disableErrorBoundaries: false,
});

enableScreens();

export default function App() {
  return (
    <StoreContext.Provider value={rootStore}>
      <SafeAreaProvider>
        <AppNavigator />
      </SafeAreaProvider>
    </StoreContext.Provider>
  );
}
