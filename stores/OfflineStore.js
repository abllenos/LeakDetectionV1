import { makeObservable, observable, action, runInAction } from 'mobx';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  getQueue, 
  getPendingCount, 
  getFailedItems,
  retryFailedItem,
  clearQueue 
} from '../services/offlineQueue';
import { syncOfflineQueue, startAutoSync, stopAutoSync } from '../services/syncService';
import { Alert } from 'react-native';

const OFFLINE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const LAST_ONLINE_KEY = 'last_online_timestamp';

class OfflineStore {
  isOnline = true;
  isSyncing = false;
  pendingCount = 0;
  failedCount = 0;
  syncProgress = 0;
  lastSyncTime = null;
  lastOnlineTime = null;
  offlineTimeoutCheckInterval = null;
  onLogoutCallback = null;
  
  constructor() {
    makeObservable(this, {
      isOnline: observable,
      isSyncing: observable,
      pendingCount: observable,
      failedCount: observable,
      syncProgress: observable,
      lastSyncTime: observable,
      lastOnlineTime: observable,
      setOnlineStatus: action,
      setSyncing: action,
      setPendingCount: action,
      setFailedCount: action,
      setSyncProgress: action,
      setLastSyncTime: action,
      setLastOnlineTime: action,
      updateCounts: action,
      startSync: action,
      retryFailed: action,
      clearAllQueue: action,
      initialize: action,
      checkOfflineTimeout: action,
      setLogoutCallback: action,
    });
  }

  setOnlineStatus(status) {
    this.isOnline = status;
  }

  setSyncing(status) {
    this.isSyncing = status;
  }

  setPendingCount(count) {
    this.pendingCount = count;
  }

  setFailedCount(count) {
    this.failedCount = count;
  }

  setSyncProgress(progress) {
    this.syncProgress = progress;
  }

  setLastSyncTime(time) {
    this.lastSyncTime = time;
  }

  setLastOnlineTime(time) {
    this.lastOnlineTime = time;
  }

  setLogoutCallback(callback) {
    this.onLogoutCallback = callback;
  }

  async saveLastOnlineTime(timestamp) {
    try {
      await AsyncStorage.setItem(LAST_ONLINE_KEY, timestamp.toString());
      runInAction(() => {
        this.lastOnlineTime = timestamp;
      });
    } catch (error) {
      console.error('[OfflineStore] Error saving last online time:', error);
    }
  }

  async loadLastOnlineTime() {
    try {
      const timestamp = await AsyncStorage.getItem(LAST_ONLINE_KEY);
      if (timestamp) {
        runInAction(() => {
          this.lastOnlineTime = parseInt(timestamp, 10);
        });
      }
    } catch (error) {
      console.error('[OfflineStore] Error loading last online time:', error);
    }
  }

  async checkOfflineTimeout() {
    if (this.isOnline) {
      // User is online, no timeout needed
      return false;
    }

    if (!this.lastOnlineTime) {
      // No last online time recorded, load it
      await this.loadLastOnlineTime();
    }

    if (!this.lastOnlineTime) {
      // Still no last online time, might be first launch - save current time
      await this.saveLastOnlineTime(Date.now());
      return false;
    }

    const offlineDuration = Date.now() - this.lastOnlineTime;
    const remainingTime = OFFLINE_TIMEOUT_MS - offlineDuration;

    console.log(`[OfflineStore] Offline duration: ${Math.floor(offlineDuration / 1000 / 60)} minutes`);
    console.log(`[OfflineStore] Remaining time: ${Math.floor(remainingTime / 1000 / 60)} minutes`);

    if (offlineDuration >= OFFLINE_TIMEOUT_MS) {
      console.log('[OfflineStore] 24-hour offline timeout reached - forcing logout');
      
      // Clear the last online time
      await AsyncStorage.removeItem(LAST_ONLINE_KEY);
      
      // Show alert and trigger logout
      Alert.alert(
        'Session Expired',
        'You have been offline for more than 24 hours. Please login again to continue using the app.',
        [
          {
            text: 'OK',
            onPress: () => {
              if (this.onLogoutCallback) {
                this.onLogoutCallback();
              }
            },
          },
        ],
        { cancelable: false }
      );
      
      return true;
    }

    return false;
  }

  startOfflineTimeoutCheck() {
    // Check every 5 minutes
    this.offlineTimeoutCheckInterval = setInterval(() => {
      this.checkOfflineTimeout();
    }, 5 * 60 * 1000);

    // Also check immediately
    this.checkOfflineTimeout();
  }

  stopOfflineTimeoutCheck() {
    if (this.offlineTimeoutCheckInterval) {
      clearInterval(this.offlineTimeoutCheckInterval);
      this.offlineTimeoutCheckInterval = null;
    }
  }

  async updateCounts() {
    try {
      const pending = await getPendingCount();
      const failed = await getFailedItems();
      
      runInAction(() => {
        this.pendingCount = pending;
        this.failedCount = failed.length;
      });
    } catch (error) {
      console.error('[OfflineStore] Error updating counts:', error);
    }
  }

  async startSync() {
    if (this.isSyncing) {
      console.log('[OfflineStore] Sync already in progress');
      return;
    }

    if (!this.isOnline) {
      Alert.alert('Offline', 'Cannot sync while offline. Please check your internet connection.');
      return;
    }

    runInAction(() => {
      this.isSyncing = true;
      this.syncProgress = 0;
    });

    try {
      const result = await syncOfflineQueue((progress) => {
        runInAction(() => {
          this.syncProgress = progress.percentage;
        });
      });

      runInAction(() => {
        this.lastSyncTime = new Date().toISOString();
      });

      await this.updateCounts();

      if (result.success) {
        Alert.alert(
          'Sync Complete',
          result.synced > 0 
            ? `Successfully synced ${result.synced} item(s)`
            : 'All items are already synced'
        );
      } else if (result.failed > 0) {
        Alert.alert(
          'Sync Completed with Errors',
          `Synced ${result.synced} item(s), ${result.failed} failed. Failed items will be retried later.`
        );
      }
    } catch (error) {
      console.error('[OfflineStore] Sync error:', error);
      Alert.alert('Sync Error', 'An error occurred while syncing. Please try again.');
    } finally {
      runInAction(() => {
        this.isSyncing = false;
        this.syncProgress = 0;
      });
    }
  }

  async retryFailed() {
    try {
      const failedItems = await getFailedItems();
      
      for (const item of failedItems) {
        await retryFailedItem(item.id);
      }

      await this.updateCounts();
      
      if (this.isOnline) {
        await this.startSync();
      } else {
        Alert.alert('Retry Queued', 'Failed items will be retried when connection is restored.');
      }
    } catch (error) {
      console.error('[OfflineStore] Error retrying failed items:', error);
      Alert.alert('Error', 'Failed to retry items. Please try again.');
    }
  }

  async clearAllQueue() {
    Alert.alert(
      'Clear Queue',
      'Are you sure you want to clear all pending and failed items? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearQueue();
              await this.updateCounts();
              Alert.alert('Success', 'Queue cleared');
            } catch (error) {
              console.error('[OfflineStore] Error clearing queue:', error);
              Alert.alert('Error', 'Failed to clear queue');
            }
          },
        },
      ]
    );
  }

  async initialize() {
    console.log('[OfflineStore] Initializing...');
    
    // Load last online time from storage
    await this.loadLastOnlineTime();
    
    // Set up network listener
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      const isOnline = state.isConnected && state.isInternetReachable !== false;
      
      runInAction(() => {
        this.isOnline = isOnline;
      });
      
      console.log(`[OfflineStore] Network status: ${isOnline ? 'Online' : 'Offline'}`);
      
      // Update last online time when user comes online
      if (isOnline) {
        await this.saveLastOnlineTime(Date.now());
      }
    });

    // Get initial network state
    const state = await NetInfo.fetch();
    const isOnline = state.isConnected && state.isInternetReachable !== false;
    
    runInAction(() => {
      this.isOnline = isOnline;
    });

    // Save last online time if currently online
    if (isOnline) {
      await this.saveLastOnlineTime(Date.now());
    }

    // Start offline timeout check
    this.startOfflineTimeoutCheck();

    // Update counts
    await this.updateCounts();

    // Start auto-sync
    startAutoSync((result) => {
      console.log('[OfflineStore] Auto-sync completed:', result);
      runInAction(() => {
        this.lastSyncTime = new Date().toISOString();
      });
      this.updateCounts();
      
      // Only show notification if items were actually synced
      if (result.synced > 0) {
        console.log(`✅ Auto-sync: ${result.synced} item(s) synced to server`);
        // You can optionally show a toast notification here instead of Alert
        // For now, we'll just log it - less disruptive than Alert
      }
      
      if (result.failed > 0) {
        console.warn(`⚠️ Auto-sync: ${result.failed} item(s) failed to sync`);
      }
    });

    console.log('[OfflineStore] Initialized successfully');
    
    return unsubscribe;
  }

  cleanup() {
    this.stopOfflineTimeoutCheck();
    stopAutoSync();
  }
}

export default OfflineStore;
