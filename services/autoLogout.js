import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { saveFormBeforeLogout } from './draftService';

// Auto-logout configuration
const IDLE_TIMEOUT_MS = 5 * 60 * 60 * 1000; // 5 hours in milliseconds
const IDLE_CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

// State
let lastActivityTime = null;
let idleCheckInterval = null;
let appStateSubscription = null;
let logoutCallback = null;

/**
 * Record user activity - resets the idle timer
 */
export const recordActivity = async () => {
  lastActivityTime = Date.now();
  await AsyncStorage.setItem('lastActivityTime', lastActivityTime.toString());
};

/**
 * Check if user has been idle for too long
 */
const checkIdleTimeout = async () => {
  if (!lastActivityTime) {
    // Try to load from storage
    const storedTime = await AsyncStorage.getItem('lastActivityTime');
    if (storedTime) {
      lastActivityTime = parseInt(storedTime, 10);
    } else {
      return; // No activity recorded, skip check
    }
  }
  
  const now = Date.now();
  const idleDuration = now - lastActivityTime;
  const hoursIdle = idleDuration / (1000 * 60 * 60);
  
  console.log(`[AutoLogout] Idle check - ${hoursIdle.toFixed(2)} hours idle`);
  
  if (idleDuration >= IDLE_TIMEOUT_MS) {
    console.log('[AutoLogout] ⏰ Idle timeout reached (5 hours) - logging out');
    await performAutoLogout('idle_timeout_5h');
  }
};

/**
 * Perform auto-logout
 */
export const performAutoLogout = async (reason = 'unknown') => {
  console.log(`[AutoLogout] 🚪 Performing auto-logout. Reason: ${reason}`);
  
  try {
    // Save any in-progress form data to drafts before logout
    console.log('[AutoLogout] 📝 Checking for unsaved form data...');
    const savedDraft = await saveFormBeforeLogout();
    if (savedDraft) {
      console.log('[AutoLogout] ✅ Form data saved to drafts before logout');
    }
    
    // Clear auth data
    await AsyncStorage.multiRemove([
      'token',
      'refresh_token',
      'userData',
      'lastActivityTime',
    ]);
    
    // Reset last activity time
    lastActivityTime = null;
    
    // Trigger the logout callback if set
    if (logoutCallback) {
      logoutCallback(reason);
    }
  } catch (error) {
    console.error('[AutoLogout] Error during auto-logout:', error);
  }
};

/**
 * Handle app state changes (background/foreground)
 */
const handleAppStateChange = async (nextAppState) => {
  console.log(`[AutoLogout] App state changed to: ${nextAppState}`);
  
  if (nextAppState === 'active') {
    // App came to foreground - check idle timeout and record activity
    await checkIdleTimeout();
    await recordActivity();
  }
};

/**
 * Initialize auto-logout monitoring
 * @param {Function} onLogout - Callback function when auto-logout occurs
 */
export const initAutoLogout = async (onLogout) => {
  console.log('[AutoLogout] 🚀 Initializing auto-logout service (5 hour idle timeout)');
  
  logoutCallback = onLogout;
  
  // Check if there's an existing last activity time
  const storedTime = await AsyncStorage.getItem('lastActivityTime');
  if (storedTime) {
    lastActivityTime = parseInt(storedTime, 10);
    console.log(`[AutoLogout] Last activity: ${new Date(lastActivityTime).toLocaleString()}`);
    
    // Check if already expired
    const idleDuration = Date.now() - lastActivityTime;
    if (idleDuration >= IDLE_TIMEOUT_MS) {
      console.log('[AutoLogout] ⏰ Already idle too long - logging out');
      await performAutoLogout('idle_timeout_5h');
      return;
    }
  } else {
    // First activity - record it
    await recordActivity();
    console.log(`[AutoLogout] First activity recorded at: ${new Date(lastActivityTime).toLocaleString()}`);
  }
  
  // Start idle check interval
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
  }
  idleCheckInterval = setInterval(checkIdleTimeout, IDLE_CHECK_INTERVAL);
  
  // Subscribe to app state changes
  if (appStateSubscription) {
    appStateSubscription.remove();
  }
  appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
  
  console.log('[AutoLogout] ✅ Auto-logout service initialized');
};

/**
 * Stop auto-logout monitoring (call on logout)
 */
export const stopAutoLogout = async () => {
  console.log('[AutoLogout] 🛑 Stopping auto-logout service');
  
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
  }
  
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
  
  // Clear last activity time
  lastActivityTime = null;
  await AsyncStorage.removeItem('lastActivityTime');
  
  logoutCallback = null;
};

/**
 * Handle session expiry from API (401 errors)
 */
export const handleSessionExpiry = async () => {
  console.log('[AutoLogout] 🔒 Session expired (401) - logging out');
  await performAutoLogout('session_expired');
};

export default {
  initAutoLogout,
  stopAutoLogout,
  recordActivity,
  performAutoLogout,
  handleSessionExpiry,
};
