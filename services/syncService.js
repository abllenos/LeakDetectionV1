import { 
  getQueue, 
  updateQueueItem, 
  removeFromQueue, 
  checkOnlineStatus,
  saveSyncStatus 
} from './offlineQueue';
import { submitLeakReport } from './interceptor';

const MAX_RETRIES = 3;

/**
 * Sync Service
 * Handles syncing offline queue to server
 */

// Process a single queue item
const processQueueItem = async (item) => {
  console.log(`[SyncService] Processing ${item.type}:`, item.id);
  
  try {
    switch (item.type) {
      case 'leak_report':
        await submitLeakReport(item.data);
        break;
      
      // Add more action types here in the future
      // case 'update_profile':
      //   await updateProfile(item.data);
      //   break;
      
      default:
        console.warn(`[SyncService] Unknown action type: ${item.type}`);
        return false;
    }
    
    return true;
  } catch (error) {
    console.error(`[SyncService] Error processing ${item.type}:`, error);
    throw error;
  }
};

// Sync all pending items
export const syncOfflineQueue = async (onProgress) => {
  const isOnline = await checkOnlineStatus();
  
  if (!isOnline) {
    console.log('[SyncService] Device is offline, skipping sync');
    return {
      success: false,
      message: 'Device is offline',
      synced: 0,
      failed: 0,
      pending: 0,
    };
  }
  
  console.log('[SyncService] Starting sync...');
  const queue = await getQueue();
  const pendingItems = queue.filter(item => item.status === 'pending');
  
  if (pendingItems.length === 0) {
    console.log('[SyncService] No pending items to sync');
    return {
      success: true,
      message: 'No items to sync',
      synced: 0,
      failed: 0,
      pending: 0,
    };
  }
  
  let synced = 0;
  let failed = 0;
  
  for (let i = 0; i < pendingItems.length; i++) {
    const item = pendingItems[i];
    
    // Report progress
    if (onProgress) {
      onProgress({
        current: i + 1,
        total: pendingItems.length,
        percentage: Math.round(((i + 1) / pendingItems.length) * 100),
        currentItem: item.type,
      });
    }
    
    try {
      // Mark as syncing
      await updateQueueItem(item.id, { status: 'syncing' });
      
      // Process the item
      const success = await processQueueItem(item);
      
      if (success) {
        // Remove from queue on success
        await removeFromQueue(item.id);
        synced++;
        console.log(`[SyncService] ✓ Synced ${item.type}`);
      } else {
        // Mark as failed
        await updateQueueItem(item.id, { 
          status: 'failed',
          retryCount: item.retryCount + 1,
          lastError: 'Unknown error',
        });
        failed++;
      }
    } catch (error) {
      const retryCount = item.retryCount + 1;
      
      if (retryCount >= MAX_RETRIES) {
        // Max retries reached, mark as failed
        await updateQueueItem(item.id, {
          status: 'failed',
          retryCount,
          lastError: error.message,
        });
        failed++;
        console.error(`[SyncService] ✗ Failed ${item.type} after ${retryCount} attempts`);
      } else {
        // Reset to pending for retry
        await updateQueueItem(item.id, {
          status: 'pending',
          retryCount,
          lastError: error.message,
        });
        console.log(`[SyncService] ⟳ Will retry ${item.type} (attempt ${retryCount}/${MAX_RETRIES})`);
      }
    }
  }
  
  // Save sync status
  await saveSyncStatus({
    synced,
    failed,
    itemsProcessed: pendingItems.length,
  });
  
  const result = {
    success: failed === 0,
    message: `Synced ${synced} items${failed > 0 ? `, ${failed} failed` : ''}`,
    synced,
    failed,
    pending: await getQueue().then(q => q.filter(i => i.status === 'pending').length),
  };
  
  console.log('[SyncService] Sync complete:', result);
  return result;
};

// Auto-sync when connection is restored
let syncListener = null;
let previousOnlineStatus = null;
let isSyncInProgress = false;

export const startAutoSync = (onSyncComplete) => {
  if (syncListener) {
    console.log('[SyncService] Auto-sync already running');
    return;
  }
  
  console.log('[SyncService] Starting auto-sync listener');
  
  // Import NetInfo here to avoid circular dependency
  const NetInfo = require('@react-native-community/netinfo').default;
  
  syncListener = NetInfo.addEventListener(async (state) => {
    const isOnline = state.isConnected && state.isInternetReachable !== false;
    
    // Only trigger sync when transitioning from offline to online
    if (isOnline && previousOnlineStatus === false) {
      console.log('[SyncService] 📶 Connection restored, checking for pending items...');
      
      // Prevent multiple simultaneous syncs
      if (isSyncInProgress) {
        console.log('[SyncService] Sync already in progress, skipping...');
        return;
      }
      
      const queue = await getQueue();
      const pendingCount = queue.filter(item => item.status === 'pending').length;
      
      if (pendingCount > 0) {
        console.log(`[SyncService] 🔄 Found ${pendingCount} pending items, starting auto-sync...`);
        
        isSyncInProgress = true;
        
        try {
          const result = await syncOfflineQueue((progress) => {
            console.log(`[SyncService] Progress: ${progress.percentage}% (${progress.current}/${progress.total})`);
          });
          
          console.log('[SyncService] ✅ Auto-sync completed:', result);
          
          if (onSyncComplete) {
            onSyncComplete(result);
          }
        } catch (error) {
          console.error('[SyncService] ❌ Auto-sync error:', error);
        } finally {
          isSyncInProgress = false;
        }
      } else {
        console.log('[SyncService] No pending items to sync');
      }
    }
    
    // Update previous status
    previousOnlineStatus = isOnline;
  });
  
  // Get initial status
  NetInfo.fetch().then((state) => {
    previousOnlineStatus = state.isConnected && state.isInternetReachable !== false;
    console.log('[SyncService] Initial connection status:', previousOnlineStatus ? 'Online' : 'Offline');
  });
};

export const stopAutoSync = () => {
  if (syncListener) {
    syncListener();
    syncListener = null;
    previousOnlineStatus = null;
    isSyncInProgress = false;
    console.log('[SyncService] Auto-sync stopped');
  }
};
