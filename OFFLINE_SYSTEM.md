# Offline-First System Documentation

## Overview

The LeakDetection app implements a comprehensive offline-first architecture that allows users to work seamlessly whether online or offline. Changes made while offline are queued locally and automatically synchronized when the device reconnects to the internet.

## Core Features

### ✅ What Works

1. **Network Detection**: Automatically detects online/offline status using `@react-native-community/netinfo`
2. **Offline Queue**: Stores all offline actions (leak reports, etc.) in AsyncStorage
3. **Auto-Sync**: Automatically syncs queued items when connection is restored
4. **Manual Sync**: Users can manually trigger sync from Settings
5. **Retry Logic**: Failed sync attempts are retried up to 3 times with exponential backoff
6. **Visual Indicators**: Shows offline status banners and pending item counts
7. **Persistent Storage**: Queue survives app restarts and crashes

### 📱 User Experience Flow

1. **Login Online**: User must login online first to fetch initial data (authentication tokens, user info)
2. **Work Offline**: After initial login, user can work completely offline
3. **Queue Actions**: All actions performed offline are saved to local queue
4. **Auto-Sync**: When device comes back online, queued items automatically sync to server
5. **Visual Feedback**: Users see offline indicators, pending counts, and sync progress

## Architecture

### Components

#### 1. **OfflineStore** (`stores/OfflineStore.js`)

MobX store managing offline state:

**Observables:**
- `isOnline`: Current network status (boolean)
- `isSyncing`: Whether sync is in progress
- `pendingCount`: Number of items waiting to sync
- `failedCount`: Number of failed sync attempts
- `syncProgress`: Current sync progress (0-100)
- `lastSyncTime`: Timestamp of last successful sync

**Actions:**
- `initialize()`: Sets up NetInfo listener and starts auto-sync
- `startSync()`: Manually triggers sync process
- `retryFailed()`: Retries all failed queue items
- `clearAllQueue()`: Clears entire queue (pending + failed)
- `updateCounts()`: Updates pending/failed counts from queue

**Usage:**
```javascript
import { useOfflineStore } from '../stores/RootStore';

const offlineStore = useOfflineStore();
console.log('Online:', offlineStore.isOnline);
console.log('Pending:', offlineStore.pendingCount);
```

#### 2. **offlineQueue.js** (`services/offlineQueue.js`)

AsyncStorage-based queue management:

**Functions:**
- `getQueue()`: Retrieves entire queue from storage
- `addToQueue(type, data)`: Adds new item to queue with unique ID
- `updateQueueItem(id, updates)`: Updates specific queue item
- `removeFromQueue(id)`: Removes item from queue
- `getPendingCount()`: Gets count of pending items
- `getFailedItems()`: Gets all failed items
- `retryFailedItem(id)`: Resets failed item to pending
- `checkOnlineStatus()`: Checks current network status

**Queue Item Structure:**
```javascript
{
  id: 'unique-timestamp-random',
  type: 'leak_report', // Action type
  data: { ... }, // Action-specific data
  status: 'pending', // pending | syncing | synced | failed
  timestamp: 1234567890,
  retryCount: 0
}
```

**Usage:**
```javascript
import { addToQueue, getQueue } from '../services/offlineQueue';

// Add to queue
await addToQueue('leak_report', { 
  address: '123 Main St',
  description: 'Water leak'
});

// Get all items
const queue = await getQueue();
```

#### 3. **syncService.js** (`services/syncService.js`)

Handles syncing queued items to server:

**Configuration:**
- `MAX_RETRIES = 3`: Maximum retry attempts per item
- Exponential backoff: 1s → 2s → 4s delays

**Functions:**
- `processQueueItem(item)`: Processes single queue item based on type
- `syncOfflineQueue(progressCallback)`: Syncs all pending items with progress updates
- `startAutoSync(onSyncComplete)`: Starts auto-sync on network reconnect
- `stopAutoSync()`: Stops auto-sync listener

**Supported Action Types:**
- `leak_report`: Submit leak report to server

**Usage:**
```javascript
import { syncOfflineQueue, startAutoSync } from '../services/syncService';

// Manual sync
const result = await syncOfflineQueue((progress) => {
  console.log('Progress:', progress);
});

// Auto-sync
startAutoSync((synced, failed) => {
  console.log(`Synced: ${synced}, Failed: ${failed}`);
});
```

#### 4. **LeakReportStore** (`stores/LeakReportStore.js`)

Modified to support offline queueing:

**Changes:**
- `submit()` now checks online status before submitting
- If **online**: Submits directly to server
- If **offline**: Adds to queue and shows success message
- Returns `{ success, offline }` to indicate queue vs direct submission

**Usage:**
```javascript
const result = await leakReportStore.submit();
if (result.success && result.offline) {
  // Queued for later sync
} else if (result.success) {
  // Submitted to server immediately
}
```

### UI Components

#### 1. **AppHeader** (`components/AppHeader.js`)

Shows real-time offline status:

**Visual Indicators:**
- **Offline Banner** (red): Shown when device is offline
  - Displays "You are offline"
  - Shows pending count: "X report(s) queued"
- **Syncing Banner** (blue): Shown during sync
  - Displays "Syncing X%..."
  - Shows current sync progress

**Example:**
```
┌─────────────────────────────────────┐
│ ⚠️ You are offline. 3 report(s)     │
│    queued                           │
└─────────────────────────────────────┘
```

#### 2. **SettingsScreen** (`screens/SettingsScreen.js`)

Added "Offline Queue" section:

**Displays:**
- Network status (Online/Offline) with colored badge
- Pending items count
- Failed items count
- Last sync time
- Sync progress indicator (when syncing)

**Actions:**
- **Sync Now**: Manually trigger sync (disabled when offline or no pending items)
- **Retry Failed**: Retry all failed items
- **Clear Queue**: Remove all pending/failed items (with confirmation)

**Example:**
```
┌─────────── Offline Queue ───────────┐
│ Network Status: ● Online            │
│                                      │
│ Pending: 3    Failed: 0   Last: 2:15│
│                                      │
│ [Sync Now]  [Retry Failed]          │
│ [Clear Queue]                        │
└──────────────────────────────────────┘
```

## Implementation Details

### Network Detection

Uses `@react-native-community/netinfo` v11.x:

```javascript
import NetInfo from '@react-native-community/netinfo';

const unsubscribe = NetInfo.addEventListener(state => {
  const online = state.isConnected && state.isInternetReachable;
  // Update store...
});
```

**States Detected:**
- `isConnected`: Device has network interface connection
- `isInternetReachable`: Device can reach internet servers
- Only considers online when **both** are true

### Queue Storage

Stored in AsyncStorage under key `offline_queue`:

```javascript
// Storage structure
{
  "offline_queue": [
    {
      "id": "1701234567890-abc123",
      "type": "leak_report",
      "data": { "address": "...", "description": "..." },
      "status": "pending",
      "timestamp": 1701234567890,
      "retryCount": 0
    }
  ]
}
```

**Benefits:**
- Persists across app restarts
- Survives crashes
- No database setup required
- JSON serializable

### Auto-Sync Logic

```javascript
// Triggered when connection restored
NetInfo.addEventListener(state => {
  if (state.isConnected && state.isInternetReachable) {
    // Wait 2 seconds for connection to stabilize
    setTimeout(() => {
      syncOfflineQueue((progress) => {
        // Update UI...
      });
    }, 2000);
  }
});
```

**Behavior:**
1. Detects network reconnection
2. Waits 2 seconds for connection stability
3. Syncs all pending items
4. Shows alert on completion
5. Updates queue counts

### Retry Strategy

Failed items use exponential backoff:

```javascript
const delays = [1000, 2000, 4000]; // 1s, 2s, 4s

for (let i = 0; i < MAX_RETRIES; i++) {
  try {
    await processQueueItem(item);
    break; // Success
  } catch (error) {
    if (i < MAX_RETRIES - 1) {
      await new Promise(resolve => setTimeout(resolve, delays[i]));
    } else {
      // Mark as failed after 3 attempts
    }
  }
}
```

**States:**
- `pending`: Waiting to sync
- `syncing`: Currently syncing
- `synced`: Successfully synced
- `failed`: Failed after 3 attempts

### Adding New Queue Types

To support new offline actions:

1. **Define type constant:**
```javascript
const QUEUE_TYPES = {
  LEAK_REPORT: 'leak_report',
  UPDATE_PROFILE: 'update_profile', // New type
};
```

2. **Add to queue:**
```javascript
await addToQueue('update_profile', {
  userId: '123',
  name: 'John Doe'
});
```

3. **Add handler in syncService:**
```javascript
async function processQueueItem(item) {
  switch (item.type) {
    case 'leak_report':
      // Existing handler...
      break;
    
    case 'update_profile': // New handler
      const response = await api.put('/user/profile', item.data);
      return response.data;
    
    default:
      throw new Error(`Unknown queue type: ${item.type}`);
  }
}
```

## Testing

### Test Offline Flow

1. **Setup:**
   - Login to app while online
   - Navigate to leak report form

2. **Go Offline:**
   - Enable airplane mode OR
   - Disable WiFi/cellular data

3. **Submit Report:**
   - Fill out leak report form
   - Submit report
   - Verify success message
   - Check offline banner appears in header
   - Verify pending count shows 1

4. **Check Queue:**
   - Go to Settings → Offline Queue
   - Verify pending count = 1
   - Verify network status = Offline

5. **Go Online:**
   - Disable airplane mode OR
   - Enable WiFi/cellular data
   - Wait 2-3 seconds for auto-sync
   - Verify sync alert appears
   - Verify pending count returns to 0

6. **Verify Sync:**
   - Check server/database for submitted report
   - Verify all data fields are correct

### Test Retry Logic

1. **Simulate Server Error:**
   - Modify API endpoint to return 500 error
   - Submit leak report while online
   - Verify item marked as failed

2. **Retry Failed:**
   - Go to Settings → Offline Queue
   - Tap "Retry Failed"
   - Verify retry attempts (should see 3 attempts)

3. **Fix Server:**
   - Restore API endpoint
   - Tap "Retry Failed" again
   - Verify successful sync

### Test Queue Persistence

1. **Queue Items:**
   - Go offline
   - Submit 3 leak reports
   - Verify pending count = 3

2. **Force Close App:**
   - Swipe app away from recent apps
   - Reopen app
   - Go to Settings → Offline Queue
   - Verify pending count still = 3

3. **Sync After Restart:**
   - Go online
   - Wait for auto-sync
   - Verify all 3 items synced

## Troubleshooting

### Queue Not Syncing

**Symptoms:**
- Pending items remain after going online
- No sync alert shown

**Solutions:**
1. Check network status in Settings
2. Manually tap "Sync Now"
3. Check console logs for errors
4. Verify API endpoints are accessible

### Items Stuck in "Syncing" State

**Symptoms:**
- Items show as syncing indefinitely
- Sync progress stuck at certain percentage

**Solutions:**
1. Force close app and reopen
2. Check if server is responding
3. Clear queue and resubmit
4. Check for network timeouts

### Failed Items Not Retrying

**Symptoms:**
- Failed count increases but retries don't work
- Retry button does nothing

**Solutions:**
1. Check if device is online
2. Verify API endpoints are correct
3. Check error logs for server responses
4. Clear failed items and resubmit fresh

### High Storage Usage

**Symptoms:**
- App using excessive storage
- Queue file very large

**Solutions:**
1. Check pending count (should be reasonable)
2. Clear old synced items periodically
3. Implement queue size limits if needed
4. Monitor for duplicate items

## Performance Considerations

### Memory

- **Queue Size**: Each item ~1-5 KB
- **1000 items**: ~1-5 MB storage
- Minimal RAM impact (queue loaded on demand)

### Network

- **Sync Batching**: Items synced sequentially to avoid overwhelming server
- **Retry Delays**: Exponential backoff prevents rapid retry storms
- **Connection Checks**: Cached for 1 second to reduce NetInfo calls

### Battery

- **Background Sync**: Only when app is active
- **NetInfo Listener**: Minimal battery impact
- No wake locks or background services

## Best Practices

### For Users

1. **Initial Login**: Always login online first to fetch data
2. **Queue Management**: Periodically check Settings for failed items
3. **WiFi Sync**: Sync large queues on WiFi to save cellular data
4. **Manual Sync**: Use "Sync Now" if auto-sync doesn't trigger

### For Developers

1. **Queue Types**: Use descriptive type names ('leak_report', not 'lr')
2. **Data Validation**: Validate data before queueing (prevent bad data)
3. **Error Handling**: Always handle sync errors gracefully
4. **Progress Updates**: Show sync progress for long operations
5. **Testing**: Test offline flow for every new feature
6. **Logging**: Log queue operations for debugging

## Future Enhancements

- [ ] Background sync using WorkManager (Android) / BackgroundTasks (iOS)
- [ ] Conflict resolution for concurrent edits
- [ ] Batch sync API endpoints (sync multiple items in one request)
- [ ] Queue size limits and auto-cleanup
- [ ] Differential sync (only send changed fields)
- [ ] Sync priority levels (critical vs normal)
- [ ] Offline data caching (customer data, meter data)
- [ ] Bi-directional sync (receive server updates while offline)
- [ ] Queue analytics (success rate, average sync time)
- [ ] Push notifications when sync completes

## API Reference

### OfflineStore

```javascript
class OfflineStore {
  // Observables
  isOnline: boolean
  isSyncing: boolean
  pendingCount: number
  failedCount: number
  syncProgress: number
  lastSyncTime: number | null
  
  // Actions
  initialize(): void
  startSync(): Promise<void>
  retryFailed(): Promise<void>
  clearAllQueue(): Promise<void>
  updateCounts(): Promise<void>
}
```

### offlineQueue

```javascript
// Add item to queue
addToQueue(type: string, data: object): Promise<void>

// Get entire queue
getQueue(): Promise<Array<QueueItem>>

// Update queue item
updateQueueItem(id: string, updates: object): Promise<void>

// Remove queue item
removeFromQueue(id: string): Promise<void>

// Get pending count
getPendingCount(): Promise<number>

// Get failed items
getFailedItems(): Promise<Array<QueueItem>>

// Retry failed item
retryFailedItem(id: string): Promise<void>

// Check online status
checkOnlineStatus(): Promise<boolean>
```

### syncService

```javascript
// Process single queue item
processQueueItem(item: QueueItem): Promise<any>

// Sync entire queue
syncOfflineQueue(
  progressCallback?: (progress: number) => void
): Promise<{ synced: number, failed: number, pending: number }>

// Start auto-sync
startAutoSync(
  onSyncComplete?: (synced: number, failed: number) => void
): void

// Stop auto-sync
stopAutoSync(): void
```

## Code Examples

### Check if Online

```javascript
import { useOfflineStore } from '../stores/RootStore';

function MyComponent() {
  const offlineStore = useOfflineStore();
  
  if (!offlineStore.isOnline) {
    return <Text>You are offline</Text>;
  }
  
  return <Text>You are online</Text>;
}
```

### Queue Leak Report

```javascript
import { addToQueue } from '../services/offlineQueue';

async function submitReport(reportData) {
  const online = await checkOnlineStatus();
  
  if (online) {
    // Submit directly
    await api.post('/leak-reports', reportData);
  } else {
    // Queue for later
    await addToQueue('leak_report', reportData);
    Alert.alert('Saved', 'Report queued and will sync when online');
  }
}
```

### Manual Sync

```javascript
import { syncOfflineQueue } from '../services/syncService';

async function handleManualSync() {
  const result = await syncOfflineQueue((progress) => {
    console.log('Sync progress:', progress);
  });
  
  Alert.alert(
    'Sync Complete',
    `Synced: ${result.synced}\nFailed: ${result.failed}\nPending: ${result.pending}`
  );
}
```

### Listen to Network Changes

```javascript
import NetInfo from '@react-native-community/netinfo';

useEffect(() => {
  const unsubscribe = NetInfo.addEventListener(state => {
    const online = state.isConnected && state.isInternetReachable;
    console.log('Network status:', online ? 'Online' : 'Offline');
  });
  
  return () => unsubscribe();
}, []);
```

---

**Last Updated:** December 2024  
**Version:** 1.0.0
