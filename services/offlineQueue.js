import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const QUEUE_KEY = 'offline_queue';
const SYNC_STATUS_KEY = 'last_sync_status';

/**
 * Offline Queue Manager
 * Stores actions performed while offline and syncs them when online
 */

// Get current queue
export const getQueue = async () => {
  try {
    const queueStr = await AsyncStorage.getItem(QUEUE_KEY);
    return queueStr ? JSON.parse(queueStr) : [];
  } catch (error) {
    console.error('Error reading offline queue:', error);
    return [];
  }
};

// Add item to queue
export const addToQueue = async (action) => {
  try {
    const queue = await getQueue();
    const queueItem = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      status: 'pending', // pending, syncing, synced, failed
      retryCount: 0,
      ...action,
    };
    
    queue.push(queueItem);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    
    console.log(`[OfflineQueue] Added to queue:`, queueItem.type);
    return queueItem.id;
  } catch (error) {
    console.error('Error adding to offline queue:', error);
    throw error;
  }
};

// Update queue item status
export const updateQueueItem = async (id, updates) => {
  try {
    const queue = await getQueue();
    const updatedQueue = queue.map(item => 
      item.id === id ? { ...item, ...updates } : item
    );
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(updatedQueue));
  } catch (error) {
    console.error('Error updating queue item:', error);
  }
};

// Remove item from queue
export const removeFromQueue = async (id) => {
  try {
    const queue = await getQueue();
    const filteredQueue = queue.filter(item => item.id !== id);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filteredQueue));
    console.log(`[OfflineQueue] Removed item ${id} from queue`);
  } catch (error) {
    console.error('Error removing from queue:', error);
  }
};

// Clear entire queue
export const clearQueue = async () => {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([]));
    console.log('[OfflineQueue] Queue cleared');
  } catch (error) {
    console.error('Error clearing queue:', error);
  }
};

// Get pending items count
export const getPendingCount = async () => {
  try {
    const queue = await getQueue();
    return queue.filter(item => item.status === 'pending').length;
  } catch (error) {
    console.error('Error getting pending count:', error);
    return 0;
  }
};

// Check if online
export const checkOnlineStatus = async () => {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected && state.isInternetReachable !== false;
  } catch (error) {
    console.error('Error checking online status:', error);
    return false;
  }
};

// Save sync status
export const saveSyncStatus = async (status) => {
  try {
    await AsyncStorage.setItem(SYNC_STATUS_KEY, JSON.stringify({
      lastSync: new Date().toISOString(),
      ...status,
    }));
  } catch (error) {
    console.error('Error saving sync status:', error);
  }
};

// Get sync status
export const getSyncStatus = async () => {
  try {
    const statusStr = await AsyncStorage.getItem(SYNC_STATUS_KEY);
    return statusStr ? JSON.parse(statusStr) : null;
  } catch (error) {
    console.error('Error getting sync status:', error);
    return null;
  }
};

// Get failed items
export const getFailedItems = async () => {
  try {
    const queue = await getQueue();
    return queue.filter(item => item.status === 'failed');
  } catch (error) {
    console.error('Error getting failed items:', error);
    return [];
  }
};

// Retry failed item
export const retryFailedItem = async (id) => {
  try {
    await updateQueueItem(id, {
      status: 'pending',
      retryCount: 0,
      lastError: null,
    });
    console.log(`[OfflineQueue] Reset item ${id} for retry`);
  } catch (error) {
    console.error('Error retrying failed item:', error);
  }
};
