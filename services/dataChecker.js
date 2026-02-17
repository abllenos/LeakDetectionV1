import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkForNewData } from './interceptor';

const LAST_CHECK_KEY = 'lastDataCheck';
const CHECK_INTERVAL = 60 * 60 * 1000; // Check every 1 hour (in milliseconds)

/**
 * Check if new customer data is available and notify user
 * This runs in the background and can be called periodically
 */
export const checkAndNotifyNewData = async () => {
  try {
    // Check if we should run (avoid too frequent checks)
    const lastCheck = await AsyncStorage.getItem(LAST_CHECK_KEY);
    const now = Date.now();

    if (lastCheck) {
      const timeSinceLastCheck = now - parseInt(lastCheck);
      if (timeSinceLastCheck < CHECK_INTERVAL) {
        console.log(`⏱️ Skipping data check (checked ${Math.round(timeSinceLastCheck / 1000 / 60)} min ago)`);
        return null;
      }
    }

    console.log('🔍 Checking for new customer data...');

    // Check for new data
    const result = await checkForNewData();

    // If skipped due to no authentication, don't update last check time
    if (result.skipped) {
      console.log('⏭️ Data check skipped - user not authenticated');
      return null;
    }

    // Update last check time
    await AsyncStorage.setItem(LAST_CHECK_KEY, now.toString());

    if (result.hasNewData) {
      console.log(`🔔 New data detected: ${result.difference} new customers available`);

      // Return update info (used by SettingsScreen)
      return {
        title: 'New Customer Data Available',
        message: `${result.difference.toLocaleString()} new customer${result.difference > 1 ? 's' : ''} available for download`,
        type: 'data_update',
        data: {
          localCount: result.localCount,
          remoteCount: result.remoteCount,
          difference: result.difference
        }
      };
    } else if (result.needsDownload) {
      console.log(`🔔 Data changed detected: Remote=${result.remoteCount}, Local=${result.localCount}`);

      // Data count changed (could be deletion or update)
      return {
        title: 'Customer Data Update Available',
        message: `Customer data has changed. Please update your local data.`,
        type: 'data_update',
        data: {
          localCount: result.localCount,
          remoteCount: result.remoteCount,
          difference: result.difference
        }
      };
    } else {
      console.log('✓ No new data available');
      return null;
    }
  } catch (error) {
    console.error('Failed to check and notify new data:', error?.message || error);
    return null;
  }
};

/**
 * Force a data check regardless of the last check time
 */
export const forceCheckNewData = async () => {
  await AsyncStorage.removeItem(LAST_CHECK_KEY);
  return await checkAndNotifyNewData();
};

/**
 * Get the last time data was checked
 */
export const getLastCheckTime = async () => {
  try {
    const lastCheck = await AsyncStorage.getItem(LAST_CHECK_KEY);
    return lastCheck ? parseInt(lastCheck) : null;
  } catch (error) {
    console.error('Failed to get last check time:', error);
    return null;
  }
};

/**
 * Set up periodic background checking
 * Call this after login to start checking for new data
 */
export const startPeriodicDataCheck = (intervalMs = CHECK_INTERVAL) => {
  console.log(`🔄 Starting periodic data check (every ${intervalMs / 1000 / 60} minutes)`);

  // Run initial check after 30 seconds
  setTimeout(() => {
    checkAndNotifyNewData();
  }, 30000);

  // Set up interval for periodic checks
  const intervalId = setInterval(() => {
    checkAndNotifyNewData();
  }, intervalMs);

  return intervalId;
};

/**
 * Stop periodic background checking
 */
export const stopPeriodicDataCheck = (intervalId) => {
  if (intervalId) {
    clearInterval(intervalId);
    console.log('🛑 Stopped periodic data check');
  }
};
