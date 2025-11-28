import 'react-native-gesture-handler';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, LogBox, Alert, Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { enableScreens } from 'react-native-screens';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { configure } from 'mobx';
import * as Updates from 'expo-updates';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AppNavigator from './navigation/AppNavigator';
import { StoreContext, rootStore } from './stores/RootStore';
import { stopLocationTracking } from './services/locationTracker';
import { initAutoLogout, stopAutoLogout, recordActivity } from './services/autoLogout';

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
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  
  useEffect(() => {
    // Check for EAS Updates
    const checkForUpdates = async () => {
      if (__DEV__) {
        console.log('[EAS Update] Skipping update check in development mode');
        return;
      }

      try {
        console.log('[EAS Update] Checking for updates...');
        const update = await Updates.checkForUpdateAsync();
        
        if (update.isAvailable) {
          console.log('[EAS Update] Update available, fetching...');
          await Updates.fetchUpdateAsync();
          setUpdateModalVisible(true);
        } else {
          console.log('[EAS Update] App is up to date');
        }
      } catch (error) {
        console.error('[EAS Update] Error checking for updates:', error);
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
  
  const handleRestartNow = async () => {
    setIsRestarting(true);
    try {
      await Updates.reloadAsync();
    } catch (error) {
      console.error('[EAS Update] Error restarting:', error);
      setIsRestarting(false);
    }
  };
  
  return (
    <StoreContext.Provider value={rootStore}>
      <SafeAreaProvider>
        <AppNavigator navigationRef={navigationRef} />
        
        {/* Custom Update Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={updateModalVisible}
          onRequestClose={() => setUpdateModalVisible(false)}
        >
          <View style={styles.updateModalOverlay}>
            <View style={styles.updateModalContainer}>
              {/* Icon */}
              <View style={styles.updateIconContainer}>
                <LinearGradient
                  colors={['#1e5a8e', '#2d7ab8']}
                  style={styles.updateIconGradient}
                >
                  <Ionicons name="cloud-download" size={48} color="#fff" />
                </LinearGradient>
              </View>

              {/* Title */}
              <Text style={styles.updateModalTitle}>Update Available</Text>

              {/* Message */}
              <Text style={styles.updateModalMessage}>
                A new version of the app is ready to install. Restart now to get the latest features and improvements.
              </Text>

              {/* Buttons */}
              <View style={styles.updateModalButtons}>
                <TouchableOpacity
                  style={styles.updateCancelButton}
                  onPress={() => setUpdateModalVisible(false)}
                  disabled={isRestarting}
                >
                  <Text style={styles.updateCancelButtonText}>Later</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.updateConfirmButton}
                  onPress={handleRestartNow}
                  disabled={isRestarting}
                >
                  <LinearGradient
                    colors={['#1e5a8e', '#2d7ab8']}
                    style={styles.updateConfirmGradient}
                  >
                    {isRestarting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="refresh" size={18} color="#fff" style={{ marginRight: 8 }} />
                        <Text style={styles.updateConfirmButtonText}>Restart Now</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaProvider>
    </StoreContext.Provider>
  );
}

const styles = StyleSheet.create({
  updateModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  updateModalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  updateIconContainer: {
    marginBottom: 20,
  },
  updateIconGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1e5a8e',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  updateModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
    textAlign: 'center',
  },
  updateModalMessage: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  updateModalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  updateCancelButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateCancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748b',
  },
  updateConfirmButton: {
    flex: 1.5,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#1e5a8e',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  updateConfirmGradient: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateConfirmButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
