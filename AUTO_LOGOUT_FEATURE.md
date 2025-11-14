# 24-Hour Auto-Logout Feature

## Overview

The LeakDetection app implements a **24-hour offline timeout** security feature. If a user remains offline for 24 consecutive hours, they will be automatically logged out and required to login again. This ensures data security and prevents indefinite offline access.

## How It Works

### Core Logic

1. **Track Last Online Time**: Every time the device connects to the internet, the current timestamp is saved to AsyncStorage
2. **Periodic Checks**: Every 5 minutes, the app checks if the user has been offline for 24 hours
3. **Force Logout**: When 24 hours offline is detected, the app shows an alert and automatically logs the user out
4. **Reset Timer**: Timer resets to zero whenever the device reconnects to the internet

### Key Components

#### 1. **OfflineStore** (`stores/OfflineStore.js`)

**New Observables:**
- `lastOnlineTime`: Timestamp (ms) of when user was last online
- `offlineTimeoutCheckInterval`: Interval ID for periodic timeout checks
- `onLogoutCallback`: Callback function to trigger logout

**New Methods:**

```javascript
// Save last online time to AsyncStorage and store
async saveLastOnlineTime(timestamp)

// Load last online time from AsyncStorage
async loadLastOnlineTime()

// Check if 24-hour timeout has been reached
async checkOfflineTimeout()

// Start periodic timeout checks (every 5 minutes)
startOfflineTimeoutCheck()

// Stop timeout checks
stopOfflineTimeoutCheck()

// Set callback to execute on timeout
setLogoutCallback(callback)
```

**Timeout Logic:**

```javascript
const OFFLINE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

// Calculate offline duration
const offlineDuration = Date.now() - lastOnlineTime;

// Check if timeout reached
if (offlineDuration >= OFFLINE_TIMEOUT_MS) {
  // Show alert and force logout
}
```

#### 2. **App.js**

Sets up the logout callback during initialization:

```javascript
rootStore.offlineStore.setLogoutCallback(async () => {
  // Stop location tracking
  stopLocationTracking();
  
  // Clear authentication
  await rootStore.authStore.handleLogout();
  
  // Navigate to splash screen
  navigationRef.current.reset({
    index: 0,
    routes: [{ name: 'Splash' }],
  });
});
```

#### 3. **SettingsScreen**

Displays remaining time before auto-logout:

**Visual Warning:**
- Shows orange warning box when offline
- Displays countdown timer (e.g., "23h 45m remaining")
- Updates in real-time
- Only visible when user is offline

**Example Display:**
```
┌─────────────────────────────────────┐
│ ⚠️ Auto-logout Timer                │
│                                      │
│ You will be automatically logged     │
│ out in 23h 45m if you remain        │
│ offline. Please connect to the      │
│ internet to reset the timer.        │
└─────────────────────────────────────┘
```

## Implementation Flow

### 1. **App Initialization**

```
App starts
  ↓
Load last online time from AsyncStorage
  ↓
Check current network status
  ↓
If online: Save current timestamp
  ↓
Start 5-minute periodic check
  ↓
Set up network listener
```

### 2. **Network State Changes**

```
Network listener detects change
  ↓
Is device online?
  ├─ Yes → Save current timestamp to AsyncStorage
  └─ No  → Continue monitoring
```

### 3. **Periodic Timeout Check** (Every 5 minutes)

```
Check timeout interval fires
  ↓
Is user currently online?
  ├─ Yes → No action needed (timer already reset)
  └─ No  → Calculate offline duration
             ↓
           Has it been ≥24 hours?
             ├─ Yes → Show alert → Force logout
             └─ No  → Continue monitoring
```

### 4. **Force Logout Process**

```
24-hour timeout detected
  ↓
Clear last online timestamp from AsyncStorage
  ↓
Show "Session Expired" alert
  ↓
User taps "OK"
  ↓
Stop location tracking
  ↓
Call authStore.handleLogout()
  ↓
Clear auth tokens and user data
  ↓
Navigate to Splash screen
  ↓
User must login again
```

## Storage

### AsyncStorage Keys

**`last_online_timestamp`**
- Stores millisecond timestamp of last online connection
- Updated every time device connects to internet
- Cleared on logout
- Persists across app restarts

**Example:**
```javascript
{
  "last_online_timestamp": "1701234567890"
}
```

## Configuration

### Timeout Duration

Located in `stores/OfflineStore.js`:

```javascript
const OFFLINE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
```

**To change timeout duration:**
```javascript
// 12 hours
const OFFLINE_TIMEOUT_MS = 12 * 60 * 60 * 1000;

// 48 hours
const OFFLINE_TIMEOUT_MS = 48 * 60 * 60 * 1000;

// 7 days
const OFFLINE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;
```

### Check Interval

Located in `stores/OfflineStore.js`:

```javascript
// Check every 5 minutes
this.offlineTimeoutCheckInterval = setInterval(() => {
  this.checkOfflineTimeout();
}, 5 * 60 * 1000);
```

**To change check frequency:**
```javascript
// Check every 1 minute
}, 1 * 60 * 1000);

// Check every 10 minutes
}, 10 * 60 * 1000);

// Check every 30 seconds (not recommended - battery drain)
}, 30 * 1000);
```

## User Experience

### Scenario 1: Normal Online Usage
```
User logs in (online) → lastOnlineTime = now
User works normally (online) → lastOnlineTime updates continuously
User logs out manually → Normal logout flow
```

### Scenario 2: Brief Offline Period
```
User logs in (online) → lastOnlineTime = now
User goes offline for 2 hours
User comes back online → lastOnlineTime = now (timer reset)
User continues working → No interruption
```

### Scenario 3: Extended Offline Usage
```
User logs in (online) → lastOnlineTime = now
User goes offline for 20 hours → Warning shows "4h 0m remaining"
User goes offline for 23 hours → Warning shows "1h 0m remaining"
User goes offline for 24+ hours → Alert shown → Force logout
User must login online again
```

### Scenario 4: App Restart During Offline
```
User logs in (online) → lastOnlineTime saved to AsyncStorage
User goes offline for 12 hours
User force-closes app
User reopens app (still offline) → lastOnlineTime loaded from storage
Timer continues from 12 hours → 12h 0m remaining
```

## Alert Messages

### Session Expired Alert

**Title:** "Session Expired"

**Message:** "You have been offline for more than 24 hours. Please login again to continue using the app."

**Buttons:**
- "OK" (non-cancelable) → Triggers logout

## Visual Indicators

### Settings Screen - Offline Queue Card

**When Online:**
```
Network Status: ● Online (green)
Pending: 0    Failed: 0    Last Sync: 2:15 PM

(No timeout warning shown)
```

**When Offline - 5 hours:**
```
Network Status: ● Offline (red)
Pending: 3    Failed: 0    Last Sync: Never

⚠️ Auto-logout Timer
You will be automatically logged out in 19h 0m if you 
remain offline. Please connect to the internet to reset 
the timer.
```

**When Offline - 23 hours:**
```
Network Status: ● Offline (red)
Pending: 5    Failed: 1    Last Sync: Never

⚠️ Auto-logout Timer (yellow/orange background)
You will be automatically logged out in 1h 0m if you 
remain offline. Please connect to the internet to reset 
the timer.
```

## Testing

### Test 1: Normal Timeout Flow

**Setup:**
1. Login to app while online
2. Note the current time

**Steps:**
1. Enable airplane mode
2. Wait 24 hours (or temporarily change `OFFLINE_TIMEOUT_MS` to 2 minutes for testing)
3. Observe alert appears
4. Tap "OK"
5. Verify navigation to Splash screen
6. Verify user must login again

**Expected Result:**
- Alert shows after exactly 24 hours offline
- User logged out automatically
- Auth tokens cleared
- Navigation resets to Splash

### Test 2: Timer Reset on Reconnection

**Setup:**
1. Login to app while online
2. Enable airplane mode

**Steps:**
1. Wait 20 hours offline
2. Check Settings → Offline Queue → Should show "4h 0m remaining"
3. Disable airplane mode (go online)
4. Wait 2 seconds for connection
5. Check Settings → Should show "N/A (Currently online)"
6. Enable airplane mode again
7. Check Settings → Should show "24h 0m remaining" (timer reset)

**Expected Result:**
- Timer resets to 24 hours when connection restored
- Warning message updates correctly
- No logout occurs

### Test 3: App Restart Persistence

**Setup:**
1. Login to app while online
2. Enable airplane mode
3. Wait 12 hours

**Steps:**
1. Force close app (swipe away from recent apps)
2. Reopen app
3. Check Settings → Offline Queue
4. Verify shows "12h 0m remaining" (timer persisted)
5. Wait 12 more hours
6. Verify logout occurs

**Expected Result:**
- Last online time persists across app restarts
- Timer continues correctly
- Logout occurs at exact 24-hour mark

### Test 4: Rapid Online/Offline Changes

**Setup:**
1. Login to app while online

**Steps:**
1. Toggle airplane mode on/off rapidly 10 times
2. Leave offline
3. Check Settings → Verify timer starts from most recent online time
4. Go online briefly (2 seconds)
5. Go offline again
6. Check Settings → Verify timer reset to 24h 0m

**Expected Result:**
- Each online connection resets timer
- No errors or crashes
- Timer always accurate

## Debugging

### Enable Detailed Logging

Check console logs for timeout monitoring:

```
[OfflineStore] Offline duration: 1440 minutes (24 hours)
[OfflineStore] Remaining time: 0 minutes
[OfflineStore] 24-hour offline timeout reached - forcing logout
[App] 24-hour offline timeout - forcing logout
```

### Check AsyncStorage

Inspect stored last online time:

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';

// Check stored value
const lastOnline = await AsyncStorage.getItem('last_online_timestamp');
console.log('Last online:', new Date(parseInt(lastOnline)));
```

### Manual Timer Adjustment (for testing)

Temporarily modify timeout for faster testing:

```javascript
// In OfflineStore.js - TESTING ONLY
const OFFLINE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes instead of 24 hours
```

**Remember to revert before production!**

## Security Considerations

### Why 24 Hours?

**Balance between:**
- **Security**: Prevents indefinite offline access to sensitive data
- **Usability**: Allows reasonable offline work periods (e.g., overnight, weekend)
- **Real-world scenarios**: Field workers may be offline for extended periods

### Data Protection

**What happens to queued data on timeout?**
- Queued items remain in AsyncStorage
- User must login again to access app
- After re-login, queue is still available and will sync

**Authentication tokens:**
- Cleared on timeout logout
- User must re-authenticate with server
- Fresh tokens issued on re-login

### Network Detection Reliability

**Edge cases handled:**
- **Spotty connection**: Timer only resets when both `isConnected` AND `isInternetReachable` are true
- **WiFi without internet**: Does NOT reset timer
- **Airplane mode toggle**: Correctly detects and resets timer

## Troubleshooting

### Timer Not Counting Down

**Symptoms:**
- Offline for hours but timer shows "24h 0m"
- Timer seems stuck

**Solutions:**
1. Check if device is actually detecting offline status
2. Verify `lastOnlineTime` is set in AsyncStorage
3. Check console logs for timeout check execution
4. Ensure periodic interval is running

### Premature Logout

**Symptoms:**
- Logged out before 24 hours
- Timer counting down too fast

**Solutions:**
1. Verify `OFFLINE_TIMEOUT_MS` is correctly set to 24 hours
2. Check device clock is accurate
3. Review console logs for actual offline duration
4. Check for multiple timeout checks running

### Timer Not Resetting on Connection

**Symptoms:**
- Go online but timer still counting down
- "N/A (Currently online)" not shown

**Solutions:**
1. Verify network listener is active
2. Check `isOnline` observable updates correctly
3. Ensure `saveLastOnlineTime()` is called on connection
4. Check AsyncStorage write permissions

## API Reference

### OfflineStore Methods

```javascript
// Set callback for timeout logout
setLogoutCallback(callback: () => void): void

// Save last online timestamp
saveLastOnlineTime(timestamp: number): Promise<void>

// Load last online timestamp from storage
loadLastOnlineTime(): Promise<void>

// Check if timeout reached (returns true if logout triggered)
checkOfflineTimeout(): Promise<boolean>

// Start periodic timeout checks
startOfflineTimeoutCheck(): void

// Stop timeout checks
stopOfflineTimeoutCheck(): void
```

### OfflineStore Observables

```javascript
lastOnlineTime: number | null  // Timestamp when last online
```

## Future Enhancements

- [ ] Configurable timeout duration per user role
- [ ] Warning notifications at 23 hours, 23.5 hours
- [ ] Grace period option (e.g., "extend session 1 hour")
- [ ] Analytics tracking of offline duration patterns
- [ ] Admin dashboard to view user offline durations
- [ ] Biometric re-authentication option instead of full logout
- [ ] Different timeout durations for different data sensitivity levels

---

**Last Updated:** December 2024  
**Version:** 1.0.0
