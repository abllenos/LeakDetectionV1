import 'react-native-gesture-handler';
import React, { useEffect, useRef, useState } from 'react';
import { LogBox, Modal, View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { enableScreens } from 'react-native-screens';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { configure } from 'mobx';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
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
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const [updateInfo, setUpdateInfo] = useState({ currentVersion: '', latestVersion: '' });
  
  useEffect(() => {
    // Check for Play Store updates on app start
    const checkForUpdates = async () => {
      if (__DEV__) {
        console.log('[Update] Skipping update check in development mode');
        return;
      }

      try {
        console.log('[Play Store] Checking for updates...');
        const result = await updateChecker.checkForUpdate(false, true);
        
        if (result.updateAvailable && !result.isDismissed) {
          setUpdateInfo({
            currentVersion: result.currentVersion,
            latestVersion: result.latestVersion,
          });
          setUpdateModalVisible(true);
        }
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
        
        {/* Update Available Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={updateModalVisible}
          onRequestClose={() => setUpdateModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              {/* Icon */}
              <View style={styles.iconContainer}>
                <LinearGradient
                  colors={['#10b981', '#059669']}
                  style={styles.iconGradient}
                >
                  <Ionicons name="arrow-up-circle" size={48} color="#fff" />
                </LinearGradient>
              </View>

              {/* Title */}
              <Text style={styles.modalTitle}>Update Available!</Text>

              {/* Version Info */}
              <View style={styles.versionContainer}>
                <View style={styles.versionRow}>
                  <Text style={styles.versionLabel}>Current Version:</Text>
                  <Text style={styles.versionValue}>{updateInfo.currentVersion}</Text>
                </View>
                <View style={styles.versionRow}>
                  <Text style={styles.versionLabel}>New Version:</Text>
                  <Text style={[styles.versionValue, { color: '#10b981', fontWeight: '700' }]}>
                    {updateInfo.latestVersion}
                  </Text>
                </View>
              </View>

              {/* Message */}
              <Text style={styles.modalMessage}>
                A new version of LeakDetection is available with bug fixes and improvements. Update now for the best experience!
              </Text>

              {/* Buttons */}
              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={styles.laterButton}
                  onPress={() => {
                    updateChecker.dismissVersion(updateInfo.latestVersion);
                    setUpdateModalVisible(false);
                  }}
                >
                  <Text style={styles.laterButtonText}>Later</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.updateButton}
                  onPress={() => {
                    updateChecker.openStore();
                    setUpdateModalVisible(false);
                  }}
                >
                  <LinearGradient
                    colors={['#10b981', '#059669']}
                    style={styles.updateButtonGradient}
                  >
                    <Ionicons name="download-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.updateButtonText}>Update Now</Text>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
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
  iconContainer: {
    marginBottom: 20,
  },
  iconGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
    textAlign: 'center',
  },
  versionContainer: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 16,
  },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  versionLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  versionValue: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '600',
  },
  modalMessage: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  laterButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748b',
  },
  updateButton: {
    flex: 1.5,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  updateButtonGradient: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
