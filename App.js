import 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import { LogBox } from 'react-native';
import { enableScreens } from 'react-native-screens';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { configure } from 'mobx';
import AppNavigator from './navigation/AppNavigator';
import { StoreContext, rootStore } from './stores/RootStore';
import { stopLocationTracking } from './services/locationTracker';
import { initAutoLogout, stopAutoLogout, recordActivity } from './services/autoLogout';
import updateChecker from './services/updateChecker';

// Suppress known MobX-React Navigation compatibility warnings
LogBox.ignoreLogs([
  'Dynamic observable objects cannot be frozen',
  'Property is not configurable',
  'Cannot assign to read only property',
]);

// Patch Object.defineProperty to handle non-configurable properties
const originalDefineProperty = Object.defineProperty;
Object.defineProperty = function(obj, prop, descriptor) {
  try {
    return originalDefineProperty(obj, prop, descriptor);
  } catch (error) {
    if (error.message && error.message.includes('not configurable')) {
      // Silently ignore non-configurable property errors
      console.log(`[MobX-RN Compat] Skipping non-configurable property: ${prop}`);
      return obj;
    }
    throw error;
  }
};

// Patch Object.freeze to handle MobX observables
const originalFreeze = Object.freeze;
Object.freeze = function(obj) {
  // Check if object is a MobX observable by looking for MobX symbols
  if (obj && typeof obj === 'object') {
    const keys = Object.getOwnPropertySymbols(obj);
    const isMobXObservable = keys.some(sym => sym.toString().includes('mobx'));
    
    if (isMobXObservable) {
      console.log('[MobX-RN Compat] Prevented freezing MobX observable');
      return obj; // Return unfrozen object
    }
  }
  return originalFreeze(obj);
};

// Patch Object.isFrozen to return false for MobX observables
const originalIsFrozen = Object.isFrozen;
Object.isFrozen = function(obj) {
  if (obj && typeof obj === 'object') {
    const keys = Object.getOwnPropertySymbols(obj);
    const isMobXObservable = keys.some(sym => sym.toString().includes('mobx'));
    
    if (isMobXObservable) {
      return false; // MobX observables are never frozen
    }
  }
  return originalIsFrozen(obj);
};

// Configure MobX for React Native iOS compatibility
configure({
  enforceActions: 'never',
  useProxies: 'never', // CRITICAL: iOS JSC doesn't support Proxies well
  disableErrorBoundaries: false,
  isolateGlobalState: true,
});

enableScreens();

export default function App() {
  const navigationRef = useRef(null);
  
  useEffect(() => {
    // Check for Play Store updates on app start
    const checkForUpdates = async () => {
      if (__DEV__) {
        console.log('[Update] Skipping update check in development mode');
        return;
      }

      try {
        console.log('[Play Store] Checking for updates...');
        await updateChecker.checkForUpdate(false, true);
      } catch (error) {
        console.log('[Play Store] Update check failed:', error);
      }
    };

    checkForUpdates();
    
    // Initialize offline store
    let unsubscribe;
    
    const init = async () => {
      try {
        // Set up auto-logout callback for idle timeout (30 min) and session expiry
        const handleAutoLogout = async (reason) => {
          console.log(`[App] Auto-logout triggered. Reason: ${reason}`);
          
          // Show alert based on reason
          const message = reason === 'session_expired' 
            ? 'Your session has expired. Please log in again.'
            : reason === 'idle_timeout' || reason === 'background_timeout'
            ? 'You have been logged out due to inactivity (30 minutes).'
            : 'You have been logged out.';
          
          // Stop location tracking
          stopLocationTracking();
          
          // Stop auto-logout monitoring
          stopAutoLogout();
          
          // Clear auth state
          await rootStore.authStore.handleLogout();
          
          // Navigate to splash screen
          if (navigationRef.current) {
            navigationRef.current.reset({
              index: 0,
              routes: [{ name: 'Splash' }],
            });
          }
          
          // Show alert after navigation
          setTimeout(() => {
            Alert.alert('Session Ended', message);
          }, 500);
        };
        
        // Initialize auto-logout service (30 min idle timeout)
        initAutoLogout(handleAutoLogout);
        
        // Set up logout callback for 24-hour timeout
        rootStore.offlineStore.setLogoutCallback(async () => {
          console.log('[App] 24-hour offline timeout - forcing logout');
          
          // Stop location tracking
          stopLocationTracking();
          
          // Stop auto-logout
          stopAutoLogout();
          
          // Logout and clear auth
          await rootStore.authStore.handleLogout();
          
          // Navigate to splash screen
          if (navigationRef.current) {
            navigationRef.current.reset({
              index: 0,
              routes: [{ name: 'Splash' }],
            });
          }
        });
        
        unsubscribe = await rootStore.offlineStore.initialize();
        console.log('[App] Offline store initialized');
      } catch (error) {
        console.error('[App] Error initializing offline store:', error);
      }
    };
    
    init();
    
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      rootStore.offlineStore.cleanup();
      stopAutoLogout();
    };
  }, []);
  
  return (
    <StoreContext.Provider value={rootStore}>
      <SafeAreaProvider>
        <AppNavigator navigationRef={navigationRef} />
      </SafeAreaProvider>
    </StoreContext.Provider>
  );
}
